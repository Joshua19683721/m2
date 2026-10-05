"""檢查詞庫裡的撇號到底是不是半形 U+0027"""
import json
import re
import collections
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

def scan(folder):
    counts = collections.Counter()
    samples = {}
    for f in sorted(Path(folder).glob("*.json")):
        data = json.loads(f.read_text(encoding="utf-8"))
        for sc in data:
            for key in ("words", "phrases", "sentences"):
                for it in sc.get(key, []):
                    en = it["en"]
                    for ch in set(en):
                        if not (ch.isascii() or ch.isspace() or ch in "-/"):
                            counts[ch] += 1
                            samples.setdefault(ch, (sc["id"], key, en))
                    if "'" in en:
                        counts["U+0027 (半形)"] += 1
    return counts, samples

total = collections.Counter()
samples = {}
for folder in (ROOT / "data" / "parts", ROOT / "data" / "parts_extra"):
    c, s = scan(folder)
    total.update(c)
    for k, v in s.items():
        samples.setdefault(k, v)

print("詞庫中出現的非 ASCII 字元：")
if not total:
    print("  （無）")
for ch, n in total.most_common():
    if ch == "U+0027 (半形)":
        continue
    label = f"U+{ord(ch):04X}"
    print(f"  {label}  {ch!r}  × {n}   例：{samples[ch]}")
print()
print("半形撇號 ' 出現次數：", total.get("U+0027 (半形)", 0))

# 產生後的 scenes.js
src = (ROOT / "data" / "scenes.js").read_text(encoding="utf-8")
print()
print("scenes.js 內的非 ASCII 撇號類字元：")
found = collections.Counter()
for ch in set(src):
    if not ch.isascii() and ch in "‘’＇＄´`ˋ":
        found[ch] += src.count(ch)
for ch, n in found.most_common():
    print(f"  U+{ord(ch):04X}  {ch!r}  × {n}")
if not found:
    print("  （無）")