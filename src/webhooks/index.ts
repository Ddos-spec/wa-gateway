import axios from "axios";
import { env } from "../env.js";

export type CreateWebhookProps = {
  baseUrl: string;
};

export const webhookClient = axios.create({
  headers: {
    key: env.KEY,
  },
});
