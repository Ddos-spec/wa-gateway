Apa aja yang berubah:

src/index.ts (dan dist/index.js): Ini perubahan paling gede. Logika webhook-nya gue rombak total. Sekarang dia bakal:

Ngambil semua URL webhook yang aktif dari tabel webhooks (bukan cuma satu dari tabel sessions).

Ngirim update status (connected, disconnected, dll.) ke semua webhook yang langganan event update_status.

Ngirim update pesan (message, image, video, dll.) ke semua webhook yang langganan event tersebut.

Gue juga benerin rute API-nya dari /api/session jadi /session biar nyambung sama panggilan dari backend.

src/controllers/session.ts (dan dist/controllers/session.js):

Waktu nge-delete session (DELETE /:name), sekarang dia otomatis ngebersihin semua webhook yang nempel sama session itu di tabel webhooks dulu, baru ngehapus session-nya. Jadi gak ada data sampah.

Endpoint POST /start sekarang lebih pinter, dia nge-cek dulu session-nya ada di DB atau enggak.

backend/routes/sessions.js:

QR Code: GET /:name/qr sekarang manggil gateway pake POST (ini yang bener) buat minta QR.

Create Session: POST / udah gak usah pusing-pusing manggil gateway, cukup bikin data di DB. Nanti frontend yang minta QR.

Pair Phone: POST /:name/pair-phone sekarang langsung ngasih tau "fitur belum siap, pake QR aja", sesuai balikan dari gateway.

Delete Session: DELETE /:name sekarang manggil endpoint DELETE di gateway (bukan GET /logout lagi), biar logic delete yang baru (di poin 2) kepake.

Test Message: Gue benerin cara manggil API-nya, pake API key di query param, bukan Bearer token.

frontend/assets/js/detail.js:

Toggle On/Off: Gue tambahin fungsi toggleWebhook dan gue modif renderWebhooks buat nampilin tombol switch on/off. Sekarang tombol itu beneran manggil API PATCH .../toggle di backend.

Copy API Key: Gue tambahin fallback document.execCommand('copy') biar tetep bisa jalan di beberapa environment.

Load QR: Gue benerin sedikit logikanya biar gak error kalo pas di-load ternyata session-nya udah connected.

dist/repositories/config.repository.js & dist/services/auth.service.js:

Ini gue compile ulang dari file .ts aslinya. Yang lama itu salah, masih nyari kolom password padahal di DB namanya password_hash. Sekarang udah bener.

Harusnya sekarang semua tombol di halaman detail itu udah idup sesuai fungsinya, boss. Webhook-nya juga udah beneran ngeloop ke semua URL yang aktif. Coba lo tes lagi. Kalo ada yang macet, kabarin aja!


src/index.ts
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono, type Context } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import moment from "moment";
import * as whatsapp from "wa-multi-session";
import { createAuthController } from "./controllers/auth.js";
import { createMessageController } from "./controllers/message.js";
import { createProfileController } from "./controllers/profile.js";
import { createSessionController } from "./controllers/session.js";
import { env } from "./env.js";
import { globalErrorMiddleware } from "./middlewares/error.middleware.js";
import { notFoundMiddleware } from "./middlewares/notfound.middleware.js";
import { CreateWebhookProps, webhookClient } from "./webhooks/index.js";
import { createWebhookMessage, WebhookMessageBody } from "./webhooks/message.js";
import { createWebhookSession, WebhookSessionBody } from "./webhooks/session.js";
import { query } from "./lib/postgres.js";

const app = new Hono();

const defaultAllowedOrigins = [
  "https://ddos-spec.github.io",
  "http://localhost:3000",
  "http://localhost:5173",
  "http://127.0.0.1:3000",
  "http://127.0.0.1:5173",
];

const configuredOrigins = new Set(defaultAllowedOrigins);

if (env.FRONTEND_URL) {
  configuredOrigins.add(env.FRONTEND_URL);
}

if (env.ALLOWED_ORIGINS.length) {
  env.ALLOWED_ORIGINS.forEach((origin) => configuredOrigins.add(origin));
}

const allowedOrigins = Array.from(configuredOrigins);
console.log('Allowed Origins:', allowedOrigins); // <-- DEBUG LOG
const defaultOrigin =
  allowedOrigins[0] ?? "https://ddos-spec.github.io";

const resolveOrigin = (origin?: string | null) => {
  if (!origin) {
    return defaultOrigin;
  }

  if (configuredOrigins.has(origin)) {
    return origin;
  }

  if (origin.includes("github.io")) {
    return origin;
  }

  return undefined;
};

const selectOrigin = (origin?: string | null) => resolveOrigin(origin) ?? defaultOrigin;

const applyPreflightHeaders = (c: Context) => {
  const requestedOrigin = c.req.header("Origin");
  const allowedOrigin = selectOrigin(requestedOrigin);

  if (allowedOrigin) {
    c.header("Access-Control-Allow-Origin", allowedOrigin);
    c.header("Access-Control-Allow-Credentials", "true");
  }

  c.header(
    "Access-Control-Allow-Methods",
    "GET,POST,PUT,DELETE,OPTIONS,PATCH"
  );
  c.header(
    "Access-Control-Allow-Headers",
    "Content-Type,Authorization,X-Requested-With,Accept"
  );
  c.header("Access-Control-Max-Age", "86400");
  c.header("Vary", "Origin");
};

app.use(
  "/*",
  cors({
    origin: (origin) => {
      console.log('Incoming request origin:', origin); // <-- DEBUG LOG
      return selectOrigin(origin) ?? "";
    },
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
    allowHeaders: ["Content-Type", "Authorization", "X-Requested-With", "Accept"],
    exposeHeaders: ["Content-Length", "X-Request-Id"],
    maxAge: 86_400,
    credentials: true,
  })
);

app.options("*", (c) => {
  applyPreflightHeaders(c);
  return c.newResponse(null, 204);
});

/**
 * auth routes
 */
console.log("Registering auth routes...");
app.route("/auth", createAuthController());
console.log("Auth routes registered.");

app.use(
  "*",
  logger((...params) => {
    params.forEach((param) =>
      console.log(`${moment().toISOString()} | ${param}`)
    );
  })
);

app.get("/", (c) =>
  c.json({
    status: "ok",
    message: "WA Gateway API is running",
    timestamp: new Date().toISOString(),
  })
);

/**
 * serve media message static files
 */
app.use(
  "/media/*",
  serveStatic({
    root: "./",
  })
);

/**
 * session routes
 * FIX: Changed route from "/api/session" to "/session" to match backend calls
 */
app.route("/session", createSessionController());
/**
 * message routes
 */
app.route("/message", createMessageController());
/**
 * profile routes
 */
app.route("/profile", createProfileController());
/**
 * auth routes
 */
console.log("Registering auth routes...");
app.route("/auth", createAuthController());
console.log("Auth routes registered.");

app.notFound(notFoundMiddleware);
app.onError(globalErrorMiddleware);

const port = env.PORT;

serve(
  {
    fetch: app.fetch,
    port,
  },
  (info) => {
    console.log(`Server is running on http://localhost:${info.port}`);
  }
);


// --- NEW WEBHOOK LOGIC ---

