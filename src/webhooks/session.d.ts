import { CreateWebhookProps } from ".";
type SessionStatus = "connected" | "disconnected" | "connecting";
type WebhookSessionBody = {
    session: string;
    status: SessionStatus;
};
export declare const createWebhookSession: (props: CreateWebhookProps) => (event: WebhookSessionBody) => Promise<void>;
export {};
//# sourceMappingURL=session.d.ts.map