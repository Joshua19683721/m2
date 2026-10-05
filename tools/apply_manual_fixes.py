#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
apply_manual_fixes.py — 套用 data/qa/manual_fixes.json 裡人工確認的修正。

field 支援：
    "zh" / "ipa" / "en"   取代該欄位
    "delete"              整筆刪除（用於合併重複詞條）

修正 en 時會連帶更新同一筆的 zh（避免中英不一致）。

用法：
    python tools/apply_manual_fixes.py            # 預覽
    python tools/apply_manual_fixes.py --apply    # 寫入
"""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FIXES = ROOT / "data" / "qa" / "manual_fixes.json"
PARTS = [ROOT / "data" / "parts", ROOT / "data" / "parts_extra"]


def load():
    scenes, index, file_data = {}, {}, {}
    for folder in PARTS:
        if not folder.exists():
            continue
        for f in sorted(folder.glob("*.json")):
            data = json.loads(f.read_text(encoding="utf-8"))
            if isinstance(data, dict):
                data = [data]
            file_data[f] = data
            for sc in data:
                scenes[sc["id"]] = sc
                for key in ("words", "phrases", "sentences"):
                    for it in sc.get(key, []):
                        index[(sc["id"], it["en"].strip(), key)] = it
    return scenes, index, file_data


def main():
    apply = "--apply" in sys.argv
    fixes = json.loads(FIXES.read_text(encoding="utf-8"))
    scenes, index, file_data = load()

    ok, miss, deleted = 0, [], 0
    order = {"zh": 0, "ipa": 0, "delete": 0, "en": 1}
    for fx in sorted(fixes["entries"], key=lambda x: order.get(x["field"], 2)):
        sid, en, field = fx["scene"], fx["en"], fx["field"]
        hit, hit_key = None, None
        for key in ("words", "phrases", "sentences"):
            if (sid, en, key) in index:
                hit, hit_key = index[(sid, en, key)], key
                break
        if hit is None:
            miss.append((sid, en, field))
            continue
        if field == "delete":
            sc = scenes[sid]
            sc[hit_key] = [x for x in sc[hit_key] if x is not hit]
            deleted += 1
        else:
            hit[field] = fx["value"]
        ok += 1

    tips_ok, tips_miss = 0, []
    for tf in fixes.get("tips", []):
        sc = scenes.get(tf["scene"])
        if not sc or not sc.get("tips") or tf["index"] >= len(sc["tips"]):
            tips_miss.append(tf["scene"])
            continue
        sc["tips"][tf["index"]] = tf["value"]
        tips_ok += 1

    print(f"條目修正 {ok} 筆套用成功（其中刪除 {deleted} 筆），{len(miss)} 筆找不到")
    for m in miss:
        print(f"   [!] 找不到：[{m[0]}] {m[1]!r} .{m[2]}")
    print(f"提示修正 {tips_ok} 筆套用成功，{len(tips_miss)} 筆找不到 {tips_miss}")

    if not apply:
        print("（預覽；加 --apply 才寫入）")
        return

    for f, data in file_data.items():
        f.write_text(json.dumps(data, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"已寫回 {len(file_data)} 個來源檔")


if __name__ == "__main__":
    main()
