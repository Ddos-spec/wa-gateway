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
    } catch (error) {
      console.error("Error fetching sessions from DB:", error);
      throw new HTTPException(500, { message: "Failed to fetch sessions" });
    }
  });

  // Endpoint to create a new session
  app.post(
    "/start",
    createKeyMiddleware(),
    requestValidator("json", z.object({ session: z.string() })),
    async (c) => {
      const payload = c.req.valid("json");
      try {
        // 1. Start the session in the library
        const qr = await new Promise<string | null>((resolve) => {
          whatsapp.startSession(payload.session, {
            onConnected: () => resolve(null),
            onQRUpdated: (qr) => resolve(qr),
          });
        });

        // 2. Save the session to the DATABASE
        const apiKey = crypto.randomBytes(32).toString('hex');
                  await query(
                    'INSERT INTO sessions (session_name, status, api_key) VALUES ($1, $2, $3) ON CONFLICT (session_name) DO UPDATE SET status = $2',
                    [payload.session, 'connecting', apiKey]
                  );
        if (qr) {
          return c.json({ qr: await toDataURL(qr) });
        }

        // If already connected (no QR)
        await query("UPDATE sessions SET status = 'online' WHERE session_name = $1", [payload.session]);
        return c.json({ message: "Already connected" });

      } catch (error) {
        console.error("Error starting session:", error);
        throw new HTTPException(500, { message: "Failed to start session" });
      }
    }
  );

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
    } catch (error) {
      console.error(`Error fetching session ${name}:`, error);
      if (error instanceof HTTPException) throw error;
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
    } catch (error) {
      console.error(`Error fetching status for ${name}:`, error);
      if (error instanceof HTTPException) throw error;
      throw new HTTPException(500, { message: "Failed to get session status" });
    }
  });

  // Endpoint to update webhook by name
  app.put(
    "/:name/webhook",
    createKeyMiddleware(),
    requestValidator(
      "json",
      z.object({
        webhook_url: z.string().url().optional(),
        webhook_events: z.array(z.string()).optional(),
      })
    ),
    async (c) => {
      const name = c.req.param("name");
      const { webhook_url, webhook_events } = c.req.valid("json");
      try {
        const result = await query(
          "UPDATE sessions SET webhook_url = $1, webhook_events = $2, updated_at = CURRENT_TIMESTAMP WHERE session_name = $3 RETURNING *",
          [webhook_url, JSON.stringify(webhook_events), name]
        );
        if (result.rows.length === 0) {
          throw new HTTPException(404, { message: "Session not found" });
        }
        return c.json({ success: true, session: result.rows[0] });
      } catch (error) {
        console.error(`Error updating webhook for ${name}:`, error);
        if (error instanceof HTTPException) throw error;
        throw new HTTPException(500, { message: "Failed to update webhook" });
      }
    }
  );

  // Endpoint to regenerate API key by name
  app.post(
    "/:name/regenerate-key",
    createKeyMiddleware(),
    async (c) => {
      const name = c.req.param("name");
      try {
        const newApiKey = crypto.randomBytes(32).toString('hex');
        const result = await query(
          "UPDATE sessions SET api_key = $1, updated_at = CURRENT_TIMESTAMP WHERE session_name = $2 RETURNING *",
          [newApiKey, name]
        );
        if (result.rows.length === 0) {
          throw new HTTPException(404, { message: "Session not found" });
        }
        return c.json({ success: true, api_key: newApiKey });
      } catch (error) {
        console.error(`Error regenerating API key for ${name}:`, error);
        if (error instanceof HTTPException) throw error;
        throw new HTTPException(500, { message: "Failed to regenerate API key" });
      }
    }
  );

  // Endpoint to delete a session by name
  app.delete("/:name", createKeyMiddleware(), async (c) => {
    const sessionName = c.req.param("name");
    try {
      // 1. Delete from the library
      await whatsapp.deleteSession(sessionName);
      // 2. Delete from the DATABASE
      await query("DELETE FROM sessions WHERE session_name = $1", [sessionName]);
      return c.json({ success: true, message: "Session deleted successfully" });
    } catch (error) {
      console.error(`Error deleting session ${sessionName}:`, error);
      throw new HTTPException(500, { message: "Failed to delete session" });
    }
  });

  return app;
};