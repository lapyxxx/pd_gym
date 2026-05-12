const state = {
  token: localStorage.getItem("codex_token") || "",
  projects: [],
  workspaces: [],
  profiles: [],
  selectedProfileId: "",
  activeProjectId: "",
  selectedFiles: [],
  isSending: false,
  isDrawerOpen: true,
  drawerView: "chats",
  isSheetOpen: false,
  syncCommand: null,
  workspaceSyncCommand: null,
  syncErrorPopoverKey: "",
  workspaceErrorPopoverOpen: false,
  workspaceErrorText: "",
  swipedThreadId: "",
  syncVisualTimer: null,
  workspacePicker: {
    visible: false,
    mode: "new-chat",
    selectedWorkspaceId: null,
    draftName: "",
    creating: false,
    pendingText: "",
    editingWorkspaceId: null,
    editingDraft: "",
  },
  profilePicker: {
    visible: false,
    connectSession: null,
  },
};

const tg = window.Telegram?.WebApp;
tg?.ready();
tg?.expand();

const chatBack = document.getElementById("chat-back");
const projectTitle = document.getElementById("project-title");
const workspaceWarning = document.getElementById("workspace-warning");
const workspaceErrorPopup = document.getElementById("workspace-error-popup");
const workspaceSyncStrip = document.getElementById("workspace-sync-strip");
const workspaceSyncStripFill = document.getElementById("workspace-sync-strip-fill");
const workspaceSyncStripDone = document.getElementById("workspace-sync-strip-done");
const menuButton = document.getElementById("menu-button");
const messagesEl = document.getElementById("messages");
const projectDrawer = document.getElementById("project-drawer");
const projectsList = document.getElementById("projects-list");
const drawerNavButton = document.getElementById("drawer-nav-button");
const profileButton = document.getElementById("profile-button");
const drawerArchiveIcon = document.getElementById("drawer-archive-icon");
const drawerBackIcon = document.getElementById("drawer-back-icon");
const drawerTitle = document.getElementById("drawer-title");
const syncNowButton = document.getElementById("sync-now-button");
const syncErrorPopup = document.getElementById("sync-error-popup");
const composer = document.getElementById("composer");
const input = document.getElementById("message-input");
const fileInput = document.getElementById("file-input");
const attachmentsPreview = document.getElementById("attachments-preview");
const attachButton = document.getElementById("attach-button");
const modelSelect = document.getElementById("model-select");
const powerSelect = document.getElementById("power-select");
const modeSelect = document.getElementById("mode-select");
const messageTemplate = document.getElementById("message-template");
const sendButton = document.getElementById("send-button");
const sendSpinner = sendButton.querySelector(".send-spinner");
const sendIcon = sendButton.querySelector(".send-icon");
const sendStopIcon = document.getElementById("send-stop-icon");
const settingsSheet = document.getElementById("settings-sheet");
const sheetThreadActions = document.getElementById("sheet-thread-actions");
const syncThreadButton = document.getElementById("sync-thread-button");
const syncWorkspaceButton = document.getElementById("sync-workspace-button");
const returnToLaptopButton = document.getElementById("return-to-laptop-button");
const selectWorkspaceButton = document.getElementById("select-workspace-button");
const previewModal = document.getElementById("preview-modal");
const previewImage = document.getElementById("preview-image");
const previewFile = document.getElementById("preview-file");
const previewClose = document.getElementById("preview-close");
const workspaceSheet = document.getElementById("workspace-sheet");
const workspaceOptions = document.getElementById("workspace-options");
const workspaceCreateToggle = document.getElementById("workspace-create-toggle");
const workspaceCreatePrefix = document.getElementById("workspace-create-prefix");
const workspaceCreateLabel = document.getElementById("workspace-create-label");
const workspaceCreateInputWrap = document.getElementById("workspace-create-input-wrap");
const workspaceCreateInput = document.getElementById("workspace-create-input");
const workspaceCreateCancel = document.getElementById("workspace-create-cancel");
const workspaceAnyButton = document.getElementById("workspace-any-button");
const workspaceApplyButton = document.getElementById("workspace-apply-button");
const profileSheet = document.getElementById("profile-sheet");
const profileOptions = document.getElementById("profile-options");
const profileAddRow = document.getElementById("profile-add-row");
let profileConnectPoller = null;

let lastRenderedMessageId = 0;
let lastRenderedThreadId = "";
let syncCommandPoller = null;
let workspaceSyncPoller = null;
let activeThreadPoller = null;

const SYNC_ICON_MARKUP = `
  <svg class="sync-glyph sync-glyph-idle" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M14.3935 5.37371C18.0253 6.70569 19.8979 10.7522 18.5761 14.4118C17.6363 17.0135 15.335 18.7193 12.778 19.0094M12.778 19.0094L13.8253 17.2553M12.778 19.0094L14.4889 20M9.60651 18.6263C5.97465 17.2943 4.10205 13.2478 5.42394 9.58823C6.36371 6.98651 8.66504 5.28075 11.222 4.99059M11.222 4.99059L10.1747 6.74471M11.222 4.99059L9.51114 4"></path>
  </svg>
  <svg class="sync-glyph sync-glyph-success" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M16.5 5.38468C18.6128 6.82466 20 9.25033 20 12C20 16.4183 16.4183 20 12 20C11.5898 20 11.1868 19.9691 10.7932 19.9096M13.1599 4.08348C12.7812 4.02847 12.3939 4 12 4C7.58172 4 4 7.58172 4 12C4 14.708 5.34553 17.1018 7.40451 18.5492M13.1599 4.08348L12.5 3M13.1599 4.08348L12.5 5M10.7932 19.9096L11.7561 19M10.7932 19.9096L11.5 21M9 12L11 14L15 10"></path>
  </svg>
  <svg class="sync-glyph sync-glyph-error" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M15.9375 6.11972C17.7862 7.39969 19 9.55585 19 12C19 15.9274 15.866 19.1111 12 19.1111C11.6411 19.1111 11.2885 19.0837 10.9441 19.0307M13.0149 4.96309C12.6836 4.9142 12.3447 4.88889 12 4.88889C8.13401 4.88889 5 8.07264 5 12C5 14.4071 6.17734 16.5349 7.97895 17.8215M13.0149 4.96309L12.4375 4M13.0149 4.96309L12.4375 5.77778M10.9441 19.0307L11.7866 18.2222M10.9441 19.0307L11.5625 20M12 9V12.5M12 14.5V15"></path>
  </svg>
`;

const ARCHIVE_ACTION_ICON = `
  <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M12 21L12 12M12 12L15 15.3333M12 12L9 15.3333" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"></path>
    <path d="M20.5 7V13C20.5 16.7712 20.5 18.6569 19.3284 19.8284C18.1569 21 16.2712 21 12.5 21H11.5M3.5 7V13C3.5 16.7712 3.5 18.6569 4.67157 19.8284C5.37634 20.5332 6.3395 20.814 7.81608 20.9259" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"></path>
    <path d="M12 3H4C3.05719 3 2.58579 3 2.29289 3.29289C2 3.58579 2 4.05719 2 5C2 5.94281 2 6.41421 2.29289 6.70711C2.58579 7 3.05719 7 4 7H20C20.9428 7 21.4142 7 21.7071 6.70711C22 6.41421 22 5.94281 22 5C22 4.05719 22 3.58579 21.7071 3.29289C21.4142 3 20.9428 3 20 3H16" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"></path>
  </svg>
`;

const DELETE_ACTION_ICON = `
  <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M1.5 3.75C1.08579 3.75 0.75 4.08579 0.75 4.5C0.75 4.91421 1.08579 5.25 1.5 5.25V3.75ZM22.5 5.25C22.9142 5.25 23.25 4.91421 23.25 4.5C23.25 4.08579 22.9142 3.75 22.5 3.75V5.25ZM1.5 5.25H22.5V3.75H1.5V5.25Z" fill="currentColor"></path>
    <path d="M9.75 1.5V0.75V1.5ZM8.25 3H7.5H8.25ZM7.5 4.5C7.5 4.91421 7.83579 5.25 8.25 5.25C8.66421 5.25 9 4.91421 9 4.5H7.5ZM15 4.5C15 4.91421 15.3358 5.25 15.75 5.25C16.1642 5.25 16.5 4.91421 16.5 4.5H15ZM15.75 3H16.5H15.75ZM14.25 0.75H9.75V2.25H14.25V0.75ZM9.75 0.75C9.15326 0.75 8.58097 0.987053 8.15901 1.40901L9.21967 2.46967C9.36032 2.32902 9.55109 2.25 9.75 2.25V0.75ZM8.15901 1.40901C7.73705 1.83097 7.5 2.40326 7.5 3H9C9 2.80109 9.07902 2.61032 9.21967 2.46967L8.15901 1.40901ZM7.5 3V4.5H9V3H7.5ZM16.5 4.5V3H15V4.5H16.5ZM16.5 3C16.5 2.40326 16.2629 1.83097 15.841 1.40901L14.7803 2.46967C14.921 2.61032 15 2.80109 15 3H16.5ZM15.841 1.40901C15.419 0.987053 14.8467 0.75 14.25 0.75V2.25C14.4489 2.25 14.6397 2.32902 14.7803 2.46967L15.841 1.40901Z" fill="currentColor"></path>
    <path d="M9 17.25C9 17.6642 9.33579 18 9.75 18C10.1642 18 10.5 17.6642 10.5 17.25H9ZM10.5 9.75C10.5 9.33579 10.1642 9 9.75 9C9.33579 9 9 9.33579 9 9.75H10.5ZM10.5 17.25V9.75H9V17.25H10.5Z" fill="currentColor"></path>
    <path d="M13.5 17.25C13.5 17.6642 13.8358 18 14.25 18C14.6642 18 15 17.6642 15 17.25H13.5ZM15 9.75C15 9.33579 14.6642 9 14.25 9C13.8358 9 13.5 9.33579 13.5 9.75H15ZM15 17.25V9.75H13.5V17.25H15Z" fill="currentColor"></path>
    <path d="M18.865 21.124L18.1176 21.0617L18.1176 21.062L18.865 21.124ZM17.37 22.5L17.3701 21.75H17.37V22.5ZM6.631 22.5V21.75H6.63093L6.631 22.5ZM5.136 21.124L5.88343 21.062L5.88341 21.0617L5.136 21.124ZM4.49741 4.43769C4.46299 4.0249 4.10047 3.71818 3.68769 3.75259C3.2749 3.78701 2.96818 4.14953 3.00259 4.56231L4.49741 4.43769ZM20.9974 4.56227C21.0318 4.14949 20.7251 3.78698 20.3123 3.75259C19.8995 3.7182 19.537 4.02495 19.5026 4.43773L20.9974 4.56227ZM18.1176 21.062C18.102 21.2495 18.0165 21.4244 17.878 21.5518L18.8939 22.6555C19.3093 22.2732 19.5658 21.7486 19.6124 21.186L18.1176 21.062ZM17.878 21.5518C17.7396 21.6793 17.5583 21.75 17.3701 21.75L17.3699 23.25C17.9345 23.25 18.4785 23.0379 18.8939 22.6555L17.878 21.5518ZM17.37 21.75H6.631V23.25H17.37V21.75ZM6.63093 21.75C6.44274 21.75 6.26142 21.6793 6.12295 21.5518L5.10713 22.6555C5.52253 23.0379 6.06649 23.25 6.63107 23.25L6.63093 21.75ZM6.12295 21.5518C5.98449 21.4244 5.89899 21.2495 5.88343 21.062L4.38857 21.186C4.43524 21.7486 4.69172 22.2732 5.10713 22.6555L6.12295 21.5518ZM5.88341 21.0617L4.49741 4.43769L3.00259 4.56231L4.38859 21.1863L5.88341 21.0617ZM19.5026 4.43773L18.1176 21.0617L19.6124 21.1863L20.9974 4.56227L19.5026 4.43773Z" fill="currentColor"></path>
  </svg>
`;

