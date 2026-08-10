// 抓 YouTube 的非官方接口：搜视频 + 抓字幕，找目标词出现的时间点。
// 没有官方免费接口能做"字幕内容检索"，YouGlish 自己也是靠爬字幕建库。
// 这里直接解析网页里内嵌的 ytInitialData / ytInitialPlayerResponse，结构可能随时变。

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

export type PronounceHit = {
  videoId: string;
  title: string;
  channel: string;
  start: number;
  text: string;
};

function escapeRegex(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function fetchText(url: string, timeoutMs = 8000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, "Accept-Language": "en-US,en;q=0.9" },
      signal: controller.signal,
      next: { revalidate: 21600 },
    });
    if (!res.ok) throw new Error(`fetch ${url} -> ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

// 从 HTML 里挖出 `var marker = {...};` 这种内嵌 JSON，用括号计数找到匹配的结尾
// （懒正则遇到值里的分号会截断，只能手动数括号）。
function extractInlineJson(html: string, marker: string): unknown | null {
  const idx = html.indexOf(marker);
  if (idx === -1) return null;
  const start = html.indexOf("{", idx);
  if (start === -1) return null;
  let depth = 0;
  for (let i = start; i < html.length; i++) {
    const ch = html[i];
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) {
        const raw = html.slice(start, i + 1);
        try {
          return JSON.parse(raw);
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

// 递归找出所有 key === name 的值，不依赖具体嵌套路径（页面结构说变就变）。
function findAll(obj: unknown, key: string, out: unknown[] = []): unknown[] {
  if (obj == null || typeof obj !== "object") return out;
  if (Array.isArray(obj)) {
    for (const item of obj) findAll(item, key, out);
    return out;
  }
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    if (k === key) out.push(v);
    else findAll(v, key, out);
  }
  return out;
}

type VideoCandidate = {
  videoId: string;
  title: string;
  channel: string;
  durationSec: number | null;
};

// "3:33" / "1:02:10" -> 秒数
function parseDuration(text: string | undefined): number | null {
  if (!text) return null;
  const parts = text.split(":").map((p) => parseInt(p, 10));
  if (parts.some(Number.isNaN)) return null;
  return parts.reduce((acc, p) => acc * 60 + p, 0);
}

async function searchVideos(word: string, limit: number): Promise<VideoCandidate[]> {
  const html = await fetchText(
    `https://www.youtube.com/results?search_query=${encodeURIComponent(word)}`,
  );
  const data = extractInlineJson(html, "ytInitialData");
  if (!data) return [];

  const renderers = findAll(data, "videoRenderer") as Array<{
    videoId?: string;
    title?: { runs?: Array<{ text?: string }> };
    ownerText?: { runs?: Array<{ text?: string }> };
    badges?: Array<{ metadataBadgeRenderer?: { label?: string } }>;
    lengthText?: { simpleText?: string };
  }>;

  const seen = new Set<string>();
  const pool: VideoCandidate[] = [];
  for (const vr of renderers) {
    if (!vr.videoId || seen.has(vr.videoId)) continue;
    const isLive = vr.badges?.some((b) => b.metadataBadgeRenderer?.label === "LIVE");
    if (isLive) continue;
    seen.add(vr.videoId);
    pool.push({
      videoId: vr.videoId,
      title: vr.title?.runs?.[0]?.text ?? "",
      channel: vr.ownerText?.runs?.[0]?.text ?? "",
      durationSec: parseDuration(vr.lengthText?.simpleText),
    });
  }

  // 短视频优先——精确定位不上的时候，播放器打开就离目标词近，不用拖半天进度条
  pool.sort((a, b) => (a.durationSec ?? Infinity) - (b.durationSec ?? Infinity));
  return pool.slice(0, limit);
}

