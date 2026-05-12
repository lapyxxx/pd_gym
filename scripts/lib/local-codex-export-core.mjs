import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export function resolveCodexHome(inputPath) {
  return inputPath ? path.resolve(inputPath) : path.join(os.homedir(), ".codex");
}

export function readJsonl(filePath) {
  return fs.readFileSync(filePath, "utf8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

export function walkFiles(rootDir) {
  const result = [];
  const queue = [rootDir];

  while (queue.length > 0) {
    const current = queue.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        queue.push(fullPath);
      } else {
        result.push(fullPath);
      }
    }
  }

  return result;
}

function extractText(parts) {
  if (!Array.isArray(parts)) {
    return "";
  }

  return parts
    .map((part) => {
      if (part?.type === "output_text" || part?.type === "input_text") {
        return String(part.text ?? "");
      }
      return "";
    })
    .join("")
    .trim();
}

export function collectLocalCodexThreads(codexHomeInput) {
  const codexHome = resolveCodexHome(codexHomeInput);
  const sessionIndexPath = path.join(codexHome, "session_index.jsonl");
  const sessionsRoot = path.join(codexHome, "sessions");

  if (!fs.existsSync(sessionIndexPath)) {
    throw new Error(`session_index.jsonl not found at ${sessionIndexPath}`);
  }

  const sessionEntries = readJsonl(sessionIndexPath)
    .filter((entry) => entry?.id && entry?.thread_name)
    .sort((left, right) => String(right.updated_at ?? "").localeCompare(String(left.updated_at ?? "")));

  const files = fs.existsSync(sessionsRoot) ? walkFiles(sessionsRoot) : [];
  const fileBySessionId = new Map();
  for (const filePath of files) {
    const match = filePath.match(/-([0-9a-f]{8}-[0-9a-f-]{27})\.jsonl$/i);
    if (!match) {
      continue;
    }
    fileBySessionId.set(match[1], filePath);
  }

  const threads = [];
  for (const [index, entry] of sessionEntries.entries()) {
    const sessionFile = fileBySessionId.get(entry.id);
    if (!sessionFile || !fs.existsSync(sessionFile)) {
      continue;
    }

    let cwd = "";
    const messages = [];
    for (const row of readJsonl(sessionFile)) {
      if (row?.type === "turn_context" && row?.payload?.cwd) {
        cwd = String(row.payload.cwd);
        continue;
      }

      if (row?.type !== "response_item") {
        continue;
      }

      const payload = row.payload ?? {};
      if (payload.type !== "message") {
        continue;
      }

      const role = payload.role;
      if (role !== "user" && role !== "assistant" && role !== "system") {
        continue;
      }

      const content = extractText(payload.content);
      if (!content) {
        continue;
      }

      messages.push({
        role,
        content,
        createdAt: row.timestamp ?? entry.updated_at ?? null,
        metadata: {
          phase: payload.phase ?? null,
        },
      });
    }

    if (messages.length === 0) {
      continue;
    }

    threads.push({
      id: `local-${entry.id}`,
      sourceId: entry.id,
      title: String(entry.thread_name),
      sourcePath: cwd || null,
      updatedAt: entry.updated_at ?? null,
      activeOnLaptop: index === 0,
      sessionFile,
      messages,
    });
  }

  return {
    exportedAt: new Date().toISOString(),
    codexHome,
    threads,
  };
}