// Helper function to get active webhooks for a session
const getActiveWebhooks = async (sessionName: string) => {
  try {
    const sessionResult = await query("SELECT id FROM sessions WHERE session_name = $1", [sessionName]);
    if (sessionResult.rows.length === 0) {
      return [];
    }
    const sessionId = sessionResult.rows[0].id;
    
    const webhooksResult = await query(
      "SELECT * FROM webhooks WHERE session_id = $1 AND is_active = true",
      [sessionId]
    );
    
    return webhooksResult.rows;
  } catch (error) {
    console.error(`Error fetching webhooks for ${sessionName}:`, error);
    return [];
  }
};

// Helper function to dispatch webhooks
const dispatchWebhook = (webhook: any, body: WebhookMessageBody | WebhookSessionBody, eventType: string) => {
  try {
    const events = typeof webhook.webhook_events === 'string' 
      ? JSON.parse(webhook.webhook_events) 
      : webhook.webhook_events;

    if (events[eventType]) {
      webhookClient.post(webhook.webhook_url, body).catch(err => 
        console.error(`Failed to send webhook to ${webhook.webhook_url}:`, err.message)
      );
    }
  } catch (e) {
    console.error(`Error parsing webhook events for ${webhook.webhook_url}:`, e);
  }
};

// --- WHATSAPP EVENT LISTENERS ---

whatsapp.onMessageReceived(async (message) => {
  if (message.key.fromMe || message.key.remoteJid?.includes("broadcast"))
    return;

  const activeWebhooks = await getActiveWebhooks(message.sessionId);
  if (activeWebhooks.length === 0) return;

  // Create the webhook body
  const webhookBody = await createWebhookMessage(message);
  if (!webhookBody) return;

  // Dispatch to all interested webhooks
  for (const webhook of activeWebhooks) {
    let eventType = 'individual'; // Default
    if (message.key.remoteJid?.includes('@g.us')) eventType = 'group';
    if (webhookBody.media.image) eventType = 'image';
    if (webhookBody.media.video) eventType = 'video';
    if (webhookBody.media.audio) eventType = 'audio';
    if (webhookBody.media.document) eventType = 'document';
    // Note: sticker event type is missing from original logic, add if needed
    
    dispatchWebhook(webhook, webhookBody, eventType);
  }
});

whatsapp.onConnected(async (session) => {
  console.log(`session: '${session}' connected`);
  try {
    const sessionInfo = whatsapp.getSession(session);
    const waNumber = sessionInfo?.user?.id.split('@')[0] || '';
    const profileName = sessionInfo?.user?.name ?? '';

    await query(
      "UPDATE sessions SET status = 'online', wa_number = $1, profile_name = $2, updated_at = CURRENT_TIMESTAMP WHERE session_name = $3",
      [waNumber, profileName, session]
    );

    const activeWebhooks = await getActiveWebhooks(session);
    if (activeWebhooks.length === 0) return;

    const body = { session, status: "connected" } as WebhookSessionBody;
    for (const webhook of activeWebhooks) {
      dispatchWebhook(webhook, body, 'update_status');
    }

  } catch (error) {
    console.error(`Error getting profile info for session ${session}:`, error);
    await query("UPDATE sessions SET status = 'online', updated_at = CURRENT_TIMESTAMP WHERE session_name = $1", [session]);
  }
});

whatsapp.onConnecting(async (session) => {
  console.log(`session: '${session}' connecting`);
  await query("UPDATE sessions SET status = 'connecting', updated_at = CURRENT_TIMESTAMP WHERE session_name = $1", [session]);
  
  const activeWebhooks = await getActiveWebhooks(session);
  if (activeWebhooks.length === 0) return;

  const body = { session, status: "connecting" } as WebhookSessionBody;
  for (const webhook of activeWebhooks) {
    dispatchWebhook(webhook, body, 'update_status');
  }
});

whatsapp.onDisconnected(async (session) => {
  console.log(`session: '${session}' disconnected`);
  await query("UPDATE sessions SET status = 'offline', updated_at = CURRENT_TIMESTAMP WHERE session_name = $1", [session]);
  
  const activeWebhooks = await getActiveWebhooks(session);
  if (activeWebhooks.length === 0) return;

  const body = { session, status: "disconnected" } as WebhookSessionBody;
  for (const webhook of activeWebhooks) {
    dispatchWebhook(webhook, body, 'update_status');
  }
});

whatsapp.loadSessionsFromStorage();

src/controllers/session.ts
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

  // Endpoint to create a new session or get QR
  app.post(
    "/start",
    createKeyMiddleware(),
    requestValidator("json", z.object({ session: z.string() })),
    async (c) => {
      const payload = c.req.valid("json");
      try {
        // 1. Check if session exists in DB
        const dbSession = await query("SELECT * FROM sessions WHERE session_name = $1", [payload.session]);

        // 2. Start the session in the library
        const qr = await new Promise<string | null>((resolve) => {
          whatsapp.startSession(payload.session, {
            onConnected: () => resolve(null),
            onQRUpdated: (qr) => resolve(qr),
          });
        });

        // 3. Save/Update the session to the DATABASE
        if (dbSession.rows.length === 0) {
          const apiKey = crypto.randomBytes(32).toString('hex');
          await query(
            'INSERT INTO sessions (session_name, status, api_key) VALUES ($1, $2, $3)',
            [payload.session, 'connecting', apiKey]
          );
        } else {
          await query(
            'UPDATE sessions SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE session_name = $2',
            ['connecting', payload.session]
          );
        }
                  
        if (qr) {
          return c.json({ qr: await toDataURL(qr) });
        }

        // If already connected (no QR)
        await query("UPDATE sessions SET status = 'online', updated_at = CURRENT_TIMESTAMP WHERE session_name = $1", [payload.session]);
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

  // Endpoint to update webhook by name (DEPRECATED - Use /api/webhooks from backend)
  app.put(
    "/:name/webhook",
    createKeyMiddleware(),
    requestValidator(
      "json",
      z.object({
        webhook_url: z.string().url().optional().nullable(),
        webhook_events: z.record(z.boolean()).optional(),
      })
    ),
    async (c) => {
        // This logic is deprecated because the `sessions` table webhook columns are deprecated
        // The real logic is in `backend/routes/webhooks.js`
      const name = c.req.param("name");
      const { webhook_url, webhook_events } = c.req.valid("json");
      try {
        const result = await query(
          "UPDATE sessions SET webhook_url = $1, webhook_events = $2, updated_at = CURRENT_TIMESTAMP WHERE session_name = $3 RETURNING *",
          [webhook_url || null, JSON.stringify(webhook_events || {}), name]
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

  // Endpoint to pair with phone number  
  app.post(
    "/pair-phone",
    createKeyMiddleware(),
    requestValidator("json", z.object({ 
      session: z.string(),
      phone: z.string() 
    })),
    async (c) => {
      const { session, phone } = c.req.valid("json");
      try {
        // Return 501 Not Implemented, as requested by frontend logic
        return c.json({ 
          success: false, 
          message: "Phone pairing sedang dalam pengembangan. Silakan gunakan QR Code.",
          use_qr: true
        }, 501);
      } catch (error) {
        console.error("Error pairing with phone:", error);
        throw new HTTPException(500, { message: "Failed to pair with phone number" });
      }
    }
  );

  // Endpoint to delete a session by name
  app.delete("/:name", createKeyMiddleware(), async (c) => {
    const sessionName = c.req.param("name");
    try {
      // 1. Get session id
      const sessionResult = await query(
        'SELECT id FROM sessions WHERE session_name = $1',
        [sessionName]
      );

      if (sessionResult.rows.length > 0) {
        const sessionId = sessionResult.rows[0].id;
        // 2. Delete associated webhooks from the DATABASE
        await query("DELETE FROM webhooks WHERE session_id = $1", [sessionId]);
      }
      
      // 3. Delete from the library
      await whatsapp.deleteSession(sessionName);
      
      // 4. Delete from the sessions DATABASE
      await query("DELETE FROM sessions WHERE session_name = $1", [sessionName]);
      
      return c.json({ success: true, message: "Session deleted successfully" });
    } catch (error) {
      console.error(`Error deleting session ${sessionName}:`, error);
      throw new HTTPException(500, { message: "Failed to delete session" });
    }
  });

  // Legacy logout route (called by old backend)
  app.all("/logout", createKeyMiddleware(), async (c) => {
    const sessionName = c.req.query().session || (await c.req.json()).session || "";
    try {
      // 1. Delete from the library
      await whatsapp.deleteSession(sessionName);
      // 2. Delete from the DATABASE (will also cascade delete webhooks)
      // Note: This logic is duplicated in DELETE /:name, which is better
      await query("DELETE FROM sessions WHERE session_name = $1", [sessionName]);
      return c.json({ data: "success" });
    } catch (error) {
      console.error(`Error logging out session ${sessionName}:`, error);
      throw new HTTPException(500, { message: "Failed to logout session" });
    }
  });


  return app;
};


backend/routes/sessions.js
import express from 'express';
import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';
import pool from '../config/db.js';
import authMiddleware from '../middleware/auth.js';

const router = express.Router();

function generateApiKey() {
  return uuidv4().replace(/-/g, '') + uuidv4().replace(/-/g, '');
}

// GET ALL SESSIONS
router.get('/', authMiddleware, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM sessions ORDER BY created_at DESC');
    res.json({ success: true, sessions: result.rows });
  } catch (error) {
    console.error('Get sessions error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch sessions' });
  }
});

// GET SINGLE SESSION BY NAME
router.get('/:name', authMiddleware, async (req, res) => {
  try {
    const { name } = req.params;
    console.log('Received session name for GET /:name:', name);
    const result = await pool.query('SELECT * FROM sessions WHERE session_name = $1', [name]);
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Session not found' });
    }
    res.json({ success: true, session: result.rows[0] });
  } catch (error) {
    console.error('Get session by name error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch session' });
  }
});

// GET SESSION STATUS BY NAME
router.get('/:name/status', authMiddleware, async (req, res) => {
  try {
    const { name } = req.params;
    const result = await pool.query('SELECT status FROM sessions WHERE session_name = $1', [name]);
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Session not found' });
    }
    res.json({ success: true, status: result.rows[0].status });
  } catch (error) {
    console.error('Get session status error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch session status' });
  }
});

