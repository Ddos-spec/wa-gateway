export type SessionStatus = "connected" | "disconnected" | "connecting";

export type WebhookSessionBody = {
  session: string;
  status: SessionStatus;
};