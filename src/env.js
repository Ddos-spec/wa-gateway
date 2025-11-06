"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.env = void 0;
require("dotenv/config");
var zod_1 = require("zod");
exports.env = zod_1.z
    .object({
    NODE_ENV: zod_1.z
        .string()
        .default("DEVELOPMENT")
        .transform(function (value) { return value.toUpperCase(); })
        .refine(function (value) { return ["DEVELOPMENT", "PRODUCTION"].includes(value); }, {
        message: "NODE_ENV must be development or production",
    }),
    KEY: zod_1.z.string().default(""),
    PORT: zod_1.z
        .string()
        .default("5001")
        .transform(function (e) { return Number(e); }),
    WEBHOOK_BASE_URL: zod_1.z.string().optional(),
    FRONTEND_URL: zod_1.z.string().trim().optional(),
    ALLOWED_ORIGINS: zod_1.z
        .string()
        .optional()
        .transform(function (value) {
        if (!value) {
            return [];
        }
        return value
            .split(",")
            .map(function (origin) { return origin.trim(); })
            .filter(Boolean);
    }),
    JWT_SECRET: zod_1.z
        .string()
        .min(1, "JWT_SECRET is required"),
    JWT_EXPIRES_IN: zod_1.z
        .string()
        .min(1, "JWT_EXPIRES_IN is required"),
    DATABASE_URL: zod_1.z
        .string()
        .min(1, "DATABASE_URL is required")
        .refine(function (value) {
        return value.startsWith("postgres://") || value.startsWith("postgresql://");
    }, {
        message: "DATABASE_URL must be a valid PostgreSQL connection string",
    }),
})
    .parse(process.env);
