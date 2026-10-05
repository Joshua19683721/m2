#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
to_traditional.py — 全專案簡體 → 繁體（臺灣正體）轉換，並把檢查變成常駐關卡。

為什麼一定要用 OpenCC 的 s2twp：
    zhconv 的 'zh-hant' 是「中國大陸正體」，會把 吃→喫、床→牀、公里→公裏、游泳→遊泳，
    這些在臺灣都不對。zhconv 的 'zh-tw' 改善了一些，但 游泳→遊泳、臺灣→臺灣 仍不理想。
    OpenCC 的 s2twp 才是正解：它是「簡體 → 臺灣正體（含慣用詞）」，
    實測 吃東西 / 公里 / 游泳 / 電腦 都不動，而 視頻→影片、軟件→軟體、網絡→網路。

轉換範圍：
    data/parts/*.json       場景內容
    data/parts_extra/*.json 場景內容
    data/qa/*.json          稽核報告與修正紀錄
    README.md / index.html  文件與介面
    tools/*.py / js/*.js     註解、說明字串與介面文字

用法：
    python tools/to_traditional.py           # 只掃描
    python tools/to_traditional.py --apply   # 實際轉換
"""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

PROFILE = "s2twp"
try:
    from opencc import OpenCC
    _cc = OpenCC(PROFILE)

    def to_trad(s):
        return _cc.convert(s)

    HAVE = True
    ERR = ""
except Exception as e:      # pragma: no cover
    _cc = None
    HAVE = False
    ERR = str(e)

    def to_trad(s):
        return s


# ── JSON 裡只轉「顯示用文字」，英文與識別碼不動 ──
JSON_TEXT_KEYS = {"zh", "summary", "note", "tips", "name", "nameEn",
                  "problem", "suggestion", "kind"}


def convert_json(obj, path=""):
    """就地轉換，回傳 (obj, [(路徑, 原文, 新文)])"""
    changes = []
    if isinstance(obj, dict):
        for k, v in obj.items():
            p = f"{path}.{k}" if path else k
            if isinstance(v, str):
                if k in JSON_TEXT_KEYS:
                    new = to_trad(v)
                    if new != v:
                        obj[k] = new
                        changes.append((p, v, new))
            else:
                obj, sub = convert_json(v, p)
                changes += sub
    elif isinstance(obj, list):
        for i, v in enumerate(obj):
            p = f"{path}[{i}]"
            if isinstance(v, str):
                new = to_trad(v)
                if new != v:
                    obj[i] = new
                    changes.append((p, v, new))
            else:
                obj, sub = convert_json(v, p)
                changes += sub
    return obj, changes


def file_list():
    files = []
    for folder in ("data/parts", "data/parts_extra", "data/qa"):
        files += sorted((ROOT / folder).glob("*.json"))
    for name in ("README.md", "index.html"):
        p = ROOT / name
        if p.exists():
            files.append(p)
    files += sorted((ROOT / "tools").glob("*.py"))
    files += sorted((ROOT / "js").glob("*.js"))
    return files


def main():
    apply_changes = "--apply" in sys.argv
    if not HAVE:
        print(f"⚠️  讀不到 OpenCC（{ERR}）")
        print("    先執行： pip install opencc-python-reimplemented")
        sys.exit(2)

    print(f"轉換規則：OpenCC {PROFILE}（簡體 → 臺灣正體）\n")

    total = 0
    touched = []

    for f in file_list():
        rel = f.relative_to(ROOT)

        if f.suffix == ".json":
            try:
                data = json.loads(f.read_text(encoding="utf-8"))
            except Exception as e:
                print(f"  ⚠️ {rel} 解析失敗：{e}")
                continue
            data, changes = convert_json(data)
            if changes:
                total += len(changes)
                touched.append((str(rel), changes))
                if apply_changes:
                    f.write_text(json.dumps(data, ensure_ascii=False, indent=1),
                                 encoding="utf-8")
            continue

        src = f.read_text(encoding="utf-8")
        dst = to_trad(src)
        if dst != src:
            n = sum(1 for a, b in zip(src, dst) if a != b)
            total += n
            touched.append((str(rel), [("<整份檔案>", f"{n} 個字", "（含註解與說明）")]))
            if apply_changes:
                f.write_text(dst, encoding="utf-8")

    print(f"需要轉換：{total} 處，分布在 {len(touched)} 個檔案\n")
    for name, changes in touched:
        print(f"── {name}（{len(changes)} 處）")
        for p, before, after in changes[:10]:
            short_b = before if len(before) <= 40 else before[:40] + "…"
            short_a = after if len(after) <= 40 else after[:40] + "…"
            print(f"     {p}\n       {short_b}\n    →  {short_a}")
        if len(changes) > 10:
            print(f"     …還有 {len(changes) - 10} 處")

    if not touched:
        print("✅ 沒有簡體字，全部已是臺灣正體")
    elif apply_changes:
        print("\n✅ 已轉換。接著執行： python tools/build_scenes.py 重新產生詞庫")
    else:
        print("\n（預覽；加 --apply 才寫入）")


if __name__ == "__main__":
    main()