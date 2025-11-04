import { HTTPException } from "hono/http-exception";
import { query } from "../lib/postgres.js";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { env } from "../env.js";
export const login = async (c) => {
    const { email, password } = await c.req.json();
    if (!email || !password) {
        throw new HTTPException(400, { message: "Email and password are required" });
    }
    try {
        const result = await query("SELECT id, name, email, password_hash, status FROM users WHERE email = $1", [email]);
        if (result.rows.length === 0) {
            throw new HTTPException(401, { message: "Invalid credentials" });
        }
        const user = result.rows[0];
        if (user.status !== 'active') {
            throw new HTTPException(403, { message: "Account is not active" });
        }
        const isPasswordValid = await bcrypt.compare(password, user.password_hash);
        if (!isPasswordValid) {
            throw new HTTPException(401, { message: "Invalid credentials" });
        }
        const token = jwt.sign({ id: user.id, name: user.name, email: user.email }, env.JWT_SECRET, { expiresIn: '1d' });
        return c.json({ success: true, token, user: { id: user.id, name: user.name, email: user.email } });
    }
    catch (error) {
        console.error("Customer login error:", error);
        if (error instanceof HTTPException)
            throw error;
        throw new HTTPException(500, { message: "Internal server error" });
    }
};
export const getCustomerSessions = async (c) => {
    // This assumes a middleware has verified the JWT and added the user to the context
    // For now, we will simulate this by passing the user ID in the request
    const { userId } = c.req.query(); // In a real app, this would come from the decoded JWT
    if (!userId) {
        throw new HTTPException(401, { message: "Unauthorized" });
    }
    try {
        const result = await query("SELECT id, session_name, status, profile_name, wa_number FROM sessions WHERE user_id = $1", [userId]);
        return c.json({ success: true, sessions: result.rows });
    }
    catch (error) {
        console.error("Error fetching customer sessions:", error);
        throw new HTTPException(500, { message: "Failed to fetch sessions" });
    }
};
