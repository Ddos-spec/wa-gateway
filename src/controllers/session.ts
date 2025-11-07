import { type Context } from "hono";
import { HTTPException } from "hono/http-exception";
import { toDataURL } from "qrcode";
import * as whatsapp from "wa-multi-session";
import crypto from "crypto";
import { query } from "../lib/postgres.js";

// Map to hold pending pairing promises
const pendingPairingPromises = new Map<
  string,
  { reject: (reason?: any) => void; timer: NodeJS.Timeout }
>();

const pairingTimeout = 60000; // 60 seconds

// --- CONTROLLER FUNCTIONS ---

export const getSessions = async (c: Context) => {
  console.log("Attempting to fetch all sessions.");
  const user = c.var.user;

  let queryText = "SELECT * FROM sessions";
  const queryParams: (string | number)[] = [];

  if (user?.role === "admin") {
    queryText += " ORDER BY created_at DESC";
  } else if (user?.id) {
    queryText += " WHERE user_id = $1 ORDER BY created_at DESC";
    queryParams.push(user.id);
  } else {
    throw new HTTPException(403, { message: "Forbidden: Not authenticated." });
  }

  try {
    const result = await query(queryText, queryParams);
    console.log("Fetched sessions:", result.rows);
    return c.json({
      data: result.rows,
    });
  } catch (error) {
    console.error("Error fetching sessions from DB:", error);
    throw new HTTPException(500, { message: "Failed to fetch sessions" });
  }
};

export const getSession = async (c: Context) => {
  const name = c.req.param("name");
  const user = c.var.user;

  let queryText = "SELECT * FROM sessions WHERE session_name = $1";
  const queryParams: (string | number)[] = [name];

  if (user?.role === "admin") {
    // Admin can view any session
  } else if (user?.id) {
    queryText += " AND user_id = $2";
    queryParams.push(user.id);
  } else {
    throw new HTTPException(403, { message: "Forbidden: Not authenticated." });
  }

  try {
    const result = await query(queryText, queryParams);
    if (result.rows.length === 0) {
      throw new HTTPException(404, {
        message: "Session not found in database or you don't have access",
      });
    }
    return c.json({
      success: true,
      session: result.rows[0],
    });
  } catch (error) {
    console.error(`Error fetching session ${name}:`, error);
    if (error instanceof HTTPException) throw error;
    throw new HTTPException(500, { message: "Failed to get session" });
  }
};

export const startNewSession = async (c: Context) => {
  const { session: sessionName, pairingType, phone } = await c.req.json();
  const codeRequestTimeout = 30000; // 30 seconds
  const user = c.var.user; // Get authenticated user from context

  if (!user || !user.id) {
    throw new HTTPException(403, { message: "Forbidden: Not authenticated." });
  }

  if (!sessionName) {
    throw new HTTPException(400, { message: "Session name is required" });
  }
  // Prevent starting a session that's already being processed
  if (pendingPairingPromises.has(sessionName)) {
    throw new HTTPException(409, {
      message: "A pairing process for this session is already in progress.",
    });
  }
  // Check DB if session is already online
  const dbSessionStatus = await query(
    "SELECT status, user_id FROM sessions WHERE session_name = $1",
    [sessionName]
  );
  if (
    dbSessionStatus.rows.length > 0 &&
    dbSessionStatus.rows[0].status === "online"
  ) {
    // If session exists and is online, check ownership
    if (dbSessionStatus.rows[0].user_id !== user.id && user.role !== "admin") {
      throw new HTTPException(403, { message: "Forbidden: You do not own this session." });
    }
    return c.json({ success: true, message: "Session is already online." });
  }

  // Upsert session in DB
  try {
     const apiKey = crypto.randomBytes(32).toString("hex");
     await query(
      `INSERT INTO sessions (session_name, status, api_key, user_id)
       VALUES ($1, 'connecting', $2, $3)
       ON CONFLICT (session_name)
       DO UPDATE SET status = 'connecting', updated_at = CURRENT_TIMESTAMP, user_id = $3`,
      [sessionName, apiKey, user.id]
    );
  } catch (dbError) {
      console.error(`[${sessionName}] Failed to upsert session in DB:`, dbError);
      throw new HTTPException(500, { message: "Database operation failed." });
  }


  try {
    const result = await new Promise<any>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error("Failed to generate code. Please try again."));
      }, codeRequestTimeout);

      pendingPairingPromises.set(sessionName, { reject, timer });

      const onConnected = (sessionId: string) => {
         if (sessionId === sessionName) {
            console.log(`[${sessionId}] Connected!`);
            resolve({ status: "connected" });
         }
      };

      if (pairingType === "code" && phone) {
        console.log(`[${sessionName}] Requesting pairing code for phone: ${phone}`);
        whatsapp.startSessionWithPairingCode(sessionName, {
            phoneNumber: phone,
        });
        whatsapp.onPairingCode((sessionId, code) => {
             if (sessionId === sessionName) {
                console.log(`[${sessionName}] Pairing code received: ${code}`);
                const formattedCode = code.replace(/.(?=.)/g, '$&-'); // Add dashes
                resolve({ code: formattedCode });
            }
        });
      } else {
        console.log(`[${sessionName}] Requesting QR code`);
        whatsapp.startSession(sessionName, {
            onQRUpdated: (qr) => {
                console.log(`[${sessionName}] QR code updated`);
                toDataURL(qr).then(qrDataURL => resolve({ qr: qrDataURL }));
            }
        });
        whatsapp.onConnected((sessionId) => {
            if (sessionId === sessionName) {
                console.log(`[${sessionId}] Connected!`);
                resolve({ status: "connected" });
            }
        });
      }
    });

    // Clean up timeout
    const pending = pendingPairingPromises.get(sessionName);
    if (pending) {
      clearTimeout(pending.timer);
      pendingPairingPromises.delete(sessionName);
    }

    return c.json({ success: true, ...result });

  } catch (error: any) {
    console.error(`[${sessionName}] Error starting session:`, error.message);

    const pending = pendingPairingPromises.get(sessionName);
    if (pending) {
      clearTimeout(pending.timer);
      pendingPairingPromises.delete(sessionName);
    }

    await whatsapp.deleteSession(sessionName).catch(e => console.error(`[${sessionName}] Cleanup delete failed:`, e));
    await query("UPDATE sessions SET status = 'offline' WHERE session_name = $1", [sessionName]);

    throw new HTTPException(500, { message: error.message || "Failed to start session" });
  }
};


