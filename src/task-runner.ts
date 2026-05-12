import fs from "node:fs";
import path from "node:path";
import { spawn, type ChildProcess } from "node:child_process";
import { config, loadProjects, type ProjectConfig } from "./config.js";
import { findMessageByTaskId, getRecentThread, getActiveTaskForThread, insertMessage, listPendingTasks, listRunningTasks, updateMessage, updateTaskStatus } from "./db.js";
import { sendTelegramNotification } from "./telegram.js";

type Attachment = {
  originalName: string;
  storedPath: string;
  mimeType: string;
  size: number;
};

const processingThreads = new Set<string>();
const processingDeployProjects = new Set<string>();
const runningTaskChildren = new Map<number, ChildProcess>();
const cancelledTasks = new Set<number>();

type ProgressPhase =
  | "thinking"
  | "workspace"
  | "running"
  | "git"
  | "deploy"
  | "finalizing"
  | "completed"
  | "failed";

function progressMetadata(taskId: number, phase: ProgressPhase, loading: boolean) {
  return {
    kind: "task-live-message",
    taskId,
    phase,
    loading,
    showText: true,
  };
}

function createProgressMessage(taskId: number, threadId: string, content: string, phase: ProgressPhase): number {
  return insertMessage(threadId, "assistant", content, {
    ...progressMetadata(taskId, phase, true),
    showText: false,
  });
}

function setProgressMessage(
  taskId: number,
  messageId: number,
  content: string,
  phase: ProgressPhase,
  loading: boolean,
  showText = true,
): void {
  updateMessage(messageId, content, {
    ...progressMetadata(taskId, phase, loading),
    showText,
  });
}

function sanitizeRefPart(input: string): string {
  return input.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48) || "thread";
}

function filePreview(attachment: Attachment): string {
  if (!fs.existsSync(attachment.storedPath)) {
    return `Attachment missing: ${attachment.originalName}`;
  }

  const isTextLike = /\.(md|txt|json|yaml|yml|log|env|ts|tsx|js|jsx|css|html)$/i.test(attachment.originalName);
  if (!isTextLike || attachment.size > 64_000) {
    return `Attachment: ${attachment.originalName} at ${attachment.storedPath}`;
  }

  const content = fs.readFileSync(attachment.storedPath, "utf8");
  return `Attachment: ${attachment.originalName}\n---\n${content}\n---`;
}

function projectMemory(project: ProjectConfig): string {
  if (!project.memoryFile || !fs.existsSync(project.memoryFile)) {
    return "";
  }

  const content = fs.readFileSync(project.memoryFile, "utf8").trim();
  if (!content) {
    return "";
  }

  return `Persistent project memory:\n${content}`;
}

function buildPrompt(project: ProjectConfig, task: { threadId: string; mode: string; prompt: string; attachments: Attachment[] }): string {
  const thread = getRecentThread(task.threadId, 16);
  const history = thread.map((message) => `${message.role.toUpperCase()}: ${message.content}`).join("\n\n");
  const memorySection = projectMemory(project);
  const attachmentSection = task.attachments.length
    ? `\n\nAttachments:\n${task.attachments.map((attachment) => filePreview(attachment)).join("\n\n")}`
    : "";

  return [
    `You are working inside project "${project.title}" in workspace ${project.workspaceDir}.`,
    `Current mode: ${task.mode}.`,
    task.mode === "review"
      ? "Focus on bugs, risks, regressions, and missing tests."
      : "Work conversationally and keep the final answer concise and useful for a Telegram chat.",
    memorySection,
    "Conversation history follows.",
    history,
    `New user request:\n${task.prompt}`,
    attachmentSection,
  ].join("\n\n");
}

async function runCommand(
  command: string,
  args: string[],
  cwd: string,
  extraEnv: Record<string, string> = {},
  taskId?: number,
): Promise<{ code: number; stdout: string; stderr: string }> {
  return await new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd,
      env: { ...process.env, ...extraEnv },
      stdio: ["ignore", "pipe", "pipe"],
    });

    if (taskId) {
      runningTaskChildren.set(taskId, child);
      if (cancelledTasks.has(taskId)) {
        child.kill("SIGTERM");
      }
    }

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString("utf8");
    });

    child.on("close", (code) => {
      if (taskId) {
        runningTaskChildren.delete(taskId);
      }
      resolve({ code: code ?? 1, stdout, stderr });
    });
  });
}

function threadWorkspacePath(project: ProjectConfig, threadId: string): string {
  const projectDir = path.join(config.threadWorkspacesDir, sanitizeRefPart(project.id));
  fs.mkdirSync(projectDir, { recursive: true });
  return path.join(projectDir, sanitizeRefPart(threadId));
}

