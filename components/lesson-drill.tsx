"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  BookOpen,
  Check,
  Gauge,
  Info,
  List,
  MessagesSquare,
  RotateCcw,
  Star,
  Volume2,
  X,
} from "lucide-react";
import type { Lesson } from "@/lib/callan";
import { useProgress, type Saved } from "@/lib/progress";
import { useSpeech } from "@/lib/speech";
import { cn } from "@/lib/utils";

type Card =
  | { kind: "words"; words: string[]; note: string }
  | { kind: "qa"; id: string; words: string[]; q: string; a: string };

function buildCards(lesson: Lesson): Card[] {
  const cards: Card[] = [];
  lesson.groups.forEach((g, gi) => {
    if (g.words.length || g.note) {
      cards.push({ kind: "words", words: g.words, note: g.note });
    }
    g.examples.forEach((ex, ei) => {
      cards.push({
        kind: "qa",
        id: `${lesson.lesson}:${gi}:${ei}`,
        words: g.words,
        q: ex.q,
        a: ex.a,
      });
    });
  });
  return cards;
}

const RATES = [0.8, 1, 1.25, 1.5];

function Chips({ words }: { words: string[] }) {
  if (words.length === 0) return null;
  return (
    <div className="flex flex-wrap justify-center gap-1.5">
      {words.map((w, i) => (
        <span
          key={`${w}-${i}`}
          className="rounded-md bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary"
        >
          {w}
        </span>
      ))}
    </div>
  );
}

/** 通览与新词卡共用：词条 + 音标（词典没收录的词就只显示词） */
function WordChip({
  word,
  ipa,
  size = "sm",
}: {
  word: string;
  ipa?: string;
  size?: "sm" | "lg";
}) {
  return (
    <span
      className={cn(
        "inline-flex flex-col items-center rounded-md bg-primary/10",
        size === "lg" ? "px-4 py-2" : "px-2.5 py-1.5",
      )}
    >
      <span
        className={cn(
          "font-serif font-semibold text-primary",
          size === "lg" ? "text-xl" : "text-sm",
        )}
      >
        {word}
      </span>
      {ipa && (
        // 不用 font-mono：等宽字体缺 IPA 字形，ˈ 会掉成 '、ː 会掉成 :
        <span
          className={cn(
            "mt-0.5 leading-tight text-primary/70",
            size === "lg" ? "text-xs" : "text-[10px]",
          )}
        >
          /{ipa}/
        </span>
      )}
    </span>
  );
}

/** 通览里区分「词汇 / 课本说明 / 问答」三种内容 */
function BlockLabel({
  icon: Icon,
  children,
}: {
  icon: typeof BookOpen;
  children: React.ReactNode;
}) {
  return (
    <p className="mb-2 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
      <Icon className="size-3.5" />
      {children}
    </p>
  );
}

