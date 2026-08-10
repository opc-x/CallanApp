"""从 Callan Method PDF 提取按课时组织的词组与例句。

PDF 用字体区分语义，这是提取的依据：

    FreeSet-Bold      35.0   LESSON N 课时标题
    FreeSet-DemiBold  12.5   词 / 词组（Stage 11-12 用 Arial-BoldMT）
    FreeSet-Book      10.5   提问
    FreeSet-Light     10.0   答句
    FreeSet-DemiBold  10.5   语法说明
    FreeSet-Light      9.8   页边小节号（丢弃）

用法: uvx --with pdfplumber python scripts/extract_callan.py <source_dir> <out_dir>
"""

import collections
import json
import re
import sys
from pathlib import Path

import pdfplumber

HEADING = "heading"   # LESSON N
WORDS = "words"       # 词 / 词组
QUESTION = "question"
ANSWER = "answer"
NOTE = "note"
SECTION = "section"     # Dictation 等斜体小节标题，仅用于控制跳过区块

# 同一物理行内问句与答句基线略有差异，按此容差聚行
LINE_TOLERANCE = 4.0
# 词组框内靠字间距分隔，正常空格约 3pt
WORD_GAP = 6.0
# 正文里这么大的横向跳变意味着换栏，而非词间空格
COLUMN_GAP = 20.0
# 页边小节号与正文同字号，只能靠横向位置区分：整段落在正文左边界之外即丢弃
MARGIN_SLACK = 2.0


def classify(fontname: str, size: float) -> str | None:
    base = fontname.split("+")[-1]
    size = round(size, 1)
    if base == "FreeSet-Bold" and size >= 30:
        return HEADING
    if size >= 12.0 and ("Bold" in base or "DemiBold" in base):
        return WORDS
    if base == "FreeSet-Book" and size >= 10.0:
        return QUESTION
    if base.startswith("FreeSet-Light") and size >= 10.0:
        return ANSWER
    if base.startswith("FreeSet-LightOblique") and size >= 9.5:
        return SECTION
    if "DemiBold" in base and size >= 10.0:
        return NOTE
    return None  # 页码、小节号等一律丢弃


def page_raw(page):
    """把一页拆成按行分组、带横向坐标的 run: [[(kind, text, x0, x1), ...], ...]"""
    chars = [c for c in page.chars if classify(c["fontname"], c["size"])]
    if not chars:
        return []

    lines: list[list[dict]] = []
    for ch in sorted(chars, key=lambda c: c["top"]):
        if lines and abs(ch["top"] - lines[-1][0]["top"]) <= LINE_TOLERANCE:
            lines[-1].append(ch)
        else:
            lines.append([ch])

    raw: list[list[tuple[str, str, float, float]]] = []
    for line in lines:
        line.sort(key=lambda c: c["x0"])
        out: list[tuple[str, str, float, float]] = []
        cur_kind, buf, prev = None, [], None
        for ch in line:
            kind = classify(ch["fontname"], ch["size"])
            gapped = prev is not None and ch["x0"] - prev["x1"] > (
                WORD_GAP if kind == WORDS else COLUMN_GAP
            )
            if kind != cur_kind or gapped:
                if buf:
                    out.append((cur_kind, "".join(buf), start, prev["x1"]))
                cur_kind, buf, start = kind, [], ch["x0"]
            buf.append(ch["text"])
            prev = ch
        if buf:
            out.append((cur_kind, "".join(buf), start, prev["x1"]))
        raw.append(out)
    return raw


def body_left_margin(pages_raw) -> float:
    """正文左边界取全书提问/说明行起点的众数。

    不能用最小值：页边小节号本身常被判成提问，会把边界拉到自己身上。
    """
    counts = collections.Counter(
        round(r[2])
        for page in pages_raw
        for line in page
        for r in line
        if r[0] in (QUESTION, NOTE)
    )
    return float(counts.most_common(1)[0][0]) if counts else 0.0


def to_runs(pages_raw, body_left: float):
    """按正文左边界剔除页边小节号，展平成阅读顺序的 (kind, text) 序列。"""
    cutoff = body_left - MARGIN_SLACK
    runs: list[tuple[str, str]] = []
    for page in pages_raw:
        for line in page:
            for kind, text, x0, x1 in line:
                if x1 < cutoff:
                    continue  # 页边小节号
                runs.append((kind, text))
            runs.append(("\n", ""))  # 行尾标记，供跨行拼接使用
    return runs