function isGitWorkspace(workspaceDir: string): boolean {
  return fs.existsSync(path.join(workspaceDir, ".git"));
}

async function ensureThreadWorkspace(project: ProjectConfig, threadId: string): Promise<string> {
  const workspace = threadWorkspacePath(project, threadId);
  if (fs.existsSync(workspace)) {
    return workspace;
  }

  fs.mkdirSync(path.dirname(workspace), { recursive: true });
  if (!isGitWorkspace(project.workspaceDir)) {
    fs.cpSync(project.workspaceDir, workspace, { recursive: true });
    return workspace;
  }

  const branchName = `codex-session/${sanitizeRefPart(project.id)}/${sanitizeRefPart(threadId)}`;
  const startPoint = project.defaultBranch?.trim() || "HEAD";
  const worktreeResult = await runCommand(
    "git",
    ["worktree", "add", "-B", branchName, workspace, startPoint],
    project.workspaceDir,
    {},
  );

  if (worktreeResult.code !== 0) {
    throw new Error(`Failed to create thread workspace: ${worktreeResult.stderr || worktreeResult.stdout}`);
  }

  return workspace;
}

async function maybeCreatePullRequest(project: ProjectConfig, taskId: number, threadId: string, workspace: string): Promise<string> {
  if (!isGitWorkspace(workspace)) {
    return "Для этого проекта серверный workspace без git-репозитория, поэтому PR автоматически не создавал.";
  }

  const branchName = `codex/${sanitizeRefPart(project.id)}/${sanitizeRefPart(threadId)}/${taskId}`;

  const checkoutResult = await runCommand("git", ["checkout", "-B", branchName], workspace, {}, taskId);
  if (checkoutResult.code !== 0) {
    throw new Error(`Failed to create branch: ${checkoutResult.stderr || checkoutResult.stdout}`);
  }

  const statusResult = await runCommand("git", ["status", "--porcelain"], workspace, {}, taskId);
  if (statusResult.code !== 0) {
    throw new Error(`Failed to read git status: ${statusResult.stderr || statusResult.stdout}`);
  }
  if (!statusResult.stdout.trim()) {
    return "Изменений в git-дереве не появилось, поэтому PR не создавал.";
  }

  const addResult = await runCommand("git", ["add", "-A"], workspace, {}, taskId);
  if (addResult.code !== 0) {
    throw new Error(`Failed to stage changes: ${addResult.stderr || addResult.stdout}`);
  }

  const commitResult = await runCommand(
    "git",
    ["commit", "-m", `feat(codex): task ${taskId}`],
    workspace,
    {
      GIT_AUTHOR_NAME: config.gitAuthorName,
      GIT_AUTHOR_EMAIL: config.gitAuthorEmail,
      GIT_COMMITTER_NAME: config.gitAuthorName,
      GIT_COMMITTER_EMAIL: config.gitAuthorEmail,
    },
    taskId,
  );
  if (commitResult.code !== 0) {
    throw new Error(`Failed to commit changes: ${commitResult.stderr || commitResult.stdout}`);
  }

  const pushResult = await runCommand("git", ["push", "-u", "origin", branchName], workspace, {}, taskId);
  if (pushResult.code !== 0) {
    throw new Error(`Failed to push branch: ${pushResult.stderr || pushResult.stdout}`);
  }

  const prTitle = `Codex task ${taskId}: ${project.title}`;
  const prBody = `Automated PR created by the Telegram Codex control plane for task ${taskId}.`;
  const prResult = await runCommand("gh", ["pr", "create", "--title", prTitle, "--body", prBody], workspace, {}, taskId);
  if (prResult.code !== 0) {
    throw new Error(`Failed to create PR: ${prResult.stderr || prResult.stdout}`);
  }

  return `Создал PR:\n${prResult.stdout.trim()}`;
}

async function maybeRunDeploy(project: ProjectConfig, workspace: string, taskId: number): Promise<string> {
  if (!project.deployCommand?.trim()) {
    return "Для этого проекта не настроен deploy command.";
  }

  const deployResult = await runCommand("bash", ["-lc", project.deployCommand], workspace, {}, taskId);
  if (deployResult.code !== 0) {
    throw new Error(`Deploy command failed:\n${deployResult.stderr || deployResult.stdout}`);
  }

  return `Деплой завершён успешно.\n\n${deployResult.stdout.trim()}`;
}

