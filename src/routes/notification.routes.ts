import { Hono } from "hono";
import { notificationService } from "../services/notification.service.js";
import { authMiddleware } from "../middlewares/auth.middleware.js";

// Define the expected context for these routes
interface AppContext {
  Bindings: {};
  Variables: {
    user?: { id: number; email: string };
  };
}

export const createNotificationRoutes = () => {
  const router = new Hono<AppContext>();

  // Middleware to ensure user is authenticated for all notification routes
  router.use("*", authMiddleware);

  /**
   * GET /notifications
   * Fetches all notifications for the authenticated user.
   */
  router.get("/", async (c) => {
    const user = c.get("user"); // Assuming authMiddleware sets the user context

    if (!user || !user.id) {
      return c.json({ error: "Authentication required." }, 401);
    }

    try {
      const notifications = await notificationService.getNotificationsForUser(user.id);
      return c.json(notifications);
    } catch (error) {
      console.error("Error fetching notifications route:", error);
      return c.json({ error: "Failed to fetch notifications." }, 500);
    }
  });

  /**
   * PATCH /notifications/:id/read
   * Marks a specific notification as read.
   */
  router.patch("/:id/read", async (c) => {
    const notificationId = parseInt(c.req.param("id"), 10);
    const user = c.get("user");

    if (isNaN(notificationId)) {
      return c.json({ error: "Invalid notification ID." }, 400);
    }

    if (!user || !user.id) {
      return c.json({ error: "Authentication required." }, 401);
    }

    try {
      // Optional: Verify the notification belongs to the user before marking as read
      // This adds an extra layer of security.
      const notifications = await notificationService.getNotificationsForUser(user.id);
      const notificationExists = notifications.some(n => n.id === notificationId);

      if (!notificationExists) {
        return c.json({ error: "Notification not found or access denied." }, 404);
      }

      const success = await notificationService.markNotificationAsRead(notificationId);
      if (success) {
        return c.json({ message: "Notification marked as read." });
      } else {
        return c.json({ error: "Failed to mark notification as read." }, 500);
      }
    } catch (error) {
      console.error(`Error in PATCH /notifications/${notificationId}/read route:`, error);
      return c.json({ error: "An internal server error occurred." }, 500);
    }
  });

  return router;
};
