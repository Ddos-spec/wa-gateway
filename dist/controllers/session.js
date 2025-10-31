import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { toDataURL } from "qrcode";
import * as whatsapp from "wa-multi-session";
import { z } from "zod";
import crypto from "crypto";
import { createKeyMiddleware } from "../middlewares/key.middleware.js";
import { requestValidator } from "../middlewares/validation.middleware.js";
import { query } from "../lib/postgres.js";
export const createSessionController = () => {
    const app = new Hono();
    // Endpoint to get all sessions from the DATABASE
    app.get("/", createKeyMiddleware(), async (c) => {
        console.log("Attempting to fetch all sessions.");
        try {
            const result = await query('SELECT * FROM sessions ORDER BY created_at DESC');
            console.log("Fetched sessions:", result.rows);
            return c.json({
                data: result.rows,
            });
        }
        catch (error) {
            console.error("Error fetching sessions from DB:", error);
            throw new HTTPException(500, { message: "Failed to fetch sessions" });
        }
    });
    // Endpoint to create a new session or get QR
    app.post("/start", createKeyMiddleware(), requestValidator("json", z.object({ session: z.string() })), async (c) => {
        const payload = c.req.valid("json");
        try {
            console.log(`[${payload.session}] Starting session...`);
            // ✅ FIX: Check if session already exists in the library before starting
            const existingSession = whatsapp.getSession(payload.session);
            if (existingSession) {
                console.log(`[${payload.session}] Session already exists. Preventing new start call.`);
                // Return a generic message to prevent a crash, without assuming status.
                return c.json({ message: "Session is already being processed. Please wait." });
            }
            // 1. Check if session exists in DB
            const dbSession = await query("SELECT * FROM sessions WHERE session_name = $1", [payload.session]);
            // 2. Start the session in the library
            const qr = await new Promise((resolve, reject) => {
                try {
                    whatsapp.startSession(payload.session, {
                        onConnected: async () => {
                            console.log(`[${payload.session}] Connected!`);
                            // ✅ FIX: Update status to online when connected
                            try {
                                await query("UPDATE sessions SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE session_name = $2", ['online', payload.session]);
                            }
                            catch (dbError) {
                                console.error(`[${payload.session}] Failed to update status to online:`, dbError);
                            }
                            resolve(null);
                        },
                        onQRUpdated: async (qr) => {
                            console.log(`[${payload.session}] QR Code updated`);
                            // ✅ FIX: Update status to connecting when QR is generated
                            try {
                                await query("UPDATE sessions SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE session_name = $2", ['connecting', payload.session]);
                            }
                            catch (dbError) {
                                console.error(`[${payload.session}] Failed to update status to connecting:`, dbError);
                            }
                            resolve(qr);
                        },
                        onDisconnected: async () => {
                            console.log(`[${payload.session}] Disconnected`);
                            // ✅ FIX: Update status to offline when disconnected
                            try {
                                await query("UPDATE sessions SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE session_name = $2", ['offline', payload.session]);
                            }
                            catch (dbError) {
                                console.error(`[${payload.session}] Failed to update status to offline:`, dbError);
                            }
                        },
                    });
                }
                catch (error) {
                    console.error(`[${payload.session}] Error starting session:`, error);
                    reject(error);
                }
            });
            // 3. Save/Update the session to the DATABASE
            if (dbSession.rows.length === 0) {
                const apiKey = crypto.randomBytes(32).toString('hex');
                await query('INSERT INTO sessions (session_name, status, api_key) VALUES ($1, $2, $3)', [payload.session, 'connecting', apiKey]);
                console.log(`[${payload.session}] Created new session in DB`);
            }
            if (qr) {
                const qrDataURL = await toDataURL(qr);
                console.log(`[${payload.session}] Returning QR code`);
                return c.json({ qr: qrDataURL });
            }
            // If already connected (no QR)
            console.log(`[${payload.session}] Already connected, no QR needed`);
            return c.json({ message: "Already connected" });
        }
        catch (error) {
            console.error(`[${payload.session}] Error starting session:`, error);
            throw new HTTPException(500, { message: "Failed to start session" });
        }
    });
    // Endpoint to get a specific session by name from the DATABASE
    app.get("/:name", createKeyMiddleware(), async (c) => {
        const name = c.req.param("name");
        try {
            const result = await query("SELECT * FROM sessions WHERE session_name = $1", [name]);
            if (result.rows.length === 0) {
                throw new HTTPException(404, { message: "Session not found in database" });
            }
            return c.json({
                success: true,
                session: result.rows[0],
            });
        }
        catch (error) {
            console.error(`Error fetching session ${name}:`, error);
            if (error instanceof HTTPException)
                throw error;
            throw new HTTPException(500, { message: "Failed to get session" });
        }
    });
    // Endpoint to get a specific session's status from the DATABASE
    app.get("/:name/status", createKeyMiddleware(), async (c) => {
        const name = c.req.param("name");
        try {
            const result = await query("SELECT status FROM sessions WHERE session_name = $1", [name]);
            if (result.rows.length === 0) {
                throw new HTTPException(404, { message: "Session not found in database" });
            }
            return c.json({
                success: true,
                status: result.rows[0].status,
            });
        }
        catch (error) {
            console.error(`Error fetching status for ${name}:`, error);
            if (error instanceof HTTPException)
                throw error;
            throw new HTTPException(500, { message: "Failed to get session status" });
        }
    });
    // Endpoint to update webhook by name
    app.put("/:name/webhook", createKeyMiddleware(), requestValidator("json", z.object({
        webhook_url: z.string().url().optional().nullable(),
        webhook_events: z.record(z.boolean()).optional(),
    })), async (c) => {
        const name = c.req.param("name");
        const { webhook_url, webhook_events } = c.req.valid("json");
        try {
            const result = await query("UPDATE sessions SET webhook_url = $1, webhook_events = $2, updated_at = CURRENT_TIMESTAMP WHERE session_name = $3 RETURNING *", [webhook_url || null, JSON.stringify(webhook_events || {}), name]);
            if (result.rows.length === 0) {
                throw new HTTPException(404, { message: "Session not found" });
            }
            return c.json({ success: true, session: result.rows[0] });
        }
        catch (error) {
            console.error(`Error updating webhook for ${name}:`, error);
            if (error instanceof HTTPException)
                throw error;
            throw new HTTPException(500, { message: "Failed to update webhook" });
        }
    });
    // Endpoint to regenerate API key by name
    app.post("/:name/regenerate-key", createKeyMiddleware(), async (c) => {
        const name = c.req.param("name");
        try {
            const newApiKey = crypto.randomBytes(32).toString('hex');
            const result = await query("UPDATE sessions SET api_key = $1, updated_at = CURRENT_TIMESTAMP WHERE session_name = $2 RETURNING *", [newApiKey, name]);
            if (result.rows.length === 0) {
                throw new HTTPException(404, { message: "Session not found" });
            }
            return c.json({ success: true, api_key: newApiKey });
        }
        catch (error) {
            console.error(`Error regenerating API key for ${name}:`, error);
            if (error instanceof HTTPException)
                throw error;
            throw new HTTPException(500, { message: "Failed to regenerate API key" });
        }
    });
    // Endpoint to pair with phone number  
    app.post("/pair-phone", createKeyMiddleware(), requestValidator("json", z.object({
        session: z.string(),
        phone: z.string()
    })), async (c) => {
        const { session, phone } = c.req.valid("json");
        try {
            // Return 501 Not Implemented, as requested by frontend logic
            return c.json({
                success: false,
                message: "Phone pairing sedang dalam pengembangan. Silakan gunakan QR Code.",
                use_qr: true
            }, 501);
        }
        catch (error) {
            console.error("Error pairing with phone:", error);
            throw new HTTPException(500, { message: "Failed to pair with phone number" });
        }
    });
    // Endpoint to delete a session by name
    app.delete("/:name", createKeyMiddleware(), async (c) => {
        const sessionName = c.req.param("name");
        try {
            // 1. Get session id
            const sessionResult = await query('SELECT id FROM sessions WHERE session_name = $1', [sessionName]);
            if (sessionResult.rows.length > 0) {
                const sessionId = sessionResult.rows[0].id;
                // 2. Delete associated webhooks from the DATABASE
                await query("DELETE FROM webhooks WHERE session_id = $1", [sessionId]);
            }
            // 3. Delete from the library
            await whatsapp.deleteSession(sessionName);
            // 4. Delete from the DATABASE
            await query("DELETE FROM sessions WHERE session_name = $1", [sessionName]);
            return c.json({ success: true, message: "Session deleted successfully" });
        }
        catch (error) {
            console.error(`Error deleting session ${sessionName}:`, error);
            throw new HTTPException(500, { message: "Failed to delete session" });
        }
    });
    return app;
};
