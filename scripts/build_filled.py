"""把例句里 Callan 教材原有的省略号（"..." 仿说填空）替换成具体、完整的答案，方便自学者
不看课本也能读懂例句。只处理 q 或 a 含 "..."/"…" 的条目，其余不动。

用法：
    python3 scripts/build_filled.py [data_dir] [out_dir]

按课跑，每课一次 codex exec 调用，结果落盘到 out_dir/lesson_N.json，可断点续跑。
全部跑完后用 scripts/merge_filled.py 合并成 data/callan/filled.json。
"""

import json
import re
import subprocess
import sys
from pathlib import Path

DOTS = re.compile(r"\.\.\.|…")

PROMPT_HEADER = """你在改写 Callan Method 英语教材里的问答例句。原句里的省略号（... 或 …）
是课本让学生仿说填空用的占位符，现在要把它替换成一个具体、完整、自然的答案，
让不看课本原文的自学者也能读懂完整例句该怎么说。

要求：
- 保留原句的语法结构、时态、句型不变，只把省略号处补全成具体内容。
- 如果原句是 "Yes, ... ~ No, ..." 这种一正一反两个分支，只保留其中更自然、更常见的一个分支，
  改写成一句完整、独立的答案，不要保留 "~" 和另一个分支。
- 补全的内容要贴近上下文常识（比如 (London) 这种括号地名占位符可以直接当真实地名用）。
- q（问题）本身一般不用改，除非问题里也有省略号；大多数情况下只改 a。
- 不要逐字翻译，只输出改写后的英文原句。
- 只输出 JSON，字段是 items 数组，每项 {key, q, a}，key 原样照抄输入，q/a 是改写后的完整英文句子。

以下是本课需要改写的问答句（JSON 数组，字段 key/q/a）：
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


def lesson_blank_items(lesson):
    items = []
    for gi, g in enumerate(lesson["groups"]):
        for ei, ex in enumerate(g["examples"]):
            if DOTS.search(ex["q"]) or DOTS.search(ex["a"]):
                items.append({"key": f"{lesson['lesson']}:{gi}:{ei}", "q": ex["q"], "a": ex["a"]})
    return items


def run_lesson(lesson, out_dir: Path, schema_path: Path):
    out_path = out_dir / f"lesson_{lesson['lesson']:03d}.json"
    if out_path.exists():
        return "skip"

    items = lesson_blank_items(lesson)
    if not items:
        out_path.write_text(json.dumps({"items": []}, ensure_ascii=False))
        return "empty"

    prompt = PROMPT_HEADER + json.dumps(items, ensure_ascii=False, indent=1)
    last_msg_path = out_dir / f"_last_{lesson['lesson']:03d}.json"

    try:
        proc = subprocess.run(
            [
                "codex", "exec",
                "--skip-git-repo-check",
                "--sandbox", "read-only",
                "--output-schema", str(schema_path),
                "-o", str(last_msg_path),
            ],
            input=prompt,
            text=True,
            capture_output=True,
            timeout=300,
        )
    except subprocess.TimeoutExpired:
        (out_dir / f"_error_{lesson['lesson']:03d}.log").write_text("codex exec timed out after 300s")
        return "timeout"

    if proc.returncode != 0 or not last_msg_path.exists():
        (out_dir / f"_error_{lesson['lesson']:03d}.log").write_text(proc.stdout + "\n" + proc.stderr)
        return "error"

    raw = last_msg_path.read_text()
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        (out_dir / f"_error_{lesson['lesson']:03d}.log").write_text(raw)
        return "error"

    got_keys = {it["key"] for it in data.get("items", [])}
    want_keys = {it["key"] for it in items}
    if got_keys != want_keys:
        (out_dir / f"_error_{lesson['lesson']:03d}.log").write_text(
            f"key mismatch, missing={want_keys - got_keys} extra={got_keys - want_keys}\n{raw}"
        )
        return "error"

    # 只查 a：q 里的省略号有时是引用课本词组本身（如 "no … whatsoever"），不是待填空
    still_blank = [it["key"] for it in data["items"] if DOTS.search(it["a"])]
    if still_blank:
        (out_dir / f"_error_{lesson['lesson']:03d}.log").write_text(
            f"still has ellipsis: {still_blank}\n{raw}"
        )
        return "error"

    out_path.write_text(json.dumps(data, ensure_ascii=False, indent=1))
    last_msg_path.unlink(missing_ok=True)
    return "ok"


def main():
    data_dir = Path(sys.argv[1]) if len(sys.argv) > 1 else Path("data/callan")
    out_dir = Path(sys.argv[2]) if len(sys.argv) > 2 else Path("scripts/.filled_out")
    out_dir.mkdir(parents=True, exist_ok=True)

    schema_path = out_dir / "_schema.json"
    schema_path.write_text(json.dumps(SCHEMA))

    lessons = load_lessons(data_dir)
    print(f"{len(lessons)} lessons", flush=True)

    for lesson in lessons:
        status = run_lesson(lesson, out_dir, schema_path)
        print(f"lesson {lesson['lesson']:>3}: {status}", flush=True)


if __name__ == "__main__":
    main()
