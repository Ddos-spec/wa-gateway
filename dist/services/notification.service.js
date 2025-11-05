import { query } from "../lib/postgres.js";
import { io } from "../index.js";
class NotificationService {
    /**
     * Creates a new notification in the database and emits a WebSocket event.
     * @param notification - The notification object to create.
     */
    async createNotification(notification) {
        try {
            const { user_id, type, message } = notification;
            // Insert the new notification into the database
            const result = await query("INSERT INTO notifications (user_id, type, message) VALUES ($1, $2, $3) RETURNING *", [user_id, type, message]);
            const newNotification = result.rows[0];
            // Emit a WebSocket event to the specific user or to all admins
            if (user_id) {
                // Find sockets associated with this user and emit
                io.to(`user_${user_id}`).emit("new_notification", newNotification);
            }
            else {
                // For system-wide notifications, maybe emit to an 'admins' room
                io.emit("new_notification", newNotification); // Or io.to('admins').emit(...)
            }
            console.log(`Notification created for user ${user_id || 'system'}: "${message}"`);
            return newNotification;
        }
        catch (error) {
            console.error("Error creating notification:", error);
            throw new Error("Failed to create notification.");
        }
    }
    /**
     * Fetches all notifications for a specific user.
     * @param userId - The ID of the user.
     */
    async getNotificationsForUser(userId) {
        try {
            const result = await query("SELECT * FROM notifications WHERE user_id = $1 ORDER BY created_at DESC", [userId]);
            return result.rows;
        }
        catch (error) {
            console.error(`Error fetching notifications for user ${userId}:`, error);
            throw new Error("Failed to fetch notifications.");
        }
    }
    /**
     * Marks a specific notification as read.
     * @param notificationId - The ID of the notification to mark as read.
     */
    async markNotificationAsRead(notificationId) {
        try {
            const result = await query("UPDATE notifications SET read_status = TRUE WHERE id = $1", [notificationId]);
            return result.rowCount ? result.rowCount > 0 : false;
        }
        catch (error) {
            console.error(`Error marking notification ${notificationId} as read:`, error);
            throw new Error("Failed to update notification status.");
        }
    }
}
export const notificationService = new NotificationService();
