import crypto from "node:crypto";
import { loadProjects } from "./config.js";
import { db, getThread, insertMessage, listMessages, listThreads, replaceThreadMessages, upsertThread, type StoredMessage, type StoredThread } from "./db.js";

export type DesktopDevice = {
  id: string;
  user_id: number | null;
  name: string;
  platform: string;
  created_at: string;
  updated_at: string;
  last_seen_at: string | null;
};

export type DesktopAuthRequest = {
  id: string;
  device_id: string;
  device_name: string;
  status: string;
  user_id: number | null;
  created_at: string;
  approved_at: string | null;
  completed_at: string | null;
};

export type DeviceSession = {
  id: string;
  device_id: string;
  user_id: number;
  token_hash: string;
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
};

export type ThreadLease = {
  thread_id: string;
  lease_owner: string;
  status: string;
  updated_at: string;
};

export type ThreadSyncState = {
  thread_id: string;
  last_synced_by_device: string | null;
  last_message_cursor: number;
  updated_at: string;
  writeback_revision: number;
};

export type ThreadSnapshot = {
  thread_id: string;
  device_id: string;
  summary_json: string;
  message_cursor: number;
  created_at: string;
  updated_at: string;
};

export type DeviceCommand = {
  id: string;
  device_id: string;
  command_type: string;
  payload_json: string | null;
  status: string;
  created_at: string;
  claimed_at: string | null;
  completed_at: string | null;
};

export type SyncThreadPayload = {
  id: string;
  projectId: string;
  title: string;
  sourceId?: string | null;
  sourcePath?: string | null;
  updatedAt: string;
  activeOnLaptop: boolean;
  canContinueOnServer?: boolean;
  messageCursor: number;
  messages: {
    role: "user" | "assistant" | "system";
    content: string;
    createdAt?: string | null;
    metadata?: unknown;
  }[];
  snapshot?: unknown;
};

db.exec(`
  CREATE TABLE IF NOT EXISTS devices (
    id TEXT PRIMARY KEY,
    user_id INTEGER,
    name TEXT NOT NULL,
    platform TEXT NOT NULL DEFAULT 'windows',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_seen_at TEXT
  );

  CREATE TABLE IF NOT EXISTS desktop_auth_requests (
    id TEXT PRIMARY KEY,
    device_id TEXT NOT NULL,
    device_name TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    user_id INTEGER,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    approved_at TEXT,
    completed_at TEXT
  );

  CREATE TABLE IF NOT EXISTS device_sessions (
    id TEXT PRIMARY KEY,
    device_id TEXT NOT NULL,
    user_id INTEGER NOT NULL,
    token_hash TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_used_at TEXT,
    revoked_at TEXT
  );

  CREATE TABLE IF NOT EXISTS thread_sync_state (
    thread_id TEXT PRIMARY KEY,
    last_synced_by_device TEXT,
    last_message_cursor INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    writeback_revision INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS thread_snapshots (
    thread_id TEXT NOT NULL,
    device_id TEXT NOT NULL,
    summary_json TEXT NOT NULL,
    message_cursor INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (thread_id, device_id)
  );

  CREATE TABLE IF NOT EXISTS thread_leases (
    thread_id TEXT PRIMARY KEY,
    lease_owner TEXT NOT NULL DEFAULT 'idle',
    status TEXT NOT NULL DEFAULT 'idle',
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS device_commands (
    id TEXT PRIMARY KEY,
    device_id TEXT NOT NULL,
    command_type TEXT NOT NULL,
    payload_json TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    claimed_at TEXT,
    completed_at TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_devices_user_id ON devices(user_id);
  CREATE INDEX IF NOT EXISTS idx_device_sessions_device_id ON device_sessions(device_id);
  CREATE INDEX IF NOT EXISTS idx_desktop_auth_requests_device_id ON desktop_auth_requests(device_id);
  CREATE INDEX IF NOT EXISTS idx_device_commands_device_status ON device_commands(device_id, status, created_at);
`);

const upsertDeviceStmt = db.prepare(`
  INSERT INTO devices (id, user_id, name, platform, created_at, updated_at, last_seen_at)
  VALUES (@id, @user_id, @name, @platform, COALESCE(@created_at, CURRENT_TIMESTAMP), COALESCE(@updated_at, CURRENT_TIMESTAMP), @last_seen_at)
  ON CONFLICT(id) DO UPDATE SET
    user_id = COALESCE(excluded.user_id, devices.user_id),
    name = excluded.name,
    platform = excluded.platform,
    updated_at = excluded.updated_at,
    last_seen_at = excluded.last_seen_at
`);