export function LessonDrill({
  lesson,
  ipa,
  locale,
  next,
}: {
  lesson: Lesson;
  /** 本课词条的英式音标，缺词条就是词典没收录 */
  ipa: Record<string, string>;
  locale: string;
  next: number | null;
}) {
  const cards = useMemo(() => buildCards(lesson), [lesson]);
  const { progress, ready, markDone, touch, setPos, toggleSaved } = useProgress();
  const speech = useSpeech();

  const [i, setI] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [overview, setOverview] = useState(false);
  const [showRate, setShowRate] = useState(false);
  const bootRef = useRef(false);

  // 挂载后恢复上次进度（服务端渲染时 localStorage 还读不到）
  useEffect(() => {
    if (!ready || bootRef.current) return;
    bootRef.current = true;
    touch(lesson.lesson);
    const saved = progress.pos[String(lesson.lesson)] ?? 0;
    if (saved > 0 && saved < cards.length) setI(saved);
  }, [ready, touch, lesson.lesson, progress.pos, cards.length]);

  useEffect(() => {
    if (bootRef.current) setPos(lesson.lesson, i);
  }, [i, lesson.lesson, setPos]);

  const card = cards[i];
  const isDone = progress.done.includes(lesson.lesson);
  const atEnd = i >= cards.length - 1;
  const savedIds = useMemo(
    () => new Set(progress.saved.map((s) => s.id)),
    [progress.saved],
  );

  const stopSpeech = speech.stop;
  const go = useCallback(
    (delta: number) => {
      stopSpeech();
      setI((prev) => {
        const n = Math.min(Math.max(prev + delta, 0), cards.length - 1);
        if (n !== prev) setRevealed(false);
        return n;
      });
    },
    [cards.length, stopSpeech],
  );

  // 空格既是「看答案」也是「下一张」，单手就能刷
  const advance = useCallback(() => {
    if (card?.kind === "qa" && !revealed) setRevealed(true);
    else go(1);
  }, [card, revealed, go]);

  // 自动朗读：问句出现时念问句，答案揭晓时念答案
  const autoRef = useRef("");
  const { auto: autoSpeak, speak } = speech;
  useEffect(() => {
    if (!autoSpeak || overview || card?.kind !== "qa") return;
    const key = `${i}:${revealed}`;
    if (autoRef.current === key) return;
    autoRef.current = key;
    speak(revealed ? card.a : card.q);
  }, [autoSpeak, speak, overview, card, revealed, i]);

  useEffect(() => {
    if (overview) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") go(1);
      else if (e.key === "ArrowLeft") go(-1);
      else if (e.key === " " || e.key === "Enter") {
        e.preventDefault();
        advance();
      } else return;
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [overview, go, advance]);

  // 左右滑动翻卡
  const touchRef = useRef<{ x: number; y: number } | null>(null);
  const onTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0];
    touchRef.current = { x: t.clientX, y: t.clientY };
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    const start = touchRef.current;
    touchRef.current = null;
    if (!start) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;
    if (Math.abs(dx) < 50 || Math.abs(dx) < Math.abs(dy)) return;
    go(dx < 0 ? 1 : -1);
  };

  const savedItem: Saved | null =
    card?.kind === "qa"
      ? {
          id: card.id,
          lesson: lesson.lesson,
          words: card.words,
          q: card.q,
          a: card.a,
        }
      : null;

  const topBar = (
    <header className="sticky top-0 z-20 bg-background/85 backdrop-blur-xl">
      <div className="mx-auto flex max-w-lg items-center gap-2 px-3 py-2.5">
        <Link
          href={`/${locale}/study`}
          aria-label="退出本课"
          className="flex size-9 items-center justify-center rounded-md text-muted-foreground transition-colors active:bg-muted"
        >
          <X className="size-5" />
        </Link>

        <div className="min-w-0 flex-1 text-center">
          <p className="truncate text-sm font-semibold">Lesson {lesson.lesson}</p>
          <p className="text-[11px] text-muted-foreground">
            Stage {lesson.stage} · {overview ? "通览" : `${i + 1}/${cards.length}`}
          </p>
        </div>

        <button
          type="button"
          onClick={() => setOverview((v) => !v)}
          aria-label={overview ? "回到逐条模式" : "通览全课"}
          className={cn(
            "flex size-9 items-center justify-center rounded-md transition-colors active:bg-muted",
            overview ? "text-primary" : "text-muted-foreground",
          )}
        >
          <List className="size-5" />
        </button>
      </div>

      {!overview && (
        <div className="h-1 w-full bg-border/60">
          <div
            className="h-full bg-primary transition-[width] duration-300"
            style={{ width: `${((i + 1) / cards.length) * 100}%` }}
          />
        </div>
      )}
    </header>
  );

  if (overview) {
    return (
      <div className="min-h-screen bg-background">
        {topBar}
        <main className="mx-auto max-w-lg space-y-8 px-5 py-6">
          {lesson.groups.map((g, gi) => (
            <section key={gi}>
              {/* 组号：一课几十张卡，没有编号很难知道自己在哪 */}
              <div className="mb-3 flex items-center gap-3">
                <span className="text-[11px] font-medium tabular-nums text-muted-foreground">
                  {String(gi + 1).padStart(2, "0")}
                </span>
                <span className="h-px flex-1 bg-border" />
              </div>

              {g.words.length > 0 && (
                <div className="mb-4">
                  <BlockLabel icon={BookOpen}>词汇 · {g.words.length}</BlockLabel>
                  <div className="flex flex-wrap gap-1.5">
                    {g.words.map((w, i) => (
                      <WordChip key={`${w}-${i}`} word={w} ipa={ipa[w]} />
                    ))}
                  </div>
                </div>
              )}

              {g.note && (
                <div className="mb-4">
                  <BlockLabel icon={Info}>课本说明</BlockLabel>
                  <p className="rounded-md border border-border bg-muted/50 p-3 text-[13px] leading-relaxed text-muted-foreground">
                    {g.note}
                  </p>
                </div>
              )}

              {g.examples.length > 0 && (
                <div>
                  <BlockLabel icon={MessagesSquare}>
                    问答 · {g.examples.length} 句
                  </BlockLabel>
                  <ul className="space-y-2">
                    {g.examples.map((ex, ei) => (
                      <li
                        key={ei}
                        className="rounded-md border border-border bg-card p-3.5"
                      >
                        <p className="font-serif text-[15px] font-medium leading-relaxed">
                          {ex.q}
                        </p>
                        <p className="mt-1.5 font-serif text-[15px] leading-relaxed text-primary">
                          {ex.a}
                        </p>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </section>
          ))}
          {next && (
            <Link
              href={`/${locale}/study/${next}`}
              className="flex items-center justify-center gap-2 rounded-md border border-border bg-card p-4 text-sm font-medium active:bg-muted"
            >
              下一课 Lesson {next}
              <ArrowRight className="size-4" />
            </Link>
          )}
        </main>
      </div>
    );
  }

  if (!card) {
    return (
      <div className="min-h-screen bg-background">
        {topBar}
        <p className="p-16 text-center text-muted-foreground">本课暂无内容。</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      {topBar}

      <main
        className="flex flex-1 select-none flex-col items-center justify-center px-6 py-8"
        onClick={advance}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        <div key={i} className="w-full max-w-lg animate-card-in">
          {card.kind === "words" ? (
            <div className="text-center">
              <p className="mb-6 text-[11px] font-medium uppercase tracking-[0.2em] text-muted-foreground">
                新词 · 词组
              </p>
              <div className="flex flex-wrap justify-center gap-2.5">
                {card.words.map((w, n) => (
                  <WordChip key={`${w}-${n}`} word={w} ipa={ipa[w]} size="lg" />
                ))}
              </div>
              {card.note && (
                <p className="mx-auto mt-7 max-w-md text-left text-[13px] leading-relaxed text-muted-foreground">
                  {card.note}
                </p>
              )}
            </div>
          ) : (
            <div>
              <Chips words={card.words} />

              <p className="mt-7 text-center font-serif text-[27px] font-semibold leading-[1.35] tracking-tight">
                {card.q}
              </p>

              <div className="mt-7 min-h-28">
                {revealed ? (
                  <p className="animate-reveal-in text-center font-serif text-[22px] leading-relaxed text-primary">
                    {card.a}
                  </p>
                ) : (
                  <div className="flex flex-col items-center gap-2 pt-6 text-muted-foreground">
                    <span className="h-px w-16 bg-border" />
                    <span className="text-xs">点一下看答案</span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </main>

      {showRate && (
        <div className="mx-auto mb-2 flex max-w-lg items-center justify-center gap-2 px-5">
          {RATES.map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => {
                speech.setRate(r);
                setShowRate(false);
              }}
              className={cn(
                "rounded-md px-3 py-1.5 text-xs font-medium tabular-nums transition-colors",
                speech.rate === r
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground active:bg-accent",
              )}
            >
              {r}×
            </button>
          ))}
        </div>
      )}

      <footer className="sticky bottom-0 border-t border-border bg-background/90 pb-safe backdrop-blur-xl">
        <div className="mx-auto flex max-w-lg items-center gap-1 px-3 py-2.5">
          {speech.supported ? (
            <>
              <button
                type="button"
                onClick={() =>
                  card.kind === "qa" && speech.speak(revealed ? card.a : card.q)
                }
                disabled={card.kind !== "qa"}
                aria-label="朗读"
                className={cn(
                  "flex size-10 items-center justify-center rounded-md transition-colors active:bg-muted disabled:opacity-30",
                  speech.speaking ? "text-primary" : "text-muted-foreground",
                )}
              >
                <Volume2 className="size-5" />
              </button>
              <button
                type="button"
                onClick={() => setShowRate((v) => !v)}
                aria-label="语速"
                className="flex h-10 items-center gap-1 rounded-md px-2 text-xs font-medium tabular-nums text-muted-foreground transition-colors active:bg-muted"
              >
                <Gauge className="size-4" />
                {speech.rate}×
              </button>
              <button
                type="button"
                onClick={speech.toggleAuto}
                className={cn(
                  "h-10 rounded-md px-2 text-xs font-medium transition-colors active:bg-muted",
                  speech.auto ? "text-primary" : "text-muted-foreground",
                )}
              >
                自动
              </button>
            </>
          ) : (
            <span className="w-10" />
          )}

          <span className="flex-1" />

          <button
            type="button"
            onClick={() => savedItem && toggleSaved(savedItem)}
            disabled={!savedItem}
            aria-label="收藏这句"
            className={cn(
              "flex size-10 items-center justify-center rounded-md transition-colors active:bg-muted disabled:opacity-30",
              savedItem && savedIds.has(savedItem.id)
                ? "text-flame"
                : "text-muted-foreground",
            )}
          >
            <Star
              className={cn(
                "size-5",
                savedItem && savedIds.has(savedItem.id) && "fill-current",
              )}
            />
          </button>

          {atEnd ? (
            <button
              type="button"
              onClick={() => markDone(lesson.lesson)}
              disabled={isDone}
              className="flex h-10 items-center gap-1.5 rounded-md bg-success px-4 text-sm font-semibold text-success-foreground transition-transform active:scale-95 disabled:opacity-60"
            >
              <Check className="size-4" />
              {isDone ? "已完成" : "完成"}
            </button>
          ) : (
            <button
              type="button"
              onClick={advance}
              className="flex h-10 items-center gap-1.5 rounded-md bg-primary px-5 text-sm font-semibold text-primary-foreground transition-transform active:scale-95"
            >
              {card.kind === "qa" && !revealed ? "看答案" : "下一张"}
              <ArrowRight className="size-4" />
            </button>
          )}
        </div>

        {atEnd && (
          <div className="mx-auto flex max-w-lg items-center justify-center gap-2 px-3 pb-3">
            <button
              type="button"
              onClick={() => {
                setI(0);
                setRevealed(false);
              }}
              className="flex items-center gap-1.5 rounded-md px-3 py-2 text-xs font-medium text-muted-foreground active:bg-muted"
            >
              <RotateCcw className="size-3.5" />
              重刷本课
            </button>
            {next && (
              <Link
                href={`/${locale}/study/${next}`}
                className="flex items-center gap-1.5 rounded-md border border-border px-3 py-2 text-xs font-medium active:bg-muted"
              >
                下一课 Lesson {next}
                <ArrowRight className="size-3.5" />
              </Link>
            )}
          </div>
        )}
      </footer>
    </div>
  );
}
