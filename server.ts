import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import Fastify from "fastify";
import multipart from "@fastify/multipart";
import fastifyStatic from "@fastify/static";
import { config, loadProjects } from "./config.js";
import { issueDesktopSyncToken, issueSessionToken, verifyDesktopSyncToken, verifySessionToken, verifyTelegramInitData } from "./auth.js";
import { buildThreadTitle, createTask, createThread, getThread, insertMessage, listMessages, listThreads } from "./db.js";
import {
  applySyncPush,
  buildSyncBootstrap,
  completeDeviceCommands,
  completeDesktopAuthRequest,
  createDesktopAuthRequest,
  createDeviceSession,
  enqueueDeviceCommand,
  getDesktopAuthRequest,
  getThreadLease,
  handoffThreadToServer,
  listDevicesForUser,
  listThreadChangesSince,
  pollDeviceCommands,
  upsertDevice,
  verifyDeviceSession,
} from "./sync-store.js";
import { startTaskRunner } from "./task-runner.js";
import { handleTelegramWebhook } from "./telegram.js";

const app = Fastify({
  logger: true,
  bodyLimit: 20 * 1024 * 1024,
});

await app.register(multipart);
await app.register(fastifyStatic, {
  root: config.publicDir,
  prefix: "/",
  wildcard: false,
});

function readBearer(request: { headers: Record<string, unknown> }): string {
  const header = String(request.headers.authorization ?? "");
  if (!header.startsWith("Bearer ")) {
    throw new Error("Missing bearer token.");
  }
  return header.slice("Bearer ".length);
}

function requireUserAuth(request: { headers: Record<string, unknown> }): { userId: number; username: string } {
  return verifySessionToken(readBearer(request));
}

function requireDesktopAuth(request: { headers: Record<string, unknown> }): { userId: number; deviceId: string; sessionId: string } {
  const token = readBearer(request);
  const payload = verifyDesktopSyncToken(token);
  verifyDeviceSession(payload.sessionId, token);
  return payload;
}

function requireAnyAuth(request: { headers: Record<string, unknown> }): { userId: number } {
  const token = readBearer(request);
  try {
    return verifySessionToken(token);
  } catch {
    const desktop = verifyDesktopSyncToken(token);
    verifyDeviceSession(desktop.sessionId, token);
    return { userId: desktop.userId };
  }
}

function threadToDto(threadId: string) {
  const thread = getThread(threadId);
  if (!thread) {
    return null;
  }

  const project = loadProjects().find((entry) => entry.id === thread.project_id);
  const lease = getThreadLease(thread.id) ?? null;
  return {
    id: thread.id,
    projectId: thread.project_id,
    title: thread.title,
    chatTitle: thread.title,
    sourceType: thread.source_type,
    sourcePath: thread.source_path,
    isReadOnly: Boolean(thread.is_readonly),
    metadata: thread.metadata_json ? JSON.parse(thread.metadata_json) : null,
    lease,
    defaultModel: project?.defaultModel ?? "gpt-5.4",
    defaultPower: project?.defaultPower ?? "high",
  };
}

app.get("/api/health", async () => ({
  ok: true,
  projects: loadProjects().length,
}));

app.post("/api/auth/telegram", async (request, reply) => {
  const body = (request.body ?? {}) as { initData?: string };
  if (!body.initData) {
    return reply.code(400).send({ error: "Missing initData." });
  }

  try {
    const user = verifyTelegramInitData(body.initData);
    return { token: issueSessionToken(user), user };
  } catch (error) {
    return reply.code(401).send({ error: error instanceof Error ? error.message : "Auth failed." });
  }
});

app.post("/api/auth/desktop/start", async (request, reply) => {
  const body = (request.body ?? {}) as { deviceId?: string; deviceName?: string };
  if (!body.deviceId || !body.deviceName) {
    return reply.code(400).send({ error: "deviceId and deviceName are required." });
  }

  const authRequest = createDesktopAuthRequest({
    deviceId: body.deviceId,
    deviceName: body.deviceName,
  });

  return {
    status: authRequest.status,
    authRequestId: authRequest.id,
    deviceId: authRequest.device_id,
    telegramLink: `https://t.me/${config.telegramBotUsername}?start=desktop_${authRequest.id}`,
  };
});

app.post("/api/auth/desktop/complete", async (request, reply) => {
  const body = (request.body ?? {}) as { authRequestId?: string };
  if (!body.authRequestId) {
    return reply.code(400).send({ error: "authRequestId is required." });
  }

  const authRequest = getDesktopAuthRequest(body.authRequestId);
  if (!authRequest) {
    return reply.code(404).send({ error: "Desktop auth request not found." });
  }

  if (authRequest.status === "pending") {
    return { status: "pending" };
  }

  if (!authRequest.user_id) {
    return reply.code(409).send({ error: "Desktop auth request is missing user binding." });
  }

  const sessionId = crypto.randomUUID();

  const token = issueDesktopSyncToken({
    userId: authRequest.user_id,
    deviceId: authRequest.device_id,
    sessionId,
  });

  createDeviceSession({
    sessionId,
    deviceId: authRequest.device_id,
    userId: authRequest.user_id,
    token,
  });
  completeDesktopAuthRequest(authRequest.id);

  const device = upsertDevice({
    id: authRequest.device_id,
    userId: authRequest.user_id,
    name: authRequest.device_name,
    platform: "windows",
  });

  return {
    status: "approved",
    token,
    device: {
      id: device.id,
      name: device.name,
    },
  };
});

