"""生成「句意」——每条问答句的中文翻译，靠本地 claude CLI（用户的 Claude 订阅）批量跑。

旧版 data/callan/meanings.json 是在 filled.json（省略号补全）出现之前生成的，
翻译的是带省略号的原始课本英文，导致跟页面上实际展示的补全后英文对不上，
表现为中文句意里一堆"如果我们说……，意思就是……"这种断头翻译。
这个脚本改成先套用 filled.json 补全英文，再基于补全后的英文重新翻译。

用法：
    python3 scripts/build_meanings.py [data_dir] [out_dir]

按课跑，每课一次 claude -p 调用，结果落盘到 out_dir/lesson_N.json，可断点续跑。
全部跑完后用 scripts/merge_meanings.py 合并成 data/callan/meanings.json。
"""

import json
import subprocess
import sys
from pathlib import Path

PROMPT_HEADER = """你在为 Callan Method 英语教材的问答句写中文「句意」翻译，帮自学者理解每句话的实际意思。

要求：
- 逐条把 q（问题）和 a（答案）分别翻译成自然、口语化的中文，字段名仍是 q/a。
- 翻译必须是完整、具体的句子，紧扣该条 q/a 的实际英文内容，绝对不能用「……」「等等」之类的省略号或占位词敷衍带过。
- 每条 item 是独立的一问一答，即使连续几条 item 其实来自同一篇阅读短文的不同段落/问题，也必须
  只翻译该条自己的 q/a 内容，不要把长文本拆开分翻到别的 key 上，也不要把别的 key 的内容错位挪过来。
- 不逐字直译，按中文表达习惯组织句子，但不能改变原意、不能省略原句信息。
- 只输出 JSON，字段是 items 数组，每项 {key, q, a}，key 原样照抄输入，q/a 是对应的中文翻译。

以下是本课的问答句（JSON 数组，字段 key/q/a，是已经把课本原有省略号填空补全后的英文）：
"""

SCHEMA = {
    "type": "object",
    "properties": {
        "items": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "key": {"type": "string"},
                    "q": {"type": "string"},
                    "a": {"type": "string"},
                },
                "required": ["key", "q", "a"],
                "additionalProperties": False,
            },
        }
    },
    "required": ["items"],
    "additionalProperties": False,
}


def load_lessons(data_dir: Path):
    lessons = []
    for stage_file in sorted(data_dir.glob("stage-*.json"), key=lambda p: int(p.stem.split("-")[1])):
        lessons.extend(json.loads(stage_file.read_text()))
    lessons.sort(key=lambda l: l["lesson"])
    return lessons


def lesson_items(lesson, filled):
    items = []
    for gi, g in enumerate(lesson["groups"]):
        for ei, ex in enumerate(g["examples"]):
            key = f"{lesson['lesson']}:{gi}:{ei}"
            f = filled.get(key)
            q, a = (f["q"], f["a"]) if f else (ex["q"], ex["a"])
            items.append({"key": key, "q": q, "a": a})
    return items


def run_lesson(lesson, filled, out_dir: Path, schema: str):
    out_path = out_dir / f"lesson_{lesson['lesson']:03d}.json"
    if out_path.exists():
        return "skip"

    items = lesson_items(lesson, filled)
    if not items:
        out_path.write_text(json.dumps({"items": []}, ensure_ascii=False))
        return "empty"

    prompt = PROMPT_HEADER + json.dumps(items, ensure_ascii=False, indent=1)

    try:
        proc = subprocess.run(
            [
                "claude", "-p",
                "--output-format", "json",
                "--json-schema", schema,
            ],
            input=prompt,
            text=True,
            capture_output=True,
            timeout=300,
        )
    except subprocess.TimeoutExpired:
        (out_dir / f"_error_{lesson['lesson']:03d}.log").write_text("claude -p timed out after 300s")
        return "timeout"

    if proc.returncode != 0:
        (out_dir / f"_error_{lesson['lesson']:03d}.log").write_text(proc.stdout + "\n" + proc.stderr)
        return "error"

    try:
        envelope = json.loads(proc.stdout)
        data = envelope["structured_output"]
    except (json.JSONDecodeError, KeyError, TypeError):
        (out_dir / f"_error_{lesson['lesson']:03d}.log").write_text(proc.stdout + "\n" + proc.stderr)
        return "error"

    got_keys = {it["key"] for it in data.get("items", [])}
    want_keys = {it["key"] for it in items}
    if got_keys != want_keys:
        (out_dir / f"_error_{lesson['lesson']:03d}.log").write_text(
            f"key mismatch, missing={want_keys - got_keys} extra={got_keys - want_keys}\n{proc.stdout}"
        )
        return "error"

    out_path.write_text(json.dumps(data, ensure_ascii=False, indent=1))
    return "ok"


def main():
    data_dir = Path(sys.argv[1]) if len(sys.argv) > 1 else Path("data/callan")
    out_dir = Path(sys.argv[2]) if len(sys.argv) > 2 else Path("scripts/.meanings_out")
    out_dir.mkdir(parents=True, exist_ok=True)

    schema = json.dumps(SCHEMA)

    lessons = load_lessons(data_dir)
    filled = json.loads((data_dir / "filled.json").read_text())
    print(f"{len(lessons)} lessons", flush=True)

    for lesson in lessons:
        status = run_lesson(lesson, filled, out_dir, schema)
        print(f"lesson {lesson['lesson']:>3}: {status}", flush=True)


if __name__ == "__main__":
    main()