async function runCodex(project: ProjectConfig, task: {
  id: number;
  threadId: string;
  mode: string;
  model: string;
  power: string;
  prompt: string;
  attachments: Attachment[];
}, workspace: string, onProgress?: (summary: string) => void): Promise<string> {
  const outputFile = path.join(config.uploadsDir, `task-${task.id}-last-message.txt`);
  const prompt = buildPrompt(project, task);
  const args = [
    "exec",
    "--json",
    "-C",
    workspace,
    "-m",
    task.model,
    "-c",
    `model_reasoning_effort=\"${task.power}\"`,
    "-o",
    outputFile,
  ];

  if (!isGitWorkspace(workspace)) {
    args.push("--skip-git-repo-check");
  }

  if (config.codexSearch) {
    args.push("--search");
  }

  if (config.codexBypassApprovals) {
    args.push("--dangerously-bypass-approvals-and-sandbox");
  } else {
    args.push("-s", config.codexSandbox);
  }

  args.push(prompt);

  const result = await new Promise<{ code: number; stdout: string; stderr: string }>((resolve) => {
    const child = spawn(config.codexBin, args, {
      cwd: workspace,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });

    runningTaskChildren.set(task.id, child);
    if (cancelledTasks.has(task.id)) {
      child.kill("SIGTERM");
    }

    let stdout = "";
    let stderr = "";
    let stdoutBuffer = "";

    const flushJsonLines = (chunk: string, flushRemainder = false) => {
      stdoutBuffer += chunk;
      const lines = stdoutBuffer.split(/\r?\n/);
      stdoutBuffer = flushRemainder ? "" : (lines.pop() ?? "");

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) {
          continue;
        }

        try {
          const event = JSON.parse(trimmed) as {
            type?: string;
            item?: { type?: string; text?: string };
          };
          if (event.type === "item.completed" && event.item?.type === "agent_message") {
            const summary = String(event.item.text ?? "").trim();
            if (summary) {
              onProgress?.(summary);
            }
          }
        } catch {
          // Keep raw stdout for diagnostics; ignore lines that are not JSON events.
        }
      }
    };

    child.stdout.on("data", (chunk) => {
      const text = chunk.toString("utf8");
      stdout += text;
      flushJsonLines(text);
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString("utf8");
    });

    child.on("close", (code) => {
      runningTaskChildren.delete(task.id);
      flushJsonLines("", true);
      resolve({ code: code ?? 1, stdout, stderr });
    });
  });
  const lastMessage = fs.existsSync(outputFile) ? fs.readFileSync(outputFile, "utf8").trim() : "";

  if (cancelledTasks.has(task.id)) {
    throw new Error("__TASK_CANCELLED__");
  }

  if (result.code !== 0) {
    if (cancelledTasks.has(task.id)) {
      throw new Error("__TASK_CANCELLED__");
    }
    const tail = (result.stderr || result.stdout || "Unknown Codex failure.").trim().slice(-2000);
    throw new Error(`Не смог завершить задачу через Codex.\n\n${tail}`);
  }

  if (!lastMessage) {
    throw new Error("Codex finished without a final message.");
  }

  return lastMessage;
}

