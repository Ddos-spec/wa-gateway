import axios from "axios";
import { env } from "../env";
export const webhookClient = axios.create({
    headers: {
        key: env.KEY,
    },
});
