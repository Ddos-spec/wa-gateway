import "dotenv/config";
import { z } from "zod";

export const env = z
  .object({
    NODE_ENV: z.enum(["DEVELOPMENT", "PRODUCTION"]).default("DEVELOPMENT"),
    KEY: z.string().default(""),
    PORT: z
      .string()
      .default("5001")
      .transform((e) => Number(e)),
    WEBHOOK_BASE_URL: z.string().optional(),
    JWT_SECRET: z
      .string()
      .min(1, "JWT_SECRET is required"),
    JWT_EXPIRES_IN: z
      .string()
      .min(1, "JWT_EXPIRES_IN is required"),
    DATABASE_URL: z
      .string()
      .min(1, "DATABASE_URL is required")
      .refine(
        (value) =>
          value.startsWith("postgres://") || value.startsWith("postgresql://"),
        {
          message: "DATABASE_URL must be a valid PostgreSQL connection string",
        }
      ),
  })
  .parse(process.env);
