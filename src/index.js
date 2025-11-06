"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
var _a;
Object.defineProperty(exports, "__esModule", { value: true });
exports.io = void 0;
var node_server_1 = require("@hono/node-server");
var serve_static_1 = require("@hono/node-server/serve-static");
var hono_1 = require("hono");
var socket_io_1 = require("socket.io");
var cors_1 = require("hono/cors");
var logger_1 = require("hono/logger");
var moment_1 = require("moment");
var whatsapp = require("wa-multi-session");
var auth_js_1 = require("./controllers/auth.js");
var message_js_1 = require("./controllers/message.js");
var profile_js_1 = require("./controllers/profile.js");
var session_routes_js_1 = require("./routes/session.routes.js");
var env_js_1 = require("./env.js");
var error_middleware_js_1 = require("./middlewares/error.middleware.js");
var index_js_1 = require("./webhooks/index.js");
var message_js_2 = require("./webhooks/message.js");
var postgres_js_1 = require("./lib/postgres.js");
var notification_service_js_1 = require("./services/notification.service.js");
var app = new hono_1.Hono();
app.onError(error_middleware_js_1.globalErrorMiddleware);
var defaultAllowedOrigins = [
    "https://ddos-spec.github.io",
    "http://localhost:3000",
    "http://localhost:5173",
    "http://127.0.0.1:3000",
    "http://127.0.0.1:5173",
];
var configuredOrigins = new Set(defaultAllowedOrigins);
if (env_js_1.env.FRONTEND_URL) {
    configuredOrigins.add(env_js_1.env.FRONTEND_URL);
}
if (env_js_1.env.ALLOWED_ORIGINS.length) {
    env_js_1.env.ALLOWED_ORIGINS.forEach(function (origin) { return configuredOrigins.add(origin); });
}
var allowedOrigins = Array.from(configuredOrigins);
console.log('Allowed Origins:', allowedOrigins); // <-- DEBUG LOG
var defaultOrigin = (_a = allowedOrigins[0]) !== null && _a !== void 0 ? _a : "https://ddos-spec.github.io";
var resolveOrigin = function (origin) {
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
var selectOrigin = function (origin) { var _a; return (_a = resolveOrigin(origin)) !== null && _a !== void 0 ? _a : defaultOrigin; };
var applyPreflightHeaders = function (c) {
    var requestedOrigin = c.req.header("Origin");
    var allowedOrigin = selectOrigin(requestedOrigin);
    if (allowedOrigin) {
        c.header("Access-Control-Allow-Origin", allowedOrigin);
        c.header("Access-Control-Allow-Credentials", "true");
    }
    c.header("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS,PATCH");
    c.header("Access-Control-Allow-Headers", "Content-Type,Authorization,X-Requested-With,Accept");
    c.header("Access-Control-Max-Age", "86400");
    c.header("Vary", "Origin");
};
app.use("/*", (0, cors_1.cors)({
    origin: function (origin) {
        var _a;
        console.log('Incoming request origin:', origin); // <-- DEBUG LOG
        return (_a = selectOrigin(origin)) !== null && _a !== void 0 ? _a : "";
    },
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
    allowHeaders: ["Content-Type", "Authorization", "X-Requested-With", "Accept"],
    exposeHeaders: ["Content-Length", "X-Request-Id"],
    maxAge: 86400,
    credentials: true,
}));
app.options("*", function (c) {
    applyPreflightHeaders(c);
    return c.newResponse(null, 204);
});
/**
import { createSessionRoutes } from "./routes/session.routes.js";
 * auth routes
 */
var admin_routes_js_1 = require("./routes/admin.routes.js");
var customer_routes_js_1 = require("./routes/customer.routes.js");
var notification_routes_js_1 = require("./routes/notification.routes.js");
var api = new hono_1.Hono();
console.log("Registering routes...");
api.route("/auth", (0, auth_js_1.createAuthController)());
api.route("/session", (0, session_routes_js_1.createSessionRoutes)());
api.route("/message", (0, message_js_1.createMessageController)());
api.route("/profile", (0, profile_js_1.createProfileController)());
api.route("/admin", (0, admin_routes_js_1.createAdminRoutes)());
api.route("/customer", (0, customer_routes_js_1.createCustomerRoutes)());
api.route("/notifications", (0, notification_routes_js_1.createNotificationRoutes)());
app.route("/api", api);
console.log("Routes registered.");
app.use("*", (0, logger_1.logger)(function () {
    var params = [];
    for (var _i = 0; _i < arguments.length; _i++) {
        params[_i] = arguments[_i];
    }
    params.forEach(function (param) {
        return console.log("".concat((0, moment_1.default)().toISOString(), " | ").concat(param));
    });
}));
app.get("/", function (c) {
    return c.json({
        status: "ok",
        message: "WA Gateway API is running",
        timestamp: new Date().toISOString(),
    });
});
/**
 * serve media message static files
 */
app.use("/*", (0, serve_static_1.serveStatic)({
    root: "./frontend/",
}));
// --- NEW WEBHOOK LOGIC ---
// Helper function to get active webhooks for a session
var getActiveWebhooks = function (sessionName) { return __awaiter(void 0, void 0, void 0, function () {
    var sessionResult, sessionId, webhooksResult, error_1;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                _a.trys.push([0, 3, , 4]);
                return [4 /*yield*/, (0, postgres_js_1.query)("SELECT id FROM sessions WHERE session_name = $1", [sessionName])];
            case 1:
                sessionResult = _a.sent();
                if (sessionResult.rows.length === 0) {
                    return [2 /*return*/, []];
                }
                sessionId = sessionResult.rows[0].id;
                return [4 /*yield*/, (0, postgres_js_1.query)("SELECT * FROM webhooks WHERE session_id = $1 AND is_active = true", [sessionId])];
            case 2:
                webhooksResult = _a.sent();
                return [2 /*return*/, webhooksResult.rows];
            case 3:
                error_1 = _a.sent();
                console.error("Error fetching webhooks for ".concat(sessionName, ":"), error_1);
                return [2 /*return*/, []];
            case 4: return [2 /*return*/];
        }
    });
}); };
// Helper function to dispatch webhooks
var dispatchWebhook = function (webhook, body, eventType) {
    try {
        var events = typeof webhook.webhook_events === 'string'
            ? JSON.parse(webhook.webhook_events)
            : webhook.webhook_events;
        if (events[eventType]) {
            index_js_1.webhookClient.post(webhook.webhook_url, body).catch(function (err) {
                return console.error("Failed to send webhook to ".concat(webhook.webhook_url, ":"), err.message);
            });
        }
    }
    catch (e) {
        console.error("Error parsing webhook events for ".concat(webhook.webhook_url, ":"), e);
    }
};
// --- WHATSAPP EVENT LISTENERS ---
whatsapp.onMessageReceived(function (message) { return __awaiter(void 0, void 0, void 0, function () {
    var activeWebhooks, webhookBody, _i, activeWebhooks_1, webhook, eventType;
    var _a, _b;
    return __generator(this, function (_c) {
        switch (_c.label) {
            case 0:
                if (message.key.fromMe || ((_a = message.key.remoteJid) === null || _a === void 0 ? void 0 : _a.includes("broadcast")))
                    return [2 /*return*/];
                return [4 /*yield*/, getActiveWebhooks(message.sessionId)];
            case 1:
                activeWebhooks = _c.sent();
                if (activeWebhooks.length === 0)
                    return [2 /*return*/];
                return [4 /*yield*/, (0, message_js_2.createWebhookMessage)(message)];
            case 2:
                webhookBody = _c.sent();
                if (!webhookBody)
                    return [2 /*return*/];
                // Dispatch to all interested webhooks
                for (_i = 0, activeWebhooks_1 = activeWebhooks; _i < activeWebhooks_1.length; _i++) {
                    webhook = activeWebhooks_1[_i];
                    eventType = 'individual';
                    if ((_b = message.key.remoteJid) === null || _b === void 0 ? void 0 : _b.includes('@g.us'))
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
                return [2 /*return*/];
        }
    });
}); });
whatsapp.onConnected(function (session) { return __awaiter(void 0, void 0, void 0, function () {
    var result, userId, activeWebhooks, body, _i, activeWebhooks_2, webhook, error_2;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                console.log("session: '".concat(session, "' connected"));
                _a.label = 1;
            case 1:
                _a.trys.push([1, 6, , 7]);
                return [4 /*yield*/, (0, postgres_js_1.query)("UPDATE sessions SET status = 'online', updated_at = CURRENT_TIMESTAMP WHERE session_name = $1 RETURNING user_id", [session])];
            case 2:
                result = _a.sent();
                console.log("[".concat(session, "] Successfully updated DB status to online."));
                if (!(result.rows.length > 0 && result.rows[0].user_id)) return [3 /*break*/, 4];
                userId = result.rows[0].user_id;
                return [4 /*yield*/, notification_service_js_1.notificationService.createNotification({
                        user_id: userId,
                        type: "session_connected",
                        message: "Session \"".concat(session, "\" has successfully connected."),
                    })];
            case 3:
                _a.sent();
                _a.label = 4;
            case 4:
                // 2. Extract and save profile info (async, non-blocking)
                extractAndSaveProfileInfo(session).catch(function (err) {
                    return console.error("[".concat(session, "] Failed to extract profile:"), err);
                });
                return [4 /*yield*/, getActiveWebhooks(session)];
            case 5:
                activeWebhooks = _a.sent();
                if (activeWebhooks.length === 0)
                    return [2 /*return*/];
                body = { session: session, status: "connected" };
                for (_i = 0, activeWebhooks_2 = activeWebhooks; _i < activeWebhooks_2.length; _i++) {
                    webhook = activeWebhooks_2[_i];
                    dispatchWebhook(webhook, body, 'update_status');
                }
                return [3 /*break*/, 7];
            case 6:
                error_2 = _a.sent();
                console.error("[".concat(session, "] Error in onConnected handler:"), error_2);
                return [3 /*break*/, 7];
            case 7: return [2 /*return*/];
        }
    });
}); });
whatsapp.onConnecting(function (session) { return __awaiter(void 0, void 0, void 0, function () {
    var activeWebhooks, body, _i, activeWebhooks_3, webhook;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                console.log("session: '".concat(session, "' connecting"));
                return [4 /*yield*/, (0, postgres_js_1.query)("UPDATE sessions SET status = 'connecting', updated_at = CURRENT_TIMESTAMP WHERE session_name = $1", [session])];
            case 1:
                _a.sent();
                return [4 /*yield*/, getActiveWebhooks(session)];
            case 2:
                activeWebhooks = _a.sent();
                if (activeWebhooks.length === 0)
                    return [2 /*return*/];
                body = { session: session, status: "connecting" };
                for (_i = 0, activeWebhooks_3 = activeWebhooks; _i < activeWebhooks_3.length; _i++) {
                    webhook = activeWebhooks_3[_i];
                    dispatchWebhook(webhook, body, 'update_status');
                }
                return [2 /*return*/];
        }
    });
}); });
whatsapp.onDisconnected(function (session) { return __awaiter(void 0, void 0, void 0, function () {
    var result, userId, activeWebhooks, body, _i, activeWebhooks_4, webhook;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                console.log("session: '".concat(session, "' disconnected"));
                return [4 /*yield*/, (0, postgres_js_1.query)("UPDATE sessions SET status = 'offline', updated_at = CURRENT_TIMESTAMP WHERE session_name = $1 RETURNING user_id", [session])];
            case 1:
                result = _a.sent();
                if (!(result.rows.length > 0 && result.rows[0].user_id)) return [3 /*break*/, 3];
                userId = result.rows[0].user_id;
                return [4 /*yield*/, notification_service_js_1.notificationService.createNotification({
                        user_id: userId,
                        type: "session_disconnected",
                        message: "Session \"".concat(session, "\" has been disconnected."),
                    })];
            case 2:
                _a.sent();
                _a.label = 3;
            case 3: return [4 /*yield*/, getActiveWebhooks(session)];
            case 4:
                activeWebhooks = _a.sent();
                if (activeWebhooks.length === 0)
                    return [2 /*return*/];
                body = { session: session, status: "disconnected" };
                for (_i = 0, activeWebhooks_4 = activeWebhooks; _i < activeWebhooks_4.length; _i++) {
                    webhook = activeWebhooks_4[_i];
                    dispatchWebhook(webhook, body, 'update_status');
                }
                return [2 /*return*/];
        }
    });
}); });
whatsapp.loadSessionsFromStorage();
var port = Number(env_js_1.env.PORT) || 5001;
console.log("\uD83D\uDE80 WA Gateway running on port ".concat(port));
var server = (0, node_server_1.serve)({
    fetch: app.fetch,
    port: port,
});
console.log("Server is running on http://localhost:".concat(port));
console.log("Server is running on http://localhost:".concat(port));
exports.io = new socket_io_1.Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"],
    },
});
exports.io.on("connection", function (socket) {
    console.log("A user connected:", socket.id);
    socket.on("disconnect", function () {
        console.log("User disconnected:", socket.id);
    });
});
var extractAndSaveProfileInfo = function (sessionName_1) {
    var args_1 = [];
    for (var _i = 1; _i < arguments.length; _i++) {
        args_1[_i - 1] = arguments[_i];
    }
    return __awaiter(void 0, __spreadArray([sessionName_1], args_1, true), void 0, function (sessionName, maxRetries) {
        var phoneNumber, profileName, _loop_1, attempt, state_1;
        var _a, _b, _c;
        if (maxRetries === void 0) { maxRetries = 12; }
        return __generator(this, function (_d) {
            switch (_d.label) {
                case 0:
                    phoneNumber = "";
                    profileName = "";
                    _loop_1 = function (attempt) {
                        var session, onWhatsApp, e_1, businessProfile, e_2, source, updateResult, error_3, delay_1;
                        return __generator(this, function (_e) {
                            switch (_e.label) {
                                case 0:
                                    _e.trys.push([0, 13, , 14]);
                                    session = whatsapp.getSession(sessionName);
                                    if (!session) {
                                        console.log("[".concat(sessionName, "] Session not found in library, skipping profile extraction"));
                                        return [2 /*return*/, { value: void 0 }];
                                    }
                                    // Debugging: Inspect session object
                                    console.log("[".concat(sessionName, "] Attempt ").concat(attempt, ": Full session object keys:"), Object.keys(session));
                                    console.log("[".concat(sessionName, "] Attempt ").concat(attempt, ": session.user object:"), JSON.stringify(session === null || session === void 0 ? void 0 : session.user, null, 2));
                                    console.log("[".concat(sessionName, "] Attempt ").concat(attempt, ": session.authState.creds object:"), JSON.stringify((_a = session === null || session === void 0 ? void 0 : session.authState) === null || _a === void 0 ? void 0 : _a.creds, null, 2));
                                    _e.label = 1;
                                case 1:
                                    _e.trys.push([1, 4, , 5]);
                                    if (!(session.user && session.user.id)) return [3 /*break*/, 3];
                                    return [4 /*yield*/, session.onWhatsApp(session.user.id)];
                                case 2:
                                    onWhatsApp = _e.sent();
                                    console.log("[".concat(sessionName, "] onWhatsApp:"), JSON.stringify(onWhatsApp, null, 2));
                                    _e.label = 3;
                                case 3: return [3 /*break*/, 5];
                                case 4:
                                    e_1 = _e.sent();
                                    console.log("[".concat(sessionName, "] Could not get onWhatsApp"), e_1);
                                    return [3 /*break*/, 5];
                                case 5:
                                    _e.trys.push([5, 8, , 9]);
                                    if (!(session.user && session.user.id)) return [3 /*break*/, 7];
                                    return [4 /*yield*/, session.getBusinessProfile(session.user.id)];
                                case 6:
                                    businessProfile = _e.sent();
                                    console.log("[".concat(sessionName, "] Business Profile:"), JSON.stringify(businessProfile, null, 2));
                                    _e.label = 7;
                                case 7: return [3 /*break*/, 9];
                                case 8:
                                    e_2 = _e.sent();
                                    console.log("[".concat(sessionName, "] Could not get business profile"), e_2);
                                    return [3 /*break*/, 9];
                                case 9:
                                    source = null;
                                    if ((session === null || session === void 0 ? void 0 : session.user) && typeof session.user.id === 'string') {
                                        source = session.user;
                                    }
                                    else if (((_c = (_b = session === null || session === void 0 ? void 0 : session.authState) === null || _b === void 0 ? void 0 : _b.creds) === null || _c === void 0 ? void 0 : _c.me) && typeof session.authState.creds.me.id === 'string') {
                                        source = session.authState.creds.me;
                                    }
                                    // Fallback: If name is missing, try verifiedName, push all possible fields to logs
                                    if (source && source.id) {
                                        phoneNumber = source.id.split('@')[0].split(':')[0];
                                        profileName = source.name || source.verifiedName || source.pushname || source.displayName || source.notify || "Profil tidak ditemukan";
                                        console.log("[".concat(sessionName, "] Full source object:"), JSON.stringify(source, null, 2));
                                        console.log("[".concat(sessionName, "] Extracted fields:"), {
                                            name: source.name,
                                            verifiedName: source.verifiedName,
                                            pushname: source.pushname,
                                            displayName: source.displayName,
                                            notify: source.notify,
                                            id: source.id
                                        });
                                    }
                                    if (!(phoneNumber && profileName)) return [3 /*break*/, 11];
                                    return [4 /*yield*/, (0, postgres_js_1.query)("UPDATE sessions \n           SET wa_number = $1, \n               profile_name = $2, \n               updated_at = CURRENT_TIMESTAMP \n           WHERE session_name = $3 RETURNING wa_number, profile_name", [phoneNumber, profileName, sessionName])];
                                case 10:
                                    updateResult = _e.sent();
                                    if (updateResult.rows.length > 0) {
                                        console.log("\u2705 [".concat(sessionName, "] DB updated:"), updateResult.rows[0]);
                                    }
                                    else {
                                        console.warn("\u26A0\uFE0F [".concat(sessionName, "] DB update did not return any rows!"));
                                    }
                                    return [2 /*return*/, { value: void 0 }];
                                case 11:
                                    console.log("\u23F3 [".concat(sessionName, "] Attempt ").concat(attempt, "/").concat(maxRetries, ": Profile info not ready (name: '").concat(profileName, "', number: '").concat(phoneNumber, "'), retrying..."));
                                    _e.label = 12;
                                case 12: return [3 /*break*/, 14];
                                case 13:
                                    error_3 = _e.sent();
                                    console.error("\u26A0\uFE0F [".concat(sessionName, "] Error extracting profile on attempt ").concat(attempt, ":"), error_3);
                                    return [3 /*break*/, 14];
                                case 14:
                                    if (!(attempt < maxRetries)) return [3 /*break*/, 16];
                                    delay_1 = Math.min(500 * Math.pow(2, attempt - 1), 3000);
                                    return [4 /*yield*/, new Promise(function (resolve) { return setTimeout(resolve, delay_1); })];
                                case 15:
                                    _e.sent();
                                    _e.label = 16;
                                case 16: return [2 /*return*/];
                            }
                        });
                    };
                    attempt = 1;
                    _d.label = 1;
                case 1:
                    if (!(attempt <= maxRetries)) return [3 /*break*/, 4];
                    return [5 /*yield**/, _loop_1(attempt)];
                case 2:
                    state_1 = _d.sent();
                    if (typeof state_1 === "object")
                        return [2 /*return*/, state_1.value];
                    _d.label = 3;
                case 3:
                    attempt++;
                    return [3 /*break*/, 1];
                case 4:
                    console.log("\u274C [".concat(sessionName, "] Failed to extract profile after ").concat(maxRetries, " attempts"));
                    return [2 /*return*/];
            }
        });
    });
};
