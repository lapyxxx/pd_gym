const state = {
  token: localStorage.getItem("codex_token") || "",
  projects: [],
  activeProjectId: "",
  selectedFiles: [],
  isSending: false,
  isDrawerOpen: true,
  isSheetOpen: false,
};

const tg = window.Telegram?.WebApp;
tg?.ready();
tg?.expand();

const chatBack = document.getElementById("chat-back");
const topbarEyebrow = document.getElementById("topbar-eyebrow");
const projectTitle = document.getElementById("project-title");
const menuButton = document.getElementById("menu-button");
const messagesEl = document.getElementById("messages");
const projectDrawer = document.getElementById("project-drawer");
const projectsList = document.getElementById("projects-list");
const syncNowButton = document.getElementById("sync-now-button");
const chatBanner = document.getElementById("chat-banner");
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
const settingsSheet = document.getElementById("settings-sheet");
const previewModal = document.getElementById("preview-modal");
const previewImage = document.getElementById("preview-image");
const previewFile = document.getElementById("preview-file");
const previewClose = document.getElementById("preview-close");

let lastRenderedMessageId = 0;
let lastRenderedThreadId = "";

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

function activeChatNeedsHandoff(chat = getActiveChat()) {
  return Boolean(
    chat &&
    chat.sourceType === "local_codex" &&
    chat.metadata?.canContinueOnServer &&
    chat.lease?.lease_owner !== "server",
  );
}

function activeChatIsBlocked(chat = getActiveChat()) {
  return Boolean(
    chat &&
    chat.sourceType === "local_codex" &&
    (!chat.metadata?.canContinueOnServer || chat.lease?.lease_owner !== "server"),
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
  topbarEyebrow.textContent = drawerOpen ? "Мои чаты" : "Текущий чат";
  projectTitle.textContent = drawerOpen ? "Чаты" : activeChat?.chatTitle || activeChat?.title || "Чат";
  chatBack.classList.toggle("hidden", drawerOpen);
  menuButton.classList.toggle("hidden", drawerOpen);
}

function openDrawer() {
  state.isDrawerOpen = true;
  projectDrawer.classList.remove("hidden");
  chatBanner.classList.add("hidden");
  messagesEl.classList.add("hidden");
  closeSettingsSheet();
  syncHeader();
  updateSendButton();
  requestAnimationFrame(() => input.focus());
}

function closeDrawer() {
  state.isDrawerOpen = false;
  projectDrawer.classList.add("hidden");
  messagesEl.classList.remove("hidden");
  syncHeader();
  renderChatBanner();
  updateSendButton();
  requestAnimationFrame(() => input.focus());
}

function openSettingsSheet() {
  if (isDrawerOpen()) {
    return;
  }
  state.isSheetOpen = true;
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
  sendButton.disabled = isSending || sendButton.disabled;
  sendButton.classList.toggle("loading", isSending);
  sendSpinner.classList.toggle("hidden", !isSending);
  sendIcon.classList.toggle("hidden", isSending);
}

function updateSendButton() {
  const activeChat = getActiveChat();
  const hasContent = Boolean(input.value.trim()) || state.selectedFiles.length > 0;
  const readOnlyInChat = !isDrawerOpen() && Boolean(activeChat?.isReadOnly);
  const blockedLaptopChat = !isDrawerOpen() && activeChatIsBlocked(activeChat);
  const disabled = state.isSending || !hasContent || readOnlyInChat || blockedLaptopChat;

  sendButton.disabled = disabled;
  sendButton.classList.toggle("loading", state.isSending);
  sendSpinner.classList.toggle("hidden", !state.isSending);
  sendIcon.classList.toggle("hidden", state.isSending);

  const disableInput = readOnlyInChat || blockedLaptopChat || state.isSending;
  input.disabled = disableInput;
  fileInput.disabled = disableInput;
  attachButton.disabled = disableInput;

  input.placeholder = readOnlyInChat
    ? "Этот чат только для чтения"
    : blockedLaptopChat
      ? activeChat?.metadata?.canContinueOnServer
        ? "Нажми Continue on server"
        : "Этот чат пока нельзя продолжить на сервере"
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
  if (!state.projects.length) {
    const empty = document.createElement("div");
    empty.className = "status-card project-list-empty";
    empty.textContent = "Чаты пока не найдены.";
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

  for (const project of state.projects) {
    const card = document.createElement("div");
    card.className = `project-item${project.id === state.activeProjectId ? " active" : ""}`;
    card.tabIndex = 0;
    card.setAttribute("role", "button");
    const titleText = project.chatTitle || project.title;
    const subtitleParts = [];
    if (project.metadata?.activeOnLaptop) {
      subtitleParts.push("Active on laptop");
    }
    if (project.sourceType === "local_codex") {
      subtitleParts.push("Imported from laptop");
    }
    if (project.sourcePath) {
      subtitleParts.push(project.sourcePath);
    } else if (project.projectId) {
      subtitleParts.push(project.projectId);
    }
    const subtitleText = subtitleParts.join(" • ") || project.title;
    card.setAttribute("aria-label", titleText);
    card.dataset.title = titleText;
    card.dataset.subtitle = subtitleText;

    card.addEventListener("click", () => {
      selectProject(project);
    });
    card.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        selectProject(project);
      }
    });
    projectsList.appendChild(card);
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
  const activeChat = getActiveChat();
  if (isDrawerOpen() || !activeChat || activeChat.sourceType !== "local_codex") {
    chatBanner.classList.add("hidden");
    chatBanner.innerHTML = "";
    return;
  }

  const copy = document.createElement("div");
  copy.className = "chat-banner-copy";
  if (!activeChat.metadata?.canContinueOnServer) {
    copy.textContent = "Этот ноутбучный чат синхронизирован, но server workspace для него пока не настроен.";
  } else if (activeChat.lease?.lease_owner === "server") {
    copy.textContent = "Чат уже переведён на сервер. Можно продолжать работу отсюда.";
  } else if (activeChat.metadata?.activeOnLaptop) {
    copy.textContent = "На ноутбуке этот чат был активен во время последнего sync. Перед продолжением на сервере останови локальный Codex и нажми Continue on server.";
  } else {
    copy.textContent = "Чат синхронизирован с ноутбука. Если локальная работа уже остановлена, можно продолжить на сервере.";
  }

  const actions = document.createElement("div");
  actions.className = "chat-banner-actions";

  const syncButton = document.createElement("button");
  syncButton.type = "button";
  syncButton.className = "chat-banner-button secondary";
  syncButton.textContent = "Sync";
  syncButton.addEventListener("click", () => {
    void requestLaptopSync(activeChat.id);
  });
  actions.append(syncButton);

  if (activeChatNeedsHandoff(activeChat)) {
    const continueButton = document.createElement("button");
    continueButton.type = "button";
    continueButton.className = "chat-banner-button primary";
    continueButton.textContent = "Continue on server";
    continueButton.addEventListener("click", () => {
      void continueOnServer(activeChat.id);
    });
    actions.append(continueButton);
  }

  chatBanner.innerHTML = "";
  chatBanner.append(copy, actions);
  chatBanner.classList.remove("hidden");
}

