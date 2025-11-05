export interface Notification {
    id?: number;
    user_id: number | null;
    type: NotificationType;
    message: string;
    read_status?: boolean;
    created_at?: Date;
}
export type NotificationType = "session_connected" | "session_disconnected" | "new_customer_registered" | "subscription_expiring" | "payment_failed" | "high_message_volume" | "api_quota_warning" | "system_health_alert";
declare class NotificationService {
    /**
     * Creates a new notification in the database and emits a WebSocket event.
     * @param notification - The notification object to create.
     */
    createNotification(notification: Notification): Promise<Notification>;
    /**
     * Fetches all notifications for a specific user.
     * @param userId - The ID of the user.
     */
    getNotificationsForUser(userId: number): Promise<Notification[]>;
    /**
     * Marks a specific notification as read.
     * @param notificationId - The ID of the notification to mark as read.
     */
    markNotificationAsRead(notificationId: number): Promise<boolean>;
}
export declare const notificationService: NotificationService;
export {};
//# sourceMappingURL=notification.service.d.ts.map