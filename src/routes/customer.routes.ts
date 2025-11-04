import { Hono } from "hono";
import {
  getCustomerSessions,
  login,
} from "../controllers/customer.js";

const customer = new Hono();

customer.post("/login", login);
customer.get("/sessions", getCustomerSessions);

export const createCustomerRoutes = () => customer;
