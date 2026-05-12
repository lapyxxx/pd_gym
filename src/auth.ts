import crypto from "node:crypto";
import { config } from "./config.js";

type TelegramUser = {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
};

type SessionPayload = {
  kind: "session";
  userId: number;
  username: string;
  exp: number;
};

type DesktopPayload = {
  kind: "desktop";
  userId: number;
  deviceId: string;
  sessionId: string;
  exp: number;
};

type SignedPayload = SessionPayload | DesktopPayload;

function signPayload(payload: SignedPayload): string {
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = crypto.createHmac("sha256", config.sessionSecret).update(encodedPayload).digest("base64url");
  return `${encodedPayload}.${signature}`;
}

function verifySignedPayload(token: string): SignedPayload {
  const [payloadEncoded, signature] = token.split(".");
  if (!payloadEncoded || !signature) {
    throw new Error("Invalid session token.");
  }

  const expectedSignature = crypto
    .createHmac("sha256", config.sessionSecret)
    .update(payloadEncoded)
    .digest("base64url");
  if (expectedSignature !== signature) {
    throw new Error("Invalid session signature.");
  }

  const payload = JSON.parse(Buffer.from(payloadEncoded, "base64url").toString("utf8")) as SignedPayload;
  if (payload.exp < Math.floor(Date.now() / 1000)) {
    throw new Error("Session token expired.");
  }

  if (!config.allowedUserIds.has(payload.userId)) {
    throw new Error("Session user is not allowed.");
  }

  return payload;
}

export function verifyTelegramInitData(initData: string): TelegramUser {
  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash) {
    throw new Error("Missing Telegram hash.");
  }

  params.delete("hash");
  const dataCheckString = [...params.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");

  const secret = crypto.createHmac("sha256", "WebAppData").update(config.telegramBotToken).digest();
  const computedHash = crypto.createHmac("sha256", secret).update(dataCheckString).digest("hex");
  if (computedHash !== hash) {
    throw new Error("Invalid Telegram signature.");
  }

  const authDate = Number(params.get("auth_date") ?? "0");
  if (!authDate || Date.now() / 1000 - authDate > 86400) {
    throw new Error("Telegram auth data is too old.");
  }

  const rawUser = params.get("user");
  if (!rawUser) {
    throw new Error("Missing Telegram user payload.");
  }

  const user = JSON.parse(rawUser) as TelegramUser;
  if (!config.allowedUserIds.has(user.id)) {
    throw new Error("Telegram user is not allowed.");
  }

  return user;
}

export function issueSessionToken(user: TelegramUser): string {
  return signPayload({
    kind: "session",
    userId: user.id,
    username: user.username ?? "",
    exp: Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60,
  });
}

export function verifySessionToken(token: string): { userId: number; username: string } {
  const payload = verifySignedPayload(token);
  if (payload.kind !== "session") {
    throw new Error("Expected user session token.");
  }

  return { userId: payload.userId, username: payload.username };
}

export function issueDesktopSyncToken(input: { userId: number; deviceId: string; sessionId: string }): string {
  return signPayload({
    kind: "desktop",
    userId: input.userId,
    deviceId: input.deviceId,
    sessionId: input.sessionId,
    exp: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60,
  });
}

export function verifyDesktopSyncToken(token: string): { userId: number; deviceId: string; sessionId: string } {
  const payload = verifySignedPayload(token);
  if (payload.kind !== "desktop") {
    throw new Error("Expected desktop sync token.");
  }

  return {
    userId: payload.userId,
    deviceId: payload.deviceId,
    sessionId: payload.sessionId,
  };
}
