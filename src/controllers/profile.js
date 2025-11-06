"use strict";
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.createProfileController = void 0;
var whatsapp = require("wa-multi-session");
var hono_1 = require("hono");
var validation_middleware_js_1 = require("../middlewares/validation.middleware.js");
var zod_1 = require("zod");
var key_middleware_js_1 = require("../middlewares/key.middleware.js");
var http_exception_1 = require("hono/http-exception");
/**
 * ✅ Response format utilities
 */
var successResponse = function (data) { return (__assign({ success: true }, data)); };
var errorResponse = function (message, details) { return (__assign({ success: false, message: message }, (details && { details: details }))); };
/**
 * ✅ FIXED: Extract user info dari Baileys WASocket
 * wa-multi-session.getSession() returns Baileys WASocket object
 * User info ada di: socket.user (authState.creds.me)
 *
 * References:
 * - Baileys stores auth creds including user info
 * - User object structure: { id: "628xxx:xx@s.whatsapp.net", name: "..." }
 */
function extractUserInfo(session_1) {
    return __awaiter(this, arguments, void 0, function (session, options) {
        var _a, maxRetries, _b, initialDelay, _c, maxDelay, _loop_1, attempt, state_1;
        var _d, _e;
        if (options === void 0) { options = {}; }
        return __generator(this, function (_f) {
            switch (_f.label) {
                case 0:
                    _a = options.maxRetries, maxRetries = _a === void 0 ? 8 : _a, _b = options.initialDelay, initialDelay = _b === void 0 ? 500 : _b, _c = options.maxDelay, maxDelay = _c === void 0 ? 3000 : _c;
                    _loop_1 = function (attempt) {
                        var user, phoneNumber, authState, phoneNumber, delay_1;
                        return __generator(this, function (_g) {
                            switch (_g.label) {
                                case 0:
                                    try {
                                        user = session === null || session === void 0 ? void 0 : session.user;
                                        if (user && user.id) {
                                            console.log("\u2705 User info extracted on attempt ".concat(attempt));
                                            phoneNumber = user.id.split('@')[0].split(':')[0];
                                            return [2 /*return*/, { value: {
                                                        name: user.name || user.verifiedName || "Unknown",
                                                        id: user.id,
                                                        number: phoneNumber,
                                                    } }];
                                        }
                                        authState = (_d = session === null || session === void 0 ? void 0 : session.authState) === null || _d === void 0 ? void 0 : _d.creds;
                                        if ((_e = authState === null || authState === void 0 ? void 0 : authState.me) === null || _e === void 0 ? void 0 : _e.id) {
                                            console.log("\u2705 User info extracted from authState on attempt ".concat(attempt));
                                            phoneNumber = authState.me.id.split('@')[0].split(':')[0];
                                            return [2 /*return*/, { value: {
                                                        name: authState.me.name || authState.me.verifiedName || "Unknown",
                                                        id: authState.me.id,
                                                        number: phoneNumber,
                                                    } }];
                                        }
                                    }
                                    catch (error) {
                                        console.error("\u26A0\uFE0F Error extracting user info on attempt ".concat(attempt, ":"), error);
                                    }
                                    if (!(attempt < maxRetries)) return [3 /*break*/, 2];
                                    delay_1 = Math.min(initialDelay * Math.pow(2, attempt - 1), maxDelay);
                                    console.log("\u23F3 Attempt ".concat(attempt, "/").concat(maxRetries, ": User info not ready, retrying in ").concat(delay_1, "ms..."));
                                    return [4 /*yield*/, new Promise(function (resolve) { return setTimeout(resolve, delay_1); })];
                                case 1:
                                    _g.sent();
                                    _g.label = 2;
                                case 2: return [2 /*return*/];
                            }
                        });
                    };
                    attempt = 1;
                    _f.label = 1;
                case 1:
                    if (!(attempt <= maxRetries)) return [3 /*break*/, 4];
                    return [5 /*yield**/, _loop_1(attempt)];
                case 2:
                    state_1 = _f.sent();
                    if (typeof state_1 === "object")
                        return [2 /*return*/, state_1.value];
                    _f.label = 3;
                case 3:
                    attempt++;
                    return [3 /*break*/, 1];
                case 4:
                    console.log("\u274C Failed to extract user info after ".concat(maxRetries, " attempts"));
                    return [2 /*return*/, null];
            }
        });
    });
}
/**
 * ✅ Session validation
 */