const PROFILE_CHECK_ICON = `
  <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M4 12.6111L8.92308 17.5L20 6.5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path>
  </svg>
`;

function updateViewportMetrics() {
  const viewportHeight = window.visualViewport?.height || window.innerHeight;
  document.documentElement.style.setProperty("--app-height", `${Math.round(viewportHeight)}px`);
  document.documentElement.style.setProperty("--composer-height", `${Math.ceil(composer.offsetHeight || 88)}px`);
}

const MODE_OPTIONS = [
  { value: "chat", label: "chat" },
  { value: "analyze", label: "analyze" },
  { value: "change", label: "change" },
  { value: "review", label: "review" },
  { value: "deploy", label: "deploy" },
];

const MODEL_OPTIONS = [
  "gpt-5.4",
  "gpt-5.4-mini",
  "gpt-5",
  "gpt-5-mini",
  "gpt-5-codex",
  "gpt-5.3-codex",
  "gpt-5.2-codex",
  "gpt-5.1-codex-max",
  "gpt-5.1-codex-mini",
  "codex-mini-latest",
];

const POWER_OPTIONS_BY_MODEL = {
  "gpt-5.4": ["none", "low", "medium", "high", "xhigh"],
  "gpt-5.4-mini": ["none", "low", "medium", "high", "xhigh"],
  "gpt-5": ["minimal", "low", "medium", "high"],
  "gpt-5-mini": ["minimal", "low", "medium", "high"],
  "gpt-5-codex": ["low", "medium", "high", "xhigh"],
  "gpt-5.3-codex": ["low", "medium", "high", "xhigh"],
  "gpt-5.2-codex": ["low", "medium", "high", "xhigh"],
  "gpt-5.1-codex-max": ["low", "medium", "high", "xhigh"],
  "gpt-5.1-codex-mini": ["medium", "high"],
  "codex-mini-latest": ["low", "medium", "high", "xhigh"],
};

function getActiveChat() {
  return state.projects.find((project) => project.id === state.activeProjectId) || null;
}

function getWorkspaceById(workspaceId) {
  return state.workspaces.find((workspace) => workspace.id === workspaceId) || null;
}

function workspaceSubtitle(workspace) {
  return workspace.localPath
    || workspace.serverWorkspaceDir
    || "Папка будет создана на ноуте при sync";
}

function getSelectedProfile() {
  return state.profiles.find((profile) => profile.id === state.selectedProfileId) || state.profiles[0] || null;
}

function profileRemainingPercent(profile, kind) {
  const usage = profile?.usage;
  if (!usage) {
    return null;
  }
  if (kind === "fiveHour") {
    if (typeof usage.fiveHourRemainingPercent === "number") {
      return usage.fiveHourRemainingPercent;
    }
    if (typeof usage.fiveHourPercent === "number") {
      return Math.max(0, Math.min(100, 100 - usage.fiveHourPercent));
    }
    if (typeof usage.fiveHourUsedPercent === "number") {
      return Math.max(0, Math.min(100, 100 - usage.fiveHourUsedPercent));
    }
    return null;
  }
  if (typeof usage.weeklyRemainingPercent === "number") {
    return usage.weeklyRemainingPercent;
  }
  if (typeof usage.weeklyPercent === "number") {
    return Math.max(0, Math.min(100, 100 - usage.weeklyPercent));
  }
  if (typeof usage.weeklyUsedPercent === "number") {
    return Math.max(0, Math.min(100, 100 - usage.weeklyUsedPercent));
  }
  return null;
}

function formatUsageResetDate(value) {
  if (!value) {
    return "";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return date.toLocaleDateString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
  });
}

function activeWorkspaceLabel(chat = getActiveChat()) {
  if (!chat?.workspaceId) {
    return "Любой";
  }
  return chat.workspaceTitle || getWorkspaceById(chat.workspaceId)?.title || "Workspace";
}

function chatMetadata(chat = getActiveChat()) {
  return chat?.metadata || {};
}

function isDeletedChat(chat) {
  return Boolean(chat?.metadata?.deletedAt);
}

function isArchivedChat(chat) {
  return Boolean(chat?.metadata?.archivedAt) && !isDeletedChat(chat);
}

function visibleProjects() {
  return state.projects.filter((project) => {
    if (isDeletedChat(project)) {
      return false;
    }
    return state.drawerView === "archive" ? isArchivedChat(project) : !isArchivedChat(project);
  });
}

function activeChatHasRunningTask(chat = getActiveChat()) {
  return Boolean(chat?.hasRunningTask);
}

function chatWorkspaceNeedsSync(chat = getActiveChat()) {
  if (!chat?.workspaceId || chat.workspaceSourceKind !== "local") {
    return false;
  }

  if (!chat.metadata?.canContinueOnServer) {
    return true;
  }

  const workspace = chat.metadata?.workspace;
  const workspaceSync = chat.metadata?.workspaceSync;
  const localSignature = workspace?.signature || "";
  const syncedSignature = workspaceSync?.signature || "";

  if (!workspace?.required) {
    return false;
  }

  return !workspaceSync?.syncedAt || !syncedSignature || syncedSignature !== localSignature;
}

function workspaceSyncLabel(status) {
  switch (status) {
    case "queued":
      return "Queued...";
    case "syncing":
      return "Syncing workspace...";
    case "completed":
      return "Workspace synced";
    case "failed":
      return "Retry workspace sync";
    case "timeout":
      return "Retry workspace sync";
    default:
      return "Sync workspace";
  }
}

function syncStatusLabel(status) {
  switch (status) {
    case "queued":
      return "Queued";
    case "syncing":
      return "Syncing...";
    case "completed":
      return "Synced";
    case "failed":
      return "Failed";
    case "timeout":
      return "Timeout";
    default:
      return "Sync";
  }
}

function isSyncBusyStatus(status) {
  return status === "queued" || status === "syncing";
}

function isSyncErrorStatus(status) {
  return status === "failed" || status === "timeout";
}

function syncVisualState(status) {
  if (isSyncBusyStatus(status)) {
    return "syncing";
  }
  if (status === "completed") {
    return "completed";
  }
  if (isSyncErrorStatus(status)) {
    return "error";
  }
  return "idle";
}

function syncStatusMessage(status, errorText = "") {
  if (status === "timeout") {
    return errorText || "Синхронизация не успела завершиться вовремя.";
  }
  if (status === "failed") {
    return errorText || "Синхронизация завершилась с ошибкой.";
  }
  return "";
}

function commandProgress(command, expectedDurationMs) {
  if (!command) {
    return 0;
  }
  if (command.status === "completed") {
    return 100;
  }
  if (command.status === "failed" || command.status === "timeout") {
    return 100;
  }
  const startedAt = command.startedAt ? new Date(command.startedAt).getTime() : Date.now();
  const elapsed = Math.max(0, Date.now() - startedAt);
  const progress = 10 + Math.min(82, (elapsed / expectedDurationMs) * 82);
  return Math.round(progress);
}

function updateWorkspaceSyncVisualState() {
  const command = state.workspaceSyncCommand;
  const chat = getActiveChat();
  const shouldShow = !isDrawerOpen() && chat?.sourceType === "local_codex" && Boolean(command && command.threadId === chat.id);

  if (!shouldShow) {
    workspaceSyncStrip.classList.add("hidden");
    workspaceSyncStrip.classList.remove("is-active", "is-complete", "is-error");
    return;
  }

  const status = command?.threadId === chat.id ? (command.status || "idle") : "idle";
  const isBusy = isSyncBusyStatus(status);
  const isDone = status === "completed";
  const isError = isSyncErrorStatus(status);
  const progress = isBusy ? commandProgress(command, 60000) : isDone ? 100 : 0;

  workspaceSyncStrip.classList.remove("hidden");
  workspaceSyncStrip.classList.toggle("is-active", isBusy);
  workspaceSyncStrip.classList.toggle("is-complete", isDone);
  workspaceSyncStrip.classList.toggle("is-error", isError);
  workspaceSyncStripFill.style.setProperty("--workspace-progress", `${progress}%`);
  workspaceSyncStripDone.classList.toggle("hidden", !isDone);

  syncWorkspaceButton?.style.setProperty("--button-progress", `${progress}%`);
  syncWorkspaceButton?.classList.toggle("is-progress", isBusy || isDone);
  syncWorkspaceButton?.classList.toggle("is-complete", isDone);
}

