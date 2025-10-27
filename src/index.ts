import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import moment from "moment";
import * as whastapp from "wa-multi-session";
import { createAuthController } from "./controllers/auth";
import { createMessageController } from "./controllers/message";
import { createProfileController } from "./controllers/profile";
import { createSessionController } from "./controllers/session";
import { env } from "./env";
import { globalErrorMiddleware } from "./middlewares/error.middleware";
import { notFoundMiddleware } from "./middlewares/notfound.middleware";
import { CreateWebhookProps } from "./webhooks";
import { createWebhookMessage } from "./webhooks/message";
import { createWebhookSession } from "./webhooks/session";

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

app.use(
  "/*",
  cors({
    origin: (origin) => {
      if (!origin) {
        return allowedOrigins;
      }

      if (configuredOrigins.has(origin)) {
        return origin;
      }

      if (origin.includes("github.io")) {
        return origin;
      }

      return allowedOrigins;
    },
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
    allowHeaders: ["Content-Type", "Authorization", "X-Requested-With", "Accept"],
    exposeHeaders: ["Content-Length", "X-Request-Id"],
    maxAge: 86_400,
    credentials: true,
  })
);

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
