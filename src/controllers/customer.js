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
exports.getCustomerSessions = exports.login = void 0;
var http_exception_1 = require("hono/http-exception");
var postgres_js_1 = require("../lib/postgres.js");
var bcrypt_1 = require("bcrypt");
var jsonwebtoken_1 = require("jsonwebtoken");
var env_js_1 = require("../env.js");
var login = function (c) { return __awaiter(void 0, void 0, void 0, function () {
    var _a, email, password, result, user, isPasswordValid, token, error_1;
    return __generator(this, function (_b) {
        switch (_b.label) {
            case 0: return [4 /*yield*/, c.req.json()];
            case 1:
                _a = _b.sent(), email = _a.email, password = _a.password;
                if (!email || !password) {
                    throw new http_exception_1.HTTPException(400, { message: "Email and password are required" });
                }
                _b.label = 2;
            case 2:
                _b.trys.push([2, 5, , 6]);
                return [4 /*yield*/, (0, postgres_js_1.query)("SELECT id, name, email, password_hash, status FROM users WHERE email = $1", [email])];
            case 3:
                result = _b.sent();
                if (result.rows.length === 0) {
                    throw new http_exception_1.HTTPException(401, { message: "Invalid credentials" });
                }
                user = result.rows[0];
                if (user.status !== 'active') {
                    throw new http_exception_1.HTTPException(403, { message: "Account is not active" });
                }
                return [4 /*yield*/, bcrypt_1.default.compare(password, user.password_hash)];
            case 4:
                isPasswordValid = _b.sent();
                if (!isPasswordValid) {
                    throw new http_exception_1.HTTPException(401, { message: "Invalid credentials" });
                }
                token = jsonwebtoken_1.default.sign({ id: user.id, name: user.name, email: user.email }, env_js_1.env.JWT_SECRET, { expiresIn: '1d' });
                return [2 /*return*/, c.json({ success: true, token: token, user: { id: user.id, name: user.name, email: user.email } })];
            case 5:
                error_1 = _b.sent();
                console.error("Customer login error:", error_1);
                if (error_1 instanceof http_exception_1.HTTPException)
                    throw error_1;
                throw new http_exception_1.HTTPException(500, { message: "Internal server error" });
            case 6: return [2 /*return*/];
        }
    });
}); };
exports.login = login;
var getCustomerSessions = function (c) { return __awaiter(void 0, void 0, void 0, function () {
    var userId, result, error_2;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                userId = c.req.query().userId;
                if (!userId) {
                    throw new http_exception_1.HTTPException(401, { message: "Unauthorized" });
                }
                _a.label = 1;
            case 1:
                _a.trys.push([1, 3, , 4]);
                return [4 /*yield*/, (0, postgres_js_1.query)("SELECT id, session_name, status, profile_name, wa_number FROM sessions WHERE user_id = $1", [userId])];
            case 2:
                result = _a.sent();
                return [2 /*return*/, c.json({ success: true, sessions: result.rows })];
            case 3:
                error_2 = _a.sent();
                console.error("Error fetching customer sessions:", error_2);
                throw new http_exception_1.HTTPException(500, { message: "Failed to fetch sessions" });
            case 4: return [2 /*return*/];
        }
    });
}); };
exports.getCustomerSessions = getCustomerSessions;
