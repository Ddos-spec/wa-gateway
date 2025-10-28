import * as whatsapp from "wa-multi-session";
import { Hono } from "hono";
import { requestValidator } from "../middlewares/validation.middleware.js";
import { z } from "zod";
import { createKeyMiddleware } from "../middlewares/key.middleware.js";
import { toDataURL } from "qrcode";
import { HTTPException } from "hono/http-exception";

export const createSessionController = () => {
  const app = new Hono();

  app.get("/", createKeyMiddleware(), async (c) => {
    console.log('ALL SESSIONS DATA:', whatsapp.getAllSession()); // <-- DEBUG LOG
    return c.json({
      data: whatsapp.getAllSession(),
    });
  });

  const startSessionSchema = z.object({
    session: z.string(),
  });

  app.post(
    "/start",
    createKeyMiddleware(),
    requestValidator("json", startSessionSchema),
    async (c) => {
      const payload = c.req.valid("json");

      const isExist = whatsapp.getSession(payload.session);
      if (isExist) {
        throw new HTTPException(400, {
          message: "Session already exist",
        });
      }

      const qr = await new Promise<string | null>(async (r) => {
        await whatsapp.startSession(payload.session, {
          onConnected() {
            r(null);
          },
          onQRUpdated(qr) {
            r(qr);
          },
        });
      });

      if (qr) {
        return c.json({
          qr: await toDataURL(qr),
        });
      }

      return c.json({
        data: {
          message: "Connected",
        },
      });
    }
  );
  app.get(
    "/start",
    createKeyMiddleware(),
    requestValidator("query", startSessionSchema),
    async (c) => {
      const payload = c.req.valid("query");

      const isExist = whatsapp.getSession(payload.session);
      if (isExist) {
        throw new HTTPException(400, {
          message: "Session already exist",
        });
      }

      const qr = await new Promise<string | null>(async (r) => {
        await whatsapp.startSession(payload.session, {
          onConnected() {
            r(null);
          },
          onQRUpdated(qr) {
            r(qr);
          },
        });
      });

      if (qr) {
        return c.render(`
            <div id="qrcode"></div>

            <script type="text/javascript">
                let qr = '${await toDataURL(qr)}'
                let image = new Image()
                image.src = qr
                document.body.appendChild(image)
            </script>
            `);
      }

      return c.json({
        data: {
          message: "Connected",
        },
      });
    }
  );

  app.all("/logout", createKeyMiddleware(), async (c) => {
    await whatsapp.deleteSession(
      c.req.query().session || (await c.req.json()).session || ""
    );
    return c.json({
      data: "success",
    });
  });

  app.get("/:name/status", createKeyMiddleware(), async (c) => {
    const name = c.req.param("name");
    const session = whatsapp.getSession(name);

    console.log('SESSION OBJECT:', session); // <-- DEBUG LOG

    if (!session) {
      throw new HTTPException(404, { message: "Session not found" });
    }

    return c.json({
      success: true,
      status: session ? 'found' : 'not_found', // Temporary status
    });
  });

  return app;
};
