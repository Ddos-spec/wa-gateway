import { Hono } from "hono";
import { cancelPairing, deleteSession, getSession, getSessions, startNewSession, } from "../controllers/session.js";
const session = new Hono();
session.get("/", getSessions);
session.get("/:name", getSession);
session.post("/start", startNewSession);
session.delete("/:name", deleteSession);
session.post("/:name/cancel", cancelPairing);
export const createSessionRoutes = () => session;
