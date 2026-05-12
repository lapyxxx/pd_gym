import Database from "better-sqlite3";
import crypto from "node:crypto";
import { config, loadProjects } from "./config.js";

export type StoredThread = {
  id: string;
  project_id: string;
  title: string;
  source_type: string;
  source_id: string | null;
  source_path: string | null;
  is_readonly: number;
  metadata_json: string | null;
  created_at: string;
  updated_at: string;
};

export type StoredMessage = {
  id: number;
  thread_id: string;
  project_id: string;
  role: "user" | "assistant" | "system";
  content: string;
  created_at: string;
  metadata_json: string | null;
};

export type StoredTask = {
  id: number;
  thread_id: string;
  project_id: string;
  user_id: number;
  mode: string;
  model: string;
  power: string;
  prompt: string;
  attachments_json: string | null;
  status: string;
  error_text: string | null;
  result_text: string | null;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
};

export const db = new Database(config.dbPath);
db.pragma("journal_mode = WAL");

db.exec(`
  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id TEXT NOT NULL,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    metadata_json TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id TEXT NOT NULL,
    user_id INTEGER NOT NULL,
    mode TEXT NOT NULL,
    model TEXT NOT NULL,
    power TEXT NOT NULL,
    prompt TEXT NOT NULL,
    attachments_json TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    error_text TEXT,
    result_text TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    started_at TEXT,
    finished_at TEXT
  );

  CREATE TABLE IF NOT EXISTS threads (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    title TEXT NOT NULL,
    source_type TEXT NOT NULL DEFAULT 'server',
    source_id TEXT,
    source_path TEXT,
    is_readonly INTEGER NOT NULL DEFAULT 0,
    metadata_json TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
`);

function ensureColumn(tableName: string, columnName: string, definition: string): void {
  const columns = db.prepare(`PRAGMA table_info(${tableName})`).all() as { name: string }[];
  if (columns.some((column) => column.name === columnName)) {
    return;
  }

  db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
}

ensureColumn("messages", "thread_id", "TEXT");
ensureColumn("tasks", "thread_id", "TEXT");

db.exec(`
  CREATE INDEX IF NOT EXISTS idx_messages_thread_id ON messages(thread_id);
  CREATE INDEX IF NOT EXISTS idx_tasks_thread_id ON tasks(thread_id);
  CREATE INDEX IF NOT EXISTS idx_threads_updated_at ON threads(updated_at DESC);
`);

const insertThreadStmt = db.prepare(`
  INSERT INTO threads (id, project_id, title, source_type, source_id, source_path, is_readonly, metadata_json, created_at, updated_at)
  VALUES (@id, @project_id, @title, @source_type, @source_id, @source_path, @is_readonly, @metadata_json, COALESCE(@created_at, CURRENT_TIMESTAMP), COALESCE(@updated_at, CURRENT_TIMESTAMP))
  ON CONFLICT(id) DO UPDATE SET
    project_id = excluded.project_id,
    title = excluded.title,
    source_type = excluded.source_type,
    source_id = excluded.source_id,
    source_path = excluded.source_path,
    is_readonly = excluded.is_readonly,
    metadata_json = excluded.metadata_json,
    updated_at = excluded.updated_at
`);

const threadByIdStmt = db.prepare(`
  SELECT id, project_id, title, source_type, source_id, source_path, is_readonly, metadata_json, created_at, updated_at
  FROM threads
  WHERE id = ?
`);

const listThreadsStmt = db.prepare(`
  SELECT id, project_id, title, source_type, source_id, source_path, is_readonly, metadata_json, created_at, updated_at
  FROM threads
  ORDER BY updated_at DESC, id DESC
`);

const touchThreadStmt = db.prepare(`
  UPDATE threads
  SET updated_at = ?
  WHERE id = ?
`);

