"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const RATE_KEY = "callan.speech.rate";
const ON_KEY = "callan.speech.auto";

/** Callan 是英式教材，优先挑英音 */
function pickVoice(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | null {
  if (voices.length === 0) return null;
  const en = voices.filter((v) => v.lang.replace("_", "-").startsWith("en"));
  if (en.length === 0) return null;
  const gb = en.filter((v) => v.lang.replace("_", "-").startsWith("en-GB"));
  const pool = gb.length > 0 ? gb : en;
  // 系统自带的高质量音色通常不带 "Google"/"Microsoft" 前缀之外的标记，
  // 这里只做稳定排序，优先本地合成（离线可用、延迟低）
  const local = pool.filter((v) => v.localService);
  return (local[0] ?? pool[0]) ?? null;
}

export function useSpeech() {
  const [supported, setSupported] = useState(false);
  const [auto, setAuto] = useState(false);
  const [rate, setRateState] = useState(1);
  const [speaking, setSpeaking] = useState(false);
  const voiceRef = useRef<SpeechSynthesisVoice | null>(null);

  useEffect(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    setSupported(true);

    try {
      const r = Number(window.localStorage.getItem(RATE_KEY));
      if (r >= 0.5 && r <= 2) setRateState(r);
      setAuto(window.localStorage.getItem(ON_KEY) === "1");
    } catch {
      // 读不到就用默认值
    }

    const load = () => {
      voiceRef.current = pickVoice(window.speechSynthesis.getVoices());
    };
    load();
    window.speechSynthesis.addEventListener("voiceschanged", load);
    return () => {
      window.speechSynthesis.removeEventListener("voiceschanged", load);
      window.speechSynthesis.cancel();
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
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
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
