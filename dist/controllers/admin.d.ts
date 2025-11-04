import { type Context } from "hono";
export declare const getUsers: (c: Context) => Promise<Response & import("hono").TypedResponse<{
    success: true;
    users: any[];
}, import("hono/utils/http-status").ContentfulStatusCode, "json">>;
export declare const addUser: (c: Context) => Promise<Response & import("hono").TypedResponse<{
    success: true;
    user: any;
}, 201, "json">>;
export declare const editUser: (c: Context) => Promise<Response & import("hono").TypedResponse<{
    success: true;
    user: any;
}, import("hono/utils/http-status").ContentfulStatusCode, "json">>;
export declare const suspendUser: (c: Context) => Promise<Response & import("hono").TypedResponse<{
    success: true;
    message: string;
}, import("hono/utils/http-status").ContentfulStatusCode, "json">>;
//# sourceMappingURL=admin.d.ts.map