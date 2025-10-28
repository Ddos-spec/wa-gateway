import { HTTPException } from "hono/http-exception";
import { ApplicationError } from "../errors/index.js";
import { env } from "../env.js";
export const globalErrorMiddleware = (err, c) => {
    if (err instanceof HTTPException && err.message) {
        return c.json({
            message: err.message,
        }, err.status);
    }
    if (ApplicationError.isApplicationError(err)) {
        return c.json(err.getResponseMessage(), err.code);
    }
    console.error("APP ERROR:", err);
    if (env.NODE_ENV == "PRODUCTION")
        err.message = "Something went wrong, please try again later!";
    return c.json({ message: err.message }, 500);
};
