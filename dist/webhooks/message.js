import { webhookClient } from "./index.js";
import { handleWebhookAudioMessage, handleWebhookDocumentMessage, handleWebhookImageMessage, handleWebhookVideoMessage, } from "./media.js";
export const createWebhookMessage = (props) => async (message) => {
    if (message.key.fromMe || message.key.remoteJid?.includes("broadcast"))
        return;
    const endpoint = `${props.baseUrl}/message`;
    const image = await handleWebhookImageMessage(message);
    const video = await handleWebhookVideoMessage(message);
    const document = await handleWebhookDocumentMessage(message);
    const audio = await handleWebhookAudioMessage(message);
    const body = {
        session: message.sessionId,
        from: message.key.remoteJid ?? null,
        message: message.message?.conversation ||
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
    webhookClient.post(endpoint, body).catch(console.error);
};
