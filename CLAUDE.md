# CLAUDE.md — CallanApp

Callan Method 刷课应用：按课时过词组与例句。

## Commands

```bash
npm run dev
npm run build
npm run lint

# 从 PDF 重建课时数据（需要 uv；source/ 未入库）
uvx --with pdfplumber python scripts/extract_callan.py source data/callan

# 重建音标表（改了课时数据后才需要跑）
uvx --with eng-to-ipa python scripts/build_ipa.py data/callan
```

## Stack

- Next.js App Router + `next-intl` (locale `zh`)
- Supabase (`lib/supabase/server.ts`, `client.ts`, `admin.ts`)
- Tailwind + shadcn `Button`
- `proxy.ts` — intl + auth（`DEV_BYPASS_AUTH` 可跳过）

## 课时数据

`data/callan/` 由 `scripts/extract_callan.py` 从 `source/*.pdf` 生成，已入库；
`source/` 是原书 PDF，**不入库**。191 课 / 2865 组 / 6756 条词目（去重后 5877）/ 7291 条例句。

`index.json` 的 `words` 是**词目条数、未去重**，且混进约 7% 的非词汇内容（语法标题、
整句例子、书末广告页）——`stats-board.tsx` 的「学过的词组」直接用它，数字偏高。

提取依据是 PDF 的字体而非文本布局——课本用字体区分语义：

| 字体 | 含义 |
|------|------|
| `FreeSet-Bold` 35 | `LESSON N` 课时标题 |
| `FreeSet-DemiBold` / `Arial-BoldMT` 12.5 | 词与词组 |
| `FreeSet-Book` 10.5 | 提问 |
| `FreeSet-Light` 10.0 | 答句 |
| `FreeSet-DemiBold` 10.5 | 语法说明 |

两个坑写在脚本里了：部分内嵌字体缺 ToUnicode，只能拿到 `(cid:N)`（偏移 31 还原）；
页边小节号与正文同字号，只能靠横向位置剔除。复习题区块靠标题跳过。

数据经 `lib/callan.ts` 静态导入，只在服务端展开，客户端仅收当前一课。

### 音标

`data/callan/ipa.json` 由 `scripts/build_ipa.py` 生成，覆盖 5522/5877 条词目（94%）。
词典（`eng-to-ipa`）给的是美式，脚本再按规则转成英式 RP——教材是英式的，
`lib/speech.ts` 也优先挑 en-GB 音色。规则外的合流（BATH、PALM、THOUGHT/CLOTH、
marry/merry）靠脚本里的小词表兜底，词典本身标错的词写在 `_MANUAL` 里。
查不到的词整条不给音标，不做「一半音标一半英文」的降级。

`lessonIpa()` 按课裁剪，客户端只收当前一课的子表。

## Env

复制 `.env.example` → `.env.local`。Supabase 控制台项目名建议 **callanApp**。

## Routes

| Path | Purpose |
|------|---------|
| `/zh` | 今天：续刷入口、连续天数、Stage 进度 |
| `/zh/study` | 课程：12 个 Stage 折叠目录 |
| `/zh/saved` | 生词本：收藏的例句，可遮答案 / 打乱 |
| `/zh/stats` | 数据：打卡热力图、各 Stage 进度 |
| `/zh/study/[lesson]` | 刷课（沉浸式，无 Tab 栏）：逐条问答 + 通览 |
| `/zh/protected` | 受保护占位 |
| `/api/v1/health` | 健康检查 |

底部 Tab 栏在 `components/app-shell.tsx`，靠 `usePathname()` 在刷课页自动隐藏。
进度、生词、打卡记录都存 localStorage（`lib/progress.ts`），朗读用浏览器
`speechSynthesis`（`lib/speech.ts`），都不依赖后端。
