#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
dedupe.py — 同一場景內的條目去重。

規則（依序套用）：
  1. 同一個清單內 `en` 完全重複 → 保留第一筆
  2. `phrases` 裡的 `en` 與 `words` 相同 → 刪掉 phrases 那筆（單字版優先）
  3. `en` 屬「英式拼法已另有對應」的美式變體（SPECIAL_DROP）→ 刪除

用法：
    python tools/dedupe.py            # 預覽
    python tools/dedupe.py --apply
"""
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PARTS = [ROOT / "data" / "parts", ROOT / "data" / "parts_extra"]

# 美式說法，但同一個場景已經有英式對應 → 直接刪掉
SPECIAL_DROP = {
    "parking lot",      # 已有 car park
    "movie theater",    # 已有 cinema
    "sidewalk", "truck", "elevator", "cellphone", "color",
}


def norm(s):
    s = (s or "").strip().lower()
    s = s.replace("’", "'").replace("‘", "'")
    s = re.sub(r"[.,!?;:]+$", "", s)
    return re.sub(r"\s+", " ", s)


def dedupe_scene(sc, apply):
    removed = []
    moved = []

    # 1. 清單內部去重
    for key in ("words", "phrases", "sentences"):
        seen, keep = set(), []
        for it in sc.get(key, []):
            k = norm(it.get("en"))
            if k and k in seen:
                removed.append((key, it["en"], "同一清單內重複"))
                continue
            if k:
                seen.add(k)
            keep.append(it)
        sc[key] = keep

    words, phrases = sc.get("words", []), sc.get("phrases", [])

    # 2. 「單字」清單裡的多字片語，如果 phrases 已經有一模一樣的 → 從 words 移除。
    #    （複合名詞如 washing machine / cell phone 是 Cambridge 詞表裡的單一詞條，
    #      應該留在 words，所以只有「重複時」才動它。）
    phrase_keys = {norm(p["en"]): p for p in phrases}
    new_words = []
    for w in words:
        k = norm(w["en"])
        if (" " in k or "/" in w["en"]) and k in phrase_keys:
            removed.append(("words", w["en"], "多字片語且 phrases 已有 → 從 words 移除"))
            continue
        new_words.append(w)
    sc["words"] = new_words

    # 3. phrases 與 words 重複
    word_keys = {norm(w["en"]) for w in sc["words"]}
    seen_p = set()
    keep = []
    for p in sc.get("phrases", []):
        k = norm(p["en"])
        if k in word_keys:
            removed.append(("phrases", p["en"], "與 words 重複"))
            continue
        if k in seen_p:
            removed.append(("phrases", p["en"], "phrases 內重複"))
            continue
        seen_p.add(k)
        keep.append(p)
    sc["phrases"] = keep

    # 4. 美式變體
    kept = {norm(w["en"]) for w in sc["words"]} | {norm(p["en"]) for p in sc["phrases"]}
    for key in ("words", "phrases"):
        keep = []
        for it in sc.get(key, []):
            k = norm(it["en"])
            if k in SPECIAL_DROP and k not in kept:
                removed.append((key, it["en"], "美式拼法且與英式重複"))
                continue
            keep.append(it)
        sc[key] = keep

    return removed, moved


def main():
    apply = "--apply" in sys.argv
    total_rm, total_mv = 0, 0
    for folder in PARTS:
        if not folder.exists():
            continue
        for f in sorted(folder.glob("*.json")):
            data = json.loads(f.read_text(encoding="utf-8"))
            if isinstance(data, dict):
                data = [data]
            changed = False
            for sc in data:
                rm, mv = dedupe_scene(sc, apply)
                if rm or mv:
                    changed = True
                    total_rm += len(rm)
                    total_mv += len(mv)
                    print(f"  [{sc['id']}]")
                    for key, en, why in rm:
                        print(f"      移除 {key}: {en}  （{why}）")
                    for en, why in mv:
                        print(f"      {why}: {en}")
            if changed and apply:
                f.write_text(json.dumps(data, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"\n移除 {total_rm} 筆重複、搬移 {total_mv} 筆（多字片語從 words 回到 phrases）"
          + ("" if apply else "（預覽，加 --apply 才寫入）"))


if __name__ == "__main__":
    main()