# ASCII 之外的字形排在子集字体尾部，偏移不再成立，逐个按上下文认出
CID_EXTRA = {
    99: "£",
    176: "ð",
    312: "ə",
    504: "–",
    505: "–",
    508: "“",
    509: "’",
    511: "“",
    512: "”",
    517: "–",
    642: "…",
    669: "fi",
    670: "fl",
}


def _decode_cid(m: re.Match) -> str:
    """部分内嵌字体缺 ToUnicode，pdfplumber 只能吐 (cid:N)。

    这些子集字体的字形序与 ASCII 差固定偏移 31，可无损还原。
    """
    out = []
    for n in re.findall(r"\(cid:(\d+)\)", m.group(0)):
        code = int(n) + 31
        if 32 <= code <= 126:
            out.append(chr(code))
        elif int(n) in CID_EXTRA:
            out.append(CID_EXTRA[int(n)])
    return "".join(out)


LIGATURES = {"ﬁ": "fi", "ﬂ": "fl", "ﬀ": "ff", "ﬃ": "ffi", "ﬄ": "ffl"}

# 这些区块不是课时内容：题目为编号列表、答案页、图表。排版与课文一致但语义不同，
# 靠字体无法区分，只能按标题跳过，直到下一个 LESSON 标题为止。
SKIP_SECTION = re.compile(
    r"""(?ix) ^ \s* (
          revision \s+ (exercises?|lessons?)
        | phrase \s+ exercise
        | word-building \s+ exercise
        | word \s+ pool \b .* revision \s+ exercise
        | (demonstration|pronunciation) \s+ charts?
        | dictation \s* \d+
    )"""
)


def normalise(text: str) -> str:
    text = re.sub(r"(?:\(cid:\d+\))+", _decode_cid, text)
    for lig, plain in LIGATURES.items():
        text = text.replace(lig, plain)
    return re.sub(r"\s+", " ", text).strip()


class LessonBuilder:
    """把 run 流累积成 groups: [{words, note, examples:[{q,a}]}]"""

    def __init__(self, lesson_id: int, stage: int):
        self.id = lesson_id
        self.stage = stage
        self.groups: list[dict] = []
        self.skipping = False
        self._kind = None
        self._buf: list[str] = []

    def _group(self) -> dict:
        if not self.groups:
            self.groups.append({"words": [], "note": "", "examples": []})
        return self.groups[-1]

    def _flush(self):
        if not self._buf:
            self._kind = None
            return
        text = normalise("".join(self._buf))
        kind, self._kind, self._buf = self._kind, None, []
        if not text:
            return
        g = self._group()
        if kind == WORDS:
            self.groups.append({"words": [text], "note": "", "examples": []})
        elif kind == NOTE:
            g["note"] = (g["note"] + " " + text).strip()
        elif kind == QUESTION:
            g["examples"].append({"q": text, "a": ""})
        elif kind == ANSWER:
            if g["examples"]:
                ex = g["examples"][-1]
                ex["a"] = (ex["a"] + " " + text).strip()

    def feed(self, kind: str, text: str):
        if kind == "\n":
            # 换行本身不切块；答句跨行时补一个空格
            if self._buf and not self._buf[-1].endswith(" "):
                self._buf.append(" ")
            return
        # Dictation/revision headings are not consistently set in the large
        # WORDS font; some stages use the NOTE font.  Detect them before the
        # kind-specific branches, otherwise their answer-font body is appended
        # to the final lesson answer until the next LESSON heading.
        if SKIP_SECTION.match(normalise(text)):
            self._flush()
            self.skipping = True
            return
        if kind == WORDS:
            # 相邻的词组 run 各自独立成词条
            self._flush()
            self.skipping = False
            self._kind = WORDS
            self._buf = [text]
            self._flush()
            return
        if self.skipping:
            return
        if kind != self._kind:
            self._flush()
            self._kind = kind
        self._buf.append(text)

    def finish(self) -> dict:
        self._flush()
        groups = []
        for g in self.groups:
            words = [w for w in (normalise(x) for x in g["words"]) if w]
            # 问句必须含实词；纯编号说明是漏网的列表序号
            examples = [
                e
                for e in g["examples"]
                if e["a"] and re.search(r"[A-Za-z]", e["q"])
            ]
            if words or examples:
                # 行内释义如 get (receive) a month? 会因字体切成
                # question/answer/question 三段；把它还原成一条完整问句。
                repaired = []
                i = 0
                while i < len(examples):
                    current = examples[i]
                    if (
                        i + 1 < len(examples)
                        and re.fullmatch(r"\([^)]{1,40}\)", current["a"])
                    ):
                        following = examples[i + 1]
                        repaired.append(
                            {
                                "q": f'{current["q"]} {current["a"]} {following["q"]}',
                                "a": following["a"],
                            }
                        )
                        i += 2
                    else:
                        repaired.append(current)
                        i += 1
                examples = repaired

                # 不规则动词表与紧随其后的问句有时使用同一字体，PDF 会把
                # 两者粘在一起。表格保留进课本说明，问句恢复为独立文本。
                for example in examples:
                    if example["q"].count("–") < 5 or "?" not in example["q"]:
                        continue
                    match = re.search(
                        r"\s(?=(?:What|Which|Who|Where|When|Why|How|Have|Has|Had|Do|Does|Did|Can|Could|Will|Would|Should|Is|Are|Was|Were)\b)",
                        example["q"],
                    )
                    if match:
                        table = example["q"][: match.start()].strip()
                        example["q"] = example["q"][match.end() :].strip()
                        g["note"] = (g["note"] + " " + table).strip()

                groups.append(
                    {"words": words, "note": g["note"], "examples": examples}
                )
        # 连续的纯词条（无例句）合并进下一个有例句的组
        merged: list[dict] = []
        pending: list[str] = []
        for g in groups:
            if not g["examples"] and not g["note"]:
                pending.extend(g["words"])
                continue
            g["words"] = pending + g["words"]
            pending = []
            merged.append(g)
        if pending:
            merged.append({"words": pending, "note": "", "examples": []})
        # 三处原书跨字体/跨行导致的确定性断句，按 PDF 原文修复；不改写教材措辞。
        exact_repairs = {
            (16, "hand side?"): "Are you sitting on my left-hand side or on my right-hand side?",
            (189, "great”, why can we not reduce the relative clause by omitting the verb “be”?"): (
                "In the sentence “The picture that John is painting looks great”, "
                "why can we not reduce the relative clause by omitting the verb “be”?"
            ),
        }
        for group in merged:
            for example in group["examples"]:
                replacement = exact_repairs.get((self.id, example["q"]))
                if replacement:
                    example["q"] = replacement
                if self.id == 59 and example["q"] == "Which is the greatest city in your country?":
                    example["a"] = "... is the greatest city in my country"
        return {"lesson": self.id, "stage": self.stage, "groups": merged}


