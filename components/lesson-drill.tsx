"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  BookOpen,
  Check,
  ChevronDown,
  Gauge,
  GraduationCap,
  Info,
  Languages,
  Lightbulb,
  List,
  MessagesSquare,
  RotateCcw,
  Sparkles,
  Star,
  Volume2,
  X,
} from "lucide-react";
import type { Lesson, LongSentence } from "@/lib/callan";
import { analyzePattern } from "@/lib/grammar";
import meaningsData from "@/data/callan/meanings.json";
import scenarioData from "@/data/callan/scenario.json";
import filledData from "@/data/callan/filled.json";
import { useProgress, type Saved } from "@/lib/progress";
import { useSpeech } from "@/lib/speech";
import { cn } from "@/lib/utils";

type Speech = ReturnType<typeof useSpeech>;

type Card =
  | { kind: "words"; words: string[]; note: string }
  | { kind: "qa"; id: string; words: string[]; q: string; a: string };

/** 课本原文里"..."仿说填空处的具体答案，由 scripts/build_filled.py 离线生成 */
const FILLED = filledData as Record<string, { q: string; a: string }>;

/** 把课本原文里的仿说填空换成 AI 补全的具体答案；没有生成过的条目保持原文不动 */
function applyFilled(lesson: Lesson): Lesson {
  return {
    ...lesson,
    groups: lesson.groups.map((g, gi) => ({
      ...g,
      examples: g.examples.map((ex, ei) => {
        const filled = FILLED[`${lesson.lesson}:${gi}:${ei}`];
        return filled ? { q: filled.q, a: filled.a } : ex;
      }),
    })),
  };
}

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

/**
 * 通览与新词卡共用：词条 + 音标或释义（词典/词表没收录的就只显示词），
 * 点击朗读；能朗读时右上角带一个小喇叭图标，别让人以为整块卡片只是展示。
 */
function WordChip({
  word,
  ipa,
  meaning,
  size = "sm",
  onSpeak,
  favorited,
  onToggleFavorite,
}: {
  word: string;
  ipa?: string;
  /** 中文释义，优先于音标展示 */
  meaning?: string;
  size?: "sm" | "lg";
  onSpeak?: (word: string) => void;
  favorited?: boolean;
  onToggleFavorite?: () => void;
}) {
  return (
    <div className="relative inline-flex flex-col items-center rounded-md bg-primary/10 transition-colors">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onSpeak?.(word);
        }}
        disabled={!onSpeak}
        className={cn(
          "flex flex-col items-center rounded-md transition-colors",
          onSpeak && "active:bg-primary/20",
          size === "lg" ? "px-4 py-2" : "px-2.5 py-1.5",
          onSpeak && (size === "lg" ? "pr-7" : "pr-5"),
          onToggleFavorite && (size === "lg" ? "pl-6" : "pl-4"),
        )}
      >
        {onSpeak && (
          <Volume2
            className={cn(
              "absolute right-1 top-1 text-primary/45",
              size === "lg" ? "size-3.5" : "size-2.5",
            )}
          />
        )}
        <span
          className={cn(
            "font-serif font-semibold text-primary",
            size === "lg" ? "text-xl" : "text-sm",
          )}
        >
          {word}
        </span>
        {meaning ? (
          <span
            className={cn(
              "mt-0.5 leading-tight text-muted-foreground",
              size === "lg" ? "text-xs" : "text-[10px]",
            )}
          >
            {meaning}
          </span>
        ) : (
          ipa && (
            // 不用 font-mono：等宽字体缺 IPA 字形，ˈ 会掉成 '、ː 会掉成 :
            <span
              className={cn(
                "mt-0.5 leading-tight text-primary/70",
                size === "lg" ? "text-xs" : "text-[10px]",
              )}
            >
              /{ipa}/
            </span>
          )
        )}
      </button>

      {onToggleFavorite && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onToggleFavorite();
          }}
          aria-label={favorited ? "取消收藏这个词" : "收藏这个词"}
          className={cn(
            "absolute left-1 top-1 text-primary/45 transition-colors active:text-flame",
            favorited && "text-flame",
          )}
        >
          <Star
            className={cn(
              size === "lg" ? "size-3.5" : "size-2.5",
              favorited && "fill-current",
            )}
          />
        </button>
      )}
    </div>
  );
}

/** 通览页问答句的折叠语法标签：规则匹配句型/时态，无标签时不渲染 */
type StoredMeaning = { q: string; a: string };
const LESSON_MEANINGS = meaningsData as Record<string, StoredMeaning>;
/** 场景解析：这句典型用在什么情境、为什么这么问，由 scripts/build_scenario.py 离线生成 */
const LESSON_SCENARIOS = scenarioData as Record<string, string>;