async function processTask(task: {
  id: number;
  thread_id: string;
  project_id: string;
  user_id: number;
  mode: string;
  model: string;
  power: string;
  prompt: string;
  attachments_json: string | null;
}): Promise<void> {
  const project = loadProjects().find((entry) => entry.id === task.project_id);
  if (!project) {
    updateTaskStatus({ id: task.id, status: "failed", errorText: "Unknown project.", finishedAt: new Date().toISOString() });
    return;
  }

  processingThreads.add(task.thread_id);
  if (task.mode === "deploy") {
    processingDeployProjects.add(task.project_id);
  }
  updateTaskStatus({ id: task.id, status: "running", startedAt: new Date().toISOString() });
  const progressMessageId = createProgressMessage(task.id, task.thread_id, "Thinking...", "thinking");
  let progressContent = "Thinking...";
  let progressPhase: ProgressPhase = "thinking";
  let progressLoading = true;
  let progressShowText = false;

  const syncProgressMessage = (
    content: string,
    phase: ProgressPhase,
    loading: boolean,
    showText: boolean,
  ) => {
    if (
      content === progressContent &&
      phase === progressPhase &&
      loading === progressLoading &&
      showText === progressShowText
    ) {
      return;
    }

    progressContent = content;
    progressPhase = phase;
    progressLoading = loading;
    progressShowText = showText;
    setProgressMessage(task.id, progressMessageId, content, phase, loading, showText);
  };

  cancelledTasks.delete(task.id);

  try {
    syncProgressMessage("Thinking...", "workspace", true, false);
    if (!fs.existsSync(project.workspaceDir)) {
      throw new Error(`Workspace not found: ${project.workspaceDir}`);
    }

    const workspace = await ensureThreadWorkspace(project, task.thread_id);
    const attachments = JSON.parse(task.attachments_json ?? "[]") as Attachment[];
    syncProgressMessage("Thinking...", "running", true, false);
    const result = await runCodex(project, {
      id: task.id,
      threadId: task.thread_id,
      mode: task.mode,
      model: task.model,
      power: task.power,
      prompt: task.prompt,
      attachments,
    }, workspace, (summary) => {
      syncProgressMessage(summary, "running", true, true);
    });

    let finalMessage = result;
    if (task.mode === "change") {
      syncProgressMessage(progressContent, "git", true, progressShowText);
      finalMessage = `${result}\n\n${await maybeCreatePullRequest(project, task.id, task.thread_id, workspace)}`;
    } else if (task.mode === "deploy") {
      syncProgressMessage(progressContent, "deploy", true, progressShowText);
      finalMessage = `${result}\n\n${await maybeRunDeploy(project, workspace, task.id)}`;
    }

    syncProgressMessage(finalMessage, "completed", false, true);
    updateTaskStatus({
      id: task.id,
      status: "completed",
      resultText: finalMessage,
      finishedAt: new Date().toISOString(),
    });
    await sendTelegramNotification(task.user_id, `Задача по проекту "${project.title}" завершена.`);
  } catch (error) {
    const cancelled = error instanceof Error && error.message === "__TASK_CANCELLED__";
    const message = cancelled ? "Задача остановлена." : error instanceof Error ? error.message : "Unknown worker error.";
    syncProgressMessage(message, "failed", false, true);
    updateTaskStatus({
      id: task.id,
      status: cancelled ? "cancelled" : "failed",
      errorText: cancelled ? null : message,
      finishedAt: new Date().toISOString(),
    });
    await sendTelegramNotification(task.user_id, cancelled
      ? `Задача по проекту "${project.title}" остановлена.`
      : `Задача по проекту "${project.title}" завершилась с ошибкой.`);
  } finally {
    runningTaskChildren.delete(task.id);
    cancelledTasks.delete(task.id);
    processingThreads.delete(task.thread_id);
    if (task.mode === "deploy") {
      processingDeployProjects.delete(task.project_id);
    }
  }
}

function recoverInterruptedTasks(): void {
  const interruptedAt = new Date().toISOString();
  for (const task of listRunningTasks()) {
    const message = "Task interrupted because the server worker restarted.";
    const existingMessage = findMessageByTaskId(task.id);
    if (existingMessage) {
      updateMessage(existingMessage.id, message, {
        ...progressMetadata(task.id, "failed", false),
        interrupted: true,
      });
    } else {
      insertMessage(task.thread_id, "assistant", message, {
        ...progressMetadata(task.id, "failed", false),
        interrupted: true,
      });
    }
    updateTaskStatus({
      id: task.id,
      status: "failed",
      errorText: message,
      finishedAt: interruptedAt,
    });
  }
}

function canStartTask(task: { thread_id: string; project_id: string; mode: string }): boolean {
  if (processingThreads.has(task.thread_id)) {
    return false;
  }
  if (task.mode === "deploy" && processingDeployProjects.has(task.project_id)) {
    return false;
  }
  return true;
}

async function processAvailableTasks(): Promise<void> {
  const capacity = Math.max(1, config.maxConcurrentTasks - processingThreads.size);
  if (capacity <= 0) {
    return;
  }

  const pendingTasks = listPendingTasks(Math.max(config.maxConcurrentTasks * 4, 20));
  let started = 0;

  for (const task of pendingTasks) {
    if (started >= capacity) {
      break;
    }
    if (!canStartTask(task)) {
      continue;
    }

    started += 1;
    void processTask(task);
  }
}

export function startTaskRunner(): void {
  recoverInterruptedTasks();
  void processAvailableTasks();
  setInterval(() => {
    void processAvailableTasks();
  }, 2000);
}

export function cancelTaskForThread(threadId: string): boolean {
  const task = getActiveTaskForThread(threadId);
  if (!task) {
    return false;
  }

  cancelledTasks.add(task.id);
  const child = runningTaskChildren.get(task.id);
  if (child && !child.killed) {
    child.kill("SIGTERM");
  }
  if (task.status === "pending") {
    updateTaskStatus({
      id: task.id,
      status: "cancelled",
      finishedAt: new Date().toISOString(),
    });
  }
  return true;
}

export function wakeTaskRunner(): void {
  void processAvailableTasks();
}
