#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
fix_traditional_words.py — 修正「繁體但用字不正確」的字。

為什麼不用轉換器全掃？
    實測：專案 1,867 個漢字裡只有 18 個字會被 OpenCC s2t 改動，
    其中 14 個在臺灣本來就該維持原樣，全掃反而會改錯：
        吃→喫(41) 游→遊(24) 台→臺(20) 床→牀(13) 群→羣(11) 里→裏(7)
        秘→祕(4) 划→劃(4；「划算」「划船」本來就對) 丑→醜(2，小丑) 岩→巖(2)
        伙→夥(1，傢伙) 唇→脣(1) 皂→皁(1) 后→後(1，皇后) 斗→鬥(1，熨斗)
    真正要改的只有 4 個詞、6 處：
        喝采→喝彩　精采→精彩　占→佔　形容词→形容詞

用法：
    python tools/fix_traditional_words.py           # 預覽
    python tools/fix_traditional_words.py --apply   # 寫入
"""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PARTS = [ROOT / "data" / "parts", ROOT / "data" / "parts_extra"]

# (場景, 欄位, 原文, 改為)   欄位 "__meta__" 表示比對 summary
FIXES = [
    ("verbs-people", "words",     "替某人加油；喝采", "替某人加油；喝彩"),
    ("verbs-people", "sentences", "觀眾席上的每個人都大聲喝采。", "觀眾席上的每個人都大聲喝彩。"),
    ("adj-quality",  "words",     "精采的；美好的", "精彩的；美好的"),
    ("adj-quality",  "sentences", "演唱會非常棒，最後一首歌也很精采。", "演唱會非常棒，最後一首歌也很精彩。"),
    ("phrasal-verbs", "words",    "開始從事；占（空間）", "開始從事；佔（空間）"),
    ("feelings", "__meta__", "形容人、心情和東西的形容词。", "形容人、心情和東西的形容詞。"),
]


def load():
    """一次讀進記憶體，之後直接寫回同一份物件（不要重新讀檔，會把修改蓋掉）。"""
    file_data, scenes = {}, {}
    for folder in PARTS:
        for f in sorted(folder.glob("*.json")):
            data = json.loads(f.read_text(encoding="utf-8"))
            file_data[f] = data
            for sc in data:
                scenes[sc["id"]] = sc
    return file_data, scenes


def main():
    apply_changes = "--apply" in sys.argv
    file_data, scenes = load()

    touched = {}   # 檔案 → [(場景, 欄位, 原文, 改為)]
    miss = []

    for sid, key, before, after in FIXES:
        sc = scenes.get(sid)
        if not sc:
            miss.append((sid, before, "找不到場景"))
            continue
        hit = False
        if key == "__meta__":
            if sc.get("summary") == before:
                sc["summary"] = after
                hit = True
        else:
            for it in sc.get(key, []):
                if it.get("zh") == before:
                    it["zh"] = after
                    hit = True
        if hit:
            owner = next(f for f, d in file_data.items()
                         if any(x["id"] == sid for x in d))
            touched.setdefault(owner, []).append((sid, key, before, after))
        else:
            miss.append((sid, before, "找不到對應的內容"))

    for f, items in touched.items():
        print(f"{f.relative_to(ROOT)}（{len(items)} 筆）")
        for sid, key, before, after in items:
            print(f"    [{sid}] {key}: {before!r}\n                 → {after!r}")

    print()
    applied = sum(len(v) for v in touched.values())
    print(f"可套用 {applied} / {len(FIXES)} 筆")
    for sid, before, why in miss:
        print(f"    [!] {sid}: {why} → {before!r}")

    if not touched:
        print("✅ 沒有需要修正的地方")
        return
    if not apply_changes:
        print("\n（預覽；加 --apply 才寫入）")
        return

    for f in touched:
        data = file_data[f]
        f.write_text(json.dumps(data, ensure_ascii=False, indent=1), encoding="utf-8")
    print("\n✅ 已寫入。接著執行： python tools/build_scenes.py")


if __name__ == "__main__":
    main()