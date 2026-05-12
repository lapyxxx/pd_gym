import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");

function parseEnvFile(filePath: string): void {
  if (!fs.existsSync(filePath)) {
    return;
  }

  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }

    const separatorIndex = line.indexOf("=");
    if (separatorIndex === -1) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    const value = line.slice(separatorIndex + 1).trim();
    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

parseEnvFile(path.join(projectRoot, ".env"));

function resolveFromRoot(inputPath: string): string {
  return path.isAbsolute(inputPath) ? inputPath : path.resolve(projectRoot, inputPath);
}

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export type ProjectConfig = {
  id: string;
  title: string;
  workspaceDir: string;
  defaultBranch?: string;
  defaultModel?: string;
  defaultPower?: string;
  deployCommand?: string;
  memoryFile?: string;
  clientPaths?: string[];
};

export const config = {
  port: Number(process.env.PORT ?? "3001"),
  publicBaseUrl: required("PUBLIC_BASE_URL").replace(/\/+$/, ""),
  telegramBotToken: required("TELEGRAM_BOT_TOKEN"),
  telegramBotUsername: (process.env.TELEGRAM_BOT_USERNAME ?? "codexSpaceBot").replace(/^@/, ""),
  sessionSecret: required("SESSION_SECRET"),
  allowedUserIds: new Set(
    (process.env.TELEGRAM_ALLOWED_USER_IDS ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean)
      .map((value) => Number(value)),
  ),
  dbPath: resolveFromRoot(process.env.DB_PATH ?? "./data/control-plane.db"),
  uploadsDir: resolveFromRoot(process.env.UPLOADS_DIR ?? "./uploads"),
  projectsFile: resolveFromRoot(process.env.PROJECTS_FILE ?? "./projects.json"),
  codexBin: process.env.CODEX_BIN ?? "codex",
  codexSandbox: process.env.CODEX_SANDBOX ?? "workspace-write",
  codexBypassApprovals: (process.env.CODEX_BYPASS_APPROVALS ?? "false").toLowerCase() === "true",
  codexSearch: (process.env.CODEX_SEARCH ?? "false").toLowerCase() === "true",
  gitAuthorName: process.env.CODEX_GIT_AUTHOR_NAME ?? "Codex Bot",
  gitAuthorEmail: process.env.CODEX_GIT_AUTHOR_EMAIL ?? "codex@example.com",
  publicDir: path.join(projectRoot, "public"),
};

fs.mkdirSync(path.dirname(config.dbPath), { recursive: true });
fs.mkdirSync(config.uploadsDir, { recursive: true });

export function loadProjects(): ProjectConfig[] {
  const raw = fs.readFileSync(config.projectsFile, "utf8");
  const parsed = JSON.parse(raw) as ProjectConfig[];
  return parsed.map((project) => ({
    ...project,
    workspaceDir: path.resolve(project.workspaceDir),
    memoryFile: project.memoryFile ? resolveFromRoot(project.memoryFile) : undefined,
  }));
}