/** 教材原文保持不动；中文句意与场景解析都来自离线生成的数据，不产生运行费用。 */
function SentenceTools({
  q,
  a,
  meaning,
  scenario,
}: {
  q: string;
  a: string;
  meaning?: StoredMeaning;
  scenario?: string;
}) {
  const [open, setOpen] = useState(false);
  const [meaningOpen, setMeaningOpen] = useState(false);
  const [scenarioOpen, setScenarioOpen] = useState(false);
  const tags = useMemo(() => analyzePattern(q, a), [q, a]);
  const hasTextbookBlank = /(?:\.{3}|…)/.test(`${q} ${a}`);

  const toggleMeaning = (e: React.MouseEvent) => {
    e.stopPropagation();
    setMeaningOpen((value) => !value);
  };
  const toggleScenario = (e: React.MouseEvent) => {
    e.stopPropagation();
    setScenarioOpen((value) => !value);
  };

  return (
    <div className="mt-2 border-t border-border/70 pt-2">
      <div className="flex items-center gap-4">
        {tags && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setOpen((v) => !v);
            }}
            className="flex items-center gap-1 text-[11px] font-medium text-muted-foreground active:text-foreground"
          >
            <GraduationCap className="size-3.5" />
            语法要点
            <ChevronDown className={cn("size-3 transition-transform", open && "rotate-180")} />
          </button>
        )}
        <button
          type="button"
          onClick={toggleMeaning}
          className="flex items-center gap-1 text-[11px] font-medium text-muted-foreground active:text-foreground"
        >
          <Languages className="size-3.5" />
          句意
          <ChevronDown className={cn("size-3 transition-transform", meaningOpen && "rotate-180")} />
        </button>
        <button
          type="button"
          onClick={toggleScenario}
          className="flex items-center gap-1 text-[11px] font-medium text-muted-foreground active:text-foreground"
        >
          <Lightbulb className="size-3.5" />
          场景解析
          <ChevronDown className={cn("size-3 transition-transform", scenarioOpen && "rotate-180")} />
        </button>
        {hasTextbookBlank && (
          <span className="text-[10px] text-muted-foreground/70" title="教材原文故意留空，需按本人情况补全">
          </span>
        )}
      </div>
      {open && tags && (
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {tags.map((tag) => (
            <span
              key={tag}
              className="rounded-md bg-accent px-2 py-0.5 text-[11px] font-medium text-accent-foreground"
            >
              {tag}
            </span>
          ))}
        </div>
      )}
      {meaningOpen && (
        <div className="mt-2 rounded-md bg-muted/60 p-2.5 text-[12px] leading-relaxed text-muted-foreground">
          {meaning ? (
            <div className="space-y-1.5">
              <p><span className="font-medium text-foreground">问：</span>{meaning.q}</p>
              <p><span className="font-medium text-primary">答：</span>{meaning.a}</p>
            </div>
          ) : (
            "本句句意正在校订中。"
          )}
        </div>
      )}
      {scenarioOpen && (
        <div className="mt-2 rounded-md bg-muted/60 p-2.5 text-[12px] leading-relaxed text-muted-foreground">
          {scenario ?? "场景解析正在生成中。"}
        </div>
      )}
    </div>
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

/**
 * 长句拆读：滚雪球跟读——从第一个分句开始，每按一次「接下一句」就把下一块拼进
 * 已读的句子里重读一遍，练到最后一步就是完整长句，练的是「组合说出来」而不只是听。
 */
