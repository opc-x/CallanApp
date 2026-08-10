"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const RATE_KEY = "callan.speech.rate";
const ON_KEY = "callan.speech.auto";

// 各平台语音库里常见的女声/高音质关键词——没有统一 API 能直接查性别，
// 只能靠名字关键词猜（Google/Microsoft/Apple 的命名习惯都不一样）
const FEMALE_HINTS = [
  "female", "kate", "serena", "stephanie", "fiona", "moira", "sonia", "libby",
  "hazel", "susan", "martha", "maisie", "zira", "emma", "amy", "joanna",
  "kimberly", "aria", "jenny", "samantha", "victoria", "karen", "tessa", "zoe",
];
const MALE_HINTS = [
  "male", "daniel", "george", "arthur", "ryan", "guy", "brian", "james",
  "oliver", "harry", "matthew", "alex", "fred", "gordon", "thomas",
];
// Natural/Enhanced/Premium/Neural 是各平台对云端或高质量合成音色的标记，
// Compact 是移动端为省空间裁剪过的低音质音色
const QUALITY_HINTS = ["natural", "enhanced", "premium", "neural"];
const LOW_QUALITY_HINTS = ["compact"];

function scoreVoice(v: SpeechSynthesisVoice): number {
  const name = v.name.toLowerCase();
  const lang = v.lang.replace("_", "-").toLowerCase();
  let score = 0;
  // Callan 是英式教材，优先英音
  if (lang.startsWith("en-gb")) score += 5;
  else if (lang.startsWith("en")) score += 2;
  if (QUALITY_HINTS.some((h) => name.includes(h))) score += 4;
  if (LOW_QUALITY_HINTS.some((h) => name.includes(h))) score -= 3;
  if (FEMALE_HINTS.some((h) => name.includes(h))) score += 3;
  if (MALE_HINTS.some((h) => name.includes(h))) score -= 2;
  // 本地合成更稳定（离线可用、延迟低），同分时优先
  if (v.localService) score += 1;
  return score;
}

/** 在系统装了哪些语音包的前提下，挑一个尽量清晰、女声、英式的音色 */
function pickVoice(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | null {
  if (voices.length === 0) return null;
  const en = voices.filter((v) => v.lang.replace("_", "-").startsWith("en"));
  const pool = en.length > 0 ? en : voices;
  return [...pool].sort((a, b) => scoreVoice(b) - scoreVoice(a))[0] ?? null;
}

export function useSpeech() {
  const [supported, setSupported] = useState(false);
  const [auto, setAuto] = useState(false);
  const [rate, setRateState] = useState(1);
  const [speaking, setSpeaking] = useState(false);
  const voiceRef = useRef<SpeechSynthesisVoice | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setSupported(true);

    try {
      const r = Number(window.localStorage.getItem(RATE_KEY));
      if (r >= 0.5 && r <= 2) setRateState(r);
      setAuto(window.localStorage.getItem(ON_KEY) === "1");
    } catch {
      // 读不到就用默认值
    }

    const load = () => {
      if ("speechSynthesis" in window) {
        voiceRef.current = pickVoice(window.speechSynthesis.getVoices());
      }
    };
    load();
    window.speechSynthesis?.addEventListener("voiceschanged", load);
    return () => {
      window.speechSynthesis?.removeEventListener("voiceschanged", load);
      window.speechSynthesis?.cancel();
    };
  }, []);

  const speak = useCallback(
    (text: string) => {
      if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
      // 课本里的 … 和 ~ 是占位/可选答案标记，念出来只会干扰
      const clean = text.replace(/[…~]+/g, " ").replace(/\s+/g, " ").trim();
      if (!clean) return;

      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(clean);
      if (voiceRef.current) {
        u.voice = voiceRef.current;
        u.lang = voiceRef.current.lang;
      } else {
        u.lang = "en-GB";
      }
      u.rate = rate;
      u.onstart = () => setSpeaking(true);
      u.onend = () => setSpeaking(false);
      u.onerror = () => setSpeaking(false);
      window.speechSynthesis.speak(u);
    },
    [rate],
  );

  const stop = useCallback(() => {
    if (typeof window === "undefined") return;
    window.speechSynthesis?.cancel();
    setSpeaking(false);
  }, []);

  const setRate = useCallback((r: number) => {
    setRateState(r);
    try {
      window.localStorage.setItem(RATE_KEY, String(r));
    } catch {
      // 不持久化也不影响本次使用
    }
  }, []);

  const toggleAuto = useCallback(() => {
    setAuto((v) => {
      const next = !v;
      try {
        window.localStorage.setItem(ON_KEY, next ? "1" : "0");
      } catch {
        // 同上
      }
      return next;
    });
  }, []);

  return { supported, speak, stop, speaking, rate, setRate, auto, toggleAuto };
}
