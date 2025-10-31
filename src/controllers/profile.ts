import * as whatsapp from "wa-multi-session";
import { Hono } from "hono";
import { requestValidator } from "../middlewares/validation.middleware.js";
import { z } from "zod";
import { createKeyMiddleware } from "../middlewares/key.middleware.js";
import { HTTPException } from "hono/http-exception";

/**
 * ✅ IMPROVEMENT: Centralized response format utility
 * Prinsip: DRY + Consistency
 * Benefit: Semua response punya format yang sama
 */
const successResponse = (data: any) => ({
  success: true,
  ...data,
});

const errorResponse = (message: string, details?: any) => ({
  success: false,
  message,
  ...(details && { details }),
});

/**
 * ✅ IMPROVEMENT: Extract user info dengan retry mechanism
 * Prinsip: Resilience + Separation of Concerns
 * 
 * Based on research: User info might not be available immediately after connection
 * Reference: https://github.com/pedroslopez/whatsapp-web.js/issues/268
 */
async function extractUserInfo(
  session: any,
  options: { maxRetries?: number; retryDelay?: number } = {}
): Promise<{ name: string; id: string; number: string } | null> {
  const { maxRetries = 3, retryDelay = 1000 } = options;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const user = session?.socket?.user;

    if (user && user.id) {
      return {
        name: user.name || "Unknown",
        id: user.id,
        number: user.id?.split(":")[0] || "",
      };
    }

    // ✅ Jangan retry di attempt terakhir
    if (attempt < maxRetries) {
      await new Promise((resolve) => setTimeout(resolve, retryDelay));
    }
  }

  return null;
}

/**
 * ✅ IMPROVEMENT: Check session status lebih robust
 * Prinsip: Single Responsibility + Explicit over Implicit
 */
function validateSession(sessionId: string) {
  const session = whatsapp.getSession(sessionId);

  if (!session) {
    throw new HTTPException(404, {
      message: "Session not found",
    });
  }

  // ✅ Optional: Check if session is actually connected
  // Based on research, connection state bisa dicek tapi nggak 100% reliable
  // Kita tetep return session dan let caller handle availability check
  return session;
}

export const createProfileController = () => {
  const app = new Hono();

  /**
   * ✅ Schema untuk POST endpoint (get profile dari target)
   */
  const getProfileSchema = z.object({
    session: z.string(),
    target: z
      .string()
      .refine((v) => v.includes("@s.whatsapp.net") || v.includes("@g.us"), {
        message: "target must contain '@s.whatsapp.net' or '@g.us'",
      }),
  });

  /**
   * ✅ GET /:name - Get profile info dari session yang logged in
   * Endpoint ini dipanggil frontend untuk dapetin info user yang login
   */
  app.get("/:name", createKeyMiddleware(), async (c) => {
    const name = c.req.param("name");

    try {
      const session = validateSession(name);

      // ✅ Try to extract user info dengan retry
      const userInfo = await extractUserInfo(session, {
        maxRetries: 3,
        retryDelay: 1000,
      });

      if (!userInfo) {
        // ✅ Return consistent error format
        return c.json(
          errorResponse(
            "User info not available yet. Please wait a moment and try again.",
            {
              hint: "Session might be connecting. Try again in a few seconds.",
              retry_after: 5, // Suggest retry after 5 seconds
            }
          ),
          503 // Service Unavailable - more appropriate than 404
        );
      }

      // ✅ Return consistent success format
      return c.json(successResponse(userInfo));
    } catch (error) {
      // ✅ Handle HTTPException yang di-throw dari validateSession
      if (error instanceof HTTPException) {
        return c.json(errorResponse(error.message), error.status);
      }

      // ✅ Handle unexpected errors
      console.error("Get profile error:", error);
      return c.json(
        errorResponse("Internal server error", {
          error: error instanceof Error ? error.message : "Unknown error",
        }),
        500
      );
    }
  });

  /**
   * ✅ POST / - Get profile info dari target number/group
   * Endpoint ini untuk cek profile orang lain
   */
  app.post(
    "/",
    createKeyMiddleware(),
    requestValidator("json", getProfileSchema),
    async (c) => {
      try {
        const payload = c.req.valid("json");

        // ✅ Validate session exists
        validateSession(payload.session);

        // ✅ Check if target is registered
        const isRegistered = await whatsapp.isExist({
          sessionId: payload.session,
          to: payload.target,
          isGroup: payload.target.includes("@g.us"),
        });

        if (!isRegistered) {
          return c.json(
            errorResponse("Target is not registered on WhatsApp", {
              target: payload.target,
            }),
            404
          );
        }

        // ✅ Get profile info
        const profileData = await whatsapp.getProfileInfo({
          sessionId: payload.session,
          target: payload.target,
        });

        return c.json(
          successResponse({
            profile: profileData,
          })
        );
      } catch (error) {
        if (error instanceof HTTPException) {
          return c.json(errorResponse(error.message), error.status);
        }

        console.error("Get target profile error:", error);
        return c.json(
          errorResponse("Failed to get profile info", {
            error: error instanceof Error ? error.message : "Unknown error",
          }),
          500
        );
      }
    }
  );

  /**
   * ✅ NEW: GET /:name/status - Check session status
   * Endpoint tambahan buat frontend cek apakah session ready
   * Prinsip: Explicit over Implicit
   */
  app.get("/:name/status", createKeyMiddleware(), async (c) => {
    const name = c.req.param("name");

    try {
      const session = validateSession(name);

      // Quick check tanpa retry
      const userInfo = await extractUserInfo(session, {
        maxRetries: 1,
        retryDelay: 0,
      });

      return c.json(
        successResponse({
          session_id: name,
          is_ready: !!userInfo,
          user_info: userInfo,
        })
      );
    } catch (error) {
      if (error instanceof HTTPException) {
        return c.json(
          successResponse({
            session_id: name,
            is_ready: false,
            user_info: null,
          })
        );
      }

      return c.json(
        errorResponse("Failed to check session status"),
        500
      );
    }
  });

  return app;
};

/**
 * ============================================
 * 🎯 USAGE EXAMPLES dari Frontend
 * ============================================
 * 
 * 1. Get logged-in user profile:
 *    GET /api/profile/:sessionId
 *    Response:
 *    {
 *      "success": true,
 *      "name": "John Doe",
 *      "id": "628123456789:1@s.whatsapp.net",
 *      "number": "628123456789"
 *    }
 * 
 * 2. Error when not ready:
 *    {
 *      "success": false,
 *      "message": "User info not available yet...",
 *      "details": {
 *        "hint": "Session might be connecting...",
 *        "retry_after": 5
 *      }
 *    }
 * 
 * 3. Check session status:
 *    GET /api/profile/:sessionId/status
 *    Response:
 *    {
 *      "success": true,
 *      "session_id": "test-session",
 *      "is_ready": true,
 *      "user_info": { ... }
 *    }
 * 
 * 4. Get target profile:
 *    POST /api/profile
 *    Body: {
 *      "session": "test-session",
 *      "target": "628123456789@s.whatsapp.net"
 *    }
 *    Response:
 *    {
 *      "success": true,
 *      "profile": { ... }
 *    }
 */