function startVisualTick() {
  if (state.syncVisualTimer) {
    return;
  }
  state.syncVisualTimer = window.setInterval(() => {
    updateSyncButtonState();
    updateWorkspaceSyncVisualState();
  }, 140);
}

function ensureSyncIcon(button) {
  if (!button || button.dataset.iconReady === "true") {
    return;
  }
  button.innerHTML = SYNC_ICON_MARKUP;
  button.dataset.iconReady = "true";
}

function applySyncControlState(button, popup, key) {
  if (!button) {
    return;
  }

  ensureSyncIcon(button);
  const status = state.syncCommand?.status || "idle";
  const visualState = syncVisualState(status);
  button.dataset.state = visualState;
  button.disabled = isSyncBusyStatus(status);
  button.setAttribute("aria-label", syncStatusLabel(status));
  button.style.setProperty("--ring-progress", `${commandProgress(state.syncCommand, 18000)}%`);

  if (popup) {
    const shouldShow = isSyncErrorStatus(status) && state.syncErrorPopoverKey === key;
    popup.textContent = syncStatusMessage(status, state.syncCommand?.errorText || "");
    popup.classList.toggle("hidden", !shouldShow);
  }
}

function updateSyncButtonState() {
  applySyncControlState(syncNowButton, syncErrorPopup, "drawer");
}

async function handleSyncButtonClick(key, threadId = "") {
  const status = state.syncCommand?.status || "idle";

  if (isSyncErrorStatus(status)) {
    if (state.syncErrorPopoverKey !== key) {
      state.syncErrorPopoverKey = key;
      updateSyncButtonState();
      renderChatBanner();
      return;
    }
    state.syncErrorPopoverKey = "";
  }

  if (isSyncBusyStatus(status)) {
    return;
  }

  state.syncErrorPopoverKey = "";
  updateSyncButtonState();
  renderChatBanner();

  try {
    await requestLaptopSync(threadId);
  } catch (error) {
    state.syncCommand = {
      id: "",
      status: "failed",
      errorText: error instanceof Error ? error.message : "Не удалось запросить sync.",
      startedAt: state.syncCommand?.startedAt || new Date().toISOString(),
    };
    updateSyncButtonState();
    renderChatBanner();
  }
}

function createSyncControl(key, threadId = "") {
  const wrapper = document.createElement("div");
  wrapper.className = "sync-control";

  const button = document.createElement("button");
  button.type = "button";
  button.className = "sync-icon-button";
  button.addEventListener("click", () => {
    void handleSyncButtonClick(key, threadId);
  });

  const popup = document.createElement("div");
  popup.className = "sync-error-popup hidden";
  popup.setAttribute("role", "status");
  popup.setAttribute("aria-live", "polite");

  wrapper.append(button, popup);
  applySyncControlState(button, popup, key);
  return wrapper;
}

function activeChatIsBlocked(chat = getActiveChat()) {
  return Boolean(
    chat &&
    chat.sourceType === "local_codex" &&
    (!chat.metadata?.canContinueOnServer || chatWorkspaceNeedsSync(chat)),
  );
}

function isDrawerOpen() {
  return state.isDrawerOpen;
}

function fillSelectOptions(select, values, preferredValue, labels = null) {
  select.innerHTML = "";
  for (const value of values) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = labels?.[value] || value;
    option.selected = value === preferredValue;
    select.appendChild(option);
  }
}

function syncPowerOptions() {
  const currentModel = modelSelect.value || "gpt-5.4";
  const options = POWER_OPTIONS_BY_MODEL[currentModel] || ["low", "medium", "high"];
  const preferred = options.includes(powerSelect.value)
    ? powerSelect.value
    : options.includes("high")
      ? "high"
      : options[0];
  fillSelectOptions(powerSelect, options, preferred);
}

function initModelControls() {
  fillSelectOptions(modelSelect, MODEL_OPTIONS, "gpt-5.4");
  fillSelectOptions(
    modeSelect,
    MODE_OPTIONS.map((item) => item.value),
    "chat",
    Object.fromEntries(MODE_OPTIONS.map((item) => [item.value, item.label])),
  );
  syncPowerOptions();
}

function syncHeader() {
  const activeChat = getActiveChat();
  const drawerOpen = isDrawerOpen();
  projectTitle.textContent = activeChat?.chatTitle || activeChat?.title || "Чат";
  document.querySelector(".topbar")?.classList.toggle("hidden", drawerOpen);
  chatBack.classList.toggle("hidden", drawerOpen);
  menuButton.classList.toggle("hidden", drawerOpen);
  workspaceWarning.classList.toggle("hidden", drawerOpen || !chatWorkspaceNeedsSync(activeChat));
  drawerTitle.textContent = state.drawerView === "archive" ? "Архив" : "Мои чаты";
  drawerArchiveIcon.classList.toggle("hidden", state.drawerView === "archive");
  drawerBackIcon.classList.toggle("hidden", state.drawerView !== "archive");
  drawerNavButton.setAttribute("aria-label", state.drawerView === "archive" ? "Back to chats" : "Open archive");
  workspaceErrorPopup.classList.add("hidden");
  state.workspaceErrorPopoverOpen = false;
}

function openDrawer() {
  state.isDrawerOpen = true;
  projectDrawer.classList.remove("hidden");
  messagesEl.classList.add("hidden");
  closeSettingsSheet();
  syncHeader();
  updateSyncButtonState();
  updateWorkspaceSyncVisualState();
  updateSendButton();
  requestAnimationFrame(() => input.focus());
}

function closeDrawer() {
  state.isDrawerOpen = false;
  projectDrawer.classList.add("hidden");
  messagesEl.classList.remove("hidden");
  syncHeader();
  updateWorkspaceSyncVisualState();
  updateSendButton();
  requestAnimationFrame(() => input.focus());
}

function openSettingsSheet() {
  if (isDrawerOpen()) {
    return;
  }
  state.isSheetOpen = true;
  renderSheetThreadActions();
  settingsSheet.classList.remove("hidden");
  requestAnimationFrame(() => {
    settingsSheet.classList.add("visible");
  });
}

function closeSettingsSheet() {
  state.isSheetOpen = false;
  settingsSheet.classList.remove("visible");
  window.setTimeout(() => {
    if (!state.isSheetOpen) {
      settingsSheet.classList.add("hidden");
    }
  }, 180);
}

function autoGrowTextarea(textarea) {
  textarea.style.height = "0px";
  const next = Math.min(textarea.scrollHeight, 168);
  textarea.style.height = `${Math.max(next, 44)}px`;
}

function isNearBottom() {
  const threshold = 80;
  return messagesEl.scrollHeight - messagesEl.scrollTop - messagesEl.clientHeight < threshold;
}

function scrollMessagesToBottom(force = false) {
  if (!force && !isNearBottom()) {
    return;
  }

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      messagesEl.scrollTop = messagesEl.scrollHeight;
    });
  });
}

function revokeSelectedFileUrls() {
  for (const item of state.selectedFiles) {
    URL.revokeObjectURL(item.url);
  }
}

function setSendingState(isSending) {
  state.isSending = isSending;
  sendButton.classList.toggle("loading", isSending);
  sendSpinner.classList.toggle("hidden", !isSending);
  sendIcon.classList.toggle("hidden", isSending);
  sendStopIcon.classList.add("hidden");
}

function updateSendButton() {
  const activeChat = getActiveChat();
  const hasContent = Boolean(input.value.trim()) || state.selectedFiles.length > 0;
  const readOnlyInChat = !isDrawerOpen() && Boolean(activeChat?.isReadOnly);
  const blockedLaptopChat = !isDrawerOpen() && activeChatIsBlocked(activeChat);
  const hasRunningTask = !isDrawerOpen() && activeChatHasRunningTask(activeChat);
  const disabled = hasRunningTask
    ? false
    : state.isSending || !hasContent || readOnlyInChat || blockedLaptopChat;

  sendButton.disabled = disabled;
  sendButton.classList.toggle("loading", state.isSending);
  sendButton.classList.toggle("is-stop", hasRunningTask);
  sendSpinner.classList.toggle("hidden", !state.isSending);
  sendIcon.classList.toggle("hidden", state.isSending || hasRunningTask);
  sendStopIcon.classList.toggle("hidden", !hasRunningTask || state.isSending);

  const disableInput = readOnlyInChat || blockedLaptopChat || state.isSending || hasRunningTask;
  input.disabled = disableInput;
  fileInput.disabled = disableInput;
  attachButton.disabled = disableInput;

  input.placeholder = readOnlyInChat
    ? "Этот чат только для чтения"
    : blockedLaptopChat
      ? activeChat?.metadata?.canContinueOnServer && chatWorkspaceNeedsSync(activeChat)
        ? "Сначала синхронизируй workspace"
        : "Этот чат пока нельзя продолжить на сервере"
      : hasRunningTask
        ? "Задача выполняется"
      : isDrawerOpen()
      ? "Новый чат"
      : "Сообщение";
}

function setSelectedFiles(files) {
  revokeSelectedFileUrls();
  state.selectedFiles = files.map((file) => ({
    file,
    url: URL.createObjectURL(file),
    isImage: file.type.startsWith("image/"),
  }));
  renderAttachments();
  updateSendButton();
}

