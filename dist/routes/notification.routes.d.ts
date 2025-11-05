import { Hono } from "hono";
interface AppContext {
    Bindings: {};
    Variables: {
        user?: {
            id: number;
            email: string;
        };
    };
}
export declare const createNotificationRoutes: () => Hono<AppContext, import("hono/types").BlankSchema, "/">;
export {};
//# sourceMappingURL=notification.routes.d.ts.map