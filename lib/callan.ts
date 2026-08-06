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

export const TOTAL_LESSONS = lessonIndex.length;

export function getLesson(lesson: number): Lesson | null {
  const summary = lessonIndex.find((l) => l.lesson === lesson);
  if (!summary) return null;
  const stage = STAGES[summary.stage - 1];
  return stage?.find((l) => l.lesson === lesson) ?? null;
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
