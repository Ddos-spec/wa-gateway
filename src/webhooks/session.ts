import { CreateWebhookProps, webhookClient } from "./index.js";

type SessionStatus = "connected" | "disconnected" | "connecting";

type WebhookSessionBody = {
  session: string;
  status: SessionStatus;
};

export const createWebhookSession =
  (props: CreateWebhookProps) => async (event: WebhookSessionBody) => {
    const endpoint = `${props.baseUrl}/session`;

    const body = {
      session: event.session,
      status: event.status,
    } satisfies WebhookSessionBody;

    webhookClient.post(endpoint, body).catch(console.error);
  };