export const cancelPairing = async (c: Context) => {
  const sessionName = c.req.param("name");
  const user = c.var.user;

  if (!user || !user.id) {
    throw new HTTPException(403, { message: "Forbidden: Not authenticated." });
  }

  console.log(`[${sessionName}] Attempting to cancel pairing.`);

  // Check ownership before cancelling
  const sessionRecord = await query(
    "SELECT user_id FROM sessions WHERE session_name = $1",
    [sessionName]
  );

  if (sessionRecord.rows.length === 0) {
    throw new HTTPException(404, { message: "Session not found." });
  }

  if (sessionRecord.rows[0].user_id !== user.id && user.role !== "admin") {
    throw new HTTPException(403, { message: "Forbidden: You do not own this session." });
  }

  const pending = pendingPairingPromises.get(sessionName);
  if (pending) {
    clearTimeout(pending.timer);
    pending.reject(new Error("Pairing was cancelled by the user."));
    pendingPairingPromises.delete(sessionName);

    // Also attempt to delete the session from the library to stop it
    await whatsapp.deleteSession(sessionName);
    await query("UPDATE sessions SET status = 'offline' WHERE session_name = $1", [sessionName]);


    console.log(`[${sessionName}] Pairing cancelled successfully.`);
    return c.json({ success: true, message: "Pairing cancelled." });
  }

  throw new HTTPException(404, { message: "No active pairing process found for this session." });
};

export const deleteSession = async (c: Context) => {
  const sessionName = c.req.param("name");
  const user = c.var.user;

  if (!user || !user.id) {
    throw new HTTPException(403, { message: "Forbidden: Not authenticated." });
  }

  try {
    // 1. Get session id and check ownership
    const sessionResult = await query(
      "SELECT id, user_id FROM sessions WHERE session_name = $1",
      [sessionName]
    );

    if (sessionResult.rows.length === 0) {
      throw new HTTPException(404, { message: "Session not found." });
    }

    if (sessionResult.rows[0].user_id !== user.id && user.role !== "admin") {
      throw new HTTPException(403, { message: "Forbidden: You do not own this session." });
    }

    const sessionId = sessionResult.rows[0].id;
    // 2. Delete associated webhooks from the DATABASE
    await query("DELETE FROM webhooks WHERE session_id = $1", [sessionId]);

    // 3. Delete from the library
    await whatsapp.deleteSession(sessionName);
    // 4. Delete from the DATABASE
    await query("DELETE FROM sessions WHERE session_name = $1", [sessionName]);
    return c.json({ success: true, message: "Session deleted successfully" });
  } catch (error) {
    console.error(`Error deleting session ${sessionName}:`, error);
    throw new HTTPException(500, { message: "Failed to delete session" });
  }
};