const insertMessageStmt = db.prepare(`
  INSERT INTO messages (thread_id, project_id, role, content, metadata_json, created_at)
  VALUES (@thread_id, @project_id, @role, @content, @metadata_json, COALESCE(@created_at, CURRENT_TIMESTAMP))
`);

const messageByIdStmt = db.prepare(`
  SELECT id, thread_id, project_id, role, content, created_at, metadata_json
  FROM messages
  WHERE id = ?
`);

const messageByTaskIdStmt = db.prepare(`
  SELECT id, thread_id, project_id, role, content, created_at, metadata_json
  FROM messages
  WHERE json_extract(metadata_json, '$.taskId') = ?
  ORDER BY id DESC
  LIMIT 1
`);

const updateMessageStmt = db.prepare(`
  UPDATE messages
  SET content = @content,
      metadata_json = @metadata_json
  WHERE id = @id
`);

const deleteMessagesForThreadStmt = db.prepare(`
  DELETE FROM messages
  WHERE thread_id = ?
`);

const listMessagesStmt = db.prepare(`
  SELECT id, thread_id, project_id, role, content, created_at, metadata_json
  FROM messages
  WHERE thread_id = ?
  ORDER BY id DESC
  LIMIT ?
`);

const insertTaskStmt = db.prepare(`
  INSERT INTO tasks (thread_id, project_id, user_id, mode, model, power, prompt, attachments_json)
  VALUES (@thread_id, @project_id, @user_id, @mode, @model, @power, @prompt, @attachments_json)
`);

const nextPendingTaskStmt = db.prepare(`
  SELECT id, thread_id, project_id, user_id, mode, model, power, prompt, attachments_json, status, error_text, result_text, created_at, started_at, finished_at
  FROM tasks
  WHERE status = 'pending'
  ORDER BY id ASC
  LIMIT 1
`);

const listPendingTasksStmt = db.prepare(`
  SELECT id, thread_id, project_id, user_id, mode, model, power, prompt, attachments_json, status, error_text, result_text, created_at, started_at, finished_at
  FROM tasks
  WHERE status = 'pending'
  ORDER BY id ASC
  LIMIT ?
`);

const listRunningTasksStmt = db.prepare(`
  SELECT id, thread_id, project_id, user_id, mode, model, power, prompt, attachments_json, status, error_text, result_text, created_at, started_at, finished_at
  FROM tasks
  WHERE status = 'running'
  ORDER BY id ASC
`);

const updateTaskStatusStmt = db.prepare(`
  UPDATE tasks
  SET status = @status,
      error_text = @error_text,
      result_text = @result_text,
      started_at = COALESCE(@started_at, started_at),
      finished_at = @finished_at
  WHERE id = @id
`);

const activeTaskByThreadStmt = db.prepare(`
  SELECT id, thread_id, project_id, user_id, mode, model, power, prompt, attachments_json, status, error_text, result_text, created_at, started_at, finished_at
  FROM tasks
  WHERE thread_id = ?
    AND status IN ('pending', 'running')
  ORDER BY id DESC
  LIMIT 1
`);

const deleteTasksForThreadStmt = db.prepare(`
  DELETE FROM tasks
  WHERE thread_id = ?
`);

const deleteThreadStmt = db.prepare(`
  DELETE FROM threads
  WHERE id = ?
`);

const recentThreadStmt = db.prepare(`
  SELECT id, thread_id, project_id, role, content, created_at, metadata_json
  FROM messages
  WHERE thread_id = ?
  ORDER BY id DESC
  LIMIT ?
`);

function fallbackProjectTitle(projectId: string): string {
  const project = loadProjects().find((entry) => entry.id === projectId);
  return project?.title ?? projectId;
}