// GET QR CODE FOR SESSION BY NAME
router.get('/:name/qr', authMiddleware, async (req, res) => {
  try {
    const { name } = req.params;
    
    // FIX: Panggil gateway menggunakan POST /session/start
    const response = await axios.post(`${process.env.WA_GATEWAY_URL}/session/start`, 
      { session: name }
    );
    
    // Kirim QR jika ada, atau status jika sudah terhubung
    if (response.data.qr) {
      res.json({ success: true, qr: response.data.qr });
    } else {
      res.json({ success: true, qr: null, message: response.data.message || 'Already connected' });
    }
  } catch (error) {
    console.error('Get QR code error:', error.response?.data || error.message);
    res.status(500).json({ success: false, error: error.response?.data?.message || 'Failed to fetch QR code' });
  }
});

// PAIR WITH PHONE NUMBER
router.post('/:name/pair-phone', authMiddleware, async (req, res) => {
  try {
    const { name } = req.params;
    const { phone_number } = req.body;
    
    if (!phone_number) {
      return res.status(400).json({ success: false, error: 'Phone number is required' });
    }
    
    // FIX: Langsung kembalikan error 501/not implemented
    // Karena gateway (src/controllers/session.ts) mengembalikan 501
    return res.status(501).json({ 
      success: false, 
      error: "Phone pairing sedang dalam pengembangan. Silakan gunakan QR Code.",
      use_qr: true 
    });

  } catch (error) {
    console.error('Pair phone error:', error);
    res.status(500).json({ success: false, error: error.response?.data?.message || 'Failed to pair with phone number' });
  }
});

// CREATE NEW SESSION
router.post('/', authMiddleware, async (req, res) => {
  try {
    const { session_name } = req.body;
    if (!session_name) {
      return res.status(400).json({ success: false, error: 'Session name is required' });
    }
    const existingSession = await pool.query('SELECT id FROM sessions WHERE session_name = $1', [session_name]);
    if (existingSession.rows.length > 0) {
      return res.status(400).json({ success: false, error: 'Session name already exists' });
    }
    const apiKey = generateApiKey();
    // FIX: Default status harusnya 'connecting' atau 'offline'
    const result = await pool.query(
      'INSERT INTO sessions (session_name, api_key, status) VALUES ($1, $2, $3) RETURNING *', 
      [session_name, apiKey, 'offline']
    );
    
    // FIX: Hapus trigger gateway dari sini.
    // Frontend (dashboard.js) akan memanggil /:name/qr setelah ini,
    // yang akan memicu /session/start di gateway.
    
    res.status(201).json({ success: true, session: result.rows[0] });
  } catch (error) {
    console.error('Create session error:', error);
    res.status(500).json({ success: false, error: 'Failed to create session' });
  }
});



// REGENERATE API KEY BY NAME
router.post('/:name/regenerate-key', authMiddleware, async (req, res) => {
  try {
    const { name } = req.params;
    const newApiKey = generateApiKey();
    const result = await pool.query(
      'UPDATE sessions SET api_key = $1, updated_at = CURRENT_TIMESTAMP WHERE session_name = $2 RETURNING *', 
      [newApiKey, name]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Session not found' });
    }
    res.json({ success: true, api_key: newApiKey });
  } catch (error) {
    console.error('Regenerate key error:', error);
    res.status(500).json({ success: false, error: 'Failed to regenerate API key' });
  }
});

// TEST MESSAGE
router.post('/:name/test-message', authMiddleware, async (req, res) => {
  try {
    const { name } = req.params;
    const { phone_number, message } = req.body;

    if (!phone_number || !message) {
      return res.status(400).json({ success: false, error: 'Phone number and message are required' });
    }
    
    // Dapatkan API Key dari session
    const sessionResult = await pool.query('SELECT api_key FROM sessions WHERE session_name = $1', [name]);
    if (sessionResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Session not found' });
    }
    const apiKey = sessionResult.rows[0].api_key;

    // Panggil gateway untuk mengirim pesan
    // Gateway Hono menggunakan 'key' sebagai query param atau header, bukan auth bearer
    await axios.post(`${process.env.WA_GATEWAY_URL}/message/send-text?key=${apiKey}`, {
      session: name,
      to: phone_number,
      text: message
    });

    res.json({ success: true, message: 'Test message sent successfully' });
  } catch (error) {
    console.error('Send test message error:', error.response?.data || error.message);
    res.status(500).json({ success: false, error: error.response?.data?.message || 'Failed to send test message' });
  }
});

