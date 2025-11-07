import bcrypt from "bcrypt";
import { HTTPException } from "hono/http-exception";
import jwt from "jsonwebtoken";
import { env } from "../env.js";
import {
  UserRow,
  findUserByUsernameOrEmail,
} from "../repositories/user.repository.js";

export type AuthenticatedUser = {
  id: number;
  username: string;
  email: string;
  role: string;
  createdAt: string;
};

export type AuthResult = {
  token: string;
  user: AuthenticatedUser;
};

const mapUser = (record: UserRow): AuthenticatedUser => ({
  id: record.id,
  username: record.username,
  email: record.email,
  role: record.role,
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
  identifier: string,
  password: string
): Promise<AuthResult> => {
  const record = await findUserByUsernameOrEmail(identifier);

  if (!record) {
    throw new HTTPException(401, {
      message: "Invalid username or password",
    });
  }

  const isPasswordValid = await bcrypt.compare(password, record.password_hash);

  if (!isPasswordValid) {
    throw new HTTPException(401, {
      message: "Invalid username or password",
    });
  }

  const user = mapUser(record);

  const token = jwt.sign(
    {
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role,
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

