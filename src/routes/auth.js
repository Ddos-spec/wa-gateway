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
Object.defineProperty(exports, "__esModule", { value: true });
exports.createAuthRoutes = void 0;
var hono_1 = require("hono");
var http_exception_1 = require("hono/http-exception");
var jwt = require("jsonwebtoken");
var env_js_1 = require("../env.js");
var auth_service_js_1 = require("../services/auth.service.js");
var auth = new hono_1.Hono();
auth.post("/login", function (c) { return __awaiter(void 0, void 0, void 0, function () {
    var _a, username, password, result, error_1;
    return __generator(this, function (_b) {
        switch (_b.label) {
            case 0:
                _b.trys.push([0, 3, , 4]);
                return [4 /*yield*/, c.req.json()];
            case 1:
                _a = _b.sent(), username = _a.username, password = _a.password;
                if (!username || !password) {
                    return [2 /*return*/, c.json({ message: "Username and password are required" }, 400)];
                }
                return [4 /*yield*/, (0, auth_service_js_1.authenticateUser)(username, password)];
            case 2:
                result = _b.sent();
                return [2 /*return*/, c.json({
                        success: true,
                        token: result.token,
                        user: result.user,
                    })];
            case 3:
                error_1 = _b.sent();
                if (error_1 instanceof http_exception_1.HTTPException) {
                    throw error_1;
                }
                console.error("Login error:", error_1);
                return [2 /*return*/, c.json({ message: "Internal server error" }, 500)];
            case 4: return [2 /*return*/];
        }
    });
}); });
auth.get("/verify", function (c) { return __awaiter(void 0, void 0, void 0, function () {
    var authHeader, token, decoded, payload, rawId_1, id;
    return __generator(this, function (_a) {
        try {
            authHeader = c.req.header("Authorization");
            if (!authHeader || !authHeader.startsWith("Bearer ")) {
                return [2 /*return*/, c.json({ message: "No token provided" }, 401)];
            }
            token = authHeader.substring(7);
            decoded = jwt.verify(token, env_js_1.env.JWT_SECRET);
            if (typeof decoded !== "object" || decoded === null) {
                return [2 /*return*/, c.json({ message: "Invalid token" }, 401)];
            }
            payload = decoded;
            rawId_1 = payload.sub;
            id = (function () {
                if (typeof rawId_1 === "number") {
                    return rawId_1;
                }
                if (typeof rawId_1 === "string") {
                    var trimmed = rawId_1.trim();
                    if (!trimmed) {
                        return null;
                    }
                    var numericId = Number(trimmed);
                    return Number.isNaN(numericId) ? trimmed : numericId;
                }
                return null;
            })();
            return [2 /*return*/, c.json({
                    valid: true,
                    user: {
                        id: id,
                        username: payload.username,
                        expiresAt: payload.exp
                            ? new Date(payload.exp * 1000).toISOString()
                            : undefined,
                    },
                })];
        }
        catch (error) {
            if (error instanceof Error && error.name === "JsonWebTokenError") {
                return [2 /*return*/, c.json({ message: "Invalid token" }, 401)];
            }
            console.error("Token verification error:", error);
            return [2 /*return*/, c.json({ message: "Invalid token" }, 401)];
        }
        return [2 /*return*/];
    });
}); });
var createAuthRoutes = function () { return auth; };
exports.createAuthRoutes = createAuthRoutes;