function removeSelectedFile(index) {
  const [removed] = state.selectedFiles.splice(index, 1);
  if (removed) {
    URL.revokeObjectURL(removed.url);
  }
  renderAttachments();
  updateSendButton();
}

function openAttachmentPreview(attachment) {
  if (attachment.isImage) {
    previewImage.src = attachment.url;
    previewImage.classList.remove("hidden");
    previewFile.classList.add("hidden");
    previewModal.classList.remove("hidden");
    return;
  }

  previewFile.textContent = attachment.file.name;
  previewFile.classList.remove("hidden");
  previewImage.classList.add("hidden");
  previewModal.classList.remove("hidden");
}

function closeAttachmentPreview() {
  previewModal.classList.add("hidden");
  previewImage.src = "";
  previewImage.classList.add("hidden");
  previewFile.classList.add("hidden");
}

async function api(path, options = {}, retryOnUnauthorized = true) {
  const headers = new Headers(options.headers || {});
  if (state.token) {
    headers.set("Authorization", `Bearer ${state.token}`);
  }
  const response = await fetch(path, { ...options, headers });

  if (response.status === 401 && retryOnUnauthorized) {
    state.token = "";
    localStorage.removeItem("codex_token");
    await ensureAuth();
    return await api(path, options, false);
  }

  return response;
}

async function ensureAuth() {
  if (state.token) {
    return;
  }

  if (!tg?.initData) {
    throw new Error("Open this app from Telegram Mini App.");
  }

  const response = await fetch("/api/auth/telegram", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ initData: tg.initData }),
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({ error: "Auth failed." }));
    throw new Error(payload.error || "Auth failed.");
  }

  const payload = await response.json();
  state.token = payload.token;
  localStorage.setItem("codex_token", state.token);
}

function renderProjects() {
  projectsList.innerHTML = "";
  const items = visibleProjects();
  if (!items.length) {
    const empty = document.createElement("div");
    empty.className = "status-card project-list-empty";
    empty.textContent = state.drawerView === "archive" ? "Архив пуст." : "Чаты пока не найдены.";
    projectsList.appendChild(empty);
    return;
  }

  function selectProject(project) {
    state.activeProjectId = project.id;
    modelSelect.value = project.defaultModel && MODEL_OPTIONS.includes(project.defaultModel)
      ? project.defaultModel
      : "gpt-5.4";
    syncPowerOptions();
    powerSelect.value = project.defaultPower && [...powerSelect.options].some((option) => option.value === project.defaultPower)
      ? project.defaultPower
      : powerSelect.value;
    closeDrawer();
    renderProjects();
    updateSendButton();
    lastRenderedMessageId = 0;
    lastRenderedThreadId = "";
    void refreshMessages();
  }

  for (const project of items) {
    const titleText = project.chatTitle || project.title;
    const subtitleParts = [];
    if (project.metadata?.activeOnLaptop) {
      subtitleParts.push("Active on laptop");
    }
    if (project.sourceType === "local_codex") {
      subtitleParts.push("Imported from laptop");
    }
    subtitleParts.push(`Workspace: ${project.workspaceTitle || "Любой"}`);
    const subtitleText = subtitleParts.join(" • ");

    const item = document.createElement("div");
    item.className = `project-row${project.id === state.activeProjectId ? " active" : ""}${state.swipedThreadId === project.id ? " swiped" : ""}`;

    const actions = document.createElement("div");
    actions.className = "project-row-actions";

    const archiveButton = document.createElement("button");
    archiveButton.type = "button";
    archiveButton.className = "project-swipe-button archive";
    archiveButton.innerHTML = ARCHIVE_ACTION_ICON;
    archiveButton.setAttribute("aria-label", state.drawerView === "archive" ? "Вернуть из архива" : "Архивировать");
    archiveButton.addEventListener("click", async (event) => {
      event.stopPropagation();
      await archiveThread(project.id, state.drawerView !== "archive");
    });

    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.className = "project-swipe-button delete";
    deleteButton.innerHTML = DELETE_ACTION_ICON;
    deleteButton.setAttribute("aria-label", "Удалить");
    deleteButton.addEventListener("click", async (event) => {
      event.stopPropagation();
      await deleteThread(project.id);
    });

    actions.append(archiveButton, deleteButton);

    const card = document.createElement("div");
    card.className = "project-item";
    card.tabIndex = 0;
    card.setAttribute("role", "button");
    card.setAttribute("aria-label", titleText);

    const copy = document.createElement("div");
    copy.className = "project-item-copy";

    const title = document.createElement("div");
    title.className = "project-item-title";
    title.textContent = titleText;

    const subtitle = document.createElement("div");
    subtitle.className = "project-item-subtitle";
    subtitle.textContent = subtitleText;

    copy.append(title, subtitle);
    card.append(copy);

    card.addEventListener("click", () => {
      state.swipedThreadId = "";
      selectProject(project);
    });
    card.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        state.swipedThreadId = "";
        selectProject(project);
      }
    });

    let startX = 0;
    let currentDelta = 0;
    let dragging = false;
    let touchMoved = false;
    const maxSwipe = 136;

    function applySwipeOffset(offset) {
      const bounded = Math.max(-maxSwipe, Math.min(0, offset));
      card.style.transform = `translateX(${bounded}px)`;
      actions.style.opacity = bounded < -8 ? "1" : "0";
    }

    const restingOffset = state.swipedThreadId === project.id ? -maxSwipe : 0;
    applySwipeOffset(restingOffset);

    card.addEventListener("touchstart", (event) => {
      startX = event.touches[0]?.clientX || 0;
      currentDelta = 0;
      dragging = true;
      touchMoved = false;
      card.style.transition = "none";
    }, { passive: true });
    card.addEventListener("touchmove", (event) => {
      if (!dragging) {
        return;
      }
      currentDelta = (event.touches[0]?.clientX || 0) - startX;
      if (Math.abs(currentDelta) > 8) {
        touchMoved = true;
      }
      const baseOffset = state.swipedThreadId === project.id ? -maxSwipe : 0;
      applySwipeOffset(baseOffset + currentDelta);
    }, { passive: true });
    card.addEventListener("touchend", () => {
      if (!dragging) {
        return;
      }
      dragging = false;
      card.style.transition = "";
      const baseOffset = state.swipedThreadId === project.id ? -maxSwipe : 0;
      if (baseOffset + currentDelta < -60) {
        state.swipedThreadId = project.id;
      } else if (baseOffset + currentDelta > -40) {
        state.swipedThreadId = "";
      }
      applySwipeOffset(state.swipedThreadId === project.id ? -maxSwipe : 0);
      if (touchMoved) {
        window.setTimeout(() => {
          renderProjects();
        }, 220);
      }
    });

    item.append(actions, card);
    projectsList.appendChild(item);
  }

  updateViewportMetrics();
}

function renderAttachments() {
  attachmentsPreview.innerHTML = "";
  attachmentsPreview.classList.toggle("hidden", state.selectedFiles.length === 0);
  for (const [index, attachment] of state.selectedFiles.entries()) {
    const card = document.createElement("button");
    card.type = "button";
    card.className = "attachment-card";
    card.addEventListener("click", () => {
      openAttachmentPreview(attachment);
    });

    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "attachment-remove";
    remove.textContent = "×";
    remove.addEventListener("click", (event) => {
      event.stopPropagation();
      removeSelectedFile(index);
    });

    if (attachment.isImage) {
      const image = document.createElement("img");
      image.className = "attachment-image";
      image.src = attachment.url;
      image.alt = attachment.file.name;
      card.append(image);
    } else {
      const fileBox = document.createElement("div");
      fileBox.className = "attachment-file-box";
      fileBox.textContent = attachment.file.name;
      card.append(fileBox);
    }

    card.append(remove);
    attachmentsPreview.appendChild(card);
  }

  updateViewportMetrics();
}

function renderChatBanner() {
  return;
}

function renderSheetThreadActions() {
  const activeChat = getActiveChat();
  const canSyncThread = Boolean(activeChat?.sourceType === "local_codex");
  const canSyncWorkspace = Boolean(activeChat?.workspaceId);
  const canReturnToLaptop = Boolean(activeChat?.workspaceId && activeChat?.lease?.lease_owner === "server");
  const canSelectWorkspace = Boolean(activeChat);
  sheetThreadActions.classList.toggle("hidden", !canReturnToLaptop && !canSyncWorkspace && !canSyncThread && !canSelectWorkspace);
  syncThreadButton.classList.toggle("hidden", !canSyncThread);
  syncWorkspaceButton.classList.toggle("hidden", !canSyncWorkspace);
  selectWorkspaceButton.classList.toggle("hidden", !canSelectWorkspace);
  if (selectWorkspaceButton) {
    selectWorkspaceButton.textContent = activeChat ? activeWorkspaceLabel(activeChat) : "Любой";
  }
  const workspaceStatus = state.workspaceSyncCommand?.threadId === activeChat?.id ? (state.workspaceSyncCommand?.status || "") : "";
  syncWorkspaceButton.disabled = isSyncBusyStatus(workspaceStatus);
  syncWorkspaceButton.textContent = state.workspaceSyncCommand?.threadId === activeChat?.id
    ? workspaceSyncLabel(workspaceStatus)
    : "Sync workspace";
  syncWorkspaceButton.style.setProperty(
    "--button-progress",
    `${state.workspaceSyncCommand?.threadId === activeChat?.id ? commandProgress(state.workspaceSyncCommand, 60000) : 0}%`,
  );
  syncWorkspaceButton.classList.toggle("is-progress", isSyncBusyStatus(workspaceStatus));
  syncWorkspaceButton.classList.toggle("is-complete", workspaceStatus === "completed");
  updateWorkspaceSyncVisualState();
  returnToLaptopButton.classList.toggle("hidden", !canReturnToLaptop);
}

