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
import { WebhookSessionBody } from "./webhooks/session.js";
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
app.route("/session", createSessionController());
app.route("/message", createMessageController());
app.route("/profile", createProfileController());
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
    // Temporarily log the auth object to find the user info
    console.log(`[${session}] Inspecting auth object:`, sessionInfo?.config?.auth);

    // Temporarily disable profile name extraction to prevent build errors
    const waNumber = ''; // sessionInfo?.user?.id.split('@')[0] || '';
    const profileName = ''; // sessionInfo?.user?.name ?? '';

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

const port = Number(env.PORT) || 5001;
console.log(`🚀 WA Gateway running on port ${port}`);

serve({
  fetch: app.fetch,
  port: port,
});
