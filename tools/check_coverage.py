#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
check_coverage.py — 檢查「專案場景」對 Cambridge A2 Key 完整詞表的覆蓋率。

比對基準 data/_a2key_full.json（字母序 1717 條 + 附錄一詞組）
檢查對象 data/parts/*.json 的 words / phrases（片語也算覆蓋）
輸出 data/_coverage.json，並在 console 印出未覆蓋的詞（依字母分組）。

用法：
    python tools/check_coverage.py            # 摘要
    python tools/check_coverage.py --list q   # 列出所有未覆蓋且符合 q 的詞
"""
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FULL = ROOT / "data" / "_a2key_full.json"
PARTS = [ROOT / "data" / "parts", ROOT / "data" / "parts_extra"]
OUT = ROOT / "data" / "_coverage.json"

NOISE = {
    # 版本／出版標記，不是詞彙
    "ucles", "cambridge", "english", "key", "for", "schools", "list",
}


def norm(s):
    s = (s or "").strip().lower()
    s = s.replace("’", "'").replace("‘", "'")
    s = s.replace("–", "-").replace("—", "-")
    return re.sub(r"\s+", " ", s)


def variants(item):
    """
    Cambridge 詞表常以 a/an、adj & n、BrE/AmE 等形式書寫，
    展開成「應視為同一個詞」的所有寫法。
    """
    out = set()
    base = norm(item)
    if not base:
        return out
    out.add(base)
    # a/an, mum(mum), dad(dy), jogging
    m = re.search(r"\((\w+)\)", base)
    if m:
        stem = base[: m.start()].strip()
        inner = m.group(1)
        out.add(stem)
        if len(inner) <= 4 and inner.isalpha():
            out.add(stem + inner)
    if "/" in base:
        for piece in base.split("/"):
            piece = piece.strip()
            if piece and piece != "n" and piece != "v" and piece != "adj":
                out.add(piece)
    return {x for x in out if x}


def load_scenes():
    scenes = {}
    for folder in PARTS:
        if not folder.exists():
            continue
        for f in sorted(folder.glob("*.json")):
            data = json.loads(f.read_text(encoding="utf-8"))
            if isinstance(data, dict):
                data = [data]
            for s in data:
                scenes[s["id"]] = s
    return scenes


def main():
    full = json.loads(FULL.read_text(encoding="utf-8"))
    scenes = load_scenes()

    # ── 場景端：建立 「所有字元變體 → 場景」 索引 ──
    covered, by_scene = {}, {}
    for sid, s in scenes.items():
        bag = set()
        for key in ("words", "phrases"):
            for item in s.get(key, []):
                for v in variants(item["en"]):
                    covered.setdefault(v, set()).add(sid)
                    bag.add(v)
        by_scene[sid] = bag

    entries = full["entries"]

    # ── 逐條判定 ──
    missing = []
    hit = []
    for e in entries:
        vs = variants(e["en"])
        # 片語也算：把詞條本身當片語比對（多詞項目）
        owners = set()
        for v in vs:
            owners |= covered.get(v, set())
        if owners:
            hit.append({**e, "scenes": sorted(owners)})
        else:
            missing.append(e)

    pct = round(100.0 * len(hit) / max(len(entries), 1), 1)

    print(f"字母序詞條       : {len(entries)}")
    print(f"已涵蓋           : {len(hit)}")
    print(f"未涵蓋           : {len(missing)}")
    print(f"覆蓋率           : {pct}%")
    print(f"場景數           : {len(scenes)}")

    letters = {}
    for e in missing:
        letters.setdefault(e["letter"], []).append(e)
    print("\n未涵蓋依字母分組：")
    for k in sorted(letters):
        print(f"  {k}: {len(letters[k])}")

    OUT.write_text(json.dumps({
        "meta": {"total": len(entries), "covered": len(hit), "missing": len(missing),
                 "coveragePct": pct, "scenes": sorted(scenes)},
        "missing": missing,
        "covered": hit,
    }, ensure_ascii=False, indent=1), encoding="utf-8")
    print("\n→", OUT)

    if len(sys.argv) > 2 and sys.argv[1] == "--list":
        q = sys.argv[2]
        for e in missing:
            if re.search(q, e["en"], re.I):
                print(f"{e['en']}  ({e['pos']})" + (f"  • {e['examples'][0]}" if e["examples"] else ""))


if __name__ == "__main__":
    main()