app.get("/api/projects", async (request, reply) => {
  try {
    requireUserAuth(request);
    return listThreads().map((thread) => threadToDto(thread.id));
  } catch (error) {
    return reply.code(401).send({ error: error instanceof Error ? error.message : "Unauthorized." });
  }
});

app.post("/api/threads", async (request, reply) => {
  try {
    requireUserAuth(request);
    const body = (request.body ?? {}) as { projectId?: string; title?: string };
    const projects = loadProjects();
    const projectId = body.projectId ?? projects[0]?.id;
    if (!projectId) {
      return reply.code(400).send({ error: "No project configured." });
    }

    const project = projects.find((entry) => entry.id === projectId);
    if (!project) {
      return reply.code(404).send({ error: "Project not found." });
    }

    const thread = createThread({
      projectId,
      title: buildThreadTitle(body.title ?? ""),
      sourceType: "server",
      isReadonly: false,
    });

    return threadToDto(thread.id);
  } catch (error) {
    return reply.code(401).send({ error: error instanceof Error ? error.message : "Unauthorized." });
  }
});

app.get("/api/projects/:projectId/messages", async (request, reply) => {
  try {
    requireUserAuth(request);
    const { projectId } = request.params as { projectId: string };
    const thread = getThread(projectId);
    if (!thread) {
      return reply.code(404).send({ error: "Chat not found." });
    }
    return { messages: listMessages(projectId, 100) };
  } catch (error) {
    return reply.code(401).send({ error: error instanceof Error ? error.message : "Unauthorized." });
  }
});

app.post("/api/projects/:projectId/messages", async (request, reply) => {
  try {
    const session = requireUserAuth(request);
    const { projectId } = request.params as { projectId: string };
    const thread = getThread(projectId);
    if (!thread) {
      return reply.code(404).send({ error: "Chat not found." });
    }
    if (thread.is_readonly) {
      return reply.code(409).send({ error: "Этот чат импортирован с ноутбука только для чтения. Для серверной работы его нужно мигрировать в отдельный рабочий чат." });
    }

    const metadata = thread.metadata_json ? JSON.parse(thread.metadata_json) as Record<string, unknown> : {};
    const lease = getThreadLease(thread.id);
    if (thread.source_type === "local_codex") {
      if (!metadata.canContinueOnServer && lease?.lease_owner !== "server") {
        return reply.code(409).send({ error: "Для этого ноутбучного чата серверный workspace пока не настроен." });
      }
      if (lease?.lease_owner !== "server") {
        return reply.code(409).send({ error: "Сначала нажми Continue on server, затем отправляй новое сообщение." });
      }
    }

    const project = loadProjects().find((entry) => entry.id === thread.project_id);
    if (!project) {
      return reply.code(404).send({ error: "Project not found." });
    }

    const parts = request.parts();
    let text = "";
    let model = project.defaultModel ?? "gpt-5.4";
    let power = project.defaultPower ?? "high";
    let mode = "chat";
    const attachments: { originalName: string; storedPath: string; mimeType: string; size: number }[] = [];

    for await (const part of parts) {
      if (part.type === "file") {
        const uploadDir = path.join(config.uploadsDir, projectId);
        fs.mkdirSync(uploadDir, { recursive: true });
        const storedPath = path.join(uploadDir, `${Date.now()}-${part.filename}`);
        const writeStream = fs.createWriteStream(storedPath);
        let size = 0;

        for await (const chunk of part.file) {
          size += chunk.length;
          writeStream.write(chunk);
        }
        writeStream.end();

        attachments.push({
          originalName: part.filename,
          storedPath,
          mimeType: part.mimetype,
          size,
        });
        continue;
      }

      const value = String(part.value ?? "");
      if (part.fieldname === "text") {
        text = value;
      } else if (part.fieldname === "model" && value) {
        model = value;
      } else if (part.fieldname === "power" && value) {
        power = value;
      } else if (part.fieldname === "mode" && value) {
        mode = value;
      }
    }

    if (!text.trim() && attachments.length === 0) {
      return reply.code(400).send({ error: "Message is empty." });
    }

    const storedText = text.trim() || "User sent attachments without additional text.";
    insertMessage(thread.id, "user", storedText, { model, power, mode, attachments });
    const taskId = createTask({
      threadId: thread.id,
      userId: session.userId,
      mode,
      model,
      power,
      prompt: storedText,
      attachments,
    });

    return { ok: true, taskId };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Request failed.";
    return reply.code(401).send({ error: message });
  }
});

