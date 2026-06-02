# CallanApp

空白脚手架，技术栈与 [TalkFlow](../talkflow) 对齐：Next.js App Router · next-intl (zh) · Supabase SSR · Tailwind · shadcn/ui。

## 本地启动

```bash
cp .env.example .env.local   # 填入 Supabase 项目 callanApp 的 URL / Key
npm install
npm run dev                  # http://localhost:3000
```

- 健康检查：`GET /api/v1/health`
- 首页：`/zh`

## Supabase

1. [Supabase Dashboard](https://supabase.com/dashboard) → **New project** → 名称 **callanApp**
2. Settings → API：复制 Project URL、anon/public key → `.env.local`
3. （可选）Settings → API → `service_role` → `SUPABASE_SERVICE_ROLE_KEY`（仅本地脚本）

## 命令

| 命令 | 说明 |
|------|------|
| `npm run dev` | 开发服务器 |
| `npm run build` | 生产构建 |
| `npm run lint` | ESLint |