const getDeviceStmt = db.prepare(`
  SELECT id, user_id, name, platform, created_at, updated_at, last_seen_at
  FROM devices
  WHERE id = ?
`);

const insertDesktopAuthRequestStmt = db.prepare(`
  INSERT INTO desktop_auth_requests (id, device_id, device_name, status)
  VALUES (@id, @device_id, @device_name, 'pending')
`);

const getDesktopAuthRequestStmt = db.prepare(`
  SELECT id, device_id, device_name, status, user_id, created_at, approved_at, completed_at
  FROM desktop_auth_requests
  WHERE id = ?
`);

const approveDesktopAuthRequestStmt = db.prepare(`
  UPDATE desktop_auth_requests
  SET status = 'approved',
      user_id = @user_id,
      approved_at = @approved_at
  WHERE id = @id
`);

const completeDesktopAuthRequestStmt = db.prepare(`
  UPDATE desktop_auth_requests
  SET status = 'completed',
      completed_at = @completed_at
  WHERE id = @id
`);

const insertDeviceSessionStmt = db.prepare(`
  INSERT INTO device_sessions (id, device_id, user_id, token_hash, created_at)
  VALUES (@id, @device_id, @user_id, @token_hash, @created_at)
`);

const getDeviceSessionStmt = db.prepare(`
  SELECT id, device_id, user_id, token_hash, created_at, last_used_at, revoked_at
  FROM device_sessions
  WHERE id = ?
`);

const touchDeviceSessionStmt = db.prepare(`
  UPDATE device_sessions
  SET last_used_at = @last_used_at
  WHERE id = @id
`);

const revokeDeviceSessionsStmt = db.prepare(`
  UPDATE device_sessions
  SET revoked_at = @revoked_at
  WHERE device_id = @device_id
    AND revoked_at IS NULL
`);

const listDevicesForUserStmt = db.prepare(`
  SELECT id, user_id, name, platform, created_at, updated_at, last_seen_at
  FROM devices
  WHERE user_id = ?
  ORDER BY COALESCE(last_seen_at, created_at) DESC, id DESC
`);

const getLeaseStmt = db.prepare(`
  SELECT thread_id, lease_owner, status, updated_at
  FROM thread_leases
  WHERE thread_id = ?
`);

const upsertLeaseStmt = db.prepare(`
  INSERT INTO thread_leases (thread_id, lease_owner, status, updated_at)
  VALUES (@thread_id, @lease_owner, @status, @updated_at)
  ON CONFLICT(thread_id) DO UPDATE SET
    lease_owner = excluded.lease_owner,
    status = excluded.status,
    updated_at = excluded.updated_at
`);

const getSyncStateStmt = db.prepare(`
  SELECT thread_id, last_synced_by_device, last_message_cursor, updated_at, writeback_revision
  FROM thread_sync_state
  WHERE thread_id = ?
`);

const upsertSyncStateStmt = db.prepare(`
  INSERT INTO thread_sync_state (thread_id, last_synced_by_device, last_message_cursor, updated_at, writeback_revision)
  VALUES (@thread_id, @last_synced_by_device, @last_message_cursor, @updated_at, @writeback_revision)
  ON CONFLICT(thread_id) DO UPDATE SET
    last_synced_by_device = excluded.last_synced_by_device,
    last_message_cursor = excluded.last_message_cursor,
    updated_at = excluded.updated_at,
    writeback_revision = excluded.writeback_revision
`);

const getSnapshotStmt = db.prepare(`
  SELECT thread_id, device_id, summary_json, message_cursor, created_at, updated_at
  FROM thread_snapshots
  WHERE thread_id = ? AND device_id = ?
`);

const upsertSnapshotStmt = db.prepare(`
  INSERT INTO thread_snapshots (thread_id, device_id, summary_json, message_cursor, created_at, updated_at)
  VALUES (@thread_id, @device_id, @summary_json, @message_cursor, COALESCE(@created_at, CURRENT_TIMESTAMP), @updated_at)
  ON CONFLICT(thread_id, device_id) DO UPDATE SET
    summary_json = excluded.summary_json,
    message_cursor = excluded.message_cursor,
    updated_at = excluded.updated_at
`);