// DELETE SESSION BY NAME
router.delete('/:name', authMiddleware, async (req, res) => {
  try {
    const { name } = req.params;
    
    // FIX: Panggil endpoint DELETE di gateway, bukan /logout
    // Ini akan memicu logika delete yang sudah diupdate di gateway (termasuk delete webhooks)
    try {
      await axios.delete(`${process.env.WA_GATEWAY_URL}/session/${name}`);
    } catch (error) {
      // Abaikan error jika session sudah tidak ada di gateway, tapi log
      console.error('Failed to logout session on wa-gateway (might be already offline):', error.message);
    }
    
    // Hapus dari database backend
    // Relasi CASCADE di DB akan otomatis menghapus webhooks dan logs
    const result = await pool.query('DELETE FROM sessions WHERE session_name = $1', [name]);
    
    if (result.rowCount === 0) {
        return res.status(404).json({ success: false, error: 'Session not found in DB' });
    }
    res.json({ success: true, message: 'Session deleted successfully' });
  } catch (error) {
    console.error('Delete session error:', error);
    res.status(500).json({ success: false, error: 'Failed to delete session' });
  }
});

export default router;

frontend/assets/js/detail.js
// Check authentication
if (!checkAuth()) {
    window.location.href = 'index.html';
}

// Get session ID from URL
const urlParams = new URLSearchParams(window.location.search);
const sessionId = urlParams.get('session');

if (!sessionId) {
    showToast('error', 'Session ID tidak ditemukan');
    setTimeout(() => {
        window.location.href = 'dashboard.html';
    }, 2000);
}

let session = null;
let statusPolling = null;

// Load session details
async function loadSessionDetails() {
    try {
        const response = await fetch(`${config.backendApiUrl}${config.endpoints.sessions}/${sessionId}`, {
            headers: {
                'Authorization': `Bearer ${getToken()}`
            }
        });
        
        const data = await response.json();
        
        if (response.ok && data.session) {
            session = data.session;
            renderSessionDetails();
            updateStatus();
            startStatusPolling();
            loadWebhooks(); // Load webhooks after session details
        } else {
            showToast('error', data.error || 'Gagal memuat detail session');
            setTimeout(() => {
                window.location.href = 'dashboard.html';
            }, 2000);
        }
    } catch (error) {
        console.error('Load session details error:', error);
        showToast('error', 'Terjadi kesalahan saat memuat detail session');
    }
}

// Render session details
function renderSessionDetails() {
    document.getElementById('sessionName').textContent = session.session_name;
    document.getElementById('profileName').textContent = session.profile_name || 'Belum terhubung';
    document.getElementById('waNumber').textContent = session.wa_number || '-';
    document.getElementById('createdAt').textContent = new Date(session.created_at).toLocaleString('id-ID');
    document.getElementById('apiKey').value = session.api_key;
}

// Update status
async function updateStatus() {
    try {
        const response = await fetch(`${config.backendApiUrl}${config.endpoints.sessions}/${sessionId}/status`, {
            headers: {
                'Authorization': `Bearer ${getToken()}`
            }
        });
        
        const data = await response.json();
        
        if (response.ok && data.success) {
            const statusBadge = document.getElementById('statusBadge');
            statusBadge.textContent = data.status;
            statusBadge.className = 'badge';
            
            if (data.status === 'online' || data.status === 'connected') {
                statusBadge.classList.add('bg-success');
                document.getElementById('pairingSection').style.display = 'none';
            } else {
                statusBadge.classList.remove('bg-success');
                document.getElementById('pairingSection').style.display = 'block';
                if (data.status === 'connecting' || data.status === 'offline') {
                    statusBadge.classList.add('bg-warning');
                    loadQrCode(); // Attempt to load QR code
                } else {
                    statusBadge.classList.add('bg-secondary');
                }
            }
        }
    } catch (error) {
        console.error('Update status error:', error);
    }
}

// Load QR Code
async function loadQrCode() {
    const qrContainer = document.getElementById('qrCodeContainer');
    qrContainer.innerHTML = `
        <div class="text-center">
            <div class="spinner-border text-primary" role="status">
                <span class="visually-hidden">Loading...</span>
            </div>
            <p class="mt-2 text-muted">Memuat QR Code...</p>
        </div>
    `;

    try {
        // FIX: Backend route is GET, not POST
        const response = await fetch(`${config.backendApiUrl}${config.endpoints.sessions}/${sessionId}/qr`, {
            headers: {
                'Authorization': `Bearer ${getToken()}`
            }
        });

        const data = await response.json();

        if (response.ok && data.qr) {
            qrContainer.innerHTML = `
                <img src="${data.qr}" alt="QR Code" class="img-fluid" style="max-width: 300px;">
                <p class="mt-2 text-muted">Pindai QR code dengan WhatsApp</p>
            `;
        } else if (response.ok && !data.qr) {
             // Already connected, do nothing, updateStatus will handle it
             qrContainer.innerHTML = `<p class="text-success">Sudah terhubung. Status akan segera update.</p>`;
        } else {
            throw new Error(data.error || 'Gagal memuat QR Code');
        }
    } catch (error) {
        console.error('Load QR code error:', error);
        qrContainer.innerHTML = `
            <p class="text-danger">Gagal memuat QR Code.</p>
            <button class="btn btn-primary btn-sm" onclick="loadQrCode()">
                <i class="bi bi-arrow-repeat"></i> Coba Lagi
            </button>
        `;
    }
}


// Start status polling
function startStatusPolling() {
    if (statusPolling) {
        clearInterval(statusPolling);
    }
    statusPolling = setInterval(updateStatus, 5000); // Poll every 5 seconds
}

// Test send message
document.getElementById('testMessageForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const phoneNumber = document.getElementById('testPhoneNumber').value;
    const message = document.getElementById('testMessage').value;
    const sendBtn = e.target.querySelector('button[type="submit"]');

    sendBtn.disabled = true;
    sendBtn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Mengirim...';
    
    try {
        const response = await fetch(`${config.backendApiUrl}${config.endpoints.sessions}/${sessionId}/test-message`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${getToken()}`
            },
            body: JSON.stringify({
                phone_number: phoneNumber,
                message: message
            })
        });
        
        const data = await response.json();
        
        if (response.ok && data.success) {
            showToast('success', 'Pesan tes berhasil dikirim');
            document.getElementById('testMessage').value = '';
        } else {
            showToast('error', data.error || 'Gagal mengirim pesan');
        }
    } catch (error) {
        console.error('Send test message error:', error);
        showToast('error', 'Terjadi kesalahan saat mengirim pesan');
    } finally {
        sendBtn.disabled = false;
        sendBtn.innerHTML = '<i class="bi bi-send"></i> Kirim';
    }
});


// Regenerate API key
async function regenerateApiKey() {
    if (!confirm('Yakin ingin membuat ulang API key? Key yang lama akan menjadi tidak valid.')) {
        return;
    }
    
    try {
        const response = await fetch(`${config.backendApiUrl}${config.endpoints.sessions}/${sessionId}/regenerate-key`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${getToken()}`
            }
        });
        
        const data = await response.json();
        
        if (response.ok && data.success) {
            document.getElementById('apiKey').value = data.api_key;
            showToast('success', 'API Key berhasil dibuat ulang');
        } else {
            showToast('error', data.error || 'Gagal membuat ulang API key');
        }
    } catch (error) {
        console.error('Regenerate API key error:', error);
        showToast('error', 'Terjadi kesalahan saat membuat ulang API key');
    }
}