function renderMessages(messages, forceScroll = false) {
  const activeChat = getActiveChat();
  const needsFullReplace =
    lastRenderedThreadId !== state.activeProjectId ||
    !messagesEl.children.length ||
    messages.length === 0;

  if (needsFullReplace) {
    messagesEl.innerHTML = "";
  }

  if (needsFullReplace && activeChat?.isReadOnly) {
    const note = document.createElement("div");
    note.className = "status-card";
    const sourcePath = activeChat.sourcePath ? `\n\nSource workspace: ${activeChat.sourcePath}` : "";
    note.textContent = `Этот чат импортирован с ноутбука и пока доступен только для чтения.${sourcePath}`;
    messagesEl.appendChild(note);
  }

  const existingCount = needsFullReplace ? 0 : messagesEl.querySelectorAll(".message").length;
  const sliceFrom = needsFullReplace ? 0 : existingCount;
  for (const message of messages.slice(sliceFrom)) {
    const node = messageTemplate.content.firstElementChild.cloneNode(true);
    node.classList.add(message.role);
    node.querySelector(".meta").textContent = message.role === "user" ? "Ты" : "Codex";
    node.querySelector(".content").textContent = message.content;
    messagesEl.appendChild(node);
  }

  const latestMessageId = messages.at(-1)?.id ?? 0;
  const shouldForce = forceScroll || latestMessageId !== lastRenderedMessageId;
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
  state.projects = projects;

  if (!state.activeProjectId && state.projects[0]) {
    state.activeProjectId = state.projects[0].id;
    syncActiveDefaults(state.projects[0]);
  } else {
    syncActiveDefaults(getActiveChat());
  }

  renderProjects();
  syncHeader();
  renderChatBanner();
  updateSendButton();
}

async function createThread(title, projectId) {
  const response = await api("/api/threads", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      title,
      projectId: projectId || state.projects[0]?.projectId || state.projects[0]?.id || "control-plane",
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

  await refreshProjects();
}

async function continueOnServer(threadId) {
  const response = await api(`/api/threads/${threadId}/handoff`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({}),
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({ error: "Не удалось переключить чат на сервер." }));
    throw new Error(payload.error || "Не удалось переключить чат на сервер.");
  }

  await refreshProjects();
  await refreshMessages();
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

  const trimmed = input.value.trim();
  if (!trimmed && state.selectedFiles.length === 0) {
    updateSendButton();
    return;
  }

  setSendingState(true);
  updateSendButton();

  try {
    if (isDrawerOpen()) {
      const thread = await createThread(trimmed || "Новый чат");
      state.activeProjectId = thread.id;
      await refreshProjects();
      await submitToThread(thread.id, trimmed);
      resetComposer();
      closeDrawer();
      lastRenderedMessageId = 0;
      lastRenderedThreadId = "";
      await refreshMessages();
      scrollMessagesToBottom(true);
    } else {
      const activeChat = getActiveChat();
      if (!activeChat) {
        throw new Error("Нет активного чата.");
      }
      await submitToThread(activeChat.id, trimmed);
      resetComposer();
      await refreshProjects();
      await refreshMessages();
      scrollMessagesToBottom(true);
    }
  } catch (error) {
    alert(error instanceof Error ? error.message : "Не удалось отправить сообщение.");
  } finally {
    setSendingState(false);
    updateSendButton();
  }
}

syncNowButton?.addEventListener("click", async () => {
  syncNowButton.disabled = true;
  try {
    await requestLaptopSync();
  } catch (error) {
    alert(error instanceof Error ? error.message : "Не удалось запросить sync.");
  } finally {
    syncNowButton.disabled = false;
  }
});

chatBack.addEventListener("click", () => {
  openDrawer();
});

menuButton.addEventListener("click", () => {
  if (state.isSheetOpen) {
    closeSettingsSheet();
  } else {
    openSettingsSheet();
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    closeSettingsSheet();
    closeAttachmentPreview();
  }

  if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
    event.preventDefault();
    composer.requestSubmit();
  }
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
    await refreshProjects();
    updateSendButton();
    openDrawer();
    setInterval(() => {
      void refreshProjects();
      void refreshMessages();
    }, 2500);
  } catch (error) {
    messagesEl.innerHTML = `<div class="status-card">${error.message}</div>`;
  }
}

void bootstrap();
