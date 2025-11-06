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
exports.notificationService = void 0;
var postgres_js_1 = require("../lib/postgres.js");
var index_js_1 = require("../index.js");
var NotificationService = /** @class */ (function () {
    function NotificationService() {
    }
    /**
     * Creates a new notification in the database and emits a WebSocket event.
     * @param notification - The notification object to create.
     */
    NotificationService.prototype.createNotification = function (notification) {
        return __awaiter(this, void 0, void 0, function () {
            var user_id, type, message, result, newNotification, error_1;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 2, , 3]);
                        user_id = notification.user_id, type = notification.type, message = notification.message;
                        return [4 /*yield*/, (0, postgres_js_1.query)("INSERT INTO notifications (user_id, type, message) VALUES ($1, $2, $3) RETURNING *", [user_id, type, message])];
                    case 1:
                        result = _a.sent();
                        newNotification = result.rows[0];
                        // Emit a WebSocket event to the specific user or to all admins
                        if (user_id) {
                            // Find sockets associated with this user and emit
                            index_js_1.io.to("user_".concat(user_id)).emit("new_notification", newNotification);
                        }
                        else {
                            // For system-wide notifications, maybe emit to an 'admins' room
                            index_js_1.io.emit("new_notification", newNotification); // Or io.to('admins').emit(...)
                        }
                        console.log("Notification created for user ".concat(user_id || 'system', ": \"").concat(message, "\""));
                        return [2 /*return*/, newNotification];
                    case 2:
                        error_1 = _a.sent();
                        console.error("Error creating notification:", error_1);
                        throw new Error("Failed to create notification.");
                    case 3: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Fetches all notifications for a specific user.
     * @param userId - The ID of the user.
     */
    NotificationService.prototype.getNotificationsForUser = function (userId) {
        return __awaiter(this, void 0, void 0, function () {
            var result, error_2;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 2, , 3]);
                        return [4 /*yield*/, (0, postgres_js_1.query)("SELECT * FROM notifications WHERE user_id = $1 ORDER BY created_at DESC", [userId])];
                    case 1:
                        result = _a.sent();
                        return [2 /*return*/, result.rows];
                    case 2:
                        error_2 = _a.sent();
                        console.error("Error fetching notifications for user ".concat(userId, ":"), error_2);
                        throw new Error("Failed to fetch notifications.");
                    case 3: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Marks a specific notification as read.
     * @param notificationId - The ID of the notification to mark as read.
     */
    NotificationService.prototype.markNotificationAsRead = function (notificationId) {
        return __awaiter(this, void 0, void 0, function () {
            var result, error_3;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 2, , 3]);
                        return [4 /*yield*/, (0, postgres_js_1.query)("UPDATE notifications SET read_status = TRUE WHERE id = $1", [notificationId])];
                    case 1:
                        result = _a.sent();
                        return [2 /*return*/, result.rowCount ? result.rowCount > 0 : false];
                    case 2:
                        error_3 = _a.sent();
                        console.error("Error marking notification ".concat(notificationId, " as read:"), error_3);
                        throw new Error("Failed to update notification status.");
                    case 3: return [2 /*return*/];
                }
            });
        });
    };
    return NotificationService;
}());
exports.notificationService = new NotificationService();
