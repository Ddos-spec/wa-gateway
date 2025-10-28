import bcrypt from "bcrypt";
import { HTTPException } from "hono/http-exception";
import jwt from "jsonwebtoken";
import { env } from "../env.js";
import {
  ConfigRow,
  findConfigByUsername,
} from "../repositories/config.repository.js";

export type AuthenticatedUser = {
  id: number;
  username: string;
  createdAt: string;
};

export type AuthResult = {
  token: string;
  user: AuthenticatedUser;
};

const mapUser = (record: ConfigRow): AuthenticatedUser => ({
  id: record.id,
  username: record.username,
  createdAt: (() => {
    const dateValue =
      record.created_at instanceof Date
        ? record.created_at
        : new Date(record.created_at);

    return Number.isNaN(dateValue.getTime())
      ? String(record.created_at)
      : dateValue.toISOString();
  })(),
});

export const authenticateUser = async (
  username: string,
  password: string
): Promise<AuthResult> => {
  const record = await findConfigByUsername(username);

  if (!record) {
    throw new HTTPException(401, {
      message: "Invalid username or password",
    });
  }

  const isPasswordValid = await bcrypt.compare(password, record.password);

  if (!isPasswordValid) {
    throw new HTTPException(401, {
      message: "Invalid username or password",
    });
  }

  const user = mapUser(record);

  const token = jwt.sign(
    {
      username: user.username,
    },
    env.JWT_SECRET,
    {
      expiresIn: env.JWT_EXPIRES_IN,
      subject: String(user.id),
    }
  );

  return {
    token,
    user,
  };
};