// Delete session
async function deleteSession() {
    if (!confirm('Yakin ingin menghapus sesi ini? Tindakan ini tidak dapat dibatalkan.')) {
        return;
    }
    
    try {
        const response = await fetch(`${config.backendApiUrl}${config.endpoints.sessions}/${sessionId}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${getToken()}`
            }
        });
        
        const data = await response.json();
        
        if (response.ok && data.success) {
            showToast('success', 'Sesi berhasil dihapus');
            setTimeout(() => {
                window.location.href = 'dashboard.html';
            }, 1500);
        } else {
            showToast('error', data.error || 'Gagal menghapus sesi');
        }
    } catch (error) {
        console.error('Delete session error:', error);
        showToast('error', 'Terjadi kesalahan saat menghapus sesi');
    }
}

let webhooks = [];

// --- Webhook Functions ---
async function loadWebhooks() {
    try {
        const response = await fetch(`${config.backendApiUrl}${config.endpoints.webhooks}/${sessionId}`, {
            headers: { 'Authorization': `Bearer ${getToken()}` }
        });
        const data = await response.json();
        if (response.ok && data.success) {
            webhooks = data.webhooks || [];
            renderWebhooks();
        } else {
            showToast('error', data.error || 'Gagal memuat webhooks');
        }
    } catch (error) {
        console.error('Load webhooks error:', error);
    }
}

function renderWebhooks() {
    const container = document.getElementById('webhooksContainer');
    if (webhooks.length === 0) {
        container.innerHTML = '<div class="text-center text-muted py-3"><p>Belum ada webhook dikonfigurasi.</p></div>';
        return;
    }
    container.innerHTML = webhooks.map((webhook, index) => `
        <div class="card mb-2">
            <div class="card-body p-3">
                <div class="d-flex justify-content-between align-items-center">
                    <div style="flex-grow: 1; min-width: 0;">
                        <p class="mb-0 fw-bold text-break">${webhook.webhook_url}</p>
                        <small class="text-muted">Events: ${getWebhookEventsText(webhook.webhook_events)}</small>
                    </div>
                    <div class="d-flex align-items-center" style="flex-shrink: 0; margin-left: 1rem;">
                        <div class="form-check form-switch me-3">
                            <input class="form-check-input" type="checkbox" role="switch" 
                                   id="toggle-${webhook.id}" 
                                   ${webhook.is_active ? 'checked' : ''} 
                                   onchange="toggleWebhook(this, ${webhook.id})">
                            <label class="form-check-label" for="toggle-${webhook.id}">${webhook.is_active ? 'On' : 'Off'}</label>
                        </div>
                        <div class="btn-group">
                            <button class="btn btn-sm btn-outline-secondary" onclick="editWebhook(${webhook.id})"><i class="bi bi-pencil"></i></button>
                            <button class="btn btn-sm btn-outline-danger" onclick="deleteWebhook(${webhook.id})"><i class="bi bi-trash"></i></button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `).join('');
}

function getWebhookEventsText(events) {
    try {
        const parsed = typeof events === 'string' ? JSON.parse(events) : events;
        if (!parsed || typeof parsed !== 'object') return 'invalid format';
        const enabled = Object.keys(parsed).filter(k => parsed[k]);
        return enabled.length > 0 ? enabled.join(', ') : 'none';
    } catch (e) {
        return 'invalid format';
    }
}

function addWebhook() {
    document.getElementById('webhookModalTitle').textContent = 'Tambah Webhook';
    document.getElementById('webhookForm').reset();
    document.getElementById('webhookId').value = '';
    new bootstrap.Modal(document.getElementById('webhookModal')).show();
}

function editWebhook(id) {
    const webhook = webhooks.find(w => w.id === id);
    if (!webhook) return;

    document.getElementById('webhookModalTitle').textContent = 'Edit Webhook';
    document.getElementById('webhookForm').reset();
    document.getElementById('webhookId').value = webhook.id;
    document.getElementById('webhookUrl').value = webhook.webhook_url;

    try {
        const events = typeof webhook.webhook_events === 'string' ? JSON.parse(webhook.webhook_events) : webhook.webhook_events;
        if (events && typeof events === 'object') {
            for (const key in events) {
                const check = document.getElementById(`webhook${key.charAt(0).toUpperCase() + key.slice(1)}`);
                if (check) check.checked = events[key];
            }
        }
    } catch (e) {
        console.error('Error parsing webhook events:', e);
    }
    new bootstrap.Modal(document.getElementById('webhookModal')).show();
}

