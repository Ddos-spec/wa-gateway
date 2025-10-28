import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import * as jwt from "jsonwebtoken";
import { env } from "../env";
import { authenticateUser } from "../services/auth.service";
const auth = new Hono();
auth.post("/login", async (c) => {
    try {
        const { username, password } = await c.req.json();
        if (!username || !password) {
            return c.json({ message: "Username and password are required" }, 400);
        }
        const result = await authenticateUser(username, password);
        return c.json({
            success: true,
            token: result.token,
            user: result.user,
        });
    }
    catch (error) {
        if (error instanceof HTTPException) {
            throw error;
        }
        console.error("Login error:", error);
        return c.json({ message: "Internal server error" }, 500);
    }
});
auth.get("/verify", async (c) => {
    try {
        const authHeader = c.req.header("Authorization");
        if (!authHeader || !authHeader.startsWith("Bearer ")) {
            return c.json({ message: "No token provided" }, 401);
        }
        const token = authHeader.substring(7);
        const decoded = jwt.verify(token, env.JWT_SECRET);
        if (typeof decoded !== "object" || decoded === null) {
            return c.json({ message: "Invalid token" }, 401);
        }
        const payload = decoded;
        const rawId = payload.sub;
        const id = (() => {
            if (typeof rawId === "number") {
                return rawId;
            }
            if (typeof rawId === "string") {
                const trimmed = rawId.trim();
                if (!trimmed) {
                    return null;
                }
                const numericId = Number(trimmed);
                return Number.isNaN(numericId) ? trimmed : numericId;
            }
            return null;
        })();
        return c.json({
            valid: true,
            user: {
                id,
                username: payload.username,
                expiresAt: payload.exp
                    ? new Date(payload.exp * 1000).toISOString()
                    : undefined,
            },
        });
    }
    catch (error) {
        if (error instanceof Error && error.name === "JsonWebTokenError") {
            return c.json({ message: "Invalid token" }, 401);
        }
        console.error("Token verification error:", error);
        return c.json({ message: "Invalid token" }, 401);
    }
});
export const createAuthRoutes = () => auth;
