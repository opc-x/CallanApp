"use client";

import { useEffect, useRef, useState } from "react";
import { ExternalLink, Languages, Loader2, Search, Volume2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PronounceHit } from "@/lib/youglish";

type Status = "idle" | "loading" | "error" | "done";

// 100 = 视频被删/私有，101/150 = 上传者禁止嵌入播放——这三种都得自动换下一条，
// 别的错误码（2/5，参数或播放器本身的问题）先原样展示，重试没用。
const UNPLAYABLE_ERROR_CODES = new Set([100, 101, 150]);

type YTPlayer = { destroy: () => void };
type YTPlayerCtor = new (
  el: HTMLElement,
  opts: {
    videoId: string;
    playerVars?: Record<string, unknown>;
    events?: {
      onError?: (e: { data: number }) => void;
    };
  },
) => YTPlayer;

declare global {
  interface Window {
    YT?: { Player: YTPlayerCtor };
    onYouTubeIframeAPIReady?: () => void;
  }
}

let ytApiPromise: Promise<void> | null = null;
function loadYouTubeApi(): Promise<void> {
  if (window.YT?.Player) return Promise.resolve();
  ytApiPromise ??= new Promise((resolve) => {
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      prev?.();
      resolve();
    };
    if (!document.querySelector('script[src="https://www.youtube.com/iframe_api"]')) {
      const tag = document.createElement("script");
      tag.src = "https://www.youtube.com/iframe_api";
      document.head.appendChild(tag);
    }
  });
  return ytApiPromise;
}

function highlight(text: string, word: string, onWordClick: () => void) {
  const re = new RegExp(`\\b(${word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})\\b`, "ig");
  const parts = text.split(re);
  return parts.map((part, i) =>
    re.test(part) && part.toLowerCase() === word.toLowerCase() ? (
      <mark
        key={i}
        onClick={(e) => {
          e.stopPropagation();
          onWordClick();
        }}
        className="cursor-pointer rounded bg-primary/20 px-0.5 text-primary underline decoration-dotted underline-offset-2"
      >
        {part}
      </mark>
    ) : (
      <span key={i}>{part}</span>
    ),
  );
}

