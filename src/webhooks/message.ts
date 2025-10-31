import { MessageReceived } from "wa-multi-session";
import {
  handleWebhookAudioMessage,
  handleWebhookDocumentMessage,
  handleWebhookImageMessage,
  handleWebhookVideoMessage,
} from "./media.js";

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

export const createWebhookMessage = async (message: MessageReceived) => {
  if (message.key.fromMe || message.key.remoteJid?.includes("broadcast")) {
    return;
  }

  const image = await handleWebhookImageMessage(message);
  const video = await handleWebhookVideoMessage(message);
  const document = await handleWebhookDocumentMessage(message);
  const audio = await handleWebhookAudioMessage(message);

  const body: WebhookMessageBody = {
    session: message.sessionId,
    from: message.key.remoteJid ?? null,
    message:
      message.message?.conversation ||
      message.message?.extendedTextMessage?.text ||
      message.message?.imageMessage?.caption ||
      message.message?.videoMessage?.caption ||
      message.message?.documentMessage?.caption ||
      message.message?.contactMessage?.displayName ||
      message.message?.locationMessage?.comment ||
      message.message?.liveLocationMessage?.caption ||
      null,

    /**
     * media message
     */
    media: {
      image,
      video,
      document,
      audio,
    },
  };
  return body;
};