import { Hono } from "hono";
import {
  addUser,
  editUser,
  getUsers,
  suspendUser,
} from "../controllers/admin.js";

const admin = new Hono();

admin.get("/users", getUsers);
admin.post("/users", addUser);
admin.put("/users/:id", editUser);
admin.patch("/users/:id/suspend", suspendUser);

export const createAdminRoutes = () => admin;
