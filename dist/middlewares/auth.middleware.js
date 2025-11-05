import { jwtVerify } from "jose";
import { env } from "../env.js";
import { TextEncoder } from "util";
const secretKey = new TextEncoder().encode(env.JWT_SECRET);
export const authMiddleware = async (c, next) => {
    const authHeader = c.req.header("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return c.json({ error: "Unauthorized: Missing or invalid token." }, 401);
    }
    const token = authHeader.split(" ")[1];
    if (!token) {
        return c.json({ error: "Unauthorized: Token format is invalid." }, 401);
    }
    try {
        const { payload } = await jwtVerify(token, secretKey);
        // Type guard to ensure the payload has the required fields
        if (typeof payload.id !== 'number' || typeof payload.email !== 'string') {
            return c.json({ error: "Unauthorized: Invalid token payload." }, 401);
        }
        c.set("user", payload);
        await next();
    }
    catch (error) {
        return c.json({ error: "Unauthorized: Invalid token." }, 401);
    }
};
