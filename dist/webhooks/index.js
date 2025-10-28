import axios from "axios";
import { env } from "../env.js";
export const webhookClient = axios.create({
    headers: {
        key: env.KEY,
    },
});
