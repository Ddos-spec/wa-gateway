import * as whatsapp from "wa-multi-session";
import { Hono } from "hono";
import { requestValidator } from "../middlewares/validation.middleware.js";
import { z } from "zod";
import { createKeyMiddleware } from "../middlewares/key.middleware.js";
import { HTTPException } from "hono/http-exception";

export const createProfileController = () => {
  const app = new Hono();

  const getProfileSchema = z.object({
    session: z.string(),
    target: z
      .string()
      .refine((v) => v.includes("@s.whatsapp.net") || v.includes("@g.us"), {
        message: "target must contain '@s.whatsapp.net' or '@g.us'",
      }),
  });

  app.get('/:name', createKeyMiddleware(), async (c) => {
    const name = c.req.param("name");
    const session = whatsapp.getSession(name);

    if (!session) {
      throw new HTTPException(404, { message: "Session not found" });
    }

    const user = (session as any)?.socket?.user;

    if (!user) {
      // Return valid JSON even for errors
      return c.json({
        success: false,
        message: "User info not available yet. Please wait a moment."
      }, 404);
    }

    return c.json({
      success: true,
      name: user.name,
      id: user.id,
      number: user.id?.split(':')[0] || ''
    });
  });
};