async function saveWebhook() {
    const id = document.getElementById('webhookId').value;
    const url = document.getElementById('webhookUrl').value;
    const events = {
        individual: document.getElementById('webhookIndividual').checked,
        group: document.getElementById('webhookGroup').checked,
        from_me: document.getElementById('webhookFromMe').checked,
        update_status: document.getElementById('webhookUpdateStatus').checked, // Renamed from webhookUpdateStatus
        image: document.getElementById('webhookImage').checked,
        video: document.getElementById('webhookVideo').checked,
        audio: document.getElementById('webhookAudio').checked,
        sticker: document.getElementById('webhookSticker').checked,
        document: document.getElementById('webhookDocument').checked,
    };

    const endpoint = id ? `${config.backendApiUrl}${config.endpoints.webhooks}/${sessionId}/${id}` : `${config.backendApiUrl}${config.endpoints.webhooks}/${sessionId}`;
    const method = id ? 'PUT' : 'POST';

    try {
        const response = await fetch(endpoint, {
            method,
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${getToken()}` },
            body: JSON.stringify({ webhook_url: url, webhook_events: events })
        });
        const data = await response.json();
        if (response.ok && data.success) {
            showToast('success', 'Webhook berhasil disimpan');
            bootstrap.Modal.getInstance(document.getElementById('webhookModal')).hide();
            loadWebhooks();
        } else {
            showToast('error', data.error || 'Gagal menyimpan webhook');
        }
    } catch (error) {
        console.error('Save webhook error:', error);
        showToast('error', 'Terjadi kesalahan');
    }
}

async function deleteWebhook(id) {
    if (!confirm('Anda yakin ingin menghapus webhook ini?')) return;

    try {
        const response = await fetch(`${config.backendApiUrl}${config.endpoints.webhooks}/${sessionId}/${id}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${getToken()}` }
        });
        const data = await response.json();
        if (response.ok && data.success) {
            showToast('success', 'Webhook berhasil dihapus');
            loadWebhooks();
        } else {
            showToast('error', data.error || 'Gagal menghapus webhook');
        }
    } catch (error) {
        console.error('Delete webhook error:', error);
        showToast('error', 'Terjadi kesalahan');
    }
}

// NEW: Toggle Webhook Function
async function toggleWebhook(checkbox, id) {
    const label = checkbox.nextElementSibling;
    const originalLabel = label.textContent;
    label.textContent = '...';
    checkbox.disabled = true;

    try {
        const response = await fetch(`${config.backendApiUrl}${config.endpoints.webhooks}/${sessionId}/${id}/toggle`, {
            method: 'PATCH',
            headers: { 'Authorization': `Bearer ${getToken()}` }
        });
        const data = await response.json();
        if (response.ok && data.success) {
            const newStatus = data.webhook.is_active;
            showToast('success', `Webhook ${newStatus ? 'diaktifkan' : 'dinonaktifkan'}`);
            // Update local data
            const webhookIndex = webhooks.findIndex(w => w.id === id);
            if (webhookIndex > -1) {
                webhooks[webhookIndex].is_active = newStatus;
            }
            label.textContent = newStatus ? 'On' : 'Off';
        } else {
            showToast('error', data.error || 'Gagal mengubah status');
            checkbox.checked = !checkbox.checked; // Revert
            label.textContent = originalLabel;
        }
    } catch (error) {
        console.error('Toggle webhook error:', error);
        showToast('error', 'Terjadi kesalahan');
        checkbox.checked = !checkbox.checked; // Revert
        label.textContent = originalLabel;
    } finally {
        checkbox.disabled = false;
    }
}


// --- Phone Pairing Functions ---

// Format nomor telepon otomatis dengan strip
document.getElementById('pairingPhone').addEventListener('input', (e) => {
    let input = e.target.value.replace(/\D/g, ''); // Hapus semua non-digit
    
    // Otomatis tambahkan 62 jika dimulai dengan 0
    if (input.startsWith('0')) {
        input = '62' + input.substring(1);
    }
    
    let formatted = '';
    if (input.length > 2) {
        formatted += input.substring(0, 2); // Kode negara (62)
        
        if (input.length > 2) {
            formatted += '-';
            let rest = input.substring(2);
            // Format sisa nomor per 4 digit
            const chunks = [];
            while (rest.length > 0) {
                chunks.push(rest.substring(0, 4));
                rest = rest.substring(4);
            }
            formatted += chunks.join('-');
        }
    } else {
        formatted = input;
    }
    
    e.target.value = formatted;
});

// Handle submit form pairing nomor
document.getElementById('phonePairingForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const phoneInput = document.getElementById('pairingPhone');
    // Hapus semua strip dan spasi untuk dikirim ke API
    const phoneNumber = phoneInput.value.replace(/[-\s]/g, ''); 
    const pairBtn = document.getElementById('pairPhoneBtn');
    const pairingCodeContainer = document.getElementById('pairingCodeContainer');
    const pairingCode = document.getElementById('pairingCode');

    if (!phoneNumber || phoneNumber.length < 10 || !phoneNumber.startsWith('62')) {
        showToast('error', 'Format nomor telepon tidak valid. Pastikan diawali 62.');
        return;
    }
    
    pairBtn.disabled = true;
    pairBtn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Menghubungkan...';
    pairingCodeContainer.classList.add('d-none');

    try {
        const response = await fetch(`${config.backendApiUrl}${config.endpoints.sessions}/${sessionId}/pair-phone`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${getToken()}`
            },
            body: JSON.stringify({ phone_number: phoneNumber })
        });
        
        const data = await response.json();

        if (response.ok && data.success && data.data && data.data.code) {
            // Jika sukses dan dapat kode pairing (walaupun backend bilang belum support)
            showToast('success', 'Kode pairing diterima! Masukkan di HP Anda.');
            pairingCode.textContent = data.data.code.replace(/(\d{3})(?=\d)/g, '$1 - '); // Format kode pairing
            pairingCodeContainer.classList.remove('d-none');
        } else {
            // Tangani error atau pesan "sedang pengembangan"
            let errorMsg = data.error || data.message || 'Gagal melakukan pairing';
            if (data.use_qr) {
                errorMsg += ' Silakan gunakan Scan QR.';
                // Pindah ke tab QR
                new bootstrap.Tab(document.getElementById('qr-tab')).show();
            }
            showToast('error', errorMsg);
        }
    } catch (error) {
        console.error('Pair phone error:', error);
        showToast('error', 'Terjadi kesalahan saat pairing.');
    } finally {
        pairBtn.disabled = false;
        pairBtn.innerHTML = '<i class="bi bi-link-45deg"></i> Hubungkan';
    }
});


// Utility functions
function copyApiKey() {
    const apiKeyInput = document.getElementById('apiKey');
    apiKeyInput.select();
    
    // Fallback for environments where navigator.clipboard is not available
    try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(apiKeyInput.value).then(() => {
                showToast('success', 'API Key berhasil disalin');
            }).catch(() => {
                showToast('error', 'Gagal menyalin API Key');
            });
        } else {
            // Use execCommand as a fallback
            if (document.execCommand('copy')) {
                showToast('success', 'API Key berhasil disalin (fallback)');
            } else {
                showToast('error', 'Gagal menyalin API Key (fallback)');
            }
        }
    } catch (e) {
        console.error('Copy error', e);
        showToast('error', 'Gagal menyalin API Key');
    }
}



// Initial load
loadSessionDetails();

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
    if (statusPolling) clearInterval(statusPolling);
});

dist/index.js
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import moment from "moment";
import * as whatsapp from "wa-multi-session";
import { createAuthController } from "./controllers/auth.js";
import { createMessageController } from "./controllers/message.js";
import { createProfileController } from "./controllers/profile.js";
import { createSessionController } from "./controllers/session.js";
import { env } from "./env.js";
import { globalErrorMiddleware } from "./middlewares/error.middleware.js";
import { notFoundMiddleware } from "./middlewares/notfound.middleware.js";
import { webhookClient } from "./webhooks/index.js";
import { createWebhookMessage } from "./webhooks/message.js";
import { createWebhookSession } from "./webhooks/session.js";
import { query } from "./lib/postgres.js";
const app = new Hono();
const defaultAllowedOrigins = [
    "https://ddos-spec.github.io",
    "http://localhost:3000",
    "http://localhost:5173",
    "http://127.0.0.1:3000",
    "http://127.0.0.1:5173",
];
const configuredOrigins = new Set(defaultAllowedOrigins);
if (env.FRONTEND_URL) {
    configuredOrigins.add(env.FRONTEND_URL);
}
if (env.ALLOWED_ORIGINS.length) {
    env.ALLOWED_ORIGINS.forEach((origin) => configuredOrigins.add(origin));
}
const allowedOrigins = Array.from(configuredOrigins);
console.log('Allowed Origins:', allowedOrigins); // <-- DEBUG LOG
const defaultOrigin = allowedOrigins[0] ?? "https://ddos-spec.github.io";
const resolveOrigin = (origin) => {
    if (!origin) {
        return defaultOrigin;
    }
    if (configuredOrigins.has(origin)) {
        return origin;
    }
    if (origin.includes("github.io")) {
        return origin;
    }
    return undefined;
};
const selectOrigin = (origin) => resolveOrigin(origin) ?? defaultOrigin;
const applyPreflightHeaders = (c) => {
    const requestedOrigin = c.req.header("Origin");
    const allowedOrigin = selectOrigin(requestedOrigin);
    if (allowedOrigin) {
        c.header("Access-Control-Allow-Origin", allowedOrigin);
        c.header("Access-Control-Allow-Credentials", "true");
    }
    c.header("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS,PATCH");
    c.header("Access-Control-Allow-Headers", "Content-Type,Authorization,X-Requested-With,Accept");
    c.header("Access-Control-Max-Age", "86400");
    c.header("Vary", "Origin");
};
app.use("/*", cors({
    origin: (origin) => {
        console.log('Incoming request origin:', origin); // <-- DEBUG LOG
        return selectOrigin(origin) ?? "";
    },
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
    allowHeaders: ["Content-Type", "Authorization", "X-Requested-With", "Accept"],
    exposeHeaders: ["Content-Length", "X-Request-Id"],
    maxAge: 86_400,
    credentials: true,
}));
app.options("*", (c) => {
    applyPreflightHeaders(c);
    return c.newResponse(null, 204);
});
/**
 * auth routes
 */