function validateSession(sessionId) {
    var session = whatsapp.getSession(sessionId);
    if (!session) {
        throw new http_exception_1.HTTPException(404, {
            message: "Session not found",
        });
    }
    return session;
}
var createProfileController = function () {
    var app = new hono_1.Hono();
    /**
     * ✅ Schema untuk POST endpoint
     */
    var getProfileSchema = zod_1.z.object({
        session: zod_1.z.string(),
        target: zod_1.z
            .string()
            .refine(function (v) { return v.includes("@s.whatsapp.net") || v.includes("@g.us"); }, {
            message: "target must contain '@s.whatsapp.net' or '@g.us'",
        }),
    });
    /**
     * ✅ GET /:name - Get profile info dari session yang logged in
     *
     * Total retry time: 500ms + 1s + 2s + 3s + 3s + 3s + 3s + 3s ≈ 18.5 seconds
     */
    app.get("/:name", (0, key_middleware_js_1.createKeyMiddleware)(), function (c) { return __awaiter(void 0, void 0, void 0, function () {
        var name, session, userInfo, error_1;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    name = c.req.param("name");
                    _a.label = 1;
                case 1:
                    _a.trys.push([1, 3, , 4]);
                    session = validateSession(name);
                    return [4 /*yield*/, extractUserInfo(session, {
                            maxRetries: 8,
                            initialDelay: 500,
                            maxDelay: 3000,
                        })];
                case 2:
                    userInfo = _a.sent();
                    if (!userInfo) {
                        return [2 /*return*/, c.json(errorResponse("User info not available. Session might still be initializing.", {
                                hint: "This usually happens right after QR scan. The session needs a moment to fully initialize.",
                                retry_after: 10,
                                max_wait_time: "2-3 minutes after QR scan",
                            }), 503)];
                    }
                    return [2 /*return*/, c.json(successResponse(userInfo))];
                case 3:
                    error_1 = _a.sent();
                    if (error_1 instanceof http_exception_1.HTTPException) {
                        return [2 /*return*/, c.json(errorResponse(error_1.message), error_1.status)];
                    }
                    console.error("Get profile error:", error_1);
                    return [2 /*return*/, c.json(errorResponse("Internal server error", {
                            error: error_1 instanceof Error ? error_1.message : "Unknown error",
                        }), 500)];
                case 4: return [2 /*return*/];
            }
        });
    }); });
    /**
     * ✅ GET /:name/quick - Quick check tanpa retry
     * Fast fail endpoint untuk frontend polling
     */
    app.get("/:name/quick", (0, key_middleware_js_1.createKeyMiddleware)(), function (c) { return __awaiter(void 0, void 0, void 0, function () {
        var name, session, user, phoneNumber, authState, authMe, phoneNumber;
        var _a, _b, _c, _d, _e, _f;
        return __generator(this, function (_g) {
            name = c.req.param("name");
            try {
                session = validateSession(name);
                // ✅ Single attempt, no retry
                try {
                    user = session === null || session === void 0 ? void 0 : session.user;
                    // ✅ FIX: Type-safe check sebelum akses property
                    if (user && typeof user.id === "string") {
                        phoneNumber = (_e = (_d = (_c = (_b = (_a = user === null || user === void 0 ? void 0 : user.id) === null || _a === void 0 ? void 0 : _a.split) === null || _b === void 0 ? void 0 : _b.call(_a, '@')[0]) === null || _c === void 0 ? void 0 : _c.split) === null || _d === void 0 ? void 0 : _d.call(_c, ':')[0]) !== null && _e !== void 0 ? _e : "";
                        return [2 /*return*/, c.json(successResponse({
                                name: user.name || user.verifiedName || "Unknown",
                                id: user.id,
                                number: phoneNumber,
                            }))];
                    }
                    authState = (_f = session === null || session === void 0 ? void 0 : session.authState) === null || _f === void 0 ? void 0 : _f.creds;
                    authMe = authState === null || authState === void 0 ? void 0 : authState.me;
                    if (authMe && authMe.id && typeof authMe.id === "string") {
                        phoneNumber = authMe.id.split('@')[0].split(':')[0];
                        return [2 /*return*/, c.json(successResponse({
                                name: authMe.name || authMe.verifiedName || "Unknown",
                                id: authMe.id,
                                number: phoneNumber,
                            }))];
                    }
                }
                catch (extractError) {
                    console.error("Quick extract error:", extractError);
                }
                // ✅ Fast fail
                return [2 /*return*/, c.json(errorResponse("User info not ready yet", {
                        hint: "Session is still initializing. Frontend should retry.",
                    }), 503)];
            }
            catch (error) {
                if (error instanceof http_exception_1.HTTPException) {
                    return [2 /*return*/, c.json(errorResponse(error.message), error.status)];
                }
                return [2 /*return*/, c.json(errorResponse("Internal server error"), 500)];
            }
            return [2 /*return*/];
        });
    }); });
    /**
     * ✅ GET /:name/status - Check session status
     */
    app.get("/:name/status", (0, key_middleware_js_1.createKeyMiddleware)(), function (c) { return __awaiter(void 0, void 0, void 0, function () {
        var name, session, user, authState, authMe, hasUserInfo, userInfo, source, phoneNumber;
        var _a;
        return __generator(this, function (_b) {
            name = c.req.param("name");
            try {
                session = validateSession(name);
                user = session === null || session === void 0 ? void 0 : session.user;
                authState = (_a = session === null || session === void 0 ? void 0 : session.authState) === null || _a === void 0 ? void 0 : _a.creds;
                authMe = authState === null || authState === void 0 ? void 0 : authState.me;
                hasUserInfo = !!((user === null || user === void 0 ? void 0 : user.id) || (authMe === null || authMe === void 0 ? void 0 : authMe.id));
                userInfo = null;
                if (hasUserInfo) {
                    source = (user === null || user === void 0 ? void 0 : user.id) ? user : authMe;
                    if (source && source.id && typeof source.id === "string") {
                        phoneNumber = source.id.split('@')[0].split(':')[0];
                        userInfo = {
                            name: source.name || source.verifiedName || "Unknown",
                            id: source.id,
                            number: phoneNumber,
                        };
                    }
                }
                return [2 /*return*/, c.json(successResponse({
                        session_id: name,
                        is_ready: !!hasUserInfo,
                        has_user_info: !!hasUserInfo,
                        user_info: userInfo,
                    }))];
            }
            catch (error) {
                if (error instanceof http_exception_1.HTTPException) {
                    return [2 /*return*/, c.json(successResponse({
                            session_id: name,
                            is_ready: false,
                            has_user_info: false,
                            user_info: null,
                        }))];
                }
                return [2 /*return*/, c.json(errorResponse("Failed to check session status"), 500)];
            }
            return [2 /*return*/];
        });
    }); });
    /**
     * ✅ POST / - Get profile info dari target number/group
     */
    app.post("/", (0, key_middleware_js_1.createKeyMiddleware)(), (0, validation_middleware_js_1.requestValidator)("json", getProfileSchema), function (c) { return __awaiter(void 0, void 0, void 0, function () {
        var payload, isRegistered, profileData, error_2;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 3, , 4]);
                    payload = c.req.valid("json");
                    validateSession(payload.session);
                    return [4 /*yield*/, whatsapp.isExist({
                            sessionId: payload.session,
                            to: payload.target,
                            isGroup: payload.target.includes("@g.us"),
                        })];
                case 1:
                    isRegistered = _a.sent();
                    if (!isRegistered) {
                        return [2 /*return*/, c.json(errorResponse("Target is not registered on WhatsApp", {
                                target: payload.target,
                            }), 404)];
                    }
                    return [4 /*yield*/, whatsapp.getProfileInfo({
                            sessionId: payload.session,
                            target: payload.target,
                        })];
                case 2:
                    profileData = _a.sent();
                    return [2 /*return*/, c.json(successResponse({
                            profile: profileData,
                        }))];
                case 3:
                    error_2 = _a.sent();
                    if (error_2 instanceof http_exception_1.HTTPException) {
                        return [2 /*return*/, c.json(errorResponse(error_2.message), error_2.status)];
                    }
                    console.error("Get target profile error:", error_2);
                    return [2 /*return*/, c.json(errorResponse("Failed to get profile info", {
                            error: error_2 instanceof Error ? error_2.message : "Unknown error",
                        }), 500)];
                case 4: return [2 /*return*/];
            }
        });
    }); });
    return app;
};
exports.createProfileController = createProfileController;
exports.default = exports.createProfileController;
