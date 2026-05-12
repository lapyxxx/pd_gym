import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { config, loadProjects, type ProjectConfig } from "./config.js";
import { getNextPendingTask, getRecentThread, insertMessage, updateTaskStatus } from "./db.js";
import { sendTelegramNotification } from "./telegram.js";

type Attachment = {
  originalName: string;
  storedPath: string;
  mimeType: string;
  size: number;
};

const processingProjects = new Set<string>();

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

async function runCommand(command: string, args: string[], cwd: string, extraEnv: Record<string, string> = {}): Promise<{ code: number; stdout: string; stderr: string }> {
  return await new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd,
      env: { ...process.env, ...extraEnv },
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString("utf8");
    });

    child.on("close", (code) => {
      resolve({ code: code ?? 1, stdout, stderr });
    });
  });
}

async function maybeCreatePullRequest(project: ProjectConfig, taskId: number): Promise<string> {
  const branchName = `codex/${project.id}/${taskId}`;
  const workspace = project.workspaceDir;

  const checkoutResult = await runCommand("git", ["checkout", "-B", branchName], workspace);
  if (checkoutResult.code !== 0) {
    throw new Error(`Failed to create branch: ${checkoutResult.stderr || checkoutResult.stdout}`);
  }

  const statusResult = await runCommand("git", ["status", "--porcelain"], workspace);
  if (statusResult.code !== 0) {
    throw new Error(`Failed to read git status: ${statusResult.stderr || statusResult.stdout}`);
  }
  if (!statusResult.stdout.trim()) {
    return "Изменений в git-дереве не появилось, поэтому PR не создавал.";
  }

  const addResult = await runCommand("git", ["add", "-A"], workspace);
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
  );
  if (commitResult.code !== 0) {
    throw new Error(`Failed to commit changes: ${commitResult.stderr || commitResult.stdout}`);
  }

  const pushResult = await runCommand("git", ["push", "-u", "origin", branchName], workspace);
  if (pushResult.code !== 0) {
    throw new Error(`Failed to push branch: ${pushResult.stderr || pushResult.stdout}`);
  }

  const prTitle = `Codex task ${taskId}: ${project.title}`;
  const prBody = `Automated PR created by the Telegram Codex control plane for task ${taskId}.`;
  const prResult = await runCommand("gh", ["pr", "create", "--title", prTitle, "--body", prBody], workspace);
  if (prResult.code !== 0) {
    throw new Error(`Failed to create PR: ${prResult.stderr || prResult.stdout}`);
  }

  return `Создал PR:\n${prResult.stdout.trim()}`;
}

async function maybeRunDeploy(project: ProjectConfig): Promise<string> {
  if (!project.deployCommand?.trim()) {
    return "Для этого проекта не настроен deploy command.";
  }

  const deployResult = await runCommand("bash", ["-lc", project.deployCommand], project.workspaceDir);
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
}): Promise<string> {
  const outputFile = path.join(config.uploadsDir, `task-${task.id}-last-message.txt`);
  const prompt = buildPrompt(project, task);
  const args = [
    "exec",
    "-C",
    project.workspaceDir,
    "-m",
    task.model,
    "-c",
    `model_reasoning_effort=\"${task.power}\"`,
    "-o",
    outputFile,
  ];

  if (config.codexSearch) {
    args.push("--search");
  }

  if (config.codexBypassApprovals) {
    args.push("--dangerously-bypass-approvals-and-sandbox");
  } else {
    args.push("-s", config.codexSandbox);
  }

  args.push(prompt);

  const result = await runCommand(config.codexBin, args, project.workspaceDir);
  const lastMessage = fs.existsSync(outputFile) ? fs.readFileSync(outputFile, "utf8").trim() : "";

  if (result.code !== 0) {
    const tail = (result.stderr || result.stdout || "Unknown Codex failure.").trim().slice(-2000);
    throw new Error(`Не смог завершить задачу через Codex.\n\n${tail}`);
  }

  if (!lastMessage) {
    throw new Error("Codex finished without a final message.");
  }

  return lastMessage;
}

async function processTaskOnce(): Promise<void> {
  const task = getNextPendingTask();
  if (!task || processingProjects.has(task.project_id)) {
    return;
  }

  const project = loadProjects().find((entry) => entry.id === task.project_id);
  if (!project) {
    updateTaskStatus({ id: task.id, status: "failed", errorText: "Unknown project.", finishedAt: new Date().toISOString() });
    return;
  }

  processingProjects.add(task.project_id);
  updateTaskStatus({ id: task.id, status: "running", startedAt: new Date().toISOString() });

  try {
    if (!fs.existsSync(project.workspaceDir)) {
      throw new Error(`Workspace not found: ${project.workspaceDir}`);
    }

    const attachments = JSON.parse(task.attachments_json ?? "[]") as Attachment[];
    const result = await runCodex(project, {
      id: task.id,
      threadId: task.thread_id,
      mode: task.mode,
      model: task.model,
      power: task.power,
      prompt: task.prompt,
      attachments,
    });

    let finalMessage = result;
    if (task.mode === "change") {
      finalMessage = `${result}\n\n${await maybeCreatePullRequest(project, task.id)}`;
    } else if (task.mode === "deploy") {
      finalMessage = `${result}\n\n${await maybeRunDeploy(project)}`;
    }

    insertMessage(task.thread_id, "assistant", finalMessage);
    updateTaskStatus({
      id: task.id,
      status: "completed",
      resultText: finalMessage,
      finishedAt: new Date().toISOString(),
    });
    await sendTelegramNotification(task.user_id, `Задача по проекту "${project.title}" завершена.`);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown worker error.";
    insertMessage(task.thread_id, "assistant", message);
    updateTaskStatus({
      id: task.id,
      status: "failed",
      errorText: message,
      finishedAt: new Date().toISOString(),
    });
    await sendTelegramNotification(task.user_id, `Задача по проекту "${project.title}" завершилась с ошибкой.`);
  } finally {
    processingProjects.delete(task.project_id);
  }
}

export function startTaskRunner(): void {
  setInterval(() => {
    void processTaskOnce();
  }, 2000);
}
