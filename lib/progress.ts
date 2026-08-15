"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  EMPTY_PROGRESS,
  mergeProgress,
  type Progress,
  type Saved,
} from "@/lib/progress-shared";
import {
  getSyncCode,
  pullProgress,
  putProgress,
  setSyncCode as persistSyncCode,
} from "@/lib/sync";

export type { Progress, Saved };

const KEY = "callan.progress.v2";
const PUSH_DEBOUNCE_MS = 2000;

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
  if (typeof window === "undefined") return EMPTY_PROGRESS;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return EMPTY_PROGRESS;
    const p = JSON.parse(raw) as Partial<Progress>;
    return {
      done: Array.isArray(p.done) ? p.done.filter(Number.isInteger) : [],
      last: typeof p.last === "number" ? p.last : null,
      pos: p.pos && typeof p.pos === "object" ? p.pos : {},
      saved: Array.isArray(p.saved) ? p.saved : [],
      days: Array.isArray(p.days) ? p.days : [],
      savedWords: Array.isArray(p.savedWords) ? p.savedWords : [],
    };
  } catch {
    return EMPTY_PROGRESS;
  }
}

function write(next: Progress) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // 隐私模式下 localStorage 会抛错，静默降级为不持久化
  }
}

export type SyncStatus = "off" | "syncing" | "synced" | "error";

export function useProgress() {
  // 首屏用空值渲染，挂载后再补上，避免服务端/客户端不一致
  const [progress, setProgress] = useState<Progress>(EMPTY_PROGRESS);
  const [ready, setReady] = useState(false);
  const [syncCode, setSyncCodeState] = useState<string | null>(null);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>("off");
  const pushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // 排队等推的操作本身（不是结果）——推的时候现拉服务端最新数据重放一遍，
  // "取消完成"/"取消收藏"/"清空" 这类会变少的操作才不会被服务端的并集合并粘回来。
  const pendingOps = useRef<Array<(p: Progress) => Progress>>([]);

  useEffect(() => {
    setProgress(read());
    setSyncCodeState(getSyncCode());
    setReady(true);
  }, []);

  const schedulePush = useCallback((code: string) => {
    if (pushTimer.current) clearTimeout(pushTimer.current);
    pushTimer.current = setTimeout(async () => {
      const ops = pendingOps.current;
      if (ops.length === 0) return;
      pendingOps.current = [];
      setSyncStatus("syncing");
      try {
        const server = await pullProgress(code);
        const result = ops.reduce((p, fn) => fn(p), server);
        await putProgress(code, result);
        setProgress((prev) => {
          const merged = mergeProgress(prev, result);
          write(merged);
          return merged;
        });
        setSyncStatus("synced");
      } catch {
        pendingOps.current.unshift(...ops); // 失败了留着，下次成功的同步会重放
        setSyncStatus("error");
      }
    }, PUSH_DEBOUNCE_MS);
  }, []);

  const update = useCallback(
    (fn: (p: Progress) => Progress) => {
      setProgress((prev) => {
        const next = fn(prev);
        write(next);
        return next;
      });
      if (syncCode) {
        pendingOps.current.push(fn);
        schedulePush(syncCode);
      }
    },
    [syncCode, schedulePush],
  );

  // 首次挂载 / 换了同步码：拉服务端数据，跟本地合并，立刻双向写回，别的设备马上能看见
  const connectSync = useCallback(async (code: string) => {
    setSyncStatus("syncing");
    try {
      const server = await pullProgress(code);
      // 直接读 localStorage 而不是走 setProgress 的 updater——React 不保证
      // updater 会在下一行同步跑完，用它的副作用去拿 merged 会拿到还没更新的旧值。
      const merged = mergeProgress(read(), server);
      write(merged);
      setProgress(merged);
      await putProgress(code, merged);
      persistSyncCode(code);
      setSyncCodeState(code);
      setSyncStatus("synced");
    } catch {
      setSyncStatus("error");
      throw new Error("sync connect failed");
    }
  }, []);

  const disconnectSync = useCallback(() => {
    persistSyncCode(null);
    setSyncCodeState(null);
    setSyncStatus("off");
  }, []);

  useEffect(() => {
    if (ready && syncCode) connectSync(syncCode).catch(() => {});
    // 只在挂载后、拿到本地存的同步码时跑一次，不依赖 connectSync identity
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

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

  /** 收藏单词：小写归一化，同一个词无论出现几次都是同一条 */
  const toggleSavedWord = useCallback(
    (word: string) =>
      update((p) => {
        const key = word.trim().toLowerCase();
        return {
          ...p,
          savedWords: p.savedWords.includes(key)
            ? p.savedWords.filter((w) => w !== key)
            : [...p.savedWords, key],
        };
      }),
    [update],
  );

  const reset = useCallback(() => update(() => EMPTY_PROGRESS), [update]);

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
    toggleSavedWord,
    reset,
    syncCode,
    syncStatus,
    connectSync,
    disconnectSync,
  };
}
