#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""把場景清單切成 QA 批次，輸出 data/_qa_batches.json"""
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
src = (ROOT / "data" / "scenes.js").read_text(encoding="utf-8")
ids = list(dict.fromkeys(re.findall(r'"id":\s*"([^"]+)"', src)))
batches = [ids[i:i + 5] for i in range(0, len(ids), 5)]

out = ROOT / "data" / "_qa_batches.json"
out.write_text(json.dumps({"sceneIds": ids, "batches": batches},
                          ensure_ascii=False, indent=1), encoding="utf-8")
print(f"{len(ids)} scenes -> {len(batches)} batches")
for b in batches:
    print("  " + ", ".join(b))
