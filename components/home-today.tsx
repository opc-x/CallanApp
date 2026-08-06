"use client";

import Link from "next/link";
import { useMemo } from "react";
import { ArrowRight, Flame, Play, Star, Sparkles } from "lucide-react";
import type { LessonSummary } from "@/lib/callan";
import { today, useProgress } from "@/lib/progress";
import { cn } from "@/lib/utils";

function greeting() {
  const h = new Date().getHours();
  if (h < 6) return "夜深了";
  if (h < 11) return "早上好";
  if (h < 14) return "中午好";
  if (h < 18) return "下午好";
  return "晚上好";
}

function Ring({ value, size = 56 }: { value: number; size?: number }) {
  const stroke = 5;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <svg width={size} height={size} className="-rotate-90" aria-hidden>
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        strokeWidth={stroke}
        className="stroke-primary/15"
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - Math.min(Math.max(value, 0), 1))}
        className="stroke-primary transition-[stroke-dashoffset] duration-500"
      />
    </svg>
  );
}

export function HomeToday({
  locale,
  index,
}: {
  locale: string;
  index: LessonSummary[];
}) {
  const { progress, ready, streak } = useProgress();

  const doneSet = useMemo(() => new Set(progress.done), [progress.done]);

  const nextUp = useMemo(
    () => index.find((l) => !doneSet.has(l.lesson)) ?? index[index.length - 1],
    [index, doneSet],
  );

  // 断点续刷：卡片总数 = 词组卡 + 例句卡
  const cardTotal = nextUp.groups + nextUp.examples;
  const pos = progress.pos[String(nextUp.lesson)] ?? 0;
  const resumed = pos > 0 && pos < cardTotal - 1;
  const lessonPct = resumed ? (pos + 1) / cardTotal : 0;

  const overallPct = progress.done.length / index.length;
  const doneToday = ready && progress.days.includes(today());

  const stages = useMemo(() => {
    const m = new Map<number, { total: number; done: number }>();
    for (const l of index) {
      const cur = m.get(l.stage) ?? { total: 0, done: 0 };
      cur.total += 1;
      if (doneSet.has(l.lesson)) cur.done += 1;
      m.set(l.stage, cur);
    }
    return [...m.entries()]
      .sort(([a], [b]) => a - b)
      .map(([stage, s]) => ({ stage, pct: s.done / s.total }));
  }, [index, doneSet]);

  return (
    <main className="mx-auto max-w-lg px-5 pt-12">
      <header className="mb-7">
        <p className="text-sm text-muted-foreground">
          {greeting()} · Callan Method
        </p>
        <h1 className="mt-1 text-[28px] font-bold leading-tight tracking-tight">
          {ready && progress.done.length > 0 ? "接着刷" : "开始第一课"}
        </h1>
      </header>

      {/* 主行动卡 */}
      <Link
        href={`/${locale}/study/${nextUp.lesson}`}
        className="group block overflow-hidden rounded-lg bg-primary text-primary-foreground shadow-lg shadow-primary/20 transition-transform active:scale-[0.985]"
      >
        <div className="p-5">
          <p className="text-xs font-medium uppercase tracking-widest opacity-70">
            {resumed ? "继续未完成" : "下一课"}
          </p>
          <div className="mt-2 flex items-end justify-between gap-4">
            <div className="min-w-0">
              <p className="text-3xl font-bold tracking-tight">
                Lesson {nextUp.lesson}
              </p>
              <p className="mt-1 text-sm opacity-80">
                Stage {nextUp.stage} · {nextUp.words} 词 · {nextUp.examples} 例句
              </p>
            </div>
            <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-primary-foreground/15 transition-transform group-active:scale-95">
              <Play className="size-5 fill-current" />
            </span>
          </div>

          {resumed && (
            <div className="mt-4">
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-primary-foreground/20">
                <div
                  className="h-full rounded-full bg-primary-foreground/90"
                  style={{ width: `${lessonPct * 100}%` }}
                />
              </div>
              <p className="mt-1.5 text-xs opacity-75">
                已刷到第 {pos + 1} / {cardTotal} 张
              </p>
            </div>
          )}
        </div>
      </Link>

      {/* 连续天数 + 总进度 */}
      <div className="mt-4 grid grid-cols-2 gap-3">
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Flame
              className={cn("size-3.5", streak > 0 ? "text-flame" : "opacity-50")}
            />
            连续学习
          </div>
          <p className="mt-2 text-2xl font-bold tabular-nums">
            {ready ? streak : "–"}
            <span className="ml-1 text-sm font-normal text-muted-foreground">天</span>
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {doneToday ? "今天已打卡" : "今天还没开始"}
          </p>
        </div>

        <div className="flex items-center gap-3 rounded-lg border border-border bg-card p-4">
          <div className="relative shrink-0">
            <Ring value={ready ? overallPct : 0} />
            <span className="absolute inset-0 flex items-center justify-center text-[11px] font-semibold tabular-nums">
              {ready ? Math.round(overallPct * 100) : 0}%
            </span>
          </div>
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">总进度</p>
            <p className="mt-1 text-lg font-bold tabular-nums leading-none">
              {ready ? progress.done.length : 0}
              <span className="text-sm font-normal text-muted-foreground">
                /{index.length}
              </span>
            </p>
            <p className="mt-1 text-xs text-muted-foreground">课</p>
          </div>
        </div>
      </div>

      {/* 快捷入口 */}
      <div className="mt-4 space-y-3">
        <Link
          href={`/${locale}/saved`}
          className="flex items-center gap-3 rounded-lg border border-border bg-card p-4 transition-colors active:bg-muted"
        >
          <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-flame/10">
            <Star className="size-[18px] text-flame" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold">生词本</span>
            <span className="block text-xs text-muted-foreground">
              {ready && progress.saved.length > 0
                ? `${progress.saved.length} 条收藏，随时重刷`
                : "刷课时点星标收藏难句"}
            </span>
          </span>
          <ArrowRight className="size-4 shrink-0 text-muted-foreground" />
        </Link>

        <Link
          href={`/${locale}/study`}
          className="flex items-center gap-3 rounded-lg border border-border bg-card p-4 transition-colors active:bg-muted"
        >
          <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-primary/10">
            <Sparkles className="size-[18px] text-primary" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold">全部课程</span>
            <span className="block text-xs text-muted-foreground">
              12 个 Stage · {index.length} 课
            </span>
          </span>
          <ArrowRight className="size-4 shrink-0 text-muted-foreground" />
        </Link>
      </div>

      {/* 12 个 Stage 的完成度一览，一眼看出走到哪了 */}
      <section className="mt-4 rounded-lg border border-border bg-card p-5">
        <div className="mb-3.5 flex items-baseline justify-between">
          <h2 className="text-sm font-semibold">Stage 进度</h2>
          <span className="text-xs text-muted-foreground">
            当前 Stage {nextUp.stage}
          </span>
        </div>
        <div className="flex items-end gap-1.5">
          {stages.map((s) => (
            <div key={s.stage} className="flex flex-1 flex-col items-center gap-1.5">
              <span className="flex h-12 w-full items-end overflow-hidden rounded-sm bg-muted">
                <span
                  className={cn(
                    "block w-full rounded-sm transition-[height] duration-500",
                    s.pct === 1 ? "bg-success" : "bg-primary",
                  )}
                  style={{ height: `${(ready ? s.pct : 0) * 100}%` }}
                />
              </span>
              <span
                className={cn(
                  "text-[10px] tabular-nums",
                  s.stage === nextUp.stage
                    ? "font-semibold text-primary"
                    : "text-muted-foreground",
                )}
              >
                {s.stage}
              </span>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
