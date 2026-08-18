"""预生成课本词/例句的英式女声 mp3（en-GB-SoniaNeural，edge-tts 免费云端合成），
取代运行时完全依赖浏览器本地语音包（音色随系统飘忽、音质参差）。

用法：
    uv run --with edge-tts python3 scripts/build_audio.py [data_dir] [out_dir]

按「清洗后的文本」去重生成，同一句子/单词无论在哪一课出现，只生成一份 mp3。
文件名是文本内容的 md5 前 16 位，产出 data/callan/audio-manifest.json
（{ 清洗后文本: 文件名 }），前端按同样的清洗规则查表播放，查不到才退回浏览器 TTS。
可断点续跑：mp3 已存在就跳过。
"""

import asyncio
import hashlib
import json
import re
import sys
from pathlib import Path

VOICE = "en-GB-SoniaNeural"
CONCURRENCY = 10
DOTS_TILDE = re.compile(r"[…~]+")
SPACES = re.compile(r"\s+")


def clean(text: str) -> str:
    text = DOTS_TILDE.sub(" ", text)
    text = SPACES.sub(" ", text).strip()
    return text


def filename_for(text: str) -> str:
    return hashlib.md5(text.encode("utf-8")).hexdigest()[:16] + ".mp3"


def load_lessons(data_dir: Path):
    lessons = []
    for stage_file in sorted(data_dir.glob("stage-*.json"), key=lambda p: int(p.stem.split("-")[1])):
        lessons.extend(json.loads(stage_file.read_text()))
    lessons.sort(key=lambda l: l["lesson"])
    return lessons


def collect_texts(data_dir: Path) -> set[str]:
    lessons = load_lessons(data_dir)
    filled = json.loads((data_dir / "filled.json").read_text())
    texts = set()
    for lesson in lessons:
        for gi, g in enumerate(lesson["groups"]):
            for w in g.get("words", []):
                c = clean(w)
                if c:
                    texts.add(c)
            for ei, ex in enumerate(g["examples"]):
                key = f"{lesson['lesson']}:{gi}:{ei}"
                f = filled.get(key)
                q, a = (f["q"], f["a"]) if f else (ex["q"], ex["a"])
                for t in (q, a):
                    c = clean(t)
                    if c:
                        texts.add(c)
    return texts


async def gen_one(text: str, out_path: Path) -> bool:
    import edge_tts

    for attempt in range(3):
        try:
            comm = edge_tts.Communicate(text, VOICE)
            await comm.save(str(out_path))
            if out_path.exists() and out_path.stat().st_size > 0:
                return True
        except Exception as e:
            if attempt == 2:
                print(f"  FAILED after 3 attempts: {text[:50]!r}: {e}", flush=True)
        await asyncio.sleep(1)
    return False


async def run(texts: list[str], audio_dir: Path):
    sem = asyncio.Semaphore(CONCURRENCY)
    done = 0
    total = len(texts)
    failed = []

    async def bound(text):
        nonlocal done
        out_path = audio_dir / filename_for(text)
        if out_path.exists() and out_path.stat().st_size > 0:
            done += 1
            return
        async with sem:
            ok = await gen_one(text, out_path)
            done += 1
            if not ok:
                failed.append(text)
            if done % 200 == 0:
                print(f"  {done}/{total}", flush=True)

    await asyncio.gather(*[bound(t) for t in texts])
    return failed


def main():
    data_dir = Path(sys.argv[1]) if len(sys.argv) > 1 else Path("data/callan")
    audio_dir = Path(sys.argv[2]) if len(sys.argv) > 2 else Path("public/audio/sentences")
    audio_dir.mkdir(parents=True, exist_ok=True)

    texts = sorted(collect_texts(data_dir))
    print(f"{len(texts)} unique texts, voice={VOICE}, out={audio_dir}", flush=True)

    failed = asyncio.run(run(texts, audio_dir))

    manifest = {}
    for t in texts:
        p = audio_dir / filename_for(t)
        if p.exists() and p.stat().st_size > 0:
            manifest[t] = filename_for(t)
    manifest_path = data_dir / "audio-manifest.json"
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=1) + "\n")
    print(f"wrote {manifest_path}, {len(manifest)} entries, {len(failed)} failed", flush=True)
    if failed:
        (data_dir / "_audio_failed.json").write_text(json.dumps(failed, ensure_ascii=False, indent=1))


if __name__ == "__main__":
    main()
