#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""列出 data/qa2 的剩餘問題。"""
import glob
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
kinds = sys.argv[1].split(",") if len(sys.argv) > 1 else None

items = []
for f in sorted(glob.glob(str(ROOT / "data" / "qa2" / "batch-*.json"))):
    items += json.loads(Path(f).read_text(encoding="utf-8"))["issues"]

sel = [i for i in items if (not kinds or i.get("kind") in kinds)]
print(f"{len(sel)} 筆\n" + "=" * 70)
for i in sel:
    print(f"[{i['scene']}] {i['kind']}")
    print(f"  en : {i.get('en','')}")
    print(f"  zh : {i.get('zh','')}")
    print(f"  問題：{i.get('problem','')}")
    print(f"  建議：{i.get('suggestion','')}")
    print()
