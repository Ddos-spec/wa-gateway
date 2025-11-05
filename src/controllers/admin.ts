import { type Context } from "hono";
import { HTTPException } from "hono/http-exception";
import { query } from "../lib/postgres.js";
import bcrypt from "bcrypt";
import { notificationService } from "../services/notification.service.js";

export const getUsers = async (c: Context) => {
  try {
    const result = await query("SELECT id, name, email, company_name, billing_status, status FROM users ORDER BY created_at DESC");
    return c.json({ success: true, users: result.rows });
  } catch (error) {
    console.error("Error fetching users:", error);
    throw new HTTPException(500, { message: "Failed to fetch users" });
  }
};

export const addUser = async (c: Context) => {
  const { name, email, password, company_name, plan_id } = await c.req.json();

  if (!name || !email || !password || !company_name || !plan_id) {
    throw new HTTPException(400, { message: "All fields are required" });
  }

  try {
    const password_hash = await bcrypt.hash(password, 10);
    const result = await query(
      "INSERT INTO users (name, email, password_hash, company_name, plan_id, billing_status, status) VALUES ($1, $2, $3, $4, $5, 'active', 'active') RETURNING id, name, email, company_name, billing_status, status",
      [name, email, password_hash, company_name, plan_id]
    );
    const newUser = result.rows[0];

    // Create a notification for the admin
    await notificationService.createNotification({
      user_id: null, // System-wide notification
      type: "new_customer_registered",
      message: `New customer registered: ${newUser.name} (${newUser.email}).`,
    });

    return c.json({ success: true, user: newUser }, 201);
  } catch (error) {
    console.error("Error adding user:", error);
    throw new HTTPException(500, { message: "Failed to add user" });
  }
};

export const editUser = async (c: Context) => {
    const { id } = c.req.param();
    const { name, email, company_name, plan_id, billing_status, status } = await c.req.json();

     if (!name || !email || !company_name || !plan_id || !billing_status || !status) {
        throw new HTTPException(400, { message: "All fields are required" });
    }

    try {
        const result = await query(
            "UPDATE users SET name = $1, email = $2, company_name = $3, plan_id = $4, billing_status = $5, status = $6, updated_at = CURRENT_TIMESTAMP WHERE id = $7 RETURNING id, name, email, company_name, billing_status, status",
            [name, email, company_name, plan_id, billing_status, status, id]
        );
        if (result.rows.length === 0) {
            throw new HTTPException(404, { message: "User not found" });
        }
        return c.json({ success: true, user: result.rows[0] });
    } catch (error) {
        console.error("Error editing user:", error);
        throw new HTTPException(500, { message: "Failed to edit user" });
    }
};

export const suspendUser = async (c: Context) => {
  const { id } = c.req.param();
  if (!id) {
    throw new HTTPException(400, { message: "User ID is required" });
  }
  try {
    const result = await query(
      "UPDATE users SET status = 'suspended', updated_at = CURRENT_TIMESTAMP WHERE id = $1 RETURNING id, status",
      [id]
    );
    if (result.rows.length === 0) {
      throw new HTTPException(404, { message: "User not found" });
    }
    return c.json({ success: true, message: `User ${id} has been suspended.` });
  } catch (error) {
    console.error("Error suspending user:", error);
    throw new HTTPException(500, { message: "Failed to suspend user" });
  }
};