function ensureDefaultThreads(): void {
  const projectIds = db.prepare(`
    SELECT DISTINCT project_id
    FROM (
      SELECT project_id FROM messages
      UNION
      SELECT project_id FROM tasks
      UNION
      SELECT project_id FROM threads
    )
    WHERE project_id IS NOT NULL
      AND project_id <> ''
  `).all() as { project_id: string }[];

  const now = new Date().toISOString();
  for (const row of projectIds) {
    insertThreadStmt.run({
      id: row.project_id,
      project_id: row.project_id,
      title: fallbackProjectTitle(row.project_id),
      source_type: "server",
      source_id: null,
      source_path: null,
      is_readonly: 0,
      metadata_json: null,
      created_at: now,
      updated_at: now,
    });
  }

  db.exec(`UPDATE messages SET thread_id = project_id WHERE thread_id IS NULL OR thread_id = ''`);
  db.exec(`UPDATE tasks SET thread_id = project_id WHERE thread_id IS NULL OR thread_id = ''`);
}

ensureDefaultThreads();

export function upsertThread(input: {
  id: string;
  projectId: string;
  title: string;
  sourceType?: string;
  sourceId?: string | null;
  sourcePath?: string | null;
  isReadonly?: boolean;
  metadata?: unknown;
  createdAt?: string | null;
  updatedAt?: string | null;
}): void {
  insertThreadStmt.run({
    id: input.id,
    project_id: input.projectId,
    title: input.title,
    source_type: input.sourceType ?? "server",
    source_id: input.sourceId ?? null,
    source_path: input.sourcePath ?? null,
    is_readonly: input.isReadonly ? 1 : 0,
    metadata_json: input.metadata ? JSON.stringify(input.metadata) : null,
    created_at: input.createdAt ?? null,
    updated_at: input.updatedAt ?? new Date().toISOString(),
  });
}

export function getThread(threadId: string): StoredThread | undefined {
  return threadByIdStmt.get(threadId) as StoredThread | undefined;
}

