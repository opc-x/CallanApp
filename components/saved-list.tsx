"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Eye, EyeOff, MapPin, Shuffle, Star, Volume2 } from "lucide-react";
import { useProgress } from "@/lib/progress";
import { useSpeech } from "@/lib/speech";
import { cn } from "@/lib/utils";

type WordLocation = { lesson: number; gi: number };

/** 收藏的单词一栏：点词跳到它在教材里第一次出现的那一组 */
function SavedWords({ locale }: { locale: string }) {
  const { progress, ready, toggleSavedWord } = useProgress();
  const speech = useSpeech();
  const [locations, setLocations] = useState<Record<string, WordLocation | null>>({});

  const words = progress.savedWords;

  useEffect(() => {
    const pending = words.filter((w) => !(w in locations));
    if (pending.length === 0) return;
    let cancelled = false;
    Promise.all(
      pending.map(async (w) => {
        try {
          const res = await fetch(`/api/v1/word-location?word=${encodeURIComponent(w)}`);
          const loc: WordLocation | null = res.ok ? await res.json() : null;
          return [w, loc] as const;
        } catch {
          return [w, null] as const;
        }
      }),
    ).then((entries) => {
      if (cancelled) return;
      setLocations((prev) => ({ ...prev, ...Object.fromEntries(entries) }));
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [words.join(",")]);

  if (!ready || words.length === 0) return null;

  return (
    <section className="mb-6">
      <h2 className="mb-2.5 text-sm font-semibold">收藏的单词 · {words.length}</h2>
      <ul className="flex flex-wrap gap-2">
        {words.map((w) => {
          const loc = locations[w];
          const href = loc ? `/${locale}/study/${loc.lesson}?g=${loc.gi}` : null;
          return (
            <li
              key={w}
              className="flex items-center gap-1 rounded-md border border-border bg-card py-1 pl-2.5 pr-1"
            >
              {href ? (
                <Link href={href} className="flex items-center gap-1 text-sm font-medium">
                  <MapPin className="size-3 text-muted-foreground" />
                  {w}
                </Link>
              ) : (
                <span className="text-sm font-medium">{w}</span>
              )}
              {speech.supported && (
                <button
                  type="button"
                  onClick={() => speech.speak(w)}
                  aria-label="朗读"
                  className="rounded p-1 text-muted-foreground active:bg-muted"
                >
                  <Volume2 className="size-3.5" />
                </button>
              )}
              <button
                type="button"
                onClick={() => toggleSavedWord(w)}
                aria-label="取消收藏"
                className="rounded p-1 text-flame active:bg-muted"
              >
                <Star className="size-3.5 fill-current" />
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export function SavedList({ locale }: { locale: string }) {
  const { progress, ready, toggleSaved } = useProgress();
  const speech = useSpeech();
  const [hideAnswers, setHideAnswers] = useState(true);
  const [shown, setShown] = useState<Set<string>>(new Set());
  const [seed, setSeed] = useState(0);

  const items = useMemo(() => {
    const list = [...progress.saved];
    if (seed === 0) return list;
    // 洗牌用固定种子，避免每次重渲染顺序都变
    let s = seed;
    const rand = () => {
      s = (s * 1103515245 + 12345) & 0x7fffffff;
      return s / 0x7fffffff;
    };
    for (let i = list.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [list[i], list[j]] = [list[j], list[i]];
    }
    return list;
  }, [progress.saved, seed]);

  const reveal = (id: string) =>
    setShown((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  if (ready && items.length === 0 && progress.savedWords.length === 0) {
    return (
      <main className="mx-auto max-w-lg px-5 pt-12">
        <h1 className="text-[28px] font-bold tracking-tight">生词本</h1>
        <div className="mt-16 flex flex-col items-center text-center">
          <span className="flex size-16 items-center justify-center rounded-full bg-flame/10">
            <Star className="size-7 text-flame" />
          </span>
          <p className="mt-5 text-[15px] font-semibold">还没有收藏</p>
          <p className="mt-1.5 max-w-xs text-sm text-muted-foreground">
            刷课时遇到不熟的句子，点底部的星标存进来，之后可以打乱重刷。
          </p>
          <Link
            href={`/${locale}/study`}
            className="mt-6 rounded-md bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground active:scale-95"
          >
            去刷课
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-lg px-5 pt-12">
      <header className="mb-5">
        <h1 className="text-[28px] font-bold tracking-tight">生词本</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {ready ? `${items.length} 条句子收藏 · ${progress.savedWords.length} 个单词收藏` : " "}
        </p>
      </header>

      <SavedWords locale={locale} />

      <div className="mb-4 flex items-center gap-2">
        <button
          type="button"
          onClick={() => setHideAnswers((v) => !v)}
          className={cn(
            "flex items-center gap-1.5 rounded-md border border-border px-3 py-2 text-xs font-medium transition-colors active:bg-muted",
            hideAnswers ? "text-foreground" : "text-muted-foreground",
          )}
        >
          {hideAnswers ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
          {hideAnswers ? "遮住答案" : "显示答案"}
        </button>
        <button
          type="button"
          onClick={() => {
            setSeed(Date.now() % 100000 || 1);
            setShown(new Set());
          }}
          className="flex items-center gap-1.5 rounded-md border border-border px-3 py-2 text-xs font-medium transition-colors active:bg-muted"
        >
          <Shuffle className="size-3.5" />
          打乱
        </button>
      </div>

      <ul className="space-y-2.5">
        {items.map((item) => {
          const open = !hideAnswers || shown.has(item.id);
          return (
            <li
              key={item.id}
              className="overflow-hidden rounded-lg border border-border bg-card"
            >
              <div className="p-4">
                <div className="mb-2 flex items-center gap-2">
                  <Link
                    href={`/${locale}/study/${item.lesson}`}
                    className="rounded bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground"
                  >
                    L{item.lesson}
                  </Link>
                  <div className="flex min-w-0 flex-1 flex-wrap gap-1">
                    {item.words.slice(0, 3).map((w, n) => (
                      <span
                        key={`${w}-${n}`}
                        className="truncate rounded bg-primary/10 px-1.5 py-0.5 text-[11px] font-medium text-primary"
                      >
                        {w}
                      </span>
                    ))}
                  </div>
                  {speech.supported && (
                    <button
                      type="button"
                      onClick={() => speech.speak(open ? item.a : item.q)}
                      aria-label="朗读"
                      className="shrink-0 rounded p-1 text-muted-foreground active:bg-muted"
                    >
                      <Volume2 className="size-4" />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => toggleSaved(item)}
                    aria-label="取消收藏"
                    className="shrink-0 rounded p-1 text-flame active:bg-muted"
                  >
                    <Star className="size-4 fill-current" />
                  </button>
                </div>

                <p className="font-serif text-[15px] font-medium leading-relaxed">
                  {item.q}
                </p>

                {open ? (
                  <p className="mt-1.5 font-serif text-[15px] leading-relaxed text-primary">
                    {item.a}
                  </p>
                ) : (
                  <button
                    type="button"
                    onClick={() => reveal(item.id)}
                    className="mt-2 w-full rounded-md bg-muted py-2 text-xs font-medium text-muted-foreground active:bg-accent"
                  >
                    看答案
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </main>
  );
}
