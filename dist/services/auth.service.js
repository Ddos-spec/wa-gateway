import bcrypt from "bcrypt";
import { HTTPException } from "hono/http-exception";
import jwt from "jsonwebtoken";
import { env } from "../env.js";
import { findConfigByUsername, } from "../repositories/config.repository.js";
const mapUser = (record) => ({
    id: record.id,
    username: record.username,
    createdAt: (() => {
        const dateValue = record.updated_at instanceof Date
            ? record.updated_at
            : new Date(record.updated_at);
        return Number.isNaN(dateValue.getTime())
            ? String(record.updated_at)
            : dateValue.toISOString();
    })(),
});
export const authenticateUser = async (username, password) => {
    const record = await findConfigByUsername(username);
    if (!record) {
        throw new HTTPException(401, {
            message: "Invalid username or password",
        });
    }
    const isPasswordValid = await bcrypt.compare(password, record.password_hash);
    if (!isPasswordValid) {
        throw new HTTPException(401, {
            message: "Invalid username or password",
        });
    }
    const user = mapUser(record);
    const token = jwt.sign({
        username: user.username,
    }, env.JWT_SECRET, {
        expiresIn: env.JWT_EXPIRES_IN,
        subject: String(user.id),
    });
    return {
        token,
        user,
    };
};
