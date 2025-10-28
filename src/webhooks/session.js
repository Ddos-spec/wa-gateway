import { webhookClient } from ".";
export const createWebhookSession = (props) => async (event) => {
    const endpoint = `${props.baseUrl}/session`;
    const body = {
        session: event.session,
        status: event.status,
    };
    webhookClient.post(endpoint, body).catch(console.error);
};
