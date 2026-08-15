import stage1 from "@/data/callan/stage-1.json";
import stage2 from "@/data/callan/stage-2.json";
import stage3 from "@/data/callan/stage-3.json";
import stage4 from "@/data/callan/stage-4.json";
import stage5 from "@/data/callan/stage-5.json";
import stage6 from "@/data/callan/stage-6.json";
import stage7 from "@/data/callan/stage-7.json";
import stage8 from "@/data/callan/stage-8.json";
import stage9 from "@/data/callan/stage-9.json";
import stage10 from "@/data/callan/stage-10.json";
import stage11 from "@/data/callan/stage-11.json";
import stage12 from "@/data/callan/stage-12.json";
import indexData from "@/data/callan/index.json";
import ipaData from "@/data/callan/ipa.json";
import glossData from "@/data/callan/gloss.json";

export type Example = { q: string; a: string };

export type Group = {
  /** 本组新出现的词与词组 */
  words: string[];
  /** 课本里的语法说明，可为空 */
  note: string;
  examples: Example[];
};

export type Lesson = {
  lesson: number;
  stage: number;
  groups: Group[];
};

export type LessonSummary = {
  lesson: number;
  stage: number;
  groups: number;
  words: number;
  examples: number;
};

const STAGES: Lesson[][] = [
  stage1,
  stage2,
  stage3,
  stage4,
  stage5,
  stage6,
  stage7,
  stage8,
  stage9,
  stage10,
  stage11,
  stage12,
];

export const lessonIndex = indexData as LessonSummary[];

/** 词条 → 英式 RP 音标，由 scripts/build_ipa.py 生成，覆盖约 94% 的词条 */
const IPA = ipaData as Record<string, string>;

/** 只挑出这一课用到的音标，客户端就不必收下整张表 */
export function lessonIpa(lesson: Lesson): Record<string, string> {
  const picked: Record<string, string> = {};
  for (const g of lesson.groups) {
    for (const w of g.words) {
      const ipa = IPA[w];
      if (ipa) picked[w] = ipa;
    }
  }
  return picked;
}

export type LongSentence = {
  q: string;
  backbone: string;
  gloss: string;
  chunks: string[];
  /** 构造公式：把这句话的语法抽象成可复用的规则，帮学生自己造句 */
  rule: string;
  /** 套用同一公式写的另一句英文 + 中文释义，证明规则能泛化 */
  example: string;
};

/**
 * 词条 → 中文释义、课时 → AI 生成的语法小结/长句拆读，均由离线批处理生成，
 * 存于 data/callan/gloss.json，覆盖不到的词/课就留空。
 */
const GLOSS = glossData as {
  words: Record<string, string>;
  grammar: Record<string, string[]>;
  longSentence?: Record<string, LongSentence[]>;
};

/** 任意单词查释义，覆盖不到就返回 null（gloss.json 只收了课本里出现过的词） */
export function wordGloss(word: string): string | null {
  const clean = word.trim();
  return GLOSS.words[clean] ?? GLOSS.words[clean.toLowerCase()] ?? null;
}

/** 只挑出这一课用到的词义，客户端就不必收下整张表 */
export function lessonGloss(lesson: Lesson): Record<string, string> {
  const picked: Record<string, string> = {};
  for (const g of lesson.groups) {
    for (const w of g.words) {
      const meaning = GLOSS.words[w];
      if (meaning) picked[w] = meaning;
    }
  }
  return picked;
}

/** 课末小结用：这一课的 AI 生成语法讲解要点，覆盖不到时返回空数组 */
export function lessonGrammar(lesson: Lesson): string[] {
  return GLOSS.grammar[String(lesson.lesson)] ?? [];
}

/** 课末小结用：这一课挑出的长难句拆读（骨架 + 分句朗读块），每课最多 3 句，覆盖不到时返回空数组 */
export function lessonLongSentences(lesson: Lesson): LongSentence[] {
  return GLOSS.longSentence?.[String(lesson.lesson)] ?? [];
}

export const TOTAL_LESSONS = lessonIndex.length;

export function getLesson(lesson: number): Lesson | null {
  const summary = lessonIndex.find((l) => l.lesson === lesson);
  if (!summary) return null;
  const stage = STAGES[summary.stage - 1];
  return stage?.find((l) => l.lesson === lesson) ?? null;
}

/** 词 → 该词在教材里全局第一次出现的位置，懒构建一次后缓存 */
let wordLocationCache: Map<string, { lesson: number; gi: number }> | null = null;

function buildWordLocationIndex(): Map<string, { lesson: number; gi: number }> {
  const map = new Map<string, { lesson: number; gi: number }>();
  for (const stage of STAGES) {
    for (const lesson of stage) {
      lesson.groups.forEach((g, gi) => {
        for (const w of g.words) {
          const key = w.trim().toLowerCase();
          if (!map.has(key)) map.set(key, { lesson: lesson.lesson, gi });
        }
      });
    }
  }
  return map;
}

/** 查某个词在教材里第一次出现的位置（课号 + 组号），查不到返回 null */
export function wordLocation(word: string): { lesson: number; gi: number } | null {
  wordLocationCache ??= buildWordLocationIndex();
  return wordLocationCache.get(word.trim().toLowerCase()) ?? null;
}

/** 课时按 Stage 分组，供目录页使用 */
export function stageOutline() {
  const byStage = new Map<number, LessonSummary[]>();
  for (const l of lessonIndex) {
    const list = byStage.get(l.stage) ?? [];
    list.push(l);
    byStage.set(l.stage, list);
  }
  return [...byStage.entries()]
    .sort(([a], [b]) => a - b)
    .map(([stage, lessons]) => ({
      stage,
      lessons,
      words: lessons.reduce((n, l) => n + l.words, 0),
      examples: lessons.reduce((n, l) => n + l.examples, 0),
    }));
}
