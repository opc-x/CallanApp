"use client";

import { useState } from "react";
import { Languages, Loader2, Search, Volume2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PronounceHit } from "@/lib/youglish";

type Status = "idle" | "loading" | "error" | "done";

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

  async function search(q: string) {
    const clean = q.trim();
    if (!clean) return;
    setStatus("loading");
    setWord(clean);
    setActive(null);
    setTranslations({});
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
        <div className="mt-6 space-y-2">
          <div className="overflow-hidden rounded-2xl border border-border bg-black">
            {/*
              纯 iframe embed，不用 YouTube JS Player API。
              之前那套靠 onError 自动跳过"禁止嵌入"视频的机制在移动端不稳定——
              播放器状态上报本身就不可靠，会连环误判成全部不能播。真被禁嵌入
              （或年龄限制/反爬拦截）的视频，YouTube 自己会在 iframe 里显示官方
              提示——那是跨域内容，我们的 JS 读不到，没法自动感知/跳过。
            */}
            <iframe
              key={`${active.videoId}-${active.start}`}
              className="aspect-video w-full"
              src={`https://www.youtube.com/embed/${active.videoId}?${precise ? `start=${active.start}&` : ""}autoplay=1&playsinline=1`}
              allow="autoplay; encrypted-media; picture-in-picture"
              allowFullScreen
            />
          </div>
          <div className="flex gap-2">
            {/*
              手机浏览器里内嵌 iframe 常年放不出来登录/年龄限制的视频——Google
              明确禁止在 WebView/iframe 里完成账号登录（防钓鱼策略），点了里面
              的 Sign in 没反应是设计如此，不是没加载出来。真要看只能跳到
              YouTube 本体（顶层页面，不是内嵌），那边登录/反爬才走得通。
            */}
            <a
              href={`https://www.youtube.com/watch?v=${active.videoId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 rounded-lg border border-border py-2 text-center text-xs font-medium text-muted-foreground active:bg-muted"
            >
              在 YouTube 打开
            </a>
            {hits.length > 1 && (
              <button
                type="button"
                onClick={() => {
                  const i = hits.findIndex(
                    (h) => h.videoId === active.videoId && h.start === active.start,
                  );
                  setActive(hits[(i + 1) % hits.length]);
                }}
                className="flex-1 rounded-lg border border-border py-2 text-xs font-medium text-muted-foreground active:bg-muted"
              >
                换一个
              </button>
            )}
          </div>
        </div>
      )}

      {hits.length > 0 && (
        <ul className="mt-4 space-y-2 pb-8">
          {hits.map((hit, i) => (
            <li key={`${hit.videoId}-${hit.start}-${i}`}>
              <button
                onClick={() => setActive(hit)}
                className={cn(
                  "w-full rounded-xl border px-4 py-3 text-left transition-colors",
                  active?.videoId === hit.videoId && active?.start === hit.start
                    ? "border-primary bg-primary/5"
                    : "border-border bg-card hover:border-primary/40",
                )}
              >
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Volume2 className="size-3.5" />
                  <span className="truncate">{hit.channel || hit.title}</span>
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
              </button>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