const listSnapshotsForThreadStmt = db.prepare(`
  SELECT thread_id, device_id, summary_json, message_cursor, created_at, updated_at
  FROM thread_snapshots
  WHERE thread_id = ?
  ORDER BY datetime(updated_at) DESC
`);

const findPendingCommandStmt = db.prepare(`
  SELECT id, device_id, command_type, payload_json, status, created_at, claimed_at, completed_at
  FROM device_commands
  WHERE device_id = ?
    AND command_type = ?
    AND status IN ('pending', 'claimed')
  ORDER BY created_at DESC
  LIMIT 1
`);

const insertDeviceCommandStmt = db.prepare(`
  INSERT INTO device_commands (id, device_id, command_type, payload_json, status, created_at)
  VALUES (@id, @device_id, @command_type, @payload_json, @status, @created_at)
`);

const listPendingCommandsStmt = db.prepare(`
  SELECT id, device_id, command_type, payload_json, status, created_at, claimed_at, completed_at
  FROM device_commands
  WHERE device_id = ?
    AND status = 'pending'
  ORDER BY created_at ASC
`);

const markCommandClaimedStmt = db.prepare(`
  UPDATE device_commands
  SET status = 'claimed',
      claimed_at = @claimed_at
  WHERE id = @id
    AND device_id = @device_id
    AND status = 'pending'
`);

const markCommandCompletedStmt = db.prepare(`
  UPDATE device_commands
  SET status = 'completed',
      completed_at = @completed_at
  WHERE id = @id
    AND device_id = @device_id
    AND status IN ('pending', 'claimed')
`);

const maxMessageIdForThreadStmt = db.prepare(`
  SELECT COALESCE(MAX(id), 0) AS value
  FROM messages
  WHERE thread_id = ?
`);

