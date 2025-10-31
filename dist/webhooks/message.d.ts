import { MessageReceived } from "wa-multi-session";
export type WebhookMessageBody = {
    session: string;
    from: string | null;
    message: string | null;
    media: {
        image: string | null;
        video: string | null;
        document: string | null;
        audio: string | null;
    };
};
export declare const createWebhookMessage: (message: MessageReceived) => Promise<WebhookMessageBody | undefined>;
//# sourceMappingURL=message.d.ts.map