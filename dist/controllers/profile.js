import * as whatsapp from "wa-multi-session";
import { Hono } from "hono";
import { requestValidator } from "../middlewares/validation.middleware.js";
import { z } from "zod";
import { createKeyMiddleware } from "../middlewares/key.middleware.js";
import { HTTPException } from "hono/http-exception";
/**
 * ✅ Response format utilities
 */
const successResponse = (data) => ({
    success: true,
    ...data,
});
const errorResponse = (message, details) => ({
    success: false,
    message,
    ...(details && { details }),
});
/**
 * ✅ FIXED: Extract user info dari Baileys WASocket
 * wa-multi-session.getSession() returns Baileys WASocket object
 * User info ada di: socket.user (authState.creds.me)
 *
 * References:
 * - Baileys stores auth creds including user info
 * - User object structure: { id: "628xxx:xx@s.whatsapp.net", name: "..." }
 */
async function extractUserInfo(session, options = {}) {
    const { maxRetries = 8, initialDelay = 500, maxDelay = 3000 } = options;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            // ✅ CRITICAL FIX: Baileys user info ada di session.user
            // Ini adalah property dari WASocket, bukan socket.user
            const user = session?.user;
            if (user && user.id) {
                console.log(`✅ User info extracted on attempt ${attempt}`);
                // Parse phone number dari ID format: "628xxx:xx@s.whatsapp.net"
                const phoneNumber = user.id.split('@')[0].split(':')[0];
                return {
                    name: user.name || user.verifiedName || "Unknown",
                    id: user.id,
                    number: phoneNumber,
                };
            }
            // ✅ Alternative: Try authState if user not available directly
            const authState = session?.authState?.creds;
            if (authState?.me?.id) {
                console.log(`✅ User info extracted from authState on attempt ${attempt}`);
                const phoneNumber = authState.me.id.split('@')[0].split(':')[0];
                return {
                    name: authState.me.name || authState.me.verifiedName || "Unknown",
                    id: authState.me.id,
                    number: phoneNumber,
                };
            }
        }
        catch (error) {
            console.error(`⚠️ Error extracting user info on attempt ${attempt}:`, error);
        }
        // Exponential backoff
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
function validateSession(sessionId) {
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
                return c.json(errorResponse("User info not available. Session might still be initializing.", {
                    hint: "This usually happens right after QR scan. The session needs a moment to fully initialize.",
                    retry_after: 10,
                    max_wait_time: "2-3 minutes after QR scan",
                }), 503);
            }
            return c.json(successResponse(userInfo));
        }
        catch (error) {
            if (error instanceof HTTPException) {
                return c.json(errorResponse(error.message), error.status);
            }
            console.error("Get profile error:", error);
            return c.json(errorResponse("Internal server error", {
                error: error instanceof Error ? error.message : "Unknown error",
            }), 500);
        }
    });
    /**
     * ✅ GET /:name/quick - Quick check tanpa retry
     * Fast fail endpoint untuk frontend polling
     */
    app.get("/:name/quick", createKeyMiddleware(), async (c) => {
        const name = c.req.param("name");
        try {
            const session = validateSession(name);
            // ✅ Single attempt, no retry
            try {
                const user = session?.user;
                // ✅ FIX: Type-safe check sebelum akses property
                if (user && typeof user.id === "string") {
                    const phoneNumber = user?.id?.split?.('@')[0]?.split?.(':')[0] ?? "";
                    return c.json(successResponse({
                        name: user.name || user.verifiedName || "Unknown",
                        id: user.id,
                        number: phoneNumber,
                    }));
                }
                // ✅ FIX: Try authState alternative dengan proper type checking
                const authState = session?.authState?.creds;
                const authMe = authState?.me;
                if (authMe && authMe.id && typeof authMe.id === "string") {
                    const phoneNumber = authMe.id.split('@')[0].split(':')[0];
                    return c.json(successResponse({
                        name: authMe.name || authMe.verifiedName || "Unknown",
                        id: authMe.id,
                        number: phoneNumber,
                    }));
                }
            }
            catch (extractError) {
                console.error("Quick extract error:", extractError);
            }
            // ✅ Fast fail
            return c.json(errorResponse("User info not ready yet", {
                hint: "Session is still initializing. Frontend should retry.",
            }), 503);
        }
        catch (error) {
            if (error instanceof HTTPException) {
                return c.json(errorResponse(error.message), error.status);
            }
            return c.json(errorResponse("Internal server error"), 500);
        }
    });
    /**
     * ✅ GET /:name/status - Check session status
     */
    app.get("/:name/status", createKeyMiddleware(), async (c) => {
        const name = c.req.param("name");
        try {
            const session = validateSession(name);
            // ✅ FIX: Type-safe check untuk multiple sources
            const user = session?.user;
            const authState = session?.authState?.creds;
            const authMe = authState?.me;
            const hasUserInfo = !!(user?.id || authMe?.id);
            let userInfo = null;
            if (hasUserInfo) {
                // ✅ FIX: Proper null checking sebelum akses property
                const source = user?.id ? user : authMe;
                if (source && source.id && typeof source.id === "string") {
                    const phoneNumber = source.id.split('@')[0].split(':')[0];
                    userInfo = {
                        name: source.name || source.verifiedName || "Unknown",
                        id: source.id,
                        number: phoneNumber,
                    };
                }
            }
            return c.json(successResponse({
                session_id: name,
                is_ready: !!hasUserInfo,
                has_user_info: !!hasUserInfo,
                user_info: userInfo,
            }));
        }
        catch (error) {
            if (error instanceof HTTPException) {
                return c.json(successResponse({
                    session_id: name,
                    is_ready: false,
                    has_user_info: false,
                    user_info: null,
                }));
            }
            return c.json(errorResponse("Failed to check session status"), 500);
        }
    });
    /**
     * ✅ POST / - Get profile info dari target number/group
     */
    app.post("/", createKeyMiddleware(), requestValidator("json", getProfileSchema), async (c) => {
        try {
            const payload = c.req.valid("json");
            validateSession(payload.session);
            const isRegistered = await whatsapp.isExist({
                sessionId: payload.session,
                to: payload.target,
                isGroup: payload.target.includes("@g.us"),
            });
            if (!isRegistered) {
                return c.json(errorResponse("Target is not registered on WhatsApp", {
                    target: payload.target,
                }), 404);
            }
            const profileData = await whatsapp.getProfileInfo({
                sessionId: payload.session,
                target: payload.target,
            });
            return c.json(successResponse({
                profile: profileData,
            }));
        }
        catch (error) {
            if (error instanceof HTTPException) {
                return c.json(errorResponse(error.message), error.status);
            }
            console.error("Get target profile error:", error);
            return c.json(errorResponse("Failed to get profile info", {
                error: error instanceof Error ? error.message : "Unknown error",
            }), 500);
        }
    });
    return app;
};
export default createProfileController;
