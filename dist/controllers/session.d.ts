import { type Context } from "hono";
export declare const getSessions: (c: Context) => Promise<Response & import("hono").TypedResponse<{
    data: any[];
}, import("hono/utils/http-status").StatusCode, "json">>;
export declare const getSession: (c: Context) => Promise<Response & import("hono").TypedResponse<{
    success: true;
    session: any;
}, import("hono/utils/http-status").StatusCode, "json">>;
export declare const startNewSession: (c: Context) => Promise<Response & import("hono").TypedResponse<any, import("hono/utils/http-status").StatusCode, "json">>;
export declare const cancelPairing: (c: Context) => Promise<Response & import("hono").TypedResponse<{
    success: true;
    message: string;
}, import("hono/utils/http-status").StatusCode, "json">>;
export declare const deleteSession: (c: Context) => Promise<Response & import("hono").TypedResponse<{
    success: true;
    message: string;
}, import("hono/utils/http-status").StatusCode, "json">>;
//# sourceMappingURL=session.d.ts.map