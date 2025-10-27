import { Hono } from "hono";
import { z } from "zod";
import { authenticateUser } from "../services/auth.service";
import { requestValidator } from "../middlewares/validation.middleware";

export const createAuthController = () => {
  const app = new Hono();

  const loginSchema = z.object({
    username: z.string().trim().min(1, "username is required"),
    password: z.string().min(1, "password is required"),
  });

  app.post(
    "/login",
    requestValidator("json", loginSchema),
    async (c) => {
      const { username, password } = c.req.valid("json");

      const result = await authenticateUser(username, password);

      return c.json(result);
    }
  );

  return app;
};