async function getCaptionTracks(videoId: string) {
  const html = await fetchText(`https://www.youtube.com/watch?v=${videoId}`);
  const data = extractInlineJson(html, "ytInitialPlayerResponse") as {
    playabilityStatus?: { status?: string; reason?: string };
    captions?: {
      playerCaptionsTracklistRenderer?: {
        captionTracks?: Array<{
          baseUrl: string;
          languageCode: string;
          kind?: string;
        }>;
      };
    };
  } | null;
  const tracks = data?.captions?.playerCaptionsTracklistRenderer?.captionTracks ?? [];
  // 优先真人上传的英文字幕，没有就退到 ASR 自动生成的
  const manual = tracks.find((t) => t.languageCode?.startsWith("en") && t.kind !== "asr");
  const asr = tracks.find((t) => t.languageCode?.startsWith("en"));
  return {
    track: manual ?? asr ?? null,
    playability: data?.playabilityStatus?.status ?? null,
    reason: data?.playabilityStatus?.reason ?? null,
    trackCount: tracks.length,
  };
}

type CaptionEvent = { tStartMs?: number; segs?: Array<{ utf8?: string }> };

export type DebugEntry = {
  videoId: string;
  title: string;
  playability: string | null;
  reason: string | null;
  trackCount: number;
  matched: number;
};

async function findHitsInVideo(
  video: VideoCandidate,
  word: string,
  maxHits: number,
  debug: DebugEntry[],
): Promise<PronounceHit[]> {
  const { track, playability, reason, trackCount } = await getCaptionTracks(video.videoId);
  const entry: DebugEntry = {
    videoId: video.videoId,
    title: video.title,
    playability,
    reason,
    trackCount,
    matched: 0,
  };
  debug.push(entry);
  if (!track) return [];

  const url = `${track.baseUrl}${track.baseUrl.includes("?") ? "&" : "?"}fmt=json3`;
  const json = JSON.parse(await fetchText(url)) as { events?: CaptionEvent[] };
  const events = json.events ?? [];

  const re = new RegExp(`\\b${escapeRegex(word)}\\b`, "i");
  const hits: PronounceHit[] = [];

  for (let i = 0; i < events.length && hits.length < maxHits; i++) {
    const ev = events[i];
    const line = (ev.segs ?? []).map((s) => s.utf8 ?? "").join("").trim();
    if (!line || !re.test(line)) continue;
    if (ev.tStartMs == null) continue;

    // 单行太短就拼上下一行凑出完整句子上下文
    let text = line;
    if (text.split(/\s+/).length < 4 && events[i + 1]) {
      const next = (events[i + 1].segs ?? []).map((s) => s.utf8 ?? "").join("").trim();
      if (next) text = `${text} ${next}`;
    }

    hits.push({
      videoId: video.videoId,
      title: video.title,
      channel: video.channel,
      start: Math.max(0, Math.floor(ev.tStartMs / 1000) - 1),
      text,
    });
  }
  entry.matched = hits.length;
  return hits;
}

export async function findPronunciations(
  word: string,
  limit = 8,
): Promise<{ hits: PronounceHit[]; fallback: PronounceHit[]; debug: DebugEntry[] }> {
  const clean = word.trim().toLowerCase();
  const debug: DebugEntry[] = [];
  if (!clean) return { hits: [], fallback: [], debug };

  const videos = await searchVideos(clean, 8);
  const results: PronounceHit[] = [];

  for (const video of videos) {
    if (results.length >= limit) break;
    try {
      const hits = await findHitsInVideo(video, clean, 2, debug);
      results.push(...hits);
    } catch (error) {
      debug.push({
        videoId: video.videoId,
        title: video.title,
        playability: "fetch_error",
        reason: error instanceof Error ? error.message : String(error),
        trackCount: 0,
        matched: 0,
      });
    }
  }

  // 字幕接口被 YouTube 反爬拦下时，退化成纯视频列表——没有自动定位的时间点，
  // 但至少能点开视频自己找发音，比"没找到"有用。
  const fallback: PronounceHit[] =
    results.length > 0
      ? []
      : videos.map((video) => ({
          videoId: video.videoId,
          title: video.title,
          channel: video.channel,
          start: 0,
          text: video.title,
        }));

  return { hits: results.slice(0, limit), fallback, debug };
}