console.log("Registering auth routes...");
app.route("/auth", createAuthController());
console.log("Auth routes registered.");
app.use("*", logger((...params) => {
    params.forEach((param) => console.log(`${moment().toISOString()} | ${param}`));
}));
app.get("/", (c) => c.json({
    status: "ok",
    message: "WA Gateway API is running",
    timestamp: new Date().toISOString(),
}));
/**
 * serve media message static files
 */
app.use("/media/*", serveStatic({
    root: "./",
}));
/**
 * session routes
 * FIX: Changed route from "/api/session" to "/session" to match backend calls
 */
app.route("/session", createSessionController());
/**
 * message routes
 */
app.route("/message", createMessageController());
/**
 * profile routes
 */
app.route("/profile", createProfileController());
/**
 * auth routes
 */
console.log("Registering auth routes...");
app.route("/auth", createAuthController());
console.log("Auth routes registered.");
app.notFound(notFoundMiddleware);
app.onError(globalErrorMiddleware);
const port = env.PORT;
serve({
    fetch: app.fetch,
    port,
}, (info) => {
    console.log(`Server is running on http://localhost:${info.port}`);
});
// --- NEW WEBHOOK LOGIC ---
// Helper function to get active webhooks for a session
const getActiveWebhooks = async (sessionName) => {
    try {
        const sessionResult = await query("SELECT id FROM sessions WHERE session_name = $1", [sessionName]);
        if (sessionResult.rows.length === 0) {
            return [];
        }
        const sessionId = sessionResult.rows[0].id;
        const webhooksResult = await query("SELECT * FROM webhooks WHERE session_id = $1 AND is_active = true", [sessionId]);
        return webhooksResult.rows;
    }
    catch (error) {
        console.error(`Error fetching webhooks for ${sessionName}:`, error);
        return [];
    }
};
// Helper function to dispatch webhooks
const dispatchWebhook = (webhook, body, eventType) => {
    try {
        const events = typeof webhook.webhook_events === 'string'
            ? JSON.parse(webhook.webhook_events)
            : webhook.webhook_events;
        if (events[eventType]) {
            webhookClient.post(webhook.webhook_url, body).catch(err => console.error(`Failed to send webhook to ${webhook.webhook_url}:`, err.message));
        }
    }
    catch (e) {
        console.error(`Error parsing webhook events for ${webhook.webhook_url}:`, e);
    }
};
// --- WHATSAPP EVENT LISTENERS ---
whatsapp.onMessageReceived(async (message) => {
    if (message.key.fromMe || message.key.remoteJid?.includes("broadcast"))
        return;
    const activeWebhooks = await getActiveWebhooks(message.sessionId);
    if (activeWebhooks.length === 0)
        return;
    // Create the webhook body
    const webhookBody = await createWebhookMessage(message);
    if (!webhookBody)
        return;
    // Dispatch to all interested webhooks
    for (const webhook of activeWebhooks) {
        let eventType = 'individual'; // Default
        if (message.key.remoteJid?.includes('@g.us'))
            eventType = 'group';
        if (webhookBody.media.image)
            eventType = 'image';
        if (webhookBody.media.video)
            eventType = 'video';
        if (webhookBody.media.audio)
            eventType = 'audio';
        if (webhookBody.media.document)
            eventType = 'document';
        // Note: sticker event type is missing from original logic, add if needed
        dispatchWebhook(webhook, webhookBody, eventType);
    }
});
whatsapp.onConnected(async (session) => {
    console.log(`session: '${session}' connected`);
    try {
        const sessionInfo = whatsapp.getSession(session);
        const waNumber = sessionInfo?.user?.id.split('@')[0] || '';
        const profileName = sessionInfo?.user?.name ?? '';
        await query("UPDATE sessions SET status = 'online', wa_number = $1, profile_name = $2, updated_at = CURRENT_TIMESTAMP WHERE session_name = $3", [waNumber, profileName, session]);
        const activeWebhooks = await getActiveWebhooks(session);
        if (activeWebhooks.length === 0)
            return;
        const body = { session, status: "connected" };
        for (const webhook of activeWebhooks) {
            dispatchWebhook(webhook, body, 'update_status');
        }
    }
    catch (error) {
        console.error(`Error getting profile info for session ${session}:`, error);
        await query("UPDATE sessions SET status = 'online', updated_at = CURRENT_TIMESTAMP WHERE session_name = $1", [session]);
    }
});
whatsapp.onConnecting(async (session) => {
    console.log(`session: '${session}' connecting`);
    await query("UPDATE sessions SET status = 'connecting', updated_at = CURRENT_TIMESTAMP WHERE session_name = $1", [session]);
    const activeWebhooks = await getActiveWebhooks(session);
    if (activeWebhooks.length === 0)
        return;
    const body = { session, status: "connecting" };
    for (const webhook of activeWebhooks) {
        dispatchWebhook(webhook, body, 'update_status');
    }
});
whatsapp.onDisconnected(async (session) => {
    console.log(`session: '${session}' disconnected`);
    await query("UPDATE sessions SET status = 'offline', updated_at = CURRENT_TIMESTAMP WHERE session_name = $1", [session]);
    const activeWebhooks = await getActiveWebhooks(session);
    if (activeWebhooks.length === 0)
        return;
    const body = { session, status: "disconnected" };
    for (const webhook of activeWebhooks) {
        dispatchWebhook(webhook, body, 'update_status');
    }
});
whatsapp.loadSessionsFromStorage();

