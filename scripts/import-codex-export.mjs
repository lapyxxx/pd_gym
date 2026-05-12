import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

const exportFile = process.argv[2] ? path.resolve(process.argv[2]) : "";
const dbFile = process.argv[3] ? path.resolve(process.argv[3]) : "";
const projectId = process.argv[4] || "control-plane";

if (!exportFile || !fs.existsSync(exportFile)) {
  throw new Error(`Export file not found: ${exportFile}`);
}

if (!dbFile || !fs.existsSync(path.dirname(dbFile))) {
  throw new Error(`DB path is invalid: ${dbFile}`);
}

const payload = JSON.parse(fs.readFileSync(exportFile, "utf8"));
const db = new Database(dbFile);
db.pragma("journal_mode = WAL");

const upsertThread = db.prepare(`
  INSERT INTO threads (id, project_id, title, source_type, source_id, source_path, is_readonly, metadata_json, created_at, updated_at)
  VALUES (@id, @project_id, @title, 'local_codex', @source_id, @source_path, @is_readonly, @metadata_json, COALESCE(@created_at, CURRENT_TIMESTAMP), COALESCE(@updated_at, CURRENT_TIMESTAMP))
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

const deleteMessages = db.prepare(`DELETE FROM messages WHERE thread_id = ?`);
const insertMessage = db.prepare(`
  INSERT INTO messages (thread_id, project_id, role, content, metadata_json, created_at)
  VALUES (@thread_id, @project_id, @role, @content, @metadata_json, COALESCE(@created_at, CURRENT_TIMESTAMP))
`);

const importThread = db.transaction((thread) => {
  const normalizedSourcePath = String(thread.sourcePath ?? "").toLowerCase();
  const isReadonly = !normalizedSourcePath.includes("\\xite vpn");
  upsertThread.run({
    id: thread.id,
    project_id: projectId,
    title: thread.title,
    source_id: thread.sourceId,
    source_path: thread.sourcePath,
    is_readonly: isReadonly ? 1 : 0,
    metadata_json: JSON.stringify({
      activeOnLaptop: Boolean(thread.activeOnLaptop),
      sessionFile: thread.sessionFile,
      importedAt: new Date().toISOString(),
    }),
    created_at: thread.messages[0]?.createdAt ?? null,
    updated_at: thread.updatedAt ?? thread.messages.at(-1)?.createdAt ?? null,
  });

  deleteMessages.run(thread.id);
  for (const message of thread.messages) {
    insertMessage.run({
      thread_id: thread.id,
      project_id: projectId,
      role: message.role,
      content: message.content,
      metadata_json: message.metadata ? JSON.stringify(message.metadata) : null,
      created_at: message.createdAt ?? null,
    });
  }
});

for (const thread of payload.threads ?? []) {
  importThread(thread);
}

console.log(`Imported ${payload.threads?.length ?? 0} threads into ${dbFile}`);
