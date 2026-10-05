"""驗證簡體字關卡真的有作用：塞一個簡體字進去，應該被擋下。"""
import json
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PARTS = ROOT / "data" / "parts_extra"

# 找一個小的 parts_extra 檔來做沙盒
target = sorted(PARTS.glob("*.json"))[0]
backup = target.read_text(encoding="utf-8")

PASS = "簡體字關卡測試通過"
FAIL = "❌ 簡體字關卡測試失敗"

try:
    data = json.loads(backup)
    sc = data[0]
    # 把第一個單字的中文換成含簡體字的句子
    sc["words"][0]["zh"] = "這是一個包含计算机和网络的测试"
    sc["summary"] = "這是一個摘要裡有计算机和软件的说明"
    sc["tips"][0] = "提示裡也放一個关于图书馆的说法"
    target.write_text(json.dumps(data, ensure_ascii=False, indent=1), encoding="utf-8")

    r = subprocess.run(
        [sys.executable, str(ROOT / "tools" / "build_scenes.py"), "--check"],
        capture_output=True, text=True, encoding="utf-8", errors="replace",
        cwd=str(ROOT))

    out = r.stdout + r.stderr
    caught = ("簡體字" in out) and (r.returncode != 0)
    for ch in ("这", "计", "网", "视", "软", "图"):
        if ch in out:
            caught = True
            break

    if caught:
        print(PASS)
        print("  已插入簡體字，建置腳本正確擋下並回報：")
        for line in out.splitlines():
            if "簡體字" in line:
                print("    " + line.strip())
    else:
        print(FAIL)
        print(out[-2000:])

finally:
    target.write_text(backup, encoding="utf-8")
    print("\n（已還原 " + target.name + "）")