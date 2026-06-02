# CLAUDE.md — CallanApp

空白 Next.js 应用，栈与 TalkFlow 对齐（无课程/场景业务）。

## Commands

```bash
npm run dev
npm run build
npm run lint
```

## Stack

- Next.js App Router + `next-intl` (locale `zh`)
- Supabase (`lib/supabase/server.ts`, `client.ts`, `admin.ts`)
- Tailwind + shadcn `Button`
- `proxy.ts` — intl + auth（`DEV_BYPASS_AUTH` 可跳过）

## Env

复制 `.env.example` → `.env.local`。Supabase 控制台项目名建议 **callanApp**。

## Routes

| Path | Purpose |
|------|---------|
| `/zh` | 首页 |
| `/zh/protected` | 受保护占位 |
| `/api/v1/health` | 健康检查 |
