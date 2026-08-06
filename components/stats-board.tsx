"use client";

import { useMemo, useState } from "react";
import { CalendarCheck, Flame, Layers, RotateCcw, Star } from "lucide-react";
import type { LessonSummary } from "@/lib/callan";
import { today, useProgress } from "@/lib/progress";
import { cn } from "@/lib/utils";

const WEEKDAYS = ["一", "二", "三", "四", "五", "六", "日"];

/** 近 N 天的日期，按周一起始补齐成整周 */
function calendarDays(weeks: number): string[] {
  const out: string[] = [];
  const now = new Date();
  // 让最后一行落在本周，往前推到周一
  const offsetToMonday = (now.getDay() + 6) % 7;
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + (6 - offsetToMonday));
  for (let i = weeks * 7 - 1; i >= 0; i--) {
    const d = new Date(end.getFullYear(), end.getMonth(), end.getDate() - i);
    const m = `${d.getMonth() + 1}`.padStart(2, "0");
    const day = `${d.getDate()}`.padStart(2, "0");
    out.push(`${d.getFullYear()}-${m}-${day}`);
  }
  return out;
}

function Stat({
  icon: Icon,
  label,
  value,
  unit,
  tone,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string | number;
  unit?: string;
  tone: "primary" | "flame" | "success";
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Icon
          className={cn(
            "size-3.5",
            tone === "flame" && "text-flame",
            tone === "primary" && "text-primary",
            tone === "success" && "text-success",
          )}
        />
        {label}
      </div>
      <p className="mt-2 text-2xl font-bold tabular-nums leading-none">
        {value}
        {unit && (
          <span className="ml-1 text-sm font-normal text-muted-foreground">{unit}</span>
        )}
      </p>
    </div>
  );
}

export function StatsBoard({ index }: { index: LessonSummary[] }) {
  const { progress, ready, streak, reset } = useProgress();
  const [confirming, setConfirming] = useState(false);

  const doneSet = useMemo(() => new Set(progress.done), [progress.done]);

  const learned = useMemo(() => {
    let words = 0;
    let examples = 0;
    for (const l of index) {
      if (doneSet.has(l.lesson)) {
        words += l.words;
        examples += l.examples;
      }
    }
    return { words, examples };
  }, [index, doneSet]);

  const days = useMemo(() => calendarDays(12), []);
  const daySet = useMemo(() => new Set(progress.days), [progress.days]);
  const now = today();

  const byStage = useMemo(() => {
    const m = new Map<number, { total: number; done: number }>();
    for (const l of index) {
      const cur = m.get(l.stage) ?? { total: 0, done: 0 };
      cur.total += 1;
      if (doneSet.has(l.lesson)) cur.done += 1;
      m.set(l.stage, cur);
    }
    return [...m.entries()].sort(([a], [b]) => a - b);
  }, [index, doneSet]);

  const pct = progress.done.length / index.length;

  return (
    <main className="mx-auto max-w-lg px-5 pt-12">
      <header className="mb-6">
        <h1 className="text-[28px] font-bold tracking-tight">数据</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {ready ? `已完成 ${progress.done.length} / ${index.length} 课` : " "}
        </p>
      </header>

      {/* 总进度条 */}
      <div className="mb-4 rounded-lg border border-border bg-card p-5">
        <div className="flex items-baseline justify-between">
          <span className="text-sm text-muted-foreground">总进度</span>
          <span className="text-2xl font-bold tabular-nums">
            {ready ? Math.round(pct * 100) : 0}
            <span className="text-base font-normal text-muted-foreground">%</span>
          </span>
        </div>
        <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-primary transition-[width] duration-500"
            style={{ width: `${(ready ? pct : 0) * 100}%` }}
          />
        </div>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-3">
        <Stat
          icon={Flame}
          label="连续学习"
          value={ready ? streak : 0}
          unit="天"
          tone="flame"
        />
        <Stat
          icon={CalendarCheck}
          label="累计打卡"
          value={ready ? progress.days.length : 0}
          unit="天"
          tone="success"
        />
        <Stat
          icon={Layers}
          label="学过的词组"
          value={ready ? learned.words.toLocaleString() : 0}
          tone="primary"
        />
        <Stat
          icon={Star}
          label="收藏例句"
          value={ready ? progress.saved.length : 0}
          tone="flame"
        />
      </div>

      {/* 打卡热力图 */}
      <section className="mb-4 rounded-lg border border-border bg-card p-5">
        <h2 className="text-sm font-semibold">最近 12 周</h2>
        <div className="mt-4 flex gap-2">
          <div className="flex flex-col justify-between py-px text-[9px] text-muted-foreground">
            {WEEKDAYS.map((d) => (
              <span key={d} className="leading-[10px]">
                {d}
              </span>
            ))}
          </div>
          <div className="grid flex-1 grid-flow-col grid-rows-7 gap-[3px]">
            {days.map((d) => {
              const active = daySet.has(d);
              const future = d > now;
              return (
                <span
                  key={d}
                  title={d}
                  className={cn(
                    "aspect-square w-full rounded-[2px]",
                    future
                      ? "bg-transparent"
                      : active
                        ? "bg-primary"
                        : "bg-muted",
                    d === now && "ring-1 ring-primary ring-offset-1 ring-offset-card",
                  )}
                />
              );
            })}
          </div>
        </div>
      </section>

      {/* 各 Stage 进度 */}
      <section className="mb-4 rounded-lg border border-border bg-card p-5">
        <h2 className="mb-4 text-sm font-semibold">各 Stage 进度</h2>
        <ul className="space-y-2.5">
          {byStage.map(([stage, s]) => {
            const p = s.done / s.total;
            return (
              <li key={stage} className="flex items-center gap-3">
                <span className="w-14 shrink-0 text-xs text-muted-foreground">
                  Stage {stage}
                </span>
                <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                  <span
                    className={cn(
                      "block h-full rounded-full transition-[width] duration-500",
                      p === 1 ? "bg-success" : "bg-primary",
                    )}
                    style={{ width: `${(ready ? p : 0) * 100}%` }}
                  />
                </span>
                <span className="w-10 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                  {ready ? s.done : 0}/{s.total}
                </span>
              </li>
            );
          })}
        </ul>
      </section>

      <div className="pb-4">
        {confirming ? (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                reset();
                setConfirming(false);
              }}
              className="flex-1 rounded-md bg-destructive px-4 py-2.5 text-sm font-semibold text-destructive-foreground active:scale-95"
            >
              确认清空全部进度
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="rounded-md border border-border px-4 py-2.5 text-sm font-medium active:bg-muted"
            >
              取消
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className="flex w-full items-center justify-center gap-1.5 rounded-md border border-border py-2.5 text-xs font-medium text-muted-foreground active:bg-muted"
          >
            <RotateCcw className="size-3.5" />
            清空进度
          </button>
        )}
        <p className="mt-3 text-center text-[11px] text-muted-foreground">
          进度保存在这台设备的浏览器里
        </p>
      </div>
    </main>
  );
}
