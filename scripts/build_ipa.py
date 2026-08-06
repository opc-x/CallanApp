"""为 data/callan/stage-*.json 里的词条生成英式 RP 音标表。

    uvx --with eng-to-ipa python scripts/build_ipa.py data/callan

eng_to_ipa 给的是美式音标，这里再按规则转成英式 RP —— Callan 是英国教材，
lib/speech.ts 也优先挑 en-GB 音色，音标跟着走才不别扭。

转换只覆盖规则性的差异（非儿化、oʊ→əʊ、ɛ→e 等）。两处已知的规则外偏差：
- PALM 与 LOT 在美式里都是 ɑ，机械转换会把 father 也转成 /ɒ/，靠 _PALM 兜底；
- BATH 词组（ask/dance/class…）美式 æ、英式 ɑː，靠 _BATH 兜底。
"""

import json
import re
import sys
from pathlib import Path

import eng_to_ipa

# 词典查不到、但课里反复出现的条目，手写
_MANUAL = {
    "I’m": "aɪm", "I’ve": "aɪv", "you’re": "jɔː", "you’ve": "juːv",
    "he’s": "hiːz", "she’s": "ʃiːz", "it’s": "ɪts", "we’re": "wɪə",
    "we’ve": "wiːv", "they’re": "ðeə", "they’ve": "ðeɪv", "that’s": "ðæts",
    "what’s": "wɒts", "where’s": "weəz", "who’s": "huːz", "there’s": "ðeəz",
    "isn’t": "ˈɪznt", "aren’t": "ɑːnt", "haven’t": "ˈhævnt",
    "hasn’t": "ˈhæznt", "don’t": "dəʊnt", "doesn’t": "ˈdʌznt",
    "can’t": "kɑːnt", "won’t": "wəʊnt", "didn’t": "ˈdɪdnt",
    "wasn’t": "ˈwɒznt", "weren’t": "wɜːnt", "couldn’t": "ˈkʊdnt",
    "wouldn’t": "ˈwʊdnt", "shouldn’t": "ˈʃʊdnt", "mustn’t": "ˈmʌsnt",
    "Beijing": "ˌbeɪˈdʒɪŋ", "Beĳing": "ˌbeɪˈdʒɪŋ", "Athens": "ˈæθɪnz",
    "Moscow": "ˈmɒskəʊ", "Scandinavia": "ˌskændɪˈneɪviə",
    "Wi–Fi": "ˈwaɪfaɪ", "etc.": "ɪtˈsetrə",
    # 弱读功能词：单音节规则会把 schwa 误当 STRUT
    "a": "ə", "an": "ən", "the": "ðə", "of": "əv", "to": "tə", "was": "wəz",
    "are": "ɑː", "were": "wɜː", "or": "ɔː", "for": "fɔː", "your": "jɔː",
    # 词典本身给错的（重音位置或音段缺失）
    "get": "ɡet", "gets": "ɡets", "that": "ðæt", "what": "wɒt", "want": "wɒnt",
    "wants": "wɒnts", "watch": "wɒtʃ", "wash": "wɒʃ", "question": "ˈkwestʃən", "umbrella": "ʌmˈbrelə", "colour": "ˈkʌlə",
    "colours": "ˈkʌləz", "water": "ˈwɔːtə", "favourite": "ˈfeɪvərɪt", "neighbour": "ˈneɪbə",
}

# 美式 æ、英式 ɑː 的 BATH 词组
_BATH = {
    "ask", "asked", "asking", "answer", "answers", "answered", "answering",
    "after", "afternoon", "afterwards", "aunt", "bath", "baths", "branch",
    "can't", "cast", "castle", "chance", "class", "classroom", "dance",
    "dancing", "demand", "example", "fast", "father", "glass", "glasses",
    "grass", "half", "last", "lastly", "laugh", "laughing", "master",
    "nasty", "pass", "passed", "passenger", "past", "pasta", "path",
    "plant", "rather", "task", "vast",
}

# 美式 ɑ 在英式里是 ɑː（PALM）而非 ɒ（LOT）
_PALM = {
    "father", "rather", "calm", "palm", "half", "art", "arm", "car", "star",
    "hard", "heart", "park", "large", "March", "garden", "party", "far",
}

# 美式 ɔ 后接 r + 元音时，英式多数是 ɔː（story），这几个例外是 ɒ
_LOT_R = {
    "orange", "oranges", "forest", "forests", "foreign", "moral", "morally",
    "origin", "original", "originally", "horrible", "horribly", "florist",
    "coral", "quarrel", "warrant",
}

# 拼成 aw/au/al/ough 的才是 THOUGHT(ɔː)，拼成短 o 的是 CLOTH/LOT(ɒ)
_THOUGHT_SPELLING = re.compile(r"(aw|au|al|ough|augh|oar|oor|ore|our|ory)")

_LETTERS = re.compile(r"^[A-Za-z’'\-]+$")


_VOWELS = "aeiouɑɔɛɪʊəæʌɜ"
_HAPPY = "\x00"  # 占位：词尾非重读的 happY 元音，最后还原成不加长的 i