function parseMessageMetadata(message) {
  if (message?.metadata && typeof message.metadata === "object") {
    return message.metadata;
  }
  if (typeof message?.metadata_json === "string" && message.metadata_json) {
    try {
      return JSON.parse(message.metadata_json);
    } catch {
      return null;
    }
  }
  return null;
}

function messageMetaLabel(message, metadata) {
  if (message.role === "user") {
    return "Ты";
  }
  if (message.role === "assistant" && metadata?.loading) {
    return "Thinking...";
  }
  if (message.role === "system") {
    return metadata?.loading ? "Thinking..." : "System";
  }
  return "Codex";
}

function appendInlineRichText(target, text) {
  const parts = text.split(/(`[^`]+`)/g);
  for (const part of parts) {
    if (!part) {
      continue;
    }
    if (part.startsWith("`") && part.endsWith("`") && part.length >= 2) {
      const code = document.createElement("code");
      code.textContent = part.slice(1, -1);
      target.appendChild(code);
      continue;
    }
    target.appendChild(document.createTextNode(part));
  }
}

function appendTextBlock(target, text) {
  const lines = text.split("\n");
  lines.forEach((line, index) => {
    appendInlineRichText(target, line);
    if (index < lines.length - 1) {
      target.appendChild(document.createElement("br"));
    }
  });
}

function renderRichContent(target, text) {
  target.innerHTML = "";
  const blockPattern = /```([a-zA-Z0-9_-]+)?\n?([\s\S]*?)```/g;
  let lastIndex = 0;
  let hasBlock = false;
  let match;

  while ((match = blockPattern.exec(text)) !== null) {
    hasBlock = true;
    const [fullMatch, language = "", codeText = ""] = match;
    const leadingText = text.slice(lastIndex, match.index);
    if (leadingText) {
      const paragraph = document.createElement("div");
      paragraph.className = "text-block";
      appendTextBlock(paragraph, leadingText);
      target.appendChild(paragraph);
    }

    const pre = document.createElement("pre");
    const code = document.createElement("code");
    if (language) {
      code.dataset.language = language;
    }
    code.textContent = codeText.replace(/\n$/, "");
    pre.appendChild(code);
    target.appendChild(pre);

    lastIndex = match.index + fullMatch.length;
  }

  const trailingText = text.slice(lastIndex);
  if (trailingText || !hasBlock) {
    const paragraph = document.createElement("div");
    paragraph.className = "text-block";
    appendTextBlock(paragraph, trailingText || text);
    target.appendChild(paragraph);
  }
}

function messageSignature(message, metadata) {
  return JSON.stringify({
    role: message.role,
    content: message.content,
    metadata,
  });
}

function upsertMessageNode(message) {
  const messageId = String(message.id);
  const metadata = parseMessageMetadata(message);
  const signature = messageSignature(message, metadata);
  let node = messagesEl.querySelector(`.message[data-message-id="${messageId}"]`);
  let changed = false;

  if (!node) {
    node = messageTemplate.content.firstElementChild.cloneNode(true);
    node.dataset.messageId = messageId;
    changed = true;
  }

  if (node.dataset.signature !== signature) {
    node.className = "message";
    node.classList.add(message.role);
    node.classList.toggle("is-loading", Boolean(metadata?.loading));
    node.classList.toggle("task-progress", message.role === "assistant" && metadata?.kind === "task-progress" && Boolean(metadata?.loading));
    const meta = node.querySelector(".meta");
    const content = node.querySelector(".content");
    meta.textContent = messageMetaLabel(message, metadata);
    content.classList.toggle("loading-text", Boolean(metadata?.loading));
    renderRichContent(content, message.content);
    node.dataset.signature = signature;
    changed = true;
  }

  return { node, changed };
}

function renderMessages(messages, forceScroll = false) {
  const activeChat = getActiveChat();
  const needsFullReplace =
    lastRenderedThreadId !== state.activeProjectId ||
    !messagesEl.children.length;

  if (needsFullReplace) {
    messagesEl.innerHTML = "";
  }

  if (needsFullReplace && activeChat?.isReadOnly) {
    const note = document.createElement("div");
    note.className = "status-card";
    note.textContent = "Этот чат импортирован с ноутбука и пока доступен только для чтения.";
    messagesEl.appendChild(note);
  }

  const existingNodes = new Map(
    [...messagesEl.querySelectorAll(".message")]
      .map((node) => [node.dataset.messageId || "", node]),
  );
  const renderedIds = new Set();
  let anyChanged = false;
  let insertAnchor = [...messagesEl.children].find((child) => child.classList.contains("message")) || null;

  for (const message of messages) {
    const { node, changed } = upsertMessageNode(message);
    const existingNode = existingNodes.get(String(message.id));
    renderedIds.add(String(message.id));
    anyChanged = anyChanged || changed;
    if (!existingNode) {
      messagesEl.appendChild(node);
      anyChanged = true;
      continue;
    }
    if (existingNode !== node) {
      existingNode.replaceWith(node);
      anyChanged = true;
      continue;
    }
    if (insertAnchor !== node) {
      messagesEl.insertBefore(node, insertAnchor ? insertAnchor.nextSibling : null);
      anyChanged = true;
    }
    insertAnchor = node;
  }

  for (const node of [...messagesEl.querySelectorAll(".message")]) {
    if (!renderedIds.has(node.dataset.messageId || "")) {
      node.remove();
      anyChanged = true;
    }
  }

  const latestMessageId = messages.at(-1)?.id ?? 0;
  const shouldForce = forceScroll || latestMessageId !== lastRenderedMessageId || anyChanged;
  lastRenderedMessageId = latestMessageId;
  lastRenderedThreadId = state.activeProjectId;
  updateViewportMetrics();
  scrollMessagesToBottom(shouldForce);
}

function syncActiveDefaults(project) {
  if (!project) {
    return;
  }
  modelSelect.value = project.defaultModel && MODEL_OPTIONS.includes(project.defaultModel)
    ? project.defaultModel
    : "gpt-5.4";
  syncPowerOptions();
  powerSelect.value = project.defaultPower && [...powerSelect.options].some((option) => option.value === project.defaultPower)
    ? project.defaultPower
    : powerSelect.value;
}

async function refreshProjects() {
  const response = await api("/api/projects");
  if (!response.ok) {
    throw new Error("Failed to load chats.");
  }

  const projects = await response.json();
  state.projects = projects.filter((project) => !isDeletedChat(project));

  if (!state.projects.some((project) => project.id === state.activeProjectId)) {
    state.activeProjectId = "";
  }

  const defaultVisibleChat = visibleProjects()[0] || state.projects[0] || null;
  if (!state.activeProjectId && defaultVisibleChat) {
    state.activeProjectId = defaultVisibleChat.id;
    syncActiveDefaults(defaultVisibleChat);
  } else if (state.activeProjectId) {
    syncActiveDefaults(getActiveChat());
  }

  renderProjects();
  syncHeader();
  updateSyncButtonState();
  updateWorkspaceSyncVisualState();
  renderChatBanner();
  updateSendButton();
}

async function refreshWorkspaces() {
  const response = await api("/api/workspaces");
  if (!response.ok) {
    throw new Error("Failed to load workspaces.");
  }
  state.workspaces = await response.json();
}

async function refreshProfiles() {
  const response = await api("/api/profiles");
  if (!response.ok) {
    throw new Error("Failed to load profiles.");
  }
  state.profiles = await response.json();
  state.selectedProfileId = state.profiles.find((profile) => profile.selected)?.id || state.profiles[0]?.id || "";
  renderProfileOptions();
  renderProfileAddRow();
}

function renderProfileOptions() {
  if (!profileOptions) {
    return;
  }

  profileOptions.innerHTML = "";
  for (const profile of state.profiles) {
    const option = document.createElement("div");
    option.className = `profile-option${profile.id === state.selectedProfileId ? " active" : ""}`;
    option.setAttribute("role", "button");
    option.tabIndex = 0;

    const main = document.createElement("div");
    main.className = "profile-option-main";

    const title = document.createElement("div");
    title.className = "profile-option-title";
    title.textContent = profile.title;

    const subtitle = document.createElement("div");
    subtitle.className = "profile-option-subtitle";
    const usageParts = [];
    const fiveHourRemaining = profileRemainingPercent(profile, "fiveHour");
    const weeklyRemaining = profileRemainingPercent(profile, "weekly");
    if (typeof fiveHourRemaining === "number") {
      usageParts.push(`${fiveHourRemaining}%`);
    }
    if (typeof weeklyRemaining === "number") {
      const weeklyReset = formatUsageResetDate(profile.usage?.weeklyResetAt);
      usageParts.push(weeklyReset ? `${weeklyRemaining}% ${weeklyReset}` : `${weeklyRemaining}%`);
    }
    subtitle.textContent = profile.authStatus === "connected"
      ? ["Подключен", ...usageParts].join(" | ")
      : "Не подключен";

    const check = document.createElement("div");
    check.className = "profile-option-check";
    check.innerHTML = PROFILE_CHECK_ICON;

    main.append(title, subtitle);
    option.append(main, check);

    const selectProfile = async () => {
      if (profile.id === state.selectedProfileId) {
        closeProfileSheet();
        return;
      }

      const response = await api("/api/profiles/select", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ profileId: profile.id }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({ error: "Не удалось выбрать аккаунт." }));
        throw new Error(payload.error || "Не удалось выбрать аккаунт.");
      }

      await refreshProfiles();
      closeProfileSheet();
    };

    option.addEventListener("click", () => {
      void selectProfile().catch((error) => {
        alert(error instanceof Error ? error.message : "Не удалось выбрать аккаунт.");
      });
    });
    option.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        void selectProfile().catch((error) => {
          alert(error instanceof Error ? error.message : "Не удалось выбрать аккаунт.");
        });
      }
    });

    profileOptions.appendChild(option);
  }
}

function renderProfileAddRow() {
  if (!profileAddRow) {
    return;
  }

  const session = state.profilePicker.connectSession;
  if (!session) {
    profileAddRow.classList.remove("is-connecting");
    profileAddRow.innerHTML = `
      <span class="profile-add-plus">+</span>
      <span class="profile-add-label">Добавить аккаунт</span>
    `;
    return;
  }

  profileAddRow.classList.add("is-connecting");
  const openButton = session.url
    ? `<button type="button" class="profile-connect-open">Открыть ChatGPT</button>`
    : "";
  const codeMarkup = session.code
    ? `<div class="profile-connect-code">${session.code}</div>`
    : "";
  const description = session.status === "completed"
    ? "Аккаунт подключен."
    : session.status === "failed"
      ? (session.errorText || "Не удалось завершить авторизацию.")
      : "Заверши вход в ChatGPT и вернись сюда.";
  profileAddRow.innerHTML = `
    <div class="profile-connect-body">
      <div class="profile-connect-title">Подключение аккаунта</div>
      <div class="profile-connect-text">${description}</div>
      ${codeMarkup}
      ${openButton}
    </div>
  `;

  const open = profileAddRow.querySelector(".profile-connect-open");
  if (open instanceof HTMLButtonElement && session.url) {
    open.addEventListener("click", (event) => {
      event.stopPropagation();
      if (window.Telegram?.WebApp?.openLink) {
        window.Telegram.WebApp.openLink(session.url);
      } else {
        window.open(session.url, "_blank", "noopener,noreferrer");
      }
    });
  }
}

function stopProfileConnectPolling() {
  if (profileConnectPoller) {
    clearInterval(profileConnectPoller);
    profileConnectPoller = null;
  }
}

async function pollProfileConnect(sessionId) {
  const response = await api(`/api/profiles/connect/${sessionId}`);
  if (!response.ok) {
    return;
  }
  state.profilePicker.connectSession = await response.json();
  renderProfileAddRow();

  if (state.profilePicker.connectSession.status === "completed") {
    stopProfileConnectPolling();
    await refreshProfiles();
    const profileId = state.profilePicker.connectSession.profileId;
    const selectResponse = await api("/api/profiles/select", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ profileId }),
    });
    if (selectResponse.ok) {
      await refreshProfiles();
    }
    return;
  }

  if (state.profilePicker.connectSession.status === "failed") {
    stopProfileConnectPolling();
  }
}

function startProfileConnectPolling(sessionId) {
  stopProfileConnectPolling();
  profileConnectPoller = setInterval(() => {
    void pollProfileConnect(sessionId);
  }, 2000);
  void pollProfileConnect(sessionId);
}

async function startProfileConnect() {
  const response = await api("/api/profiles/connect/start", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({}),
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({ error: "Не удалось начать авторизацию." }));
    throw new Error(payload.error || "Не удалось начать авторизацию.");
  }

  state.profilePicker.connectSession = await response.json();
  renderProfileAddRow();
  if (state.profilePicker.connectSession.url) {
    if (window.Telegram?.WebApp?.openLink) {
      window.Telegram.WebApp.openLink(state.profilePicker.connectSession.url);
    } else {
      window.open(state.profilePicker.connectSession.url, "_blank", "noopener,noreferrer");
    }
  }
  startProfileConnectPolling(state.profilePicker.connectSession.id);
}

function openProfileSheet() {
  if (!profileSheet) {
    return;
  }
  state.profilePicker.visible = true;
  renderProfileOptions();
  renderProfileAddRow();
  profileSheet.classList.remove("hidden");
  requestAnimationFrame(() => profileSheet.classList.add("visible"));
}

function closeProfileSheet() {
  if (!profileSheet) {
    return;
  }
  state.profilePicker.visible = false;
  state.profilePicker.connectSession = null;
  stopProfileConnectPolling();
  profileSheet.classList.remove("visible");
  window.setTimeout(() => profileSheet.classList.add("hidden"), 180);
}

function setWorkspaceCreateMode(enabled) {
  state.workspacePicker.creating = enabled;
  if (enabled) {
    state.workspacePicker.editingWorkspaceId = null;
    state.workspacePicker.editingDraft = "";
  }
  workspaceCreatePrefix.classList.toggle("hidden", enabled);
  workspaceCreateLabel.classList.toggle("hidden", enabled);
  workspaceCreateInputWrap.classList.toggle("hidden", !enabled);
  if (enabled) {
    workspaceCreateInput.value = state.workspacePicker.draftName || "";
    requestAnimationFrame(() => {
      workspaceCreateInput.focus();
      workspaceCreateInput.select();
    });
  } else {
    state.workspacePicker.draftName = "";
    workspaceCreateInput.value = "";
  }
}

async function renameWorkspace(workspaceId, title) {
  const response = await api(`/api/workspaces/${workspaceId}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ title }),
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({ error: "Не удалось переименовать workspace." }));
    throw new Error(payload.error || "Не удалось переименовать workspace.");
  }
  const workspace = await response.json();
  const index = state.workspaces.findIndex((item) => item.id === workspace.id);
  if (index >= 0) {
    state.workspaces[index] = workspace;
  }
  return workspace;
}

