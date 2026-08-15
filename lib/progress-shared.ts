// 纯数据类型 + 合并逻辑，客户端 hook（lib/progress.ts）和服务端 API 路由都要用，
// 不能带 "use client"。

/** 收藏的例句自带内容，生词页就不必把整套课程数据送到客户端 */
export type Saved = {
  /** `${课号}:${组号}:${例句号}` */
  id: string;
  lesson: number;
  words: string[];
  q: string;
  a: string;
};

export type Progress = {
  /** 已完成的课号 */
  done: number[];
  /** 最近打开的课号 */
  last: number | null;
  /** 每课刷到第几张卡，用于断点续刷 */
  pos: Record<string, number>;
  saved: Saved[];
  /** 有学习记录的日期 YYYY-MM-DD，用于连续天数 */
  days: string[];
  /** 收藏的单词，小写归一化，教材里同一个词不管出现几次都是同一条收藏 */
  savedWords: string[];
};

export const EMPTY_PROGRESS: Progress = {
  done: [],
  last: null,
  pos: {},
  saved: [],
  days: [],
  savedWords: [],
};

/**
 * 两台设备的进度合并成一份：数组取并集、每课进度取较大值，没有真的"最后写入胜出"，
 * 避免离线一阵子同步回来把另一台设备的进度冲掉。
 */
export function mergeProgress(a: Progress, b: Progress): Progress {
  const done = [...new Set([...a.done, ...b.done])].sort((x, y) => x - y);

  const pos: Record<string, number> = { ...a.pos };
  for (const [k, v] of Object.entries(b.pos)) {
    pos[k] = Math.max(pos[k] ?? 0, v);
  }

  const savedById = new Map(a.saved.map((s) => [s.id, s]));
  for (const s of b.saved) if (!savedById.has(s.id)) savedById.set(s.id, s);

  const days = [...new Set([...a.days, ...b.days])].sort();

  const savedWords = [...new Set([...a.savedWords, ...b.savedWords])].sort();

  return {
    done,
    last: b.last ?? a.last,
    pos,
    saved: [...savedById.values()],
    days,
    savedWords,
  };
}

export function isValidProgress(v: unknown): v is Progress {
  if (!v || typeof v !== "object") return false;
  const p = v as Partial<Progress>;
  return (
    Array.isArray(p.done) &&
    Array.isArray(p.saved) &&
    Array.isArray(p.days) &&
    Array.isArray(p.savedWords) &&
    typeof p.pos === "object" &&
    p.pos !== null
  );
}
