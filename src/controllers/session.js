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
exports.deleteSession = exports.cancelPairing = exports.startNewSession = exports.getSession = exports.getSessions = void 0;
var http_exception_1 = require("hono/http-exception");
var qrcode_1 = require("qrcode");
var whatsapp = require("wa-multi-session");
var crypto_1 = require("crypto");
var postgres_js_1 = require("../lib/postgres.js");
// Map to hold pending pairing promises
var pendingPairingPromises = new Map();
var pairingTimeout = 60000; // 60 seconds
// --- CONTROLLER FUNCTIONS ---
var getSessions = function (c) { return __awaiter(void 0, void 0, void 0, function () {
    var result, error_1;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                console.log("Attempting to fetch all sessions.");
                _a.label = 1;
            case 1:
                _a.trys.push([1, 3, , 4]);
                return [4 /*yield*/, (0, postgres_js_1.query)("SELECT * FROM sessions ORDER BY created_at DESC")];
            case 2:
                result = _a.sent();
                console.log("Fetched sessions:", result.rows);
                return [2 /*return*/, c.json({
                        data: result.rows,
                    })];
            case 3:
                error_1 = _a.sent();
                console.error("Error fetching sessions from DB:", error_1);
                throw new http_exception_1.HTTPException(500, { message: "Failed to fetch sessions" });
            case 4: return [2 /*return*/];
        }
    });
}); };
exports.getSessions = getSessions;
var getSession = function (c) { return __awaiter(void 0, void 0, void 0, function () {
    var name, result, error_2;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                name = c.req.param("name");
                _a.label = 1;
            case 1:
                _a.trys.push([1, 3, , 4]);
                return [4 /*yield*/, (0, postgres_js_1.query)("SELECT * FROM sessions WHERE session_name = $1", [
                        name,
                    ])];
            case 2:
                result = _a.sent();
                if (result.rows.length === 0) {
                    throw new http_exception_1.HTTPException(404, {
                        message: "Session not found in database",
                    });
                }
                return [2 /*return*/, c.json({
                        success: true,
                        session: result.rows[0],
                    })];
            case 3:
                error_2 = _a.sent();
                console.error("Error fetching session ".concat(name, ":"), error_2);
                if (error_2 instanceof http_exception_1.HTTPException)
                    throw error_2;
                throw new http_exception_1.HTTPException(500, { message: "Failed to get session" });
            case 4: return [2 /*return*/];
        }
    });
}); };
exports.getSession = getSession;
var startNewSession = function (c) { return __awaiter(void 0, void 0, void 0, function () {
    var _a, sessionName, pairingType, phone, codeRequestTimeout, dbSessionStatus, apiKey, dbError_1, result, pending, error_3, pending;
    return __generator(this, function (_b) {
        switch (_b.label) {
            case 0: return [4 /*yield*/, c.req.json()];
            case 1:
                _a = _b.sent(), sessionName = _a.session, pairingType = _a.pairingType, phone = _a.phone;
                codeRequestTimeout = 30000;
                if (!sessionName) {
                    throw new http_exception_1.HTTPException(400, { message: "Session name is required" });
                }
                // Prevent starting a session that's already being processed
                if (pendingPairingPromises.has(sessionName)) {
                    throw new http_exception_1.HTTPException(409, {
                        message: "A pairing process for this session is already in progress.",
                    });
                }
                return [4 /*yield*/, (0, postgres_js_1.query)("SELECT status FROM sessions WHERE session_name = $1", [sessionName])];
            case 2:
                dbSessionStatus = _b.sent();
                if (dbSessionStatus.rows.length > 0 &&
                    dbSessionStatus.rows[0].status === "online") {
                    return [2 /*return*/, c.json({ success: true, message: "Session is already online." })];
                }
                _b.label = 3;
            case 3:
                _b.trys.push([3, 5, , 6]);
                apiKey = crypto_1.default.randomBytes(32).toString("hex");
                return [4 /*yield*/, (0, postgres_js_1.query)("INSERT INTO sessions (session_name, status, api_key)\n       VALUES ($1, 'connecting', $2)\n       ON CONFLICT (session_name)\n       DO UPDATE SET status = 'connecting', updated_at = CURRENT_TIMESTAMP", [sessionName, apiKey])];
            case 4:
                _b.sent();
                return [3 /*break*/, 6];
            case 5:
                dbError_1 = _b.sent();
                console.error("[".concat(sessionName, "] Failed to upsert session in DB:"), dbError_1);
                throw new http_exception_1.HTTPException(500, { message: "Database operation failed." });
            case 6:
                _b.trys.push([6, 8, , 11]);
                return [4 /*yield*/, new Promise(function (resolve, reject) {
                        var timer = setTimeout(function () {
                            reject(new Error("Failed to generate code. Please try again."));
                        }, codeRequestTimeout);
                        pendingPairingPromises.set(sessionName, { reject: reject, timer: timer });
                        var onConnected = function (sessionId) {
                            if (sessionId === sessionName) {
                                console.log("[".concat(sessionId, "] Connected!"));
                                resolve({ status: "connected" });
                            }
                        };
                        if (pairingType === "code" && phone) {
                            console.log("[".concat(sessionName, "] Requesting pairing code for phone: ").concat(phone));
                            whatsapp.startSessionWithPairingCode(sessionName, {
                                phoneNumber: phone,
                            });
                            whatsapp.onPairingCode(function (sessionId, code) {
                                if (sessionId === sessionName) {
                                    console.log("[".concat(sessionName, "] Pairing code received: ").concat(code));
                                    var formattedCode = code.replace(/.(?=.)/g, '$&-'); // Add dashes
                                    resolve({ code: formattedCode });
                                }
                            });
                        }
                        else {
                            console.log("[".concat(sessionName, "] Requesting QR code"));
                            whatsapp.startSession(sessionName, {
                                onQRUpdated: function (qr) {
                                    console.log("[".concat(sessionName, "] QR code updated"));
                                    (0, qrcode_1.toDataURL)(qr).then(function (qrDataURL) { return resolve({ qr: qrDataURL }); });
                                }
                            });
                            whatsapp.onConnected(function (sessionId) {
                                if (sessionId === sessionName) {
                                    console.log("[".concat(sessionId, "] Connected!"));
                                    resolve({ status: "connected" });
                                }
                            });
                        }
                    })];
            case 7:
                result = _b.sent();
                pending = pendingPairingPromises.get(sessionName);
                if (pending) {
                    clearTimeout(pending.timer);
                    pendingPairingPromises.delete(sessionName);
                }
                return [2 /*return*/, c.json(__assign({ success: true }, result))];
            case 8:
                error_3 = _b.sent();
                console.error("[".concat(sessionName, "] Error starting session:"), error_3.message);
                pending = pendingPairingPromises.get(sessionName);
                if (pending) {
                    clearTimeout(pending.timer);
                    pendingPairingPromises.delete(sessionName);
                }
                return [4 /*yield*/, whatsapp.deleteSession(sessionName).catch(function (e) { return console.error("[".concat(sessionName, "] Cleanup delete failed:"), e); })];
            case 9:
                _b.sent();
                return [4 /*yield*/, (0, postgres_js_1.query)("UPDATE sessions SET status = 'offline' WHERE session_name = $1", [sessionName])];
            case 10:
                _b.sent();
                throw new http_exception_1.HTTPException(500, { message: error_3.message || "Failed to start session" });
            case 11: return [2 /*return*/];
        }
    });
}); };
exports.startNewSession = startNewSession;
var cancelPairing = function (c) { return __awaiter(void 0, void 0, void 0, function () {
    var sessionName, pending;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                sessionName = c.req.param("name");
                console.log("[".concat(sessionName, "] Attempting to cancel pairing."));
                pending = pendingPairingPromises.get(sessionName);
                if (!pending) return [3 /*break*/, 3];
                clearTimeout(pending.timer);
                pending.reject(new Error("Pairing was cancelled by the user."));
                pendingPairingPromises.delete(sessionName);
                // Also attempt to delete the session from the library to stop it
                return [4 /*yield*/, whatsapp.deleteSession(sessionName)];
            case 1:
                // Also attempt to delete the session from the library to stop it
                _a.sent();
                return [4 /*yield*/, (0, postgres_js_1.query)("UPDATE sessions SET status = 'offline' WHERE session_name = $1", [sessionName])];
            case 2:
                _a.sent();
                console.log("[".concat(sessionName, "] Pairing cancelled successfully."));
                return [2 /*return*/, c.json({ success: true, message: "Pairing cancelled." })];
            case 3: throw new http_exception_1.HTTPException(404, { message: "No active pairing process found for this session." });
        }
    });
}); };
exports.cancelPairing = cancelPairing;
var deleteSession = function (c) { return __awaiter(void 0, void 0, void 0, function () {
    var sessionName, sessionResult, sessionId, error_4;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                sessionName = c.req.param("name");
                _a.label = 1;
            case 1:
                _a.trys.push([1, 7, , 8]);
                return [4 /*yield*/, (0, postgres_js_1.query)("SELECT id FROM sessions WHERE session_name = $1", [sessionName])];
            case 2:
                sessionResult = _a.sent();
                if (!(sessionResult.rows.length > 0)) return [3 /*break*/, 4];
                sessionId = sessionResult.rows[0].id;
                // 2. Delete associated webhooks from the DATABASE
                return [4 /*yield*/, (0, postgres_js_1.query)("DELETE FROM webhooks WHERE session_id = $1", [sessionId])];
            case 3:
                // 2. Delete associated webhooks from the DATABASE
                _a.sent();
                _a.label = 4;
            case 4: 
            // 3. Delete from the library
            return [4 /*yield*/, whatsapp.deleteSession(sessionName)];
            case 5:
                // 3. Delete from the library
                _a.sent();
                // 4. Delete from the DATABASE
                return [4 /*yield*/, (0, postgres_js_1.query)("DELETE FROM sessions WHERE session_name = $1", [sessionName])];
            case 6:
                // 4. Delete from the DATABASE
                _a.sent();
                return [2 /*return*/, c.json({ success: true, message: "Session deleted successfully" })];
            case 7:
                error_4 = _a.sent();
                console.error("Error deleting session ".concat(sessionName, ":"), error_4);
                throw new http_exception_1.HTTPException(500, { message: "Failed to delete session" });
            case 8: return [2 /*return*/];
        }
    });
}); };
exports.deleteSession = deleteSession;