def extract(pdf_path: Path, stage: int) -> list[dict]:
    with pdfplumber.open(pdf_path) as pdf:
        pages_raw = [page_raw(page) for page in pdf.pages]

    body_left = body_left_margin(pages_raw)

    lessons: list[LessonBuilder] = []
    current: LessonBuilder | None = None
    highest = 0

    for kind, text in to_runs(pages_raw, body_left):
        if kind == HEADING:
            m = re.search(r"LESSON\s*(\d+)", text, re.I)
            if not m:
                continue
            num = int(m.group(1))
            if num <= highest:
                # 课号不再递增 → 已进入书末的听写/图表部分
                break
            highest = num
            if current:
                lessons.append(current)
            current = LessonBuilder(num, stage)
        elif current:
            current.feed(kind, text)

    if current:
        lessons.append(current)
    return [l.finish() for l in lessons]


def main():
    src, out = Path(sys.argv[1]), Path(sys.argv[2])
    out.mkdir(parents=True, exist_ok=True)

    index = []
    for stage in range(1, 13):
        pdf = src / f"Callan Method {stage}.pdf"
        if not pdf.exists():
            print(f"skip {pdf}", file=sys.stderr)
            continue
        lessons = extract(pdf, stage)
        (out / f"stage-{stage}.json").write_text(
            json.dumps(lessons, ensure_ascii=False), encoding="utf-8"
        )
        for l in lessons:
            index.append(
                {
                    "lesson": l["lesson"],
                    "stage": stage,
                    "groups": len(l["groups"]),
                    "words": sum(len(g["words"]) for g in l["groups"]),
                    "examples": sum(len(g["examples"]) for g in l["groups"]),
                }
            )
        tw = sum(sum(len(g["words"]) for g in l["groups"]) for l in lessons)
        te = sum(sum(len(g["examples"]) for g in l["groups"]) for l in lessons)
        print(f"Stage {stage:2d}: {len(lessons):3d} 课  {tw:5d} 词条  {te:5d} 例句")

    index.sort(key=lambda x: x["lesson"])
    (out / "index.json").write_text(
        json.dumps(index, ensure_ascii=False), encoding="utf-8"
    )
    print(f"\n合计 {len(index)} 课 → {out}")


if __name__ == "__main__":
    main()
