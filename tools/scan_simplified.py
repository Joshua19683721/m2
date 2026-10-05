#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
scan_simplified.py — 找出專案裡「可能還是簡體」的字。

白名單直接從 build_scenes.TRAD_OK 讀取（單一來源，避免兩處各維一份）。
那些字在臺灣本來就是正確的繁體用法，全掃反而會改錯，例如：
    吃→喫、游→遊（游泳）、台→臺（月台）、床→牀、群→羣、里→裏（公里）、
    划→劃（划算）、丑→醜（小丑）、后→後（皇后）、斗→鬥（熨斗）…

用法：
    python tools/scan_simplified.py         # 有簡體字時 exit 1（CI 可直接用）
    python tools/scan_simplified.py --list  # 一併列出白名單
"""
import importlib.util
import json
import re
import sys
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CJK = re.compile(r"[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]")


def load_trad_ok():
    spec = importlib.util.spec_from_file_location("bs", ROOT / "tools" / "build_scenes.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return getattr(mod, "TRAD_OK", {})


def collect():
    counts = Counter()
    where = {}

    def eat(text, src):
        for ch in CJK.findall(text or ""):
            counts[ch] += 1
            where.setdefault(ch, src)

    for folder in ("data/parts", "data/parts_extra"):
        for f in sorted((ROOT / folder).glob("*.json")):
            for sc in json.loads(f.read_text(encoding="utf-8")):
                eat(sc.get("name"), sc["id"])
                eat(sc.get("nameEn"), sc["id"])
                eat(sc.get("summary"), sc["id"])
                eat(sc.get("note"), sc["id"])
                for t in sc.get("tips", []):
                    eat(t, sc["id"])
                for key in ("words", "phrases", "sentences"):
                    for it in sc.get(key, []):
                        eat(it.get("zh"), sc["id"])
    return counts, where


def main():
    trad_ok = load_trad_ok()
    from opencc import OpenCC
    s2t = OpenCC("s2t")

    counts, where = collect()
    suspects = {}
    for ch, n in counts.items():
        if ch in trad_ok:
            continue
        new = s2t.convert(ch)
        if new != ch:
            suspects[ch] = (new, n, where[ch])

    print(f"漢字種類　　　　　　：{len(counts)}")
    print(f"白名單（繁體本來就對）：{len(trad_ok)} 個字，已排除")

    if "--list" in sys.argv:
        print()
        for ch, why in sorted(trad_ok.items(), key=lambda kv: -counts.get(kv[0], 0)):
            print(f"    {ch} ×{counts.get(ch, 0):<5} {why}")

    print()
    if not suspects:
        print("✅ 沒有簡體字，內容全部是臺灣正體")
        return

    print("原字   會變成    次數   第一次出現的場景")
    print("─" * 54)
    for ch, (new, n, src) in sorted(suspects.items(), key=lambda kv: -kv[1][1]):
        print(f"  {ch}  →  {new:<6} {n:>5}   {src}")
    print()
    print("❌ 發現簡體字，請手動修正後重新建置")
    sys.exit(1)


if __name__ == "__main__":
    main()