dist/controllers/session.js
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
            // 1. Check if session exists in DB
            const dbSession = await query("SELECT * FROM sessions WHERE session_name = $1", [payload.session]);
            // 2. Start the session in the library
            const qr = await new Promise((resolve) => {
                whatsapp.startSession(payload.session, {
                    onConnected: () => resolve(null),
                    onQRUpdated: (qr) => resolve(qr),
                });
            });
            // 3. Save/Update the session to the DATABASE
            if (dbSession.rows.length === 0) {
                const apiKey = crypto.randomBytes(32).toString('hex');
                await query('INSERT INTO sessions (session_name, status, api_key) VALUES ($1, $2, $3)', [payload.session, 'connecting', apiKey]);
            }
            else {
                await query('UPDATE sessions SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE session_name = $2', ['connecting', payload.session]);
            }
            if (qr) {
                return c.json({ qr: await toDataURL(qr) });
            }
            // If already connected (no QR)
            await query("UPDATE sessions SET status = 'online', updated_at = CURRENT_TIMESTAMP WHERE session_name = $1", [payload.session]);
            return c.json({ message: "Already connected" });
        }
        catch (error) {
            console.error("Error starting session:", error);
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
    // Endpoint to update webhook by name (DEPRECATED - Use /api/webhooks from backend)
    app.put("/:name/webhook", createKeyMiddleware(), requestValidator("json", z.object({
        webhook_url: z.string().url().optional().nullable(),
        webhook_events: z.record(z.boolean()).optional(),
    })), async (c) => {
        // This logic is deprecated because the `sessions` table webhook columns are deprecated
        // The real logic is in `backend/routes/webhooks.js`
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
            // 4. Delete from the sessions DATABASE
            await query("DELETE FROM sessions WHERE session_name = $1", [sessionName]);
            return c.json({ success: true, message: "Session deleted successfully" });
        }
        catch (error) {
            console.error(`Error deleting session ${sessionName}:`, error);
            throw new HTTPException(500, { message: "Failed to delete session" });
        }
    });
    // Legacy logout route (called by old backend)
    app.all("/logout", createKeyMiddleware(), async (c) => {
        const sessionName = c.req.query().session || (await c.req.json()).session || "";
        try {
            // 1. Delete from the library
            await whatsapp.deleteSession(sessionName);
            // 2. Delete from the DATABASE (will also cascade delete webhooks)
            // Note: This logic is duplicated in DELETE /:name, which is better
            await query("DELETE FROM sessions WHERE session_name = $1", [sessionName]);
            return c.json({ data: "success" });
        }
        catch (error) {
            console.error(`Error logging out session ${sessionName}:`, error);
            throw new HTTPException(500, { message: "Failed to logout session" });
        }
    });
    return app;
};

dist/repositories/config.repository.js
import { query } from "../lib/postgres.js";
export const findConfigByUsername = async (username) => {
    const result = await query(`SELECT id, username, password_hash, updated_at FROM config WHERE username = $1 LIMIT 1`, [username]);
    if (result.rowCount === 0) {
        return null;
    }
    return result.rows[0] ?? null;
};

dist/services/auth.service.js
import bcrypt from "bcrypt";
import { HTTPException } from "hono/http-exception";
import jwt from "jsonwebtoken";
import { env } from "../env.js";
import { findConfigByUsername, } from "../repositories/config.repository.js";
const mapUser = (record) => ({
    id: record.id,
    username: record.username,
    createdAt: (() => {
        const dateValue = record.updated_at instanceof Date
            ? record.updated_at
            : new Date(record.updated_at);
        return Number.isNaN(dateValue.getTime())
            ? String(record.updated_at)
            : dateValue.toISOString();
    })(),
});
export const authenticateUser = async (username, password) => {
    const record = await findConfigByUsername(username);
    if (!record) {
        throw new HTTPException(401, {
            message: "Invalid username or password",
        });
    }
    const isPasswordValid = await bcrypt.compare(password, record.password_hash);
    if (!isPasswordValid) {
        throw new HTTPException(401, {
            message: "Invalid username or password",
        });
    }
    const user = mapUser(record);
    const token = jwt.sign({
        username: user.username,
    }, env.JWT_SECRET, {
        expiresIn: env.JWT_EXPIRES_IN,
        subject: String(user.id),
    });
    return {
        token,
        user,
    };
};

src/webhooks/message.ts
import { MessageReceived } from "wa-multi-session";
import { CreateWebhookProps, webhookClient } from "./index.js";
import {
  handleWebhookAudioMessage,
  handleWebhookDocumentMessage,
  handleWebhookImageMessage,
  handleWebhookVideoMessage,
} from "./media.js";

export type WebhookMessageBody = {
  session: string;
  from: string | null;
  message: string | null;

  media: {
    image: string | null;
    video: string | null;
    document: string | null;
    audio: string | null;
  };
};

// This function now just creates the body, it doesn't send it.
// The logic in index.ts will handle sending.
export const createWebhookMessage = async (message: MessageReceived): Promise<WebhookMessageBody | null> => {
    if (message.key.fromMe || message.key.remoteJid?.includes("broadcast"))
      return null;

    const image = await handleWebhookImageMessage(message);
    const video = await handleWebhookVideoMessage(message);
    const document = await handleWebhookDocumentMessage(message);
    const audio = await handleWebhookAudioMessage(message);

    const body = {
      session: message.sessionId,
      from: message.key.remoteJid ?? null,
      message:
        message.message?.conversation ||
        message.message?.extendedTextMessage?.text ||
        message.message?.imageMessage?.caption ||
        message.message?.videoMessage?.caption ||
        message.message?.documentMessage?.caption ||
        message.message?.contactMessage?.displayName ||
        message.message?.locationMessage?.comment ||
        message.message?.liveLocationMessage?.caption ||
        null,

      /**
       * media message
       */
      media: {
        image,
        video,
        document,
        audio,
      },
    } satisfies WebhookMessageBody;
    
    return body;
  };

src/webhooks/session.ts
import { CreateWebhookProps, webhookClient } from "./index.js";

export type SessionStatus = "connected" | "disconnected" | "connecting";

export type WebhookSessionBody = {
  session: string;
  status: SessionStatus;
};

export const createWebhookSession =
  (props: CreateWebhookProps) => (event: WebhookSessionBody) => {
    const endpoint = `${props.baseUrl}/session`;

    const body = {
      session: event.session,
      status: event.status,
    } satisfies WebhookSessionBody;
    
    // This function is now just a wrapper.
    // The main logic in index.ts will call this *after* querying DB.
    // For simplicity, we'll let index.ts handle the logic directly.
    // This function is still useful if WEBHOOK_BASE_URL is used.
    webhookClient.post(endpoint, body).catch(console.error);
  };

dist/webhooks/message.js
import { handleWebhookAudioMessage, handleWebhookDocumentMessage, handleWebhookImageMessage, handleWebhookVideoMessage, } from "./media.js";
// This function now just creates the body, it doesn't send it.
// The logic in index.ts will handle sending.
export const createWebhookMessage = async (message) => {
    if (message.key.fromMe || message.key.remoteJid?.includes("broadcast"))
        return null;
    const image = await handleWebhookImageMessage(message);
    const video = await handleWebhookVideoMessage(message);
    const document = await handleWebhookDocumentMessage(message);
    const audio = await handleWebhookAudioMessage(message);
    const body = {
        session: message.sessionId,
        from: message.key.remoteJid ?? null,
        message: message.message?.conversation ||
            message.message?.extendedTextMessage?.text ||
            message.message?.imageMessage?.caption ||
            message.message?.videoMessage?.caption ||
            message.message?.documentMessage?.caption ||
            message.message?.contactMessage?.displayName ||
            message.message?.locationMessage?.comment ||
            message.message?.liveLocationMessage?.caption ||
            null,
        /**
         * media message
         */
        media: {
            image,
            video,
            document,
            audio,
        },
    };
    return body;
};

dist/webhooks/session.js
import { webhookClient } from "./index.js";
export const createWebhookSession = (props) => (event) => {
    const endpoint = `${props.baseUrl}/session`;
    const body = {
        session: event.session,
        status: event.status,
    };
    // This function is now just a wrapper.
    // The main logic in index.ts will call this *after* querying DB.
    // For simplicity, we'll let index.ts handle the logic directly.
    // This function is still useful if WEBHOOK_BASE_URL is used.
    webhookClient.post(endpoint, body).catch(console.error);
};
