"""生成「场景解析」——每条问答句用在什么场景/为什么这么问，靠本地 codex CLI（用户的 codex 额度）批量跑。

用法：
    python3 scripts/build_scenario.py [data_dir] [out_dir]

按课跑，每课一次 codex exec 调用，结果落盘到 out_dir/lesson_N.json，可断点续跑。
全部跑完后用 scripts/merge_scenario.py 合并成 data/callan/scenario.json。
"""

import json
import subprocess
import sys
from pathlib import Path

PROMPT_HEADER = """你在为 Callan Method 英语教材的问答句写「场景解析」，帮自学者理解这句话通常在什么情境下使用、为什么这么问/这么答，而不是逐字翻译。

要求：
- 每条 20-45 个汉字，一句话，口语化、直接说人话，不要「本句用于……」这种模板腔。
- 说清楚：这句典型用在什么场景/语境，或者这个句型的沟通目的是什么。
- 不要重复翻译 q/a 本身的字面意思（那是另一个「句意」板块做的事）。
- 遇到 (London) 这种括号里的占位词，忽略括号，把它当作「随口换成任意地名/人名」处理。
- 遇到省略号或 etc.，理解为「照句型自己填」，不用特别提。
- 表达方式要有变化，别让相邻几条用同一个句式开头。
- 只输出 JSON，字段是 items 数组，每项 {key, scenario}，key 原样照抄输入。

以下是本课的问答句（JSON 数组，字段 key/q/a）：
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
                    "scenario": {"type": "string"},
                },
                "required": ["key", "scenario"],
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


def lesson_items(lesson):
    items = []
    for gi, g in enumerate(lesson["groups"]):
        for ei, ex in enumerate(g["examples"]):
            items.append({"key": f"{lesson['lesson']}:{gi}:{ei}", "q": ex["q"], "a": ex["a"]})
    return items


def run_lesson(lesson, out_dir: Path, schema_path: Path):
    out_path = out_dir / f"lesson_{lesson['lesson']:03d}.json"
    if out_path.exists():
        return "skip"

    items = lesson_items(lesson)
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

    out_path.write_text(json.dumps(data, ensure_ascii=False, indent=1))
    last_msg_path.unlink(missing_ok=True)
    return "ok"


def main():
    data_dir = Path(sys.argv[1]) if len(sys.argv) > 1 else Path("data/callan")
    out_dir = Path(sys.argv[2]) if len(sys.argv) > 2 else Path("scripts/.scenario_out")
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
