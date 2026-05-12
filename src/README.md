# Control Plane

Chat-first Codex control plane for Telegram Mini App.

## What is included

- Fastify API
- Telegram Mini App auth
- Mobile chat UI served as static files
- SQLite storage for messages and tasks
- Background worker that can call `codex exec`
- Optional PR creation for `change` mode
- Optional deploy command per project
- Optional persistent project memory injected into every new task

## Quick start

1. Copy `.env.example` to `.env`.
2. Copy `projects.example.json` to `projects.json` and set real workspace paths.
3. Run `npm install`.
4. Run `npm run dev`.

## Production notes

- Keep `TELEGRAM_BOT_TOKEN` only in the real `.env`.
- Use a dedicated Linux user on the server.
- Install and login `codex` on the server before expecting live task execution.
