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
exports.suspendUser = exports.editUser = exports.addUser = exports.getUsers = void 0;
var http_exception_1 = require("hono/http-exception");
var postgres_js_1 = require("../lib/postgres.js");
var bcrypt_1 = require("bcrypt");
var notification_service_js_1 = require("../services/notification.service.js");
var getUsers = function (c) { return __awaiter(void 0, void 0, void 0, function () {
    var result, error_1;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                _a.trys.push([0, 2, , 3]);
                return [4 /*yield*/, (0, postgres_js_1.query)("SELECT id, name, email, company_name, billing_status, status FROM users ORDER BY created_at DESC")];
            case 1:
                result = _a.sent();
                return [2 /*return*/, c.json({ success: true, users: result.rows })];
            case 2:
                error_1 = _a.sent();
                console.error("Error fetching users:", error_1);
                throw new http_exception_1.HTTPException(500, { message: "Failed to fetch users" });
            case 3: return [2 /*return*/];
        }
    });
}); };
exports.getUsers = getUsers;
var addUser = function (c) { return __awaiter(void 0, void 0, void 0, function () {
    var _a, name, email, password, company_name, plan_id, password_hash, result, newUser, error_2;
    return __generator(this, function (_b) {
        switch (_b.label) {
            case 0: return [4 /*yield*/, c.req.json()];
            case 1:
                _a = _b.sent(), name = _a.name, email = _a.email, password = _a.password, company_name = _a.company_name, plan_id = _a.plan_id;
                if (!name || !email || !password || !company_name || !plan_id) {
                    throw new http_exception_1.HTTPException(400, { message: "All fields are required" });
                }
                _b.label = 2;
            case 2:
                _b.trys.push([2, 6, , 7]);
                return [4 /*yield*/, bcrypt_1.default.hash(password, 10)];
            case 3:
                password_hash = _b.sent();
                return [4 /*yield*/, (0, postgres_js_1.query)("INSERT INTO users (name, email, password_hash, company_name, plan_id, billing_status, status) VALUES ($1, $2, $3, $4, $5, 'active', 'active') RETURNING id, name, email, company_name, billing_status, status", [name, email, password_hash, company_name, plan_id])];
            case 4:
                result = _b.sent();
                newUser = result.rows[0];
                // Create a notification for the admin
                return [4 /*yield*/, notification_service_js_1.notificationService.createNotification({
                        user_id: null, // System-wide notification
                        type: "new_customer_registered",
                        message: "New customer registered: ".concat(newUser.name, " (").concat(newUser.email, ")."),
                    })];
            case 5:
                // Create a notification for the admin
                _b.sent();
                return [2 /*return*/, c.json({ success: true, user: newUser }, 201)];
            case 6:
                error_2 = _b.sent();
                console.error("Error adding user:", error_2);
                throw new http_exception_1.HTTPException(500, { message: "Failed to add user" });
            case 7: return [2 /*return*/];
        }
    });
}); };
exports.addUser = addUser;
var editUser = function (c) { return __awaiter(void 0, void 0, void 0, function () {
    var id, _a, name, email, company_name, plan_id, billing_status, status, result, error_3;
    return __generator(this, function (_b) {
        switch (_b.label) {
            case 0:
                id = c.req.param().id;
                return [4 /*yield*/, c.req.json()];
            case 1:
                _a = _b.sent(), name = _a.name, email = _a.email, company_name = _a.company_name, plan_id = _a.plan_id, billing_status = _a.billing_status, status = _a.status;
                if (!name || !email || !company_name || !plan_id || !billing_status || !status) {
                    throw new http_exception_1.HTTPException(400, { message: "All fields are required" });
                }
                _b.label = 2;
            case 2:
                _b.trys.push([2, 4, , 5]);
                return [4 /*yield*/, (0, postgres_js_1.query)("UPDATE users SET name = $1, email = $2, company_name = $3, plan_id = $4, billing_status = $5, status = $6, updated_at = CURRENT_TIMESTAMP WHERE id = $7 RETURNING id, name, email, company_name, billing_status, status", [name, email, company_name, plan_id, billing_status, status, id])];
            case 3:
                result = _b.sent();
                if (result.rows.length === 0) {
                    throw new http_exception_1.HTTPException(404, { message: "User not found" });
                }
                return [2 /*return*/, c.json({ success: true, user: result.rows[0] })];
            case 4:
                error_3 = _b.sent();
                console.error("Error editing user:", error_3);
                throw new http_exception_1.HTTPException(500, { message: "Failed to edit user" });
            case 5: return [2 /*return*/];
        }
    });
}); };
exports.editUser = editUser;
var suspendUser = function (c) { return __awaiter(void 0, void 0, void 0, function () {
    var id, result, error_4;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                id = c.req.param().id;
                if (!id) {
                    throw new http_exception_1.HTTPException(400, { message: "User ID is required" });
                }
                _a.label = 1;
            case 1:
                _a.trys.push([1, 3, , 4]);
                return [4 /*yield*/, (0, postgres_js_1.query)("UPDATE users SET status = 'suspended', updated_at = CURRENT_TIMESTAMP WHERE id = $1 RETURNING id, status", [id])];
            case 2:
                result = _a.sent();
                if (result.rows.length === 0) {
                    throw new http_exception_1.HTTPException(404, { message: "User not found" });
                }
                return [2 /*return*/, c.json({ success: true, message: "User ".concat(id, " has been suspended.") })];
            case 3:
                error_4 = _a.sent();
                console.error("Error suspending user:", error_4);
                throw new http_exception_1.HTTPException(500, { message: "Failed to suspend user" });
            case 4: return [2 /*return*/];
        }
    });
}); };
exports.suspendUser = suspendUser;
