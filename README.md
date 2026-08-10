# CallanApp

Callan 英语学习应用：Next.js App Router · next-intl (zh) · Neon Postgres · Drizzle ORM · Tailwind · shadcn/ui。

## 本地启动

```bash
cp .env.example .env.local   # 填入 Neon DATABASE_URL
npm install
npm run db:migrate           # 创建/升级 Neon 数据库结构
npm run dev                  # http://localhost:3000
```

- 健康检查：`GET /api/v1/health`
- 首页：`/zh`

## Neon 数据库

`lib/db/schema.ts` 是结构唯一来源，`drizzle/` 保存可审计的迁移。任何 agent 都可按以下闭环修改数据库：

1. 修改 `lib/db/schema.ts`
2. 执行 `npm run db:generate`
3. 检查生成的 SQL
4. 执行 `npm run db:migrate`
5. 执行 `npm run db:check` 和 `GET /api/v1/health`

应用运行时只读取 `DATABASE_URL`。本地凭据放在 `.env.local`，该文件不会提交到 Git。

## 命令

| 命令 | 说明 |
|------|------|
| `npm run dev` | 开发服务器 |
| `npm run build` | 生产构建 |
| `npm run lint` | ESLint |
| `npm run db:generate` | 根据 schema 生成迁移 |
| `npm run db:migrate` | 将迁移应用到 Neon |
| `npm run db:check` | 校验迁移文件 |
| `npm run db:studio` | 打开数据库管理界面 |
