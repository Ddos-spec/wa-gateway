import { type Context } from "hono";
export declare const getSessions: (c: Context) => Promise<Response & import("hono").TypedResponse<never, import("hono/utils/http-status").ContentfulStatusCode, "json">>;
export declare const getSession: (c: Context) => Promise<Response & import("hono").TypedResponse<{
    success: true;
    session: any;
}, import("hono/utils/http-status").ContentfulStatusCode, "json">>;
export declare const startNewSession: (c: Context) => Promise<Response & import("hono").TypedResponse<any, import("hono/utils/http-status").ContentfulStatusCode, "json">>;
export declare const cancelPairing: (c: Context) => Promise<Response & import("hono").TypedResponse<{
    success: true;
    message: string;
}, import("hono/utils/http-status").ContentfulStatusCode, "json">>;
export declare const deleteSession: (c: Context) => Promise<Response & import("hono").TypedResponse<{
    success: true;
    message: string;
}, import("hono/utils/http-status").ContentfulStatusCode, "json">>;
//# sourceMappingURL=session.d.ts.map