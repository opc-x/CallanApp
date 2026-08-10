"use client";

import type { Progress } from "@/lib/progress-shared";

const CODE_KEY = "callan.sync.code";

export function getSyncCode(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(CODE_KEY);
}

export function setSyncCode(code: string | null) {
  if (code) window.localStorage.setItem(CODE_KEY, code);
  else window.localStorage.removeItem(CODE_KEY);
}

async function call(code: string, method: "GET" | "POST" | "PUT", body?: Progress) {
  const res = await fetch("/api/v1/progress", {
    method,
    headers: {
      "x-sync-code": code,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`sync ${method} failed: ${res.status}`);
  const data = await res.json();
  if (!data.ok) throw new Error(data.error ?? "sync failed");
  return data.progress as Progress;
}

export const pullProgress = (code: string) => call(code, "GET");
/** 并集合并——只适合"变多"的操作，"变少"的操作会被合并粘回来，见 putProgress */
export const pushProgress = (code: string, p: Progress) => call(code, "POST", p);
/** 硬覆盖，服务端不做合并——取消完成/取消收藏/清空这类会"变少"的操作要用这个 */
export const putProgress = (code: string, p: Progress) => call(code, "PUT", p);