function LongSentenceDrill({ data, speech }: { data: LongSentence; speech: Speech }) {
  const [step, setStep] = useState(0);
  useEffect(() => setStep(0), [data.q]);

  const chunks = data.chunks;
  const done = step >= chunks.length - 1;
  const built = chunks.slice(0, step).join(" ");
  const current = chunks[step];

  return (
    <div>
      <div className="rounded-md border border-border bg-card p-3.5">
        <p className="text-[12.5px] font-semibold text-primary">{data.backbone}</p>
        <p className="mt-1 text-[12.5px] leading-relaxed text-muted-foreground">
          {data.gloss}
        </p>

        <div className="mt-3 rounded-md bg-primary/[0.06] p-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-primary">
            怎么搭出来
          </p>
          <p className="mt-1.5 text-[12.5px] leading-relaxed text-foreground">
            {data.rule}
          </p>
          <p className="mt-2 border-t border-primary/10 pt-2 font-serif text-[12.5px] leading-relaxed text-muted-foreground">
            {data.example}
          </p>
        </div>

        <div className="mt-3 flex items-center justify-between">
          <p className="text-[10px] font-medium uppercase tracking-[0.1em] text-muted-foreground">
            滚雪球跟读 · {step + 1}/{chunks.length}
          </p>
          {step > 0 && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setStep(0);
              }}
              className="text-[11px] text-muted-foreground active:text-foreground"
            >
              重来
            </button>
          )}
        </div>

        <p className="mt-2 rounded-md bg-muted/40 p-3 font-serif text-[15px] leading-relaxed">
          {built && `${built} `}
          <span className="font-semibold text-primary">{current}</span>
        </p>

        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              speech.speak(built ? `${built} ${current}` : current);
            }}
            disabled={!speech.supported}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-md bg-primary/10 px-3 py-2 text-xs font-semibold text-primary transition-colors active:bg-primary/20 disabled:opacity-50"
          >
            <Volume2 className="size-3.5" />
            跟读这一段
          </button>
          {!done ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setStep((s) => Math.min(s + 1, chunks.length - 1));
              }}
              className="flex-1 rounded-md bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground transition-transform active:scale-[0.98]"
            >
              接下一句 →
            </button>
          ) : (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                speech.speak(data.q);
              }}
              disabled={!speech.supported}
              className="flex-1 rounded-md bg-success px-3 py-2 text-xs font-semibold text-success-foreground transition-transform active:scale-[0.98] disabled:opacity-50"
            >
              整句跟读 ✓
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/** 长句拆读区：本课最多 3 句候选，标签切换，每句独立一套滚雪球跟读进度 */
function LongSentenceSection({
  sentences,
  speech,
}: {
  sentences: LongSentence[];
  speech: Speech;
}) {
  const [active, setActive] = useState(0);
  useEffect(() => setActive(0), [sentences]);

  if (sentences.length === 0) return null;

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <BlockLabel icon={MessagesSquare}>长句拆读</BlockLabel>
        {sentences.length > 1 && (
          <div className="mb-2 flex gap-1">
            {sentences.map((_, n) => (
              <button
                key={n}
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setActive(n);
                }}
                className={cn(
                  "flex size-6 items-center justify-center rounded-md text-[11px] font-semibold transition-colors",
                  active === n
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground active:bg-accent",
                )}
              >
                {n + 1}
              </button>
            ))}
          </div>
        )}
      </div>
      <LongSentenceDrill key={active} data={sentences[active]} speech={speech} />
    </div>
  );
}

