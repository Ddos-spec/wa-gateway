import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono, type Context } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import moment from "moment";
import * as whastapp from "wa-multi-session";
import { createAuthController } from "./controllers/auth.js";
import { createMessageController } from "./controllers/message.js";
import { createProfileController } from "./controllers/profile.js";
import { createSessionController } from "./controllers/session.js";
import { env } from "./env.js";
import { globalErrorMiddleware } from "./middlewares/error.middleware.js";
import { notFoundMiddleware } from "./middlewares/notfound.middleware.js";
import { CreateWebhookProps } from "./webhooks/index.js";
import { createWebhookMessage } from "./webhooks/message.js";
import { createWebhookSession } from "./webhooks/session.js";

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
    origin: (origin) => selectOrigin(origin) ?? "",
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
app.route("/auth", createAuthController());

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

whastapp.onConnected((session) => {
  console.log(`session: '${session}' connected`);
});

// Implement Webhook
if (env.WEBHOOK_BASE_URL) {
  const webhookProps: CreateWebhookProps = {
    baseUrl: env.WEBHOOK_BASE_URL,
  };

  // message webhook
  whastapp.onMessageReceived(createWebhookMessage(webhookProps));

  // session webhook
  const webhookSession = createWebhookSession(webhookProps);

  whastapp.onConnected((session) => {
    console.log(`session: '${session}' connected`);
    webhookSession({ session, status: "connected" });
  });
  whastapp.onConnecting((session) => {
    console.log(`session: '${session}' connecting`);
    webhookSession({ session, status: "connecting" });
  });
  whastapp.onDisconnected((session) => {
    console.log(`session: '${session}' disconnected`);
    webhookSession({ session, status: "disconnected" });
  });
}
// End Implement Webhook

whastapp.loadSessionsFromStorage();