export function parseThreadMetadata(thread: StoredThread | undefined): Record<string, unknown> {
  if (!thread?.metadata_json) {
    return {};
  }

  try {
    const parsed = JSON.parse(thread.metadata_json);
    return typeof parsed === "object" && parsed !== null ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

export function listThreads(): StoredThread[] {
  return listThreadsStmt.all() as StoredThread[];
}

export function buildThreadTitle(input: string, fallback = "Новый чат"): string {
  const normalized = input.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return fallback;
  }

  return normalized.length > 48 ? `${normalized.slice(0, 45)}...` : normalized;
}

export function createThread(input: {
  projectId: string;
  title?: string;
  sourceType?: string;
  sourceId?: string | null;
  sourcePath?: string | null;
  isReadonly?: boolean;
  metadata?: unknown;
}): StoredThread {
  const threadId = crypto.randomUUID();
  const now = new Date().toISOString();
  upsertThread({
    id: threadId,
    projectId: input.projectId,
    title: buildThreadTitle(input.title ?? ""),
    sourceType: input.sourceType ?? "server",
    sourceId: input.sourceId ?? null,
    sourcePath: input.sourcePath ?? null,
    isReadonly: input.isReadonly ?? false,
    metadata: input.metadata,
    createdAt: now,
    updatedAt: now,
  });
  return getThread(threadId) as StoredThread;
}

export function updateThreadMetadata(
  threadId: string,
  updater: (metadata: Record<string, unknown>, thread: StoredThread) => Record<string, unknown>,
): StoredThread | undefined {
  const thread = getThread(threadId);
  if (!thread) {
    return undefined;
  }

  const nextMetadata = updater(parseThreadMetadata(thread), thread);
  upsertThread({
    id: thread.id,
    projectId: thread.project_id,
    title: thread.title,
    sourceType: thread.source_type,
    sourceId: thread.source_id,
    sourcePath: thread.source_path,
    isReadonly: Boolean(thread.is_readonly),
    metadata: nextMetadata,
    createdAt: thread.created_at,
    updatedAt: new Date().toISOString(),
  });

  return getThread(threadId);
}

export function insertMessage(
  threadId: string,
  role: "user" | "assistant" | "system",
  content: string,
  metadata?: unknown,
  createdAt?: string | null,
): number {
  const thread = getThread(threadId);
  if (!thread) {
    throw new Error(`Unknown thread: ${threadId}`);
  }

  const result = insertMessageStmt.run({
    thread_id: thread.id,
    project_id: thread.project_id,
    role,
    content,
    metadata_json: metadata ? JSON.stringify(metadata) : null,
    created_at: createdAt ?? null,
  });
  touchThreadStmt.run(createdAt ?? new Date().toISOString(), threadId);
  return Number(result.lastInsertRowid);
}

export function updateMessage(
  messageId: number,
  content: string,
  metadata?: unknown,
): void {
  const message = messageByIdStmt.get(messageId) as StoredMessage | undefined;
  if (!message) {
    throw new Error(`Unknown message: ${messageId}`);
  }

  updateMessageStmt.run({
    id: messageId,
    content,
    metadata_json: metadata ? JSON.stringify(metadata) : null,
  });
  touchThreadStmt.run(new Date().toISOString(), message.thread_id);
}

export function findMessageByTaskId(taskId: number): StoredMessage | undefined {
  return messageByTaskIdStmt.get(taskId) as StoredMessage | undefined;
}

export function replaceThreadMessages(
  threadId: string,
  messages: { role: "user" | "assistant" | "system"; content: string; createdAt?: string | null; metadata?: unknown }[],
): void {
  deleteMessagesForThreadStmt.run(threadId);
  for (const message of messages) {
    insertMessage(threadId, message.role, message.content, message.metadata, message.createdAt ?? null);
  }
}

export function listMessages(threadId: string, limit = 100): StoredMessage[] {
  return listMessagesStmt.all(threadId, limit).reverse() as StoredMessage[];
}

export function createTask(input: {
  threadId: string;
  userId: number;
  mode: string;
  model: string;
  power: string;
  prompt: string;
  attachments: { originalName: string; storedPath: string; mimeType: string; size: number }[];
}): number {
  const thread = getThread(input.threadId);
  if (!thread) {
    throw new Error(`Unknown thread: ${input.threadId}`);
  }

  const result = insertTaskStmt.run({
    thread_id: thread.id,
    project_id: thread.project_id,
    user_id: input.userId,
    mode: input.mode,
    model: input.model,
    power: input.power,
    prompt: input.prompt,
    attachments_json: JSON.stringify(input.attachments),
  });
  touchThreadStmt.run(new Date().toISOString(), thread.id);
  return Number(result.lastInsertRowid);
}

export function getNextPendingTask(): StoredTask | undefined {
  return nextPendingTaskStmt.get() as StoredTask | undefined;
}

export function listPendingTasks(limit = 20): StoredTask[] {
  return listPendingTasksStmt.all(limit) as StoredTask[];
}

export function listRunningTasks(): StoredTask[] {
  return listRunningTasksStmt.all() as StoredTask[];
}

export function updateTaskStatus(input: {
  id: number;
  status: string;
  errorText?: string | null;
  resultText?: string | null;
  startedAt?: string | null;
  finishedAt?: string | null;
}): void {
  updateTaskStatusStmt.run({
    id: input.id,
    status: input.status,
    error_text: input.errorText ?? null,
    result_text: input.resultText ?? null,
    started_at: input.startedAt ?? null,
    finished_at: input.finishedAt ?? null,
  });
}

export function getActiveTaskForThread(threadId: string): StoredTask | undefined {
  return activeTaskByThreadStmt.get(threadId) as StoredTask | undefined;
}

export function deleteThreadCascade(threadId: string): void {
  deleteMessagesForThreadStmt.run(threadId);
  deleteTasksForThreadStmt.run(threadId);
  deleteThreadStmt.run(threadId);
}

export function getRecentThread(threadId: string, limit = 20): StoredMessage[] {
  return recentThreadStmt.all(threadId, limit).reverse() as StoredMessage[];
}