function stopWorkspaceRename() {
  state.workspacePicker.editingWorkspaceId = null;
  state.workspacePicker.editingDraft = "";
}

async function commitWorkspaceRename(workspaceId, nextTitle) {
  const title = nextTitle.trim();
  if (!title) {
    stopWorkspaceRename();
    renderWorkspaceOptions();
    return;
  }
  const workspace = getWorkspaceById(workspaceId);
  if (!workspace || workspace.title === title) {
    stopWorkspaceRename();
    renderWorkspaceOptions();
    return;
  }
  await renameWorkspace(workspaceId, title);
  stopWorkspaceRename();
  renderWorkspaceOptions();
  await refreshProjects();
}

function renderWorkspaceOptions() {
  workspaceOptions.innerHTML = "";
  for (const workspace of state.workspaces) {
    const button = document.createElement("div");
    button.className = `workspace-option${state.workspacePicker.selectedWorkspaceId === workspace.id ? " active" : ""}`;
    button.setAttribute("role", "button");
    button.tabIndex = 0;
    let holdTimer = 0;

    button.addEventListener("click", () => {
      if (state.workspacePicker.editingWorkspaceId === workspace.id) {
        return;
      }
      state.workspacePicker.selectedWorkspaceId = workspace.id;
      renderWorkspaceOptions();
    });
    button.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        if (state.workspacePicker.editingWorkspaceId === workspace.id) {
          return;
        }
        state.workspacePicker.selectedWorkspaceId = workspace.id;
        renderWorkspaceOptions();
      }
    });

    const isEditing = state.workspacePicker.editingWorkspaceId === workspace.id;

    if (isEditing) {
      const input = document.createElement("input");
      input.className = "workspace-option-input";
      input.type = "text";
      input.value = state.workspacePicker.editingDraft || workspace.title;
      input.addEventListener("input", () => {
        state.workspacePicker.editingDraft = input.value;
      });
      input.addEventListener("click", (event) => event.stopPropagation());
      input.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          void commitWorkspaceRename(workspace.id, input.value).catch((error) => {
            alert(error instanceof Error ? error.message : "Не удалось переименовать workspace.");
          });
        }
        if (event.key === "Escape") {
          event.preventDefault();
          stopWorkspaceRename();
          renderWorkspaceOptions();
        }
      });
      input.addEventListener("blur", () => {
        void commitWorkspaceRename(workspace.id, input.value).catch((error) => {
          alert(error instanceof Error ? error.message : "Не удалось переименовать workspace.");
        });
      });
      button.append(input);
      requestAnimationFrame(() => {
        input.focus();
        input.select();
      });
    } else {
      const title = document.createElement("div");
      title.className = "workspace-option-title";
      title.textContent = workspace.title;

      const subtitle = document.createElement("div");
      subtitle.className = "workspace-option-subtitle";
      subtitle.textContent = workspaceSubtitle(workspace);

      button.append(title, subtitle);
    }

    button.addEventListener("pointerdown", () => {
      if (state.workspacePicker.creating || isEditing) {
        return;
      }
      holdTimer = window.setTimeout(() => {
        state.workspacePicker.editingWorkspaceId = workspace.id;
        state.workspacePicker.editingDraft = workspace.title;
        renderWorkspaceOptions();
      }, 420);
    });
    const clearHold = () => {
      if (holdTimer) {
        window.clearTimeout(holdTimer);
        holdTimer = 0;
      }
    };
    button.addEventListener("pointerup", clearHold);
    button.addEventListener("pointerleave", clearHold);
    button.addEventListener("pointercancel", clearHold);

    workspaceOptions.appendChild(button);
  }
}

function openWorkspaceSheet(mode, options = {}) {
  state.workspacePicker.visible = true;
  state.workspacePicker.mode = mode;
  state.workspacePicker.selectedWorkspaceId = options.selectedWorkspaceId ?? getActiveChat()?.workspaceId ?? null;
  state.workspacePicker.pendingText = options.pendingText ?? state.workspacePicker.pendingText ?? "";
  state.workspacePicker.editingWorkspaceId = null;
  state.workspacePicker.editingDraft = "";
  setWorkspaceCreateMode(false);
  renderWorkspaceOptions();
  workspaceSheet.classList.remove("hidden");
  requestAnimationFrame(() => workspaceSheet.classList.add("visible"));
}

function closeWorkspaceSheet() {
  state.workspacePicker.visible = false;
  state.workspacePicker.pendingText = "";
  stopWorkspaceRename();
  workspaceSheet.classList.remove("visible");
  window.setTimeout(() => workspaceSheet.classList.add("hidden"), 180);
  setWorkspaceCreateMode(false);
}

async function createWorkspaceEntry(title) {
  const response = await api("/api/workspaces", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ title }),
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({ error: "Не удалось создать workspace." }));
    throw new Error(payload.error || "Не удалось создать workspace.");
  }
  const workspace = await response.json();
  state.workspaces.unshift(workspace);
  return workspace;
}

