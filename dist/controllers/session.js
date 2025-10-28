import { Hono } from "hono";
import { toDataURL } from "qrcode";
import * as whatsapp from "wa-multi-session";
import { createKeyMiddleware } from "../middlewares/key.middleware.js";
import { requestValidator } from "../middlewares/validation.middleware.js";
import { query } from "../lib/postgres.js"; // <-- IMPORT DB QUERY
export const createSessionController = () => {
    const app = new Hono();
    app.get("/", createKeyMiddleware(), async (c) => {
        const result = await query('SELECT * FROM sessions ORDER BY created_at DESC');
        return c.json({
            data: result.rows, // <-- USE DATABASE DATA
        });
    });
    import { z } from "zod";
    import { HTTPException } from "hono/http-exception";
    import crypto from "crypto";
    export const createSessionController = () => {
        const app = new Hono();
        app.get("/", createKeyMiddleware(), async (c) => {
            const result = await query('SELECT * FROM sessions ORDER BY created_at DESC');
            return c.json({
                data: result.rows, // <-- USE DATABASE DATA
            });
        });
        const startSessionSchema = z.object({
            session: z.string(),
        });
        app.post("/start", createKeyMiddleware(), requestValidator("json", startSessionSchema), async (c) => {
            const payload = c.req.valid("json");
            const qr = await new Promise(async (r) => {
                try {
                    await whatsapp.startSession(payload.session, {
                        onConnected() {
                            r(null);
                        },
                        onQRUpdated(qr) {
                            r(qr);
                        },
                    });
                    // Also save to DB after starting
                    const apiKey = crypto.randomBytes(32).toString('hex');
                    await query('INSERT INTO sessions (session_name, api_key, status) VALUES ($1, $2, $3) ON CONFLICT (session_name) DO UPDATE SET status = $3', [payload.session, apiKey, 'connecting']);
                }
                catch (error) {
                    console.error('Start session error:', error);
                    r(null); // Resolve with null on error
                }
            });
            if (qr) {
                return c.json({ qr: await toDataURL(qr) });
            }
            // If already connected and no QR is generated
            await query("UPDATE sessions SET status = 'online' WHERE session_name = $1", [payload.session]);
            return c.json({
                data: {
                    message: "Connected",
                },
            });
        });
        app.get("/start", createKeyMiddleware(), requestValidator("query", startSessionSchema), async (c) => {
            const payload = c.req.valid("query");
            const isExist = whatsapp.getSession(payload.session);
            if (isExist) {
                throw new HTTPException(400, {
                    message: "Session already exist",
                });
            }
            const qr = await new Promise(async (r) => {
                await whatsapp.startSession(payload.session, {
                    onConnected() {
                        r(null);
                    },
                    onQRUpdated(qr) {
                        r(qr);
                    },
                });
            });
            if (qr) {
                return c.render(`
            <div id="qrcode"></div>

            <script type="text/javascript">
                let qr = '${await toDataURL(qr)}'
                let image = new Image()
                image.src = qr
                document.body.appendChild(image)
            </script>
            `);
            }
            return c.json({
                data: {
                    message: "Connected",
                },
            });
        });
        app.all("/logout", createKeyMiddleware(), async (c) => {
            await whatsapp.deleteSession(c.req.query().session || (await c.req.json()).session || "");
            return c.json({
                data: "success",
            });
        });
        app.get("/:name/status", createKeyMiddleware(), async (c) => {
            const name = c.req.param("name");
            const session = whatsapp.getSession(name);
            console.log('SESSION OBJECT:', session); // <-- DEBUG LOG
            if (!session) {
                throw new HTTPException(404, { message: "Session not found" });
            }
            return c.json({
                success: true,
                status: session ? 'found' : 'not_found', // Temporary status
            });
        });
        return app;
    };
};