/** 课末小结：默认折叠，展开后回顾本课语法/句型讲解、长句拆读、全部词汇（带发音+释义），内容均为 AI 生成 */
function LessonSummary({
  lesson,
  gloss,
  grammar,
  longSentences,
  speech,
  isFavorited,
  onToggleFavorite,
}: {
  lesson: Lesson;
  /** 词条 → 中文释义 */
  gloss: Record<string, string>;
  /** AI 生成的本课语法/句型讲解要点 */
  grammar: string[];
  /** AI 生成的长句拆读，最多 3 句，覆盖不到时为空数组 */
  longSentences: LongSentence[];
  speech: Speech;
  isFavorited: (word: string) => boolean;
  onToggleFavorite: (word: string) => void;
}) {
  const [open, setOpen] = useState(false);

  const words = useMemo(
    () => [...new Set(lesson.groups.flatMap((g) => g.words))],
    [lesson],
  );

  if (grammar.length === 0 && longSentences.length === 0 && words.length === 0) return null;

  return (
    <section className="rounded-xl border border-primary/25 bg-primary/[0.04]">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 p-4 text-left"
      >
        <Sparkles className="size-4 shrink-0 text-primary" />
        <span className="flex-1 text-sm font-semibold">本课小结</span>
        <ChevronDown
          className={cn(
            "size-4 shrink-0 text-muted-foreground transition-transform",
            open && "rotate-180",
          )}
        />
      </button>

      {open && (
        <div className="space-y-5 border-t border-primary/15 px-4 pb-5 pt-4">
          {grammar.length > 0 && (
            <div>
              <BlockLabel icon={GraduationCap}>语法与句型讲解</BlockLabel>
              <ol className="space-y-2">
                {grammar.map((point, n) => (
                  <li
                    key={n}
                    className="flex gap-2.5 rounded-md border border-border bg-muted/50 p-3 text-[13px] leading-relaxed text-muted-foreground"
                  >
                    <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] font-semibold tabular-nums text-primary">
                      {n + 1}
                    </span>
                    <span>{point}</span>
                  </li>
                ))}
              </ol>
            </div>
          )}

          <LongSentenceSection sentences={longSentences} speech={speech} />

          {words.length > 0 && (
            <div>
              <BlockLabel icon={BookOpen}>词汇 · {words.length}</BlockLabel>
              <div className="flex flex-wrap gap-1.5">
                {words.map((w, n) => (
                  <WordChip
                    key={`${w}-${n}`}
                    word={w}
                    meaning={gloss[w]}
                    onSpeak={speech.supported ? speech.speak : undefined}
                    favorited={isFavorited(w)}
                    onToggleFavorite={() => onToggleFavorite(w)}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

export function LessonDrill({
  lesson: rawLesson,
  ipa,
  gloss,
  grammar,
  longSentences,
  locale,
  next,
}: {
  lesson: Lesson;
  /** 本课词条的英式音标，缺词条就是词典没收录 */
  ipa: Record<string, string>;
  /** 本课词条的中文释义，缺词条就是词表没收录 */
  gloss: Record<string, string>;
  /** AI 生成的本课语法讲解要点 */
  grammar: string[];
  /** AI 生成的长句拆读，最多 3 句，覆盖不到时为空数组 */
  longSentences: LongSentence[];
  locale: string;
  next: number | null;
}) {
  const lesson = useMemo(() => applyFilled(rawLesson), [rawLesson]);
  const cards = useMemo(() => buildCards(lesson), [lesson]);
  const { progress, ready, markDone, touch, setPos, toggleSaved, toggleSavedWord } =
    useProgress();
  const speech = useSpeech();

  const [i, setI] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [overview, setOverview] = useState(false);
  const [showRate, setShowRate] = useState(false);
  const bootRef = useRef(false);
  const jumpGroupRef = useRef<string | null>(null);

  // 从生词本点收藏词跳转过来：带着 ?g=组号，落地就切通览并滚到那一组
  useEffect(() => {
    const g = new URLSearchParams(window.location.search).get("g");
    if (g == null) return;
    jumpGroupRef.current = g;
    setOverview(true);
  }, []);

  useEffect(() => {
    if (!overview || jumpGroupRef.current == null) return;
    const id = jumpGroupRef.current;
    jumpGroupRef.current = null;
    requestAnimationFrame(() => {
      document.getElementById(`lesson-group-${id}`)?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    });
  }, [overview]);

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
  const savedWordsSet = useMemo(
    () => new Set(progress.savedWords),
    [progress.savedWords],
  );
  const isWordFavorited = useCallback(
    (w: string) => savedWordsSet.has(w.trim().toLowerCase()),
    [savedWordsSet],
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
            <section
              key={gi}
              id={`lesson-group-${gi}`}
              className="rounded-xl border border-border/70 bg-card/40 p-4"
            >
              {/* 组号：一课几十张卡，没有编号很难知道自己在哪 */}
              <div className="mb-3.5 flex items-center gap-3">
                <span className="text-[11px] font-medium tabular-nums text-muted-foreground">
                  {String(gi + 1).padStart(2, "0")}
                </span>
                <span className="h-px flex-1 bg-border" />
              </div>

              {g.words.length > 0 && (
                <div className="mb-4 rounded-lg bg-primary/5 p-3">
                  <BlockLabel icon={BookOpen}>词汇 · {g.words.length}</BlockLabel>
                  <div className="flex flex-wrap gap-1.5">
                    {g.words.map((w, i) => (
                      <WordChip
                        key={`${w}-${i}`}
                        word={w}
                        ipa={ipa[w]}
                        onSpeak={speech.supported ? speech.speak : undefined}
                        favorited={isWordFavorited(w)}
                        onToggleFavorite={() => toggleSavedWord(w)}
                      />
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
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <p className="font-serif text-[15px] font-medium leading-relaxed">
                              {ex.q}
                            </p>
                            <p className="mt-1.5 font-serif text-[15px] leading-relaxed text-primary">
                              {ex.a}
                            </p>
                          </div>
                          {speech.supported && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                speech.speak(`${ex.q} ${ex.a}`);
                              }}
                              aria-label="朗读这句"
                              className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground active:bg-muted"
                            >
                              <Volume2 className="size-4" />
                            </button>
                          )}
                        </div>
                        <SentenceTools
                          q={ex.q}
                          a={ex.a}
                          meaning={LESSON_MEANINGS[`${lesson.lesson}:${gi}:${ei}`]}
                          scenario={LESSON_SCENARIOS[`${lesson.lesson}:${gi}:${ei}`]}
                        />
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </section>
          ))}

          <LessonSummary
            lesson={lesson}
            gloss={gloss}
            grammar={grammar}
            longSentences={longSentences}
            speech={speech}
            isFavorited={isWordFavorited}
            onToggleFavorite={toggleSavedWord}
          />

          <button
            type="button"
            onClick={() => markDone(lesson.lesson)}
            disabled={isDone}
            className="flex w-full items-center justify-center gap-2 rounded-md bg-success p-4 text-sm font-semibold text-success-foreground transition-transform active:scale-[0.98] disabled:opacity-60"
          >
            <Check className="size-4" />
            {isDone ? "已完成" : "本课学完了"}
          </button>

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
                  <WordChip
                    key={`${w}-${n}`}
                    word={w}
                    ipa={ipa[w]}
                    size="lg"
                    onSpeak={speech.supported ? speech.speak : undefined}
                    favorited={isWordFavorited(w)}
                    onToggleFavorite={() => toggleSavedWord(w)}
                  />
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