async function applyWorkspaceSelection() {
  let selectedWorkspaceId = state.workspacePicker.selectedWorkspaceId;
  if (state.workspacePicker.creating) {
    const title = workspaceCreateInput.value.trim();
    if (!title) {
      throw new Error("Введите название workspace.");
    }
    const workspace = await createWorkspaceEntry(title);
    selectedWorkspaceId = workspace.id;
  }

  if (state.workspacePicker.mode === "new-chat") {
    const thread = await createThread(state.workspacePicker.pendingText || "Новый чат", selectedWorkspaceId || null);
    state.activeProjectId = thread.id;
    state.drawerView = "chats";
    await refreshProjects();
    await submitToThread(thread.id, state.workspacePicker.pendingText);
    resetComposer();
    closeWorkspaceSheet();
    closeDrawer();
    lastRenderedMessageId = 0;
    lastRenderedThreadId = "";
    await refreshMessages();
    scrollMessagesToBottom(true);
    return;
  }

  const activeChat = getActiveChat();
  if (!activeChat) {
    closeWorkspaceSheet();
    return;
  }

  const response = await api(`/api/threads/${activeChat.id}/workspace`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ workspaceId: selectedWorkspaceId || null }),
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({ error: "Не удалось поменять workspace." }));
    throw new Error(payload.error || "Не удалось поменять workspace.");
  }

  closeWorkspaceSheet();
  await refreshProjects();
  await refreshMessages();
  renderSheetThreadActions();
}

async function createThread(title, projectId) {
  const workspaceId = projectId || null;
  const response = await api("/api/threads", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      title,
      workspaceId,
      projectId: state.projects[0]?.projectId || state.projects[0]?.id || "control-plane",
    }),
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({ error: "Не удалось создать чат." }));
    throw new Error(payload.error || "Не удалось создать чат.");
  }

  return await response.json();
}

async function refreshMessages() {
  if (!state.activeProjectId || isDrawerOpen()) {
    return;
  }

  const response = await api(`/api/projects/${state.activeProjectId}/messages`);
  if (!response.ok) {
    throw new Error("Failed to load messages.");
  }

  const payload = await response.json();
  renderMessages(payload.messages || [], lastRenderedMessageId === 0);
  renderChatBanner();
  updateWorkspaceSyncVisualState();
}

function mergeActiveThread(thread) {
  const index = state.projects.findIndex((project) => project.id === thread.id);
  if (index === -1) {
    return;
  }

  state.projects[index] = thread;
  if (state.activeProjectId === thread.id) {
    syncActiveDefaults(thread);
    syncHeader();
    updateSendButton();
    renderSheetThreadActions();
    renderWorkspaceWarningPopover();
  }
}

async function refreshActiveThread(forceMessages = false) {
  if (!state.activeProjectId || isDrawerOpen()) {
    return;
  }

  const previous = getActiveChat();
  const response = await api(`/api/threads/${state.activeProjectId}`);
  if (!response.ok) {
    return;
  }

  const thread = await response.json();
  const hadRunningTask = Boolean(previous?.hasRunningTask);
  mergeActiveThread(thread);
  const hasRunningTask = Boolean(thread?.hasRunningTask);

  if (forceMessages || hasRunningTask || hadRunningTask !== hasRunningTask) {
    await refreshMessages();
  }
}

async function requestLaptopSync(threadId = "") {
  const response = await api("/api/sync/request", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(threadId ? { threadId } : {}),
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({ error: "Не удалось запросить sync." }));
    throw new Error(payload.error || "Не удалось запросить sync.");
  }

  const payload = await response.json();
  const firstCommandId = payload.commands?.[0]?.id;
  if (firstCommandId) {
    state.syncErrorPopoverKey = "";
    state.syncCommand = {
      id: firstCommandId,
      status: "queued",
      errorText: "",
      startedAt: new Date().toISOString(),
    };
    startSyncCommandPolling(firstCommandId);
  }

  await refreshProjects();
}

async function requestWorkspaceSync(threadId) {
  const response = await api(`/api/threads/${threadId}/sync-workspace`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({}),
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({ error: "Не удалось запросить sync workspace." }));
    throw new Error(payload.error || "Не удалось запросить sync workspace.");
  }

  const payload = await response.json();
  const commandId = payload.command?.id;
  if (commandId) {
    state.workspaceErrorPopoverOpen = false;
    state.workspaceErrorText = "";
    state.workspaceSyncCommand = {
      id: commandId,
      threadId,
      status: "queued",
      errorText: "",
      startedAt: new Date().toISOString(),
    };
    startWorkspaceSyncPolling(commandId, threadId);
  }
  renderSheetThreadActions();
}

function workspaceErrorText(chat = getActiveChat()) {
  if (!chat?.workspaceId) {
    return "";
  }

  if (!chat.metadata?.canContinueOnServer) {
    return "Для этого чата на сервере еще не настроен workspace.";
  }

  const errorText = chat.metadata?.workspaceSync?.errorText;
  if (errorText) {
    return errorText;
  }

  return "Workspace чата не синхронизирован с сервером.";
}

function renderWorkspaceWarningPopover() {
  const shouldShow = state.workspaceErrorPopoverOpen && !isDrawerOpen() && chatWorkspaceNeedsSync();
  workspaceErrorPopup.textContent = shouldShow ? state.workspaceErrorText : "";
  workspaceErrorPopup.classList.toggle("hidden", !shouldShow);
}

async function pollSyncCommand(commandId) {
  const response = await api(`/api/sync/commands/${commandId}`);
  if (!response.ok) {
    return;
  }

  const payload = await response.json();
  state.syncCommand = {
    id: payload.id,
    status: payload.status,
    errorText: payload.errorText || "",
    startedAt: state.syncCommand?.startedAt || new Date().toISOString(),
  };
  if (!isSyncErrorStatus(payload.status)) {
    state.syncErrorPopoverKey = "";
  }
  updateSyncButtonState();
  renderChatBanner();

  if (payload.status === "completed") {
    stopSyncCommandPolling();
    await refreshProjects();
    await refreshMessages();
    updateWorkspaceSyncVisualState();
    return;
  }

  if (payload.status === "failed" || payload.status === "timeout") {
    stopSyncCommandPolling();
    updateWorkspaceSyncVisualState();
    return;
  }
}

function stopSyncCommandPolling() {
  if (syncCommandPoller) {
    clearInterval(syncCommandPoller);
    syncCommandPoller = null;
  }
}

function startSyncCommandPolling(commandId) {
  stopSyncCommandPolling();
  updateSyncButtonState();
  renderChatBanner();
  syncCommandPoller = setInterval(() => {
    void pollSyncCommand(commandId);
  }, 2000);
  void pollSyncCommand(commandId);
}

function stopWorkspaceSyncPolling() {
  if (workspaceSyncPoller) {
    clearInterval(workspaceSyncPoller);
    workspaceSyncPoller = null;
  }
}

function stopActiveThreadPolling() {
  if (activeThreadPoller) {
    clearInterval(activeThreadPoller);
    activeThreadPoller = null;
  }
}

function startActiveThreadPolling() {
  stopActiveThreadPolling();
  activeThreadPoller = setInterval(() => {
    void refreshActiveThread();
  }, 1800);
}

async function pollWorkspaceSyncCommand(commandId, threadId) {
  const response = await api(`/api/sync/commands/${commandId}`);
  if (!response.ok) {
    return;
  }

  const payload = await response.json();
  state.workspaceSyncCommand = {
    id: payload.id,
    threadId,
    status: payload.status,
    errorText: payload.errorText || "",
    startedAt: state.workspaceSyncCommand?.startedAt || new Date().toISOString(),
  };
  renderSheetThreadActions();
  updateWorkspaceSyncVisualState();

  if (payload.status === "completed") {
    stopWorkspaceSyncPolling();
    await refreshProjects();
    await refreshMessages();
    renderSheetThreadActions();
    updateWorkspaceSyncVisualState();
    window.setTimeout(() => {
      if (state.workspaceSyncCommand?.id === payload.id) {
        state.workspaceSyncCommand = null;
        updateWorkspaceSyncVisualState();
        renderSheetThreadActions();
      }
    }, 1100);
    return;
  }

  if (payload.status === "failed" || payload.status === "timeout") {
    stopWorkspaceSyncPolling();
    state.workspaceErrorText = payload.errorText || "Не удалось синхронизировать workspace.";
    state.workspaceErrorPopoverOpen = true;
    renderWorkspaceWarningPopover();
    renderSheetThreadActions();
    updateWorkspaceSyncVisualState();
  }
}

function startWorkspaceSyncPolling(commandId, threadId) {
  stopWorkspaceSyncPolling();
  renderSheetThreadActions();
  workspaceSyncPoller = setInterval(() => {
    void pollWorkspaceSyncCommand(commandId, threadId);
  }, 2000);
  void pollWorkspaceSyncCommand(commandId, threadId);
}

async function returnToLaptop(threadId) {
  const response = await api(`/api/threads/${threadId}/return-to-laptop`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({}),
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({ error: "Не удалось передать чат на ноутбук." }));
    throw new Error(payload.error || "Не удалось передать чат на ноутбук.");
  }

  closeSettingsSheet();
  await refreshProjects();
  await refreshMessages();
}

async function syncThread(threadId) {
  await requestLaptopSync(threadId);
  await refreshProjects();
  await refreshMessages();
}

async function archiveThread(threadId, archived) {
  const response = await api(`/api/threads/${threadId}/archive`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ archived }),
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({ error: "Не удалось обновить архив." }));
    throw new Error(payload.error || "Не удалось обновить архив.");
  }

  state.swipedThreadId = "";
  await refreshProjects();
  if (threadId === state.activeProjectId && state.drawerView !== "archive" && archived) {
    state.activeProjectId = visibleProjects()[0]?.id || "";
  }
}

