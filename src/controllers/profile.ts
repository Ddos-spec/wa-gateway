import * as whatsapp from "wa-multi-session";
import { Hono } from "hono";
import { requestValidator } from "../middlewares/validation.middleware.js";
import { z } from "zod";
import { createKeyMiddleware } from "../middlewares/key.middleware.js";
import { HTTPException } from "hono/http-exception";

/**
 * ✅ Response format utilities
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
 * ✅ FIXED: Dramatically increased retry window based on research
 * Reference: User info can take up to 2-3 minutes to be fully available
 * 
 * @param session - WhatsApp session object
 * @param options - Retry configuration
 * @returns User info or null if not available
 */
async function extractUserInfo(
  session: any,
  options: { 
    maxRetries?: number; 
    initialDelay?: number;
    maxDelay?: number;
  } = {}
): Promise<{ name: string; id: string; number: string } | null> {
  const { 
    maxRetries = 8,        // ✅ Increased from 3 to 8
    initialDelay = 500,    // ✅ Start with shorter delay
    maxDelay = 3000        // ✅ Cap at 3 seconds
  } = options;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const user = session?.socket?.user;

    if (user && user.id) {
      console.log(`✅ User info extracted on attempt ${attempt}`);
      return {
        name: user.name || "Unknown",
        id: user.id,
        number: user.id?.split(":")[0] || "",
      };
    }

    // ✅ Exponential backoff: 500ms -> 1s -> 2s -> 3s (capped)
    if (attempt < maxRetries) {
      const delay = Math.min(initialDelay * Math.pow(2, attempt - 1), maxDelay);
      console.log(`⏳ Attempt ${attempt}/${maxRetries}: User info not ready, retrying in ${delay}ms...`);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  console.log(`❌ Failed to extract user info after ${maxRetries} attempts`);
  return null;
}

/**
 * ✅ Session validation
 */
function validateSession(sessionId: string) {
  const session = whatsapp.getSession(sessionId);

  if (!session) {
    throw new HTTPException(404, {
      message: "Session not found",
    });
  }

  return session;
}

export const createProfileController = () => {
  const app = new Hono();

  /**
   * ✅ Schema untuk POST endpoint
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
   * 
   * IMPORTANT: This endpoint will try for ~15 seconds total before giving up
   * Total retry time: 500ms + 1s + 2s + 3s + 3s + 3s + 3s + 3s ≈ 18.5 seconds
   */
  app.get("/:name", createKeyMiddleware(), async (c) => {
    const name = c.req.param("name");

    try {
      const session = validateSession(name);

      // ✅ Try with extended timeout
      const userInfo = await extractUserInfo(session, {
        maxRetries: 8,
        initialDelay: 500,
        maxDelay: 3000,
      });

      if (!userInfo) {
        // ✅ Return 503 dengan hint untuk retry
        return c.json(
          errorResponse(
            "User info not available. Session might still be initializing.",
            {
              hint: "This usually happens right after QR scan. The session needs a moment to fully initialize.",
              retry_after: 10,
              max_wait_time: "2-3 minutes after QR scan",
            }
          ),
          503
        );
      }

      return c.json(successResponse(userInfo));
    } catch (error) {
      if (error instanceof HTTPException) {
        return c.json(errorResponse(error.message), error.status);
      }

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
   * ✅ GET /:name/quick - Quick check tanpa retry
   * Endpoint ini untuk frontend polling - fast fail, let frontend handle retry
   */
  app.get("/:name/quick", createKeyMiddleware(), async (c) => {
    const name = c.req.param("name");

    try {
      const session = validateSession(name);

      // ✅ Single attempt, no retry
      const user = session?.socket?.user;

      if (user && user.id) {
        return c.json(
          successResponse({
            name: user.name || "Unknown",
            id: user.id,
            number: user.id?.split(":")[0] || "",
          })
        );
      }

      // ✅ Fast fail - let frontend retry
      return c.json(
        errorResponse("User info not ready yet", {
          hint: "Session is still initializing. Frontend should retry.",
        }),
        503
      );
    } catch (error) {
      if (error instanceof HTTPException) {
        return c.json(errorResponse(error.message), error.status);
      }

      return c.json(errorResponse("Internal server error"), 500);
    }
  });

  /**
   * ✅ GET /:name/status - Check session status with minimal info
   */
  app.get("/:name/status", createKeyMiddleware(), async (c) => {
    const name = c.req.param("name");

    try {
      const session = validateSession(name);
      const user = session?.socket?.user;

      return c.json(
        successResponse({
          session_id: name,
          is_ready: !!(user && user.id),
          has_user_info: !!user,
          user_info: user && user.id ? {
            name: user.name || "Unknown",
            id: user.id,
            number: user.id?.split(":")[0] || "",
          } : null,
        })
      );
    } catch (error) {
      if (error instanceof HTTPException) {
        return c.json(
          successResponse({
            session_id: name,
            is_ready: false,
            has_user_info: false,
            user_info: null,
          })
        );
      }

      return c.json(errorResponse("Failed to check session status"), 500);
    }
  });

  /**
   * ✅ POST / - Get profile info dari target number/group
   */
  app.post(
    "/",
    createKeyMiddleware(),
    requestValidator("json", getProfileSchema),
    async (c) => {
      try {
        const payload = c.req.valid("json");

        validateSession(payload.session);

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

  return app;
};

/**
 * ============================================
 * 🎯 RECOMMENDED FRONTEND USAGE PATTERNS
 * ============================================
 * 
 * PATTERN 1: Use GET /:name with long timeout (simple but blocks)
 * - Single request, backend handles retry
 * - Takes 15-20 seconds if not ready
 * - Good for: Initial page load after QR scan
 * 
 * PATTERN 2: Use GET /:name/quick with frontend polling (recommended)
 * - Fast fail (~instant response)
 * - Frontend controls retry frequency
 * - Good for: Status polling, better UX
 * 
 * PATTERN 3: Use GET /:name/status to check readiness first
 * - Check if ready before fetching
 * - Prevents unnecessary calls
 * - Good for: Conditional UI rendering
 * 
 * Example implementation in frontend:
 * 
 * ```javascript
 * async function waitForProfile(sessionId, maxAttempts = 20) {
 *   for (let i = 0; i < maxAttempts; i++) {
 *     const data = await fetch(`/api/profile/${sessionId}/quick`);
 *     
 *     if (data.success) {
 *       return data; // Got it!
 *     }
 *     
 *     // Exponential backoff: 2s, 4s, 6s, ..., max 10s
 *     const delay = Math.min(2000 * (i + 1), 10000);
 *     await sleep(delay);
 *   }
 *   
 *   throw new Error('Timeout waiting for profile');
 * }
 * ```
 */