function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function parseThreadMetadata(thread: StoredThread): Record<string, unknown> {
  if (!thread.metadata_json) {
    return {};
  }

  try {
    const parsed = JSON.parse(thread.metadata_json);
    return typeof parsed === "object" && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}

function getMessageCursor(threadId: string): number {
  const row = maxMessageIdForThreadStmt.get(threadId) as { value: number };
  return Number(row?.value ?? 0);
}

export function upsertDevice(input: {
  id: string;
  userId?: number | null;
  name: string;
  platform?: string;
  lastSeenAt?: string | null;
}): DesktopDevice {
  const now = new Date().toISOString();
  upsertDeviceStmt.run({
    id: input.id,
    user_id: input.userId ?? null,
    name: input.name,
    platform: input.platform ?? "windows",
    created_at: now,
    updated_at: now,
    last_seen_at: input.lastSeenAt ?? now,
  });
  return getDevice(input.id) as DesktopDevice;
}

export function getDevice(deviceId: string): DesktopDevice | undefined {
  return getDeviceStmt.get(deviceId) as DesktopDevice | undefined;
}

export function listDevicesForUser(userId: number): DesktopDevice[] {
  return listDevicesForUserStmt.all(userId) as DesktopDevice[];
}

export function createDesktopAuthRequest(input: { deviceId: string; deviceName: string }): DesktopAuthRequest {
  const authRequestId = crypto.randomUUID();
  upsertDevice({
    id: input.deviceId,
    name: input.deviceName,
    platform: "windows",
  });
  insertDesktopAuthRequestStmt.run({
    id: authRequestId,
    device_id: input.deviceId,
    device_name: input.deviceName,
  });
  return getDesktopAuthRequest(authRequestId) as DesktopAuthRequest;
}

export function getDesktopAuthRequest(authRequestId: string): DesktopAuthRequest | undefined {
  return getDesktopAuthRequestStmt.get(authRequestId) as DesktopAuthRequest | undefined;
}

export function approveDesktopAuthRequest(authRequestId: string, userId: number): DesktopAuthRequest | undefined {
  const request = getDesktopAuthRequest(authRequestId);
  if (!request) {
    return undefined;
  }

  const now = new Date().toISOString();
  approveDesktopAuthRequestStmt.run({
    id: authRequestId,
    user_id: userId,
    approved_at: now,
  });

  const device = getDevice(request.device_id);
  if (device) {
    upsertDevice({
      id: device.id,
      userId,
      name: device.name,
      platform: device.platform,
      lastSeenAt: device.last_seen_at,
    });
  }

  return getDesktopAuthRequest(authRequestId);
}

export function createDeviceSession(input: {
  sessionId?: string;
  deviceId: string;
  userId: number;
  token: string;
}): DeviceSession {
  const now = new Date().toISOString();
  revokeDeviceSessionsStmt.run({
    device_id: input.deviceId,
    revoked_at: now,
  });

  const sessionId = input.sessionId ?? crypto.randomUUID();
  insertDeviceSessionStmt.run({
    id: sessionId,
    device_id: input.deviceId,
    user_id: input.userId,
    token_hash: hashToken(input.token),
    created_at: now,
  });

  return getDeviceSession(sessionId) as DeviceSession;
}

export function getDeviceSession(sessionId: string): DeviceSession | undefined {
  return getDeviceSessionStmt.get(sessionId) as DeviceSession | undefined;
}

export function verifyDeviceSession(sessionId: string, token: string): DeviceSession {
  const session = getDeviceSession(sessionId);
  if (!session || session.revoked_at) {
    throw new Error("Desktop session is invalid.");
  }

  if (session.token_hash !== hashToken(token)) {
    throw new Error("Desktop session signature mismatch.");
  }

  touchDeviceSessionStmt.run({
    id: session.id,
    last_used_at: new Date().toISOString(),
  });
  return session;
}

export function completeDesktopAuthRequest(authRequestId: string): void {
  completeDesktopAuthRequestStmt.run({
    id: authRequestId,
    completed_at: new Date().toISOString(),
  });
}

export function upsertThreadSnapshot(input: {
  threadId: string;
  deviceId: string;
  summary: unknown;
  messageCursor: number;
  updatedAt?: string;
}): ThreadSnapshot {
  const now = input.updatedAt ?? new Date().toISOString();
  upsertSnapshotStmt.run({
    thread_id: input.threadId,
    device_id: input.deviceId,
    summary_json: JSON.stringify(input.summary ?? {}),
    message_cursor: input.messageCursor,
    created_at: now,
    updated_at: now,
  });
  return getSnapshotStmt.get(input.threadId, input.deviceId) as ThreadSnapshot;
}

export function setThreadLease(threadId: string, leaseOwner: string, status: string): ThreadLease {
  const now = new Date().toISOString();
  upsertLeaseStmt.run({
    thread_id: threadId,
    lease_owner: leaseOwner,
    status,
    updated_at: now,
  });
  return getThreadLease(threadId) as ThreadLease;
}

export function getThreadLease(threadId: string): ThreadLease | undefined {
  return getLeaseStmt.get(threadId) as ThreadLease | undefined;
}

export function handoffThreadToServer(threadId: string): ThreadLease {
  const thread = getThread(threadId);
  if (thread) {
    const metadata = parseThreadMetadata(thread);
    upsertThread({
      id: thread.id,
      projectId: thread.project_id,
      title: thread.title,
      sourceType: thread.source_type,
      sourceId: thread.source_id,
      sourcePath: thread.source_path,
      isReadonly: Boolean(thread.is_readonly),
      metadata: {
        ...metadata,
        activeOnLaptop: false,
        activeOnServer: true,
      },
      createdAt: thread.created_at,
      updatedAt: new Date().toISOString(),
    });
  }

  return setThreadLease(threadId, "server", "server_active");
}

export function getThreadSyncState(threadId: string): ThreadSyncState | undefined {
  return getSyncStateStmt.get(threadId) as ThreadSyncState | undefined;
}

function updateThreadSyncState(input: {
  threadId: string;
  lastSyncedByDevice: string | null;
  lastMessageCursor: number;
  updatedAt: string;
  writebackRevision: number;
}): ThreadSyncState {
  upsertSyncStateStmt.run({
    thread_id: input.threadId,
    last_synced_by_device: input.lastSyncedByDevice,
    last_message_cursor: input.lastMessageCursor,
    updated_at: input.updatedAt,
    writeback_revision: input.writebackRevision,
  });
  return getThreadSyncState(input.threadId) as ThreadSyncState;
}

function buildIncomingSummary(messages: SyncThreadPayload["messages"]): string {
  const interesting = messages.slice(-6).map((message) => `${message.role}: ${message.content}`).join("\n\n");
  return interesting.length > 2000 ? `${interesting.slice(0, 1997)}...` : interesting;
}

export function applySyncPush(deviceId: string, input: {
  lastSeenAt?: string | null;
  threads: SyncThreadPayload[];
}): { uploadedThreads: number; uploadedMessages: number } {
  let uploadedThreads = 0;
  let uploadedMessages = 0;
  const now = new Date().toISOString();

  for (const threadPayload of input.threads) {
    const existingThread = getThread(threadPayload.id);
    const existingState = existingThread ? getThreadSyncState(existingThread.id) : undefined;
    const existingLease = existingThread ? getThreadLease(existingThread.id) : undefined;
    const existingUpdatedAt = existingThread?.updated_at ?? "";
    const existingCursor = existingState?.last_message_cursor ?? getMessageCursor(threadPayload.id);
    const incomingUpdatedAt = threadPayload.updatedAt || now;
    const shouldApply =
      !existingThread ||
      incomingUpdatedAt > existingUpdatedAt ||
      (incomingUpdatedAt === existingUpdatedAt && threadPayload.messageCursor >= existingCursor);

    if (!shouldApply) {
      continue;
    }

    const previousMetadata = existingThread ? parseThreadMetadata(existingThread) : {};
    const nextMetadata = {
      ...previousMetadata,
      activeOnLaptop: threadPayload.activeOnLaptop,
      activeOnServer: existingLease?.lease_owner === "server",
      canContinueOnServer: Boolean(threadPayload.canContinueOnServer),
      lastSyncedByDevice: deviceId,
      sourceDeviceId: deviceId,
      mappedProjectId: threadPayload.projectId,
      writebackRevision: (existingState?.writeback_revision ?? 0) + 1,
    };

    upsertThread({
      id: threadPayload.id,
      projectId: threadPayload.projectId,
      title: threadPayload.title,
      sourceType: "local_codex",
      sourceId: threadPayload.sourceId ?? threadPayload.id,
      sourcePath: threadPayload.sourcePath ?? null,
      isReadonly: false,
      metadata: nextMetadata,
      updatedAt: incomingUpdatedAt,
    });

    replaceThreadMessages(threadPayload.id, threadPayload.messages);
    upsertThread({
      id: threadPayload.id,
      projectId: threadPayload.projectId,
      title: threadPayload.title,
      sourceType: "local_codex",
      sourceId: threadPayload.sourceId ?? threadPayload.id,
      sourcePath: threadPayload.sourcePath ?? null,
      isReadonly: false,
      metadata: nextMetadata,
      updatedAt: incomingUpdatedAt,
    });
    uploadedThreads += 1;
    uploadedMessages += threadPayload.messages.length;

    updateThreadSyncState({
      threadId: threadPayload.id,
      lastSyncedByDevice: deviceId,
      lastMessageCursor: threadPayload.messageCursor,
      updatedAt: incomingUpdatedAt,
      writebackRevision: (existingState?.writeback_revision ?? 0) + 1,
    });

    upsertThreadSnapshot({
      threadId: threadPayload.id,
      deviceId,
      summary: threadPayload.snapshot ?? {
        summary: buildIncomingSummary(threadPayload.messages),
        sourcePath: threadPayload.sourcePath ?? null,
      },
      messageCursor: threadPayload.messageCursor,
      updatedAt: incomingUpdatedAt,
    });

    if (existingLease?.lease_owner !== "server") {
      const leaseOwner = threadPayload.activeOnLaptop ? `local:${deviceId}` : "idle";
      const leaseStatus = threadPayload.activeOnLaptop ? "local_active" : "idle";
      setThreadLease(threadPayload.id, leaseOwner, leaseStatus);
    }
  }

  const device = getDevice(deviceId);
  if (device) {
    upsertDevice({
      id: device.id,
      userId: device.user_id ?? undefined,
      name: device.name,
      platform: device.platform,
      lastSeenAt: input.lastSeenAt ?? now,
    });
  }

  return { uploadedThreads, uploadedMessages };
}

function serializeMessages(messages: StoredMessage[]) {
  return messages.map((message) => ({
    id: message.id,
    role: message.role,
    content: message.content,
    createdAt: message.created_at,
    metadata: message.metadata_json ? JSON.parse(message.metadata_json) : null,
  }));
}

export function listThreadChangesSince(since: string | null): {
  revision: string;
  threads: Array<{
    id: string;
    projectId: string;
    title: string;
    sourceType: string;
    sourcePath: string | null;
    updatedAt: string;
    metadata: Record<string, unknown>;
    lease: ThreadLease;
    syncState: ThreadSyncState;
    snapshots: Array<{
      deviceId: string;
      summary: unknown;
      messageCursor: number;
      updatedAt: string;
    }>;
    messages: Array<{
      id: number;
      role: "user" | "assistant" | "system";
      content: string;
      createdAt: string;
      metadata: unknown;
    }>;
  }>;
} {
  const threads = listThreads()
    .filter((thread) => !since || thread.updated_at > since)
    .map((thread) => {
      const metadata = parseThreadMetadata(thread);
      const lease = getThreadLease(thread.id) ?? setThreadLease(thread.id, "idle", "idle");
      const syncState = getThreadSyncState(thread.id) ?? updateThreadSyncState({
        threadId: thread.id,
        lastSyncedByDevice: null,
        lastMessageCursor: getMessageCursor(thread.id),
        updatedAt: thread.updated_at,
        writebackRevision: Number(metadata.writebackRevision ?? 0),
      });
      const snapshots = (listSnapshotsForThreadStmt.all(thread.id) as ThreadSnapshot[]).map((snapshot) => ({
        deviceId: snapshot.device_id,
        summary: JSON.parse(snapshot.summary_json),
        messageCursor: snapshot.message_cursor,
        updatedAt: snapshot.updated_at,
      }));
      return {
        id: thread.id,
        projectId: thread.project_id,
        title: thread.title,
        sourceType: thread.source_type,
        sourcePath: thread.source_path,
        updatedAt: thread.updated_at,
        metadata,
        lease,
        syncState,
        snapshots,
        messages: serializeMessages(listMessages(thread.id, 200)),
      };
    });

  return {
    revision: new Date().toISOString(),
    threads,
  };
}

export function buildSyncBootstrap(deviceId: string): {
  device: DesktopDevice | undefined;
  revision: string;
  projects: Array<{
    id: string;
    title: string;
    workspaceDir: string;
    clientPaths?: string[];
  }>;
  threads: ReturnType<typeof listThreadChangesSince>["threads"];
} {
  return {
    device: getDevice(deviceId),
    revision: new Date().toISOString(),
    projects: loadProjects().map((project) => ({
      id: project.id,
      title: project.title,
      workspaceDir: project.workspaceDir,
      clientPaths: project.clientPaths,
    })),
    threads: listThreadChangesSince(null).threads,
  };
}

export function enqueueDeviceCommand(deviceId: string, commandType: string, payload?: unknown): DeviceCommand {
  const existing = findPendingCommandStmt.get(deviceId, commandType) as DeviceCommand | undefined;
  if (existing) {
    return existing;
  }

  const command: DeviceCommand = {
    id: crypto.randomUUID(),
    device_id: deviceId,
    command_type: commandType,
    payload_json: payload ? JSON.stringify(payload) : null,
    status: "pending",
    created_at: new Date().toISOString(),
    claimed_at: null,
    completed_at: null,
  };
  insertDeviceCommandStmt.run(command);
  return command;
}

export function pollDeviceCommands(deviceId: string): Array<DeviceCommand & { payload: unknown | null }> {
  const commands = listPendingCommandsStmt.all(deviceId) as DeviceCommand[];
  const claimedAt = new Date().toISOString();
  for (const command of commands) {
    markCommandClaimedStmt.run({
      id: command.id,
      device_id: deviceId,
      claimed_at: claimedAt,
    });
  }

  return commands.map((command) => ({
    ...command,
    status: "claimed",
    claimed_at: claimedAt,
    payload: command.payload_json ? JSON.parse(command.payload_json) : null,
  }));
}

export function completeDeviceCommands(deviceId: string, commandIds: string[]): void {
  const completedAt = new Date().toISOString();
  for (const commandId of commandIds) {
    markCommandCompletedStmt.run({
      id: commandId,
      device_id: deviceId,
      completed_at: completedAt,
    });
  }
}
