"""把 build_filled.py 逐课生成的 out_dir/lesson_*.json 合并成 data/callan/filled.json。

用法：
    python3 scripts/merge_filled.py <out_dir> [target]
"""

import json
import sys
from pathlib import Path


def main():
    out_dir = Path(sys.argv[1])
    target = Path(sys.argv[2]) if len(sys.argv) > 2 else Path("data/callan/filled.json")

    merged = {}
    files = sorted(out_dir.glob("lesson_*.json"))
    for f in files:
        data = json.loads(f.read_text())
        for item in data.get("items", []):
            merged[item["key"]] = {"q": item["q"], "a": item["a"]}

    errors = sorted(out_dir.glob("_error_*.log"))
    print(f"{len(files)} lesson files, {len(merged)} rewritten sentences, {len(errors)} errors")
    if errors:
        print("errors:", [e.name for e in errors])

    target.write_text(json.dumps(merged, ensure_ascii=False, indent=1) + "\n")
    print(f"wrote {target}")


if __name__ == "__main__":
    main()
