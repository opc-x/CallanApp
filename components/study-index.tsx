"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import type { LessonSummary } from "@/lib/callan";
import { useProgress } from "@/lib/progress";
import { cn } from "@/lib/utils";

type StageBlock = {
  stage: number;
  lessons: LessonSummary[];
  words: number;
  examples: number;
};

export function StudyIndex({
  outline,
  locale,
}: {
  outline: StageBlock[];
  locale: string;
}) {
  const { progress, ready } = useProgress();
  const doneSet = useMemo(() => new Set(progress.done), [progress.done]);

  const nextUp = useMemo(() => {
    for (const s of outline) {
      for (const l of s.lessons) {
        if (!doneSet.has(l.lesson)) return l.lesson;
      }
    }
    return outline[outline.length - 1].lessons.slice(-1)[0].lesson;
  }, [outline, doneSet]);

  const activeStage = useMemo(
    () => outline.find((s) => s.lessons.some((l) => l.lesson === nextUp))?.stage ?? 1,
    [outline, nextUp],
  );
  const [open, setOpen] = useState<number | null>(null);
  const expanded = open ?? activeStage;

  return (
    <main className="mx-auto max-w-lg px-5 pt-12">
      <header className="mb-6">
        <h1 className="text-[28px] font-bold tracking-tight">课程</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          12 个 Stage · 191 课，循序渐进
        </p>
      </header>

      <div className="space-y-2.5">
        {outline.map((s) => {
          const doneCount = s.lessons.filter((l) => doneSet.has(l.lesson)).length;
          const pct = doneCount / s.lessons.length;
          const isOpen = expanded === s.stage;
          const first = s.lessons[0].lesson;
          const lastNum = s.lessons[s.lessons.length - 1].lesson;

          return (
            <section
              key={s.stage}
              className="overflow-hidden rounded-lg border border-border bg-card"
            >
              <button
                type="button"
                onClick={() => setOpen(isOpen ? -1 : s.stage)}
                className="flex w-full items-center gap-3 p-4 text-left transition-colors active:bg-muted"
              >
                <span
                  className={cn(
                    "relative flex size-11 shrink-0 items-center justify-center rounded-md text-sm font-bold",
                    pct === 1
                      ? "bg-success text-success-foreground"
                      : "bg-primary/10 text-primary",
                  )}
                >
                  {pct === 1 ? <Check className="size-5" /> : s.stage}
                </span>

                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] font-semibold">
                    Stage {s.stage}
                  </span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    Lesson {first}–{lastNum} · {s.words} 词 · {s.examples} 例句
                  </span>
                  {ready && doneCount > 0 && (
                    <span className="mt-2 block h-1 w-full overflow-hidden rounded-full bg-muted">
                      <span
                        className="block h-full rounded-full bg-primary"
                        style={{ width: `${pct * 100}%` }}
                      />
                    </span>
                  )}
                </span>

                {ready && doneCount > 0 && (
                  <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                    {doneCount}/{s.lessons.length}
                  </span>
                )}
                <ChevronDown
                  className={cn(
                    "size-4 shrink-0 text-muted-foreground transition-transform",
                    isOpen && "rotate-180",
                  )}
                />
              </button>

              {isOpen && (
                <ul className="grid grid-cols-3 gap-2 border-t border-border p-3">
                  {s.lessons.map((l) => {
                    const done = doneSet.has(l.lesson);
                    const isNext = l.lesson === nextUp;
                    return (
                      <li key={l.lesson}>
                        <Link
                          href={`/${locale}/study/${l.lesson}`}
                          className={cn(
                            "flex flex-col items-center justify-center gap-0.5 rounded-md border py-3 transition-colors active:scale-95",
                            done
                              ? "border-success/30 bg-success/10 text-success"
                              : isNext
                                ? "border-primary bg-primary text-primary-foreground"
                                : "border-border text-foreground active:bg-muted",
                          )}
                        >
                          <span className="text-[15px] font-semibold tabular-nums">
                            {l.lesson}
                          </span>
                          <span
                            className={cn(
                              "text-[10px]",
                              done || isNext ? "opacity-80" : "text-muted-foreground",
                            )}
                          >
                            {done ? "已完成" : `${l.examples} 句`}
                          </span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          );
        })}
      </div>
    </main>
  );
}
