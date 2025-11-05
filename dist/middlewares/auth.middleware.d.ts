import { type MiddlewareHandler } from "hono";
import { type JWTPayload } from "jose";
interface CustomJwtPayload extends JWTPayload {
    id: number;
    email: string;
}
interface AppContext {
    Bindings: {};
    Variables: {
        user?: CustomJwtPayload;
    };
}
export declare const authMiddleware: MiddlewareHandler<AppContext>;
export {};
//# sourceMappingURL=auth.middleware.d.ts.map