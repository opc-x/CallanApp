"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

const KEY = "callan.progress.v2";

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
};

const EMPTY: Progress = { done: [], last: null, pos: {}, saved: [], days: [] };

export function today(): string {
  const d = new Date();
  const m = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

function dayOffset(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, m - 1, d + days);
  const mm = `${dt.getMonth() + 1}`.padStart(2, "0");
  const dd = `${dt.getDate()}`.padStart(2, "0");
  return `${dt.getFullYear()}-${mm}-${dd}`;
}

/** 连续天数：从今天（或昨天，允许今天还没开始）往回数 */
export function streakOf(days: string[]): number {
  if (days.length === 0) return 0;
  const set = new Set(days);
  const now = today();
  let cursor = set.has(now) ? now : dayOffset(now, -1);
  if (!set.has(cursor)) return 0;
  let n = 0;
  while (set.has(cursor)) {
    n += 1;
    cursor = dayOffset(cursor, -1);
  }
  return n;
}

function read(): Progress {
  if (typeof window === "undefined") return EMPTY;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return EMPTY;
    const p = JSON.parse(raw) as Partial<Progress>;
    return {
      done: Array.isArray(p.done) ? p.done.filter(Number.isInteger) : [],
      last: typeof p.last === "number" ? p.last : null,
      pos: p.pos && typeof p.pos === "object" ? p.pos : {},
      saved: Array.isArray(p.saved) ? p.saved : [],
      days: Array.isArray(p.days) ? p.days : [],
    };
  } catch {
    return EMPTY;
  }
}

function write(next: Progress) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // 隐私模式下 localStorage 会抛错，静默降级为不持久化
  }
}

export function useProgress() {
  // 首屏用空值渲染，挂载后再补上，避免服务端/客户端不一致
  const [progress, setProgress] = useState<Progress>(EMPTY);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setProgress(read());
    setReady(true);
  }, []);

  const update = useCallback((fn: (p: Progress) => Progress) => {
    setProgress((prev) => {
      const next = fn(prev);
      write(next);
      return next;
    });
  }, []);

  const markDone = useCallback(
    (lesson: number) =>
      update((p) => ({
        ...p,
        done: p.done.includes(lesson)
          ? p.done
          : [...p.done, lesson].sort((a, b) => a - b),
        last: lesson,
      })),
    [update],
  );

  const clearDone = useCallback(
    (lesson: number) =>
      update((p) => ({ ...p, done: p.done.filter((n) => n !== lesson) })),
    [update],
  );

  /** 打开一课：记为最近一课，并把今天计入连续天数 */
  const touch = useCallback(
    (lesson: number) =>
      update((p) => {
        const day = today();
        if (p.last === lesson && p.days.includes(day)) return p;
        return {
          ...p,
          last: lesson,
          days: p.days.includes(day) ? p.days : [...p.days, day],
        };
      }),
    [update],
  );

  const setPos = useCallback(
    (lesson: number, i: number) =>
      update((p) => ({ ...p, pos: { ...p.pos, [lesson]: i } })),
    [update],
  );

  const toggleSaved = useCallback(
    (item: Saved) =>
      update((p) => ({
        ...p,
        saved: p.saved.some((s) => s.id === item.id)
          ? p.saved.filter((s) => s.id !== item.id)
          : [item, ...p.saved],
      })),
    [update],
  );

  const reset = useCallback(() => update(() => EMPTY), [update]);

  const streak = useMemo(() => streakOf(progress.days), [progress.days]);

  return {
    progress,
    ready,
    streak,
    markDone,
    clearDone,
    touch,
    setPos,
    toggleSaved,
    reset,
  };
}