app.get("/api/sync/bootstrap", async (request, reply) => {
  try {
    const session = requireDesktopAuth(request);
    return buildSyncBootstrap(session.deviceId);
  } catch (error) {
    return reply.code(401).send({ error: error instanceof Error ? error.message : "Unauthorized." });
  }
});

app.post("/api/sync/push", async (request, reply) => {
  try {
    const session = requireDesktopAuth(request);
    const body = (request.body ?? {}) as {
      deviceName?: string;
      lastSeenAt?: string | null;
      threads?: Array<{
        id: string;
        projectId: string;
        title: string;
        sourceId?: string | null;
        sourcePath?: string | null;
        updatedAt: string;
        activeOnLaptop: boolean;
        messageCursor: number;
        messages: Array<{
          role: "user" | "assistant" | "system";
          content: string;
          createdAt?: string | null;
          metadata?: unknown;
        }>;
        snapshot?: unknown;
      }>;
    };

    upsertDevice({
      id: session.deviceId,
      userId: session.userId,
      name: body.deviceName ?? session.deviceId,
      platform: "windows",
      lastSeenAt: body.lastSeenAt ?? new Date().toISOString(),
    });

    const result = applySyncPush(session.deviceId, {
      lastSeenAt: body.lastSeenAt,
      threads: body.threads ?? [],
    });

    return {
      ok: true,
      uploadedThreads: result.uploadedThreads,
      uploadedMessages: result.uploadedMessages,
      revision: new Date().toISOString(),
    };
  } catch (error) {
    return reply.code(401).send({ error: error instanceof Error ? error.message : "Unauthorized." });
  }
});

app.post("/api/sync/pull", async (request, reply) => {
  try {
    requireDesktopAuth(request);
    const body = (request.body ?? {}) as { since?: string | null };
    return listThreadChangesSince(body.since ?? null);
  } catch (error) {
    return reply.code(401).send({ error: error instanceof Error ? error.message : "Unauthorized." });
  }
});

app.post("/api/sync/commands/poll", async (request, reply) => {
  try {
    const session = requireDesktopAuth(request);
    return {
      commands: pollDeviceCommands(session.deviceId),
    };
  } catch (error) {
    return reply.code(401).send({ error: error instanceof Error ? error.message : "Unauthorized." });
  }
});

app.post("/api/sync/commands/complete", async (request, reply) => {
  try {
    const session = requireDesktopAuth(request);
    const body = (request.body ?? {}) as { ids?: string[] };
    completeDeviceCommands(session.deviceId, body.ids ?? []);
    return { ok: true };
  } catch (error) {
    return reply.code(401).send({ error: error instanceof Error ? error.message : "Unauthorized." });
  }
});

app.post("/api/sync/request", async (request, reply) => {
  try {
    const session = requireAnyAuth(request);
    const body = (request.body ?? {}) as { threadId?: string };
    const targetDeviceIds = new Set<string>();

    if (body.threadId) {
      const thread = getThread(body.threadId);
      const metadata = thread?.metadata_json ? JSON.parse(thread.metadata_json) as Record<string, unknown> : null;
      const sourceDeviceId = metadata?.sourceDeviceId ? String(metadata.sourceDeviceId) : "";
      if (sourceDeviceId) {
        targetDeviceIds.add(sourceDeviceId);
      }
    }

    if (targetDeviceIds.size === 0) {
      for (const device of listDevicesForUser(session.userId)) {
        targetDeviceIds.add(device.id);
      }
    }

    if (targetDeviceIds.size === 0) {
      return reply.code(404).send({ error: "Активное laptop-устройство не найдено." });
    }

    const commands = [...targetDeviceIds].map((deviceId) => enqueueDeviceCommand(deviceId, "sync_now"));
    return {
      ok: true,
      queued: commands.length,
      deviceIds: [...targetDeviceIds],
    };
  } catch (error) {
    return reply.code(401).send({ error: error instanceof Error ? error.message : "Unauthorized." });
  }
});

app.post("/api/threads/:id/handoff", async (request, reply) => {
  try {
    requireAnyAuth(request);
    const { id } = request.params as { id: string };
    if (!getThread(id)) {
      return reply.code(404).send({ error: "Thread not found." });
    }
    return {
      ok: true,
      lease: handoffThreadToServer(id),
    };
  } catch (error) {
    return reply.code(401).send({ error: error instanceof Error ? error.message : "Unauthorized." });
  }
});

app.post("/telegram/webhook", async (request) => {
  await handleTelegramWebhook(request.body as never);
  return { ok: true };
});

app.get("/*", async (_request, reply) => {
  return reply.sendFile("index.html");
});

startTaskRunner();

app.listen({ host: "0.0.0.0", port: config.port }).then(() => {
  app.log.info(`Control plane listening on ${config.port}`);
});
