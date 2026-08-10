/**
 * 通览页「语法要点」标签：纯规则匹配问答句的时态/句型，客户端计算，
 * 不依赖任何模型调用——覆盖不到的组合就不显示标签。
 */

const BE_NEG = /\b(isn't|aren't|wasn't|weren't)\b/i;
const DO_NEG = /\b(doesn't|don't|didn't)\b/i;
const HAVE_NEG = /\b(hasn't|haven't|hadn't)\b/i;
const MODAL_NEG = /\b(won't|can't|couldn't|shouldn't|wouldn't|mustn't)\b/i;

const WH_WORDS = /^(what|where|when|who|whom|whose|why|which|how)\b/i;
const YN_START = /^(is|are|was|were|do|does|did|has|have|had|will|can|could|shall|should|would|may|might|must)\b/i;

function tense(text: string): string | null {
  if (/\b(has|have|had)\s+\w+ed\b|\b(has|have|had)\s+been\b/i.test(text)) return "完成时";
  if (/'m|'re|'s\s+\w+ing\b|\bis\s+\w+ing\b|\bare\s+\w+ing\b|\bam\s+\w+ing\b/i.test(text))
    return "进行时";
  if (/\b(was|were)\b/i.test(text)) return "一般过去时";
  if (/\bwill\b|\bshall\b|going to\b/i.test(text)) return "一般将来时";
  if (/\b(is|are|am|isn't|aren't)\b/i.test(text)) return "一般现在时";
  return null;
}

function questionType(q: string): string | null {
  const t = q.trim();
  if (WH_WORDS.test(t)) return "特殊疑问句";
  if (YN_START.test(t)) return "一般疑问句";
  return null;
}

function negationNote(a: string): string | null {
  if (BE_NEG.test(a) || DO_NEG.test(a) || HAVE_NEG.test(a) || MODAL_NEG.test(a)) {
    return "否定回答 + 修正";
  }
  return null;
}

/** 返回 1~3 个短标签；识别不出任何模式时返回 null（不展示折叠区） */
export function analyzePattern(q: string, a: string): string[] | null {
  const tags: string[] = [];
  const qt = questionType(q);
  if (qt) tags.push(qt);
  const ts = tense(q) ?? tense(a);
  if (ts) tags.push(ts);
  const neg = negationNote(a);
  if (neg) tags.push(neg);
  return tags.length > 0 ? tags : null;
}
