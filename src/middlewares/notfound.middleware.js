import { HTTPException } from "hono/http-exception";
export const notFoundMiddleware = (c) => {
    throw new HTTPException(404, {
        message: "Route not found",
    });
};
