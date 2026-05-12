import { config } from "./config.js";
import { approveDesktopAuthRequest } from "./sync-store.js";

type TelegramWebhookUpdate = {
  message?: {
    chat: { id: number; type: string };
    from?: { id: number };
    text?: string;
  };
};

async function telegramApi(method: string, body: Record<string, unknown>): Promise<void> {
  const response = await fetch(`https://api.telegram.org/bot${config.telegramBotToken}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Telegram API ${method} failed: ${response.status} ${text}`);
  }
}

export async function handleTelegramWebhook(update: TelegramWebhookUpdate): Promise<void> {
  const message = update.message;
  if (!message?.text || !message.from) {
    return;
  }

  if (!config.allowedUserIds.has(message.from.id)) {
    return;
  }

  const rawText = message.text.trim();
  const normalized = rawText.toLowerCase();
  const desktopMatch = rawText.match(/^\/start(?:@\w+)?\s+desktop_([a-z0-9-]+)$/i);
  if (desktopMatch) {
    const authRequestId = desktopMatch[1];
    const request = approveDesktopAuthRequest(authRequestId, message.from.id);
    await telegramApi("sendMessage", {
      chat_id: message.chat.id,
      text: request
        ? `Desktop login approved for "${request.device_name}". Return to the sync app and finish login.`
        : "Desktop login request not found or already expired.",
      disable_web_page_preview: true,
    });
    return;
  }

  if (normalized === "/start" || normalized === "/app") {
    await telegramApi("sendMessage", {
      chat_id: message.chat.id,
      text: "Открывай Mini App, дальше работаем там как в обычном чате.",
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: "Open Codex",
              web_app: { url: config.publicBaseUrl },
            },
          ],
        ],
      },
    });
    return;
  }

  await telegramApi("sendMessage", {
    chat_id: message.chat.id,
    text: "Пиши задачу в Mini App. Этот бот использую для открытия приложения, desktop login и уведомлений.",
    reply_markup: {
      inline_keyboard: [
        [
          {
            text: "Open Codex",
            web_app: { url: config.publicBaseUrl },
          },
        ],
      ],
    },
  });
}

export async function sendTelegramNotification(userId: number, text: string): Promise<void> {
  if (!config.allowedUserIds.has(userId)) {
    return;
  }

  await telegramApi("sendMessage", {
    chat_id: userId,
    text,
    disable_web_page_preview: true,
  });
}