export function PronounceSearch() {
  const [input, setInput] = useState("");
  const [word, setWord] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [gloss, setGloss] = useState<string | null>(null);
  const [hits, setHits] = useState<PronounceHit[]>([]);
  const [precise, setPrecise] = useState(true);
  const [active, setActive] = useState<PronounceHit | null>(null);
  const [translations, setTranslations] = useState<Record<number, string>>({});
  const [translating, setTranslating] = useState<number | null>(null);
  const [blocked, setBlocked] = useState<Set<string>>(new Set());
  const playerHostRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<YTPlayer | null>(null);

  function hitKey(hit: PronounceHit) {
    return `${hit.videoId}-${hit.start}`;
  }

  // 当前视频被 YouTube 判定禁止嵌入时，标灰并自动切到列表里下一条没试过的候选
  function skipUnplayable(hit: PronounceHit, list: PronounceHit[]) {
    setBlocked((prev) => new Set(prev).add(hitKey(hit)));
    const i = list.findIndex((h) => hitKey(h) === hitKey(hit));
    const next = list.slice(i + 1).find((h) => !blocked.has(hitKey(h)));
    setActive(next ?? null);
  }

  useEffect(() => {
    if (!active || !playerHostRef.current) return;
    let cancelled = false;
    loadYouTubeApi().then(() => {
      if (cancelled || !playerHostRef.current) return;
      playerRef.current?.destroy();
      playerRef.current = new window.YT!.Player(playerHostRef.current, {
        videoId: active.videoId,
        playerVars: { autoplay: 1, start: precise ? active.start : 0 },
        events: {
          onError: (e) => {
            if (UNPLAYABLE_ERROR_CODES.has(e.data)) skipUnplayable(active, hits);
          },
        },
      });
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active?.videoId, active?.start]);

  async function search(q: string) {
    const clean = q.trim();
    if (!clean) return;
    setStatus("loading");
    setWord(clean);
    setActive(null);
    setTranslations({});
    setBlocked(new Set());
    try {
      const res = await fetch(`/api/v1/pronounce?word=${encodeURIComponent(clean)}`);
      const data = await res.json();
      if (!data.ok) throw new Error(data.error ?? "failed");
      const list: PronounceHit[] = data.hits?.length ? data.hits : (data.fallback ?? []);
      setHits(list);
      setPrecise(!!data.hits?.length);
      setActive(list[0] ?? null);
      setGloss(data.gloss ?? null);
      setStatus("done");
    } catch {
      setHits([]);
      setGloss(null);
      setStatus("error");
    }
  }

  async function translateHit(i: number, text: string) {
    if (translations[i] !== undefined || translating === i) return;
    setTranslating(i);
    try {
      const { translateLocally } = await import("@/lib/local-ai");
      const zh = await translateLocally(text);
      setTranslations((prev) => ({ ...prev, [i]: zh || "（翻译失败）" }));
    } catch {
      setTranslations((prev) => ({ ...prev, [i]: "（本地翻译模型加载失败）" }));
    } finally {
      setTranslating(null);
    }
  }

  return (
    <main className="mx-auto max-w-lg px-5 pt-12">
      <h1 className="text-[28px] font-bold tracking-tight">发音</h1>
      <p className="mt-1.5 text-sm text-muted-foreground">
        搜一个词，听真人在 YouTube 视频里怎么说
      </p>

      <form
        className="mt-6 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          search(input);
        }}
      >
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="输入单词，比如 courage"
            className="h-11 w-full rounded-xl border border-border bg-card pl-9 pr-3 text-[15px] outline-none focus:border-primary"
          />
        </div>
        <button
          type="submit"
          disabled={status === "loading"}
          className="h-11 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground disabled:opacity-50"
        >
          {status === "loading" ? <Loader2 className="size-4 animate-spin" /> : "查"}
        </button>
      </form>

      {status === "error" && (
        <div className="mt-8 text-center text-sm text-muted-foreground">
          没抓到结果，可能是 YouTube 页面结构变了或词太生僻，换个词再试试。
        </div>
      )}

      {status === "loading" && (
        <div className="mt-8 text-center text-sm text-muted-foreground">
          正在翻 YouTube 字幕，稍等几秒…
        </div>
      )}

      {status === "done" && gloss && (
        <div className="mt-6 flex items-baseline gap-2 rounded-xl border border-border bg-card px-4 py-3">
          <span className="text-[15px] font-semibold">{word}</span>
          <span className="text-sm text-muted-foreground">{gloss}</span>
        </div>
      )}

      {status === "done" && hits.length === 0 && (
        <div className="mt-8 text-center text-sm text-muted-foreground">
          没搜到跟 “{word}” 相关的视频，换个词试试。
        </div>
      )}

      {status === "done" && hits.length > 0 && !precise && (
        <div className="mt-6 rounded-xl bg-muted px-4 py-3 text-sm text-muted-foreground">
          抓不到字幕定位到具体时间点（YouTube 拦了自动抓取），下面是相关视频，点开自己拖进度条找发音。
        </div>
      )}

      {active && (
        <div className="mt-6 aspect-video overflow-hidden rounded-2xl border border-border bg-black">
          <div ref={playerHostRef} className="size-full" />
        </div>
      )}

      {hits.length > 0 && (
        <ul className="mt-4 space-y-2 pb-8">
          {hits.map((hit, i) => {
            const isBlocked = blocked.has(hitKey(hit));
            const body = (
              <>
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Volume2 className="size-3.5" />
                  <span className="truncate">{hit.channel || hit.title}</span>
                  {isBlocked && (
                    <span className="flex shrink-0 items-center gap-1">
                      · 无法嵌入，去 YouTube 看 <ExternalLink className="size-3" />
                    </span>
                  )}
                </div>
                <p className="mt-1 text-[15px] leading-snug">
                  {highlight(hit.text, word, () => translateHit(i, hit.text))}
                </p>
                {translating === i && (
                  <p className="mt-1.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Loader2 className="size-3 animate-spin" />
                    本地模型翻译中（第一次要下载模型，稍慢）…
                  </p>
                )}
                {translations[i] !== undefined && translating !== i && (
                  <p className="mt-1.5 flex items-start gap-1.5 text-sm text-primary">
                    <Languages className="mt-0.5 size-3.5 shrink-0" />
                    {translations[i]}
                  </p>
                )}
              </>
            );
            const className = cn(
              "block w-full rounded-xl border px-4 py-3 text-left transition-colors",
              isBlocked
                ? "border-border bg-muted text-muted-foreground hover:border-primary/40"
                : active?.videoId === hit.videoId && active?.start === hit.start
                  ? "border-primary bg-primary/5"
                  : "border-border bg-card hover:border-primary/40",
            );
            return (
              <li key={`${hit.videoId}-${hit.start}-${i}`}>
                {isBlocked ? (
                  <a
                    href={`https://www.youtube.com/watch?v=${hit.videoId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={className}
                  >
                    {body}
                  </a>
                ) : (
                  <button onClick={() => setActive(hit)} className={className}>
                    {body}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
