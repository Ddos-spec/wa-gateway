import { CreateWebhookProps } from "./index.js";
type SessionStatus = "connected" | "disconnected" | "connecting";
type WebhookSessionBody = {
    session: string;
    status: SessionStatus;
};
export declare const createWebhookSession: (props: CreateWebhookProps) => (event: WebhookSessionBody) => Promise<void>;
export {};
//# sourceMappingURL=session.d.ts.map