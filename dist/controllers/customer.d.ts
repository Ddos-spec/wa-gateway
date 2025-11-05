import { type Context } from "hono";
export declare const login: (c: Context) => Promise<Response & import("hono").TypedResponse<{
    success: true;
    token: string;
    user: {
        id: any;
        name: any;
        email: any;
    };
}, import("hono/utils/http-status").ContentfulStatusCode, "json">>;
export declare const getCustomerSessions: (c: Context) => Promise<Response & import("hono").TypedResponse<{
    success: true;
    sessions: any[];
}, import("hono/utils/http-status").ContentfulStatusCode, "json">>;
//# sourceMappingURL=customer.d.ts.map