#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""列出 QA 報告中指定類型的問題，方便逐條判斷。"""
import glob
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
want = sys.argv[1] if len(sys.argv) > 1 else ""
limit = int(sys.argv[2]) if len(sys.argv) > 2 else 100

items = []
for f in sorted(glob.glob(str(ROOT / "data" / "qa" / "batch-*.json"))):
    for it in json.loads(Path(f).read_text(encoding="utf-8"))["issues"]:
        items.append(it)

sel = [it for it in items if want in it.get("kind", "")]
print(f"{len(sel)} 筆 [{want or 'all'}]\n" + "=" * 70)
for it in sel[:limit]:
    print(f"[{it['scene']}] ({it['kind']})")
    print(f"  en : {it.get('en','')}")
    print(f"  zh : {it.get('zh','')}")
    print(f"  問題：{it.get('problem','')}")
    print(f"  建議：{it.get('suggestion','')}")
    print()