def _to_british(ipa: str, word: str) -> str:
    """把 eng_to_ipa 的美式记法转成英式 RP。

    eng_to_ipa 的记法有两处要留意：NURSE(girl) 和 lettER(under) 都写作 ər，
    只能靠重音位置区分；STRUT(under) 写作 ə，靠主重音标记还原成 ʌ。
    """
    s = ipa
    lower = word.lower().strip("’'")
    stressed = "ˈ" in s

    # 1) 连字与 ASCII g 换成标准 IPA
    s = s.replace("ʧ", "tʃ").replace("ʤ", "dʒ")

    # 2) NURSE：单音节词里的 ər，或紧跟主重音的 ər。r 后跟元音时（hurry）
    #    r 属于下一音节，不算 NURSE
    if not stressed and "ˌ" not in s:
        s = re.sub(rf"ər(?![{_VOWELS}])", "ɜː", s)
    else:
        s = re.sub(rf"ˈ([^{_VOWELS}]*)ər(?![{_VOWELS}])", r"ˈ\1ɜː", s)

    # 3) 其余 r 化韵一律非儿化。r 后面还跟着元音时（sorry、very）r 属于下一
    #    音节、要原样留着，所以每条都带「r 后不是元音」的条件
    s = s.replace("ɝ", "ɜː").replace("ɚ", "ə")
    for src, dst in (
        ("aɪr", "aɪə"), ("aʊr", "aʊə"),
        ("ɑr", "ɑː"), ("ɔr", "ɔː"), ("ɛr", "eə"),
        ("ɪr", "ɪə"), ("ir", "ɪə"), ("ʊr", "ʊə"), ("ur", "ʊə"),
        ("ər", "ə"),
    ):
        s = re.sub(rf"{src}(?![{_VOWELS}])", dst, s)
    if re.search(r"(ear|eer|ier|erio)", lower):
        s = re.sub(rf"ɪr(?=[{_VOWELS}])", "ɪər", s)
    s = re.sub(rf"r(?=[^{_VOWELS}ː]|$)", "", s)

    # 4) STRUT：重读音节上的 ə 实际是 ʌ（under、mother、young）。
    #    ɪə/eə/ʊə 里的 ə 是双元音的一半，不能动
    if stressed:
        s = re.sub(rf"ˈ([^{_VOWELS}]*)ə", r"ˈ\1ʌ", s)
        s = re.sub(rf"ˌ([^{_VOWELS}]*)ə", r"ˌ\1ʌ", s)
    elif "ˌ" not in s and len(s) > 1:
        s = re.sub(r"(?<![ɪʊe])ə", "ʌ", s)  # 单音节必然重读

    # 5) 单元音对应
    s = s.replace("oʊ", "əʊ")
    # marry/merry 美式合流，靠拼写分开：-arr-/-ar+元音 在英式是 æ
    if re.search(r"arr?[aeiouy]", lower):
        s = s.replace("ɛr", "ær")
    s = s.replace("ɛ", "e")
    s = re.sub(r"ɑ(?!ː)", "ɑː" if lower in _PALM else "ɒ", s)
    if lower in _BATH:
        s = s.replace("æ", "ɑː")
    # THOUGHT(ɔː) 与 CLOTH/LOT(ɒ) 美式合流，同样靠拼写分开
    if lower in _LOT_R or not _THOUGHT_SPELLING.search(lower):
        s = re.sub(r"ɔ(?![ːɪ])", "ɒ", s)
    s = re.sub(r"ɔ(?![ːɪ])", "ɔː", s)
    # -ied / -ed 词尾的 i 是 ɪ 不是 iː
    s = re.sub(r"id$", "ɪd", s)
    # 多音节词词尾的 happY 元音不加长
    if stressed:
        s = re.sub(r"i$", _HAPPY, s)
    s = re.sub(r"i(?!ː)", "iː", s)
    s = re.sub(r"u(?!ː)", "uː", s)

    # 6) 收尾：长度记号别叠、词尾 əl/ən 写成音节性辅音（RP 惯例）
    s = re.sub(r"ːː+", "ː", s)
    s = re.sub(r"(?<=[tdszʃʒnl])əl$", "l", s)
    s = re.sub(r"(?<=[tdszʃʒnl])ən$", "n", s)
    return s.replace(_HAPPY, "i").replace("g", "ɡ")


def _skip(entry: str) -> bool:
    """提取时混进来的语法标题、整句例子、公式 —— 不该有音标。"""
    return (
        len(entry.split()) > 4
        or "=" in entry
        or "“" in entry
        or entry.endswith(":")
        or bool(re.match(r"^\d[).]", entry))
        or "vocabulary" in entry.lower()
        or entry.lower().startswith(("lesson", "stage", "index"))
    )


def ipa_for(entry: str) -> str | None:
    """整条目逐词转换。只要有一个词查不到就整条不给音标 —— 标注一半、
    另一半漏出英文原词，比没有音标更难看。"""
    if entry in _MANUAL:
        return _MANUAL[entry]
    if _skip(entry):
        return None

    # 括号里通常是同一个词的缩写变体（what is (what’s)），不重复注音
    body = re.sub(r"[（(].*?[)）]", " ", entry)

    out = []
    for token in body.split():
        core = token.strip("()（）,.;:!?？“”\"")
        if not core:
            continue
        if core in _MANUAL:
            out.append(_MANUAL[core])
            continue
        if not _LETTERS.match(core):  # 纯标点、数字：跳过不注音
            continue
        american = eng_to_ipa.convert(core)
        if american.endswith("*"):  # 词典未收录
            return None
        out.append(_to_british(american, core))
    return " ".join(out) if out else None


def main() -> int:
    root = Path(sys.argv[1] if len(sys.argv) > 1 else "data/callan")
    entries: set[str] = set()
    for path in sorted(root.glob("stage-*.json")):
        for lesson in json.loads(path.read_text(encoding="utf-8")):
            for group in lesson["groups"]:
                entries.update(group["words"])

    table = {}
    for entry in sorted(entries):
        ipa = ipa_for(entry)
        if ipa:
            table[entry] = ipa

    out = root / "ipa.json"
    out.write_text(
        json.dumps(table, ensure_ascii=False, indent=0, sort_keys=True),
        encoding="utf-8",
    )
    print(f"{len(table)}/{len(entries)} 条词目生成音标 → {out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