async function deleteThread(threadId) {
  const response = await api(`/api/threads/${threadId}`, {
    method: "DELETE",
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({ error: "Не удалось удалить чат." }));
    throw new Error(payload.error || "Не удалось удалить чат.");
  }

  state.swipedThreadId = "";
  if (threadId === state.activeProjectId) {
    state.activeProjectId = "";
  }
  await refreshProjects();
  if (!isDrawerOpen()) {
    openDrawer();
  }
}

async function cancelActiveTask(threadId) {
  const response = await api(`/api/threads/${threadId}/cancel`, {
    method: "POST",
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({ error: "Не удалось остановить задачу." }));
    throw new Error(payload.error || "Не удалось остановить задачу.");
  }
}

async function submitToThread(threadId, text) {
  const form = new FormData();
  form.append("text", text);
  form.append("model", modelSelect.value);
  form.append("power", powerSelect.value);
  form.append("mode", modeSelect.value);
  for (const attachment of state.selectedFiles) {
    form.append("file", attachment.file);
  }

  const response = await api(`/api/projects/${threadId}/messages`, {
    method: "POST",
    body: form,
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({ error: "Send failed." }));
    throw new Error(payload.error || "Send failed.");
  }
}

function resetComposer() {
  input.value = "";
  autoGrowTextarea(input);
  fileInput.value = "";
  revokeSelectedFileUrls();
  state.selectedFiles = [];
  renderAttachments();
  updateViewportMetrics();
}

async function sendMessage(event) {
  event.preventDefault();
  if (state.isSending) {
    return;
  }

  const activeChat = getActiveChat();
  if (!isDrawerOpen() && activeChat && activeChatHasRunningTask(activeChat)) {
    try {
      await cancelActiveTask(activeChat.id);
      await refreshProjects();
      await refreshMessages();
    } catch (error) {
      alert(error instanceof Error ? error.message : "Не удалось остановить задачу.");
    }
    return;
  }

  const trimmed = input.value.trim();
  if (!trimmed && state.selectedFiles.length === 0) {
    updateSendButton();
    return;
  }

  setSendingState(true);
  updateSendButton();

  try {
    if (isDrawerOpen()) {
      state.workspacePicker.pendingText = trimmed;
      await refreshWorkspaces();
      openWorkspaceSheet("new-chat", {
        pendingText: trimmed,
        selectedWorkspaceId: null,
      });
    } else {
      if (!activeChat) {
        throw new Error("Нет активного чата.");
      }
      await submitToThread(activeChat.id, trimmed);
      resetComposer();
      await refreshActiveThread(true);
      scrollMessagesToBottom(true);
    }
  } catch (error) {
    alert(error instanceof Error ? error.message : "Не удалось отправить сообщение.");
  } finally {
    setSendingState(false);
    updateSendButton();
  }
}

syncNowButton?.addEventListener("click", () => {
  void handleSyncButtonClick("drawer");
});

chatBack.addEventListener("click", () => {
  openDrawer();
});

drawerNavButton?.addEventListener("click", () => {
  state.drawerView = state.drawerView === "archive" ? "chats" : "archive";
  state.swipedThreadId = "";
  renderProjects();
  syncHeader();
});

profileButton?.addEventListener("click", () => {
  if (state.profilePicker.visible) {
    closeProfileSheet();
  } else {
    void refreshProfiles()
      .then(() => openProfileSheet())
      .catch((error) => {
        alert(error instanceof Error ? error.message : "Не удалось загрузить аккаунты.");
      });
  }
});

menuButton.addEventListener("click", () => {
  if (state.isSheetOpen) {
    closeSettingsSheet();
  } else {
    openSettingsSheet();
  }
});

returnToLaptopButton?.addEventListener("click", () => {
  const activeChat = getActiveChat();
  if (!activeChat) {
    return;
  }
  const confirmed = window.confirm("Передать этот чат обратно на ноутбук и запросить sync?");
  if (!confirmed) {
    return;
  }
  void returnToLaptop(activeChat.id);
});

syncThreadButton?.addEventListener("click", () => {
  const activeChat = getActiveChat();
  if (!activeChat) {
    return;
  }
  closeSettingsSheet();
  void syncThread(activeChat.id).catch((error) => {
    alert(error instanceof Error ? error.message : "Не удалось синхронизировать чат.");
  });
});

syncWorkspaceButton?.addEventListener("click", () => {
  const activeChat = getActiveChat();
  if (!activeChat) {
    return;
  }
  const confirmed = window.confirm("Загрузить текущий workspace этого чата с ноутбука на сервер?");
  if (!confirmed) {
    return;
  }
  void requestWorkspaceSync(activeChat.id).catch((error) => {
    state.workspaceErrorText = error instanceof Error ? error.message : "Не удалось запустить sync workspace.";
    state.workspaceErrorPopoverOpen = true;
    renderWorkspaceWarningPopover();
  });
});

workspaceWarning?.addEventListener("click", () => {
  state.workspaceErrorText = workspaceErrorText();
  state.workspaceErrorPopoverOpen = !state.workspaceErrorPopoverOpen;
  renderWorkspaceWarningPopover();
});

selectWorkspaceButton?.addEventListener("click", () => {
  if (!getActiveChat()) {
    return;
  }
  void refreshWorkspaces()
    .then(() => openWorkspaceSheet("existing-chat"))
    .catch((error) => {
      alert(error instanceof Error ? error.message : "Не удалось загрузить список workspace.");
    });
});

workspaceCreateToggle?.addEventListener("click", () => {
  if (state.workspacePicker.creating) {
    return;
  }
  setWorkspaceCreateMode(true);
});

workspaceCreateToggle?.addEventListener("keydown", (event) => {
  if (state.workspacePicker.creating) {
    return;
  }
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    setWorkspaceCreateMode(true);
  }
});

workspaceCreateCancel?.addEventListener("click", (event) => {
  event.stopPropagation();
  setWorkspaceCreateMode(false);
});

workspaceCreateInput?.addEventListener("input", () => {
  state.workspacePicker.draftName = workspaceCreateInput.value;
});

workspaceCreateInput?.addEventListener("click", (event) => {
  event.stopPropagation();
});

workspaceCreateInput?.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    event.preventDefault();
    setWorkspaceCreateMode(false);
    return;
  }
  if (event.key === "Enter") {
    event.preventDefault();
    void applyWorkspaceSelection().catch((error) => {
      alert(error instanceof Error ? error.message : "Не удалось применить workspace.");
    });
  }
});

workspaceAnyButton?.addEventListener("click", () => {
  state.workspacePicker.selectedWorkspaceId = null;
  void applyWorkspaceSelection().catch((error) => {
    alert(error instanceof Error ? error.message : "Не удалось применить workspace.");
  });
});

workspaceApplyButton?.addEventListener("click", () => {
  void applyWorkspaceSelection().catch((error) => {
    alert(error instanceof Error ? error.message : "Не удалось применить workspace.");
  });
});

workspaceSheet?.addEventListener("click", (event) => {
  if (event.target === workspaceSheet) {
    closeWorkspaceSheet();
  }
});

profileSheet?.addEventListener("click", (event) => {
  if (event.target === profileSheet) {
    closeProfileSheet();
  }
});

profileAddRow?.addEventListener("click", () => {
  if (state.profilePicker.connectSession?.status === "pending") {
    return;
  }
  void startProfileConnect().catch((error) => {
    alert(error instanceof Error ? error.message : "Не удалось начать авторизацию.");
  });
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    closeSettingsSheet();
    closeProfileSheet();
    closeAttachmentPreview();
  }

  if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
    event.preventDefault();
    composer.requestSubmit();
  }
});

document.addEventListener("click", (event) => {
  const target = event.target;
  if (!(target instanceof Element)) {
    return;
  }
  if (state.swipedThreadId && !target.closest(".project-row")) {
    state.swipedThreadId = "";
    renderProjects();
  }
  if (!state.syncErrorPopoverKey) {
    if (!state.workspaceErrorPopoverOpen) {
      return;
    }
  }
  if (target.closest(".sync-control")) {
    return;
  }
  if (target.closest("#workspace-warning") || target.closest("#workspace-error-popup")) {
    return;
  }
  state.syncErrorPopoverKey = "";
  state.workspaceErrorPopoverOpen = false;
  updateSyncButtonState();
  renderWorkspaceWarningPopover();
});

settingsSheet.addEventListener("click", (event) => {
  if (event.target === settingsSheet) {
    closeSettingsSheet();
  }
});

attachButton.addEventListener("click", () => {
  fileInput.click();
});

fileInput.addEventListener("change", () => {
  setSelectedFiles([...(fileInput.files || [])]);
});

modelSelect.addEventListener("change", () => {
  syncPowerOptions();
});

input.addEventListener("input", () => {
  autoGrowTextarea(input);
  updateViewportMetrics();
  updateSendButton();
});

window.addEventListener("resize", updateViewportMetrics);
window.visualViewport?.addEventListener("resize", updateViewportMetrics);
window.visualViewport?.addEventListener("scroll", updateViewportMetrics);

previewClose.addEventListener("click", () => {
  closeAttachmentPreview();
});

previewModal.addEventListener("click", (event) => {
  if (event.target === previewModal) {
    closeAttachmentPreview();
  }
});

composer.addEventListener("submit", (event) => {
  void sendMessage(event);
});

async function bootstrap() {
  try {
    await ensureAuth();
    initModelControls();
    renderAttachments();
    autoGrowTextarea(input);
    updateViewportMetrics();
    await refreshProfiles();
    await refreshWorkspaces();
    await refreshProjects();
    updateSendButton();
    openDrawer();
    startVisualTick();
    startActiveThreadPolling();
    updateWorkspaceSyncVisualState();
    setInterval(() => {
      if (isDrawerOpen()) {
        void refreshProjects();
      }
    }, 15000);
  } catch (error) {
    messagesEl.innerHTML = `<div class="status-card">${error.message}</div>`;
  }
}

void bootstrap();
