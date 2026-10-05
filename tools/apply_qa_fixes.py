#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
apply_qa_fixes.py — 讀 data/qa/*.json 的稽核結果並套用修正。

QA 報告的 suggestion 欄位格式不完全一致，可能是：
  A) 只有修正後的中文          → "淡綠色的"
  B) 修正後的中文 + 括號說明   → "現在電視上正在播一部好看的卡通。"
  C) 修正後的英文 +（中文）     → "Children play in the playground.（孩子們在…）"
  D) 只有修正後的英文
這支腳本會用「取最長中文片段 / 取完整英文句子」的方式把 A~D 拆回欄位，
只對**能在欄位上安全對應**的問題自動套用，其餘列成人工待辦。

用法：
    python tools/apply_qa_fixes.py          # 預覽
    python tools/apply_qa_fixes.py --apply  # 寫入
"""
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
QA = ROOT / "data" / "qa"
PARTS = [ROOT / "data" / "parts", ROOT / "data" / "parts_extra"]
REPORT = ROOT / "data" / "qa" / "MANUAL.md"

CJK = r"　-〿一-鿿＀-￯"


def load_issues():
    out = []
    for f in sorted(QA.glob("batch-*.json")):
        data = json.loads(f.read_text(encoding="utf-8"))
        for it in data.get("issues", []):
            it["_batch"] = f.name
            out.append(it)
    return out


def load_scenes():
    scenes = {}
    file_data = {}
    for folder in PARTS:
        if not folder.exists():
            continue
        for f in sorted(folder.glob("*.json")):
            data = json.loads(f.read_text(encoding="utf-8"))
            if isinstance(data, dict):
                data = [data]
            file_data[f] = data
            for s in data:
                scenes[s["id"]] = (f, s)
    return scenes, file_data


ENGLISH_SENT = re.compile(r"[A-Z][A-Za-z0-9'’ ,.?!-]{10,}")

# suggestion 若是「指示語氣」而不是「可直接取代的值」，就不能自動套用
INSTRUCTION_WORDS = ("改為", "建議", "應該", "可以", "也可", "或許", "例如", "比如",
                     "刪掉", "保留", "參考", "修正為", "請", "改成", "換成", "描述",
                     "instead", "suggest", "should", "例如可", "比較", "最佳")


def looks_like_value(text):
    """判斷 suggestion 是不是一個可以直接取代原值的字串。"""
    if not text:
        return False
    for w in INSTRUCTION_WORDS:
        if w in text:
            return False
    if "；" in text or ";" in text:
        return False
    if text.count("（") != text.count("）") or text.count("(") != text.count(")"):
        return False
    if text.count("「") != text.count("」"):
        return False
    # 說明性前綴
    if text.startswith(("（", "(", "…", "...")):
        return False
    return True


def clean_zh(text):
    """去掉多餘的括號與尾端雜訊。"""
    t = (text or "").strip()
    t = re.sub(r"^（+", "", t)
    t = re.sub(r"^[(（]+", "", t)
    t = re.sub(r"[)）]+$", "", t)
    # 從內到外消掉所有不成對的括號
    for _ in range(6):
        before = t
        while "）" in t and t.count("）") > t.count("（"):
            t = t.replace("）", "", 1)
        while ")" in t and t.count(")") > t.count("("):
            t = t.replace(")", "", 1)
        while "（" in t and t.count("（") > t.count("）"):
            t = t.replace("（", "", 1)
        while "(" in t and t.count("(") > t.count(")"):
            t = t.replace("(", "", 1)
        if t == before:
            break
    return t.strip("　 /")


def split_suggestion(sug):
    """把 suggestion 拆成 (english, chinese)；抓不到就回傳 (None, None)。"""
    sug = (sug or "").strip()
    if not sug:
        return None, None

    zh_spans = re.findall(r"[" + CJK + r"]{2,}", sug)
    zh = max(zh_spans, key=len) if zh_spans else None
    if zh:
        zh = clean_zh(zh)

    en = None
    en_spans = ENGLISH_SENT.findall(sug)
    if en_spans:
        cand = max(en_spans, key=len).strip()
        if cand.endswith((".", "!", "?")):
            en = cand

    # 整句看起來就是中文 → 當作純中文建議
    if zh and not en and not looks_like_value(sug):
        en = None
    return en, zh


def bare_value(text):
    """整串就是值本身（沒有夾雜指示語氣或括號說明）才回傳 True。"""
    return looks_like_value(text)


def main():
    apply = "--apply" in sys.argv
    issues = load_issues()
    scenes, file_data = load_scenes()

    by_kind = {}
    for it in issues:
        by_kind[it.get("kind", "?")] = by_kind.get(it.get("kind", "?"), 0) + 1
    print(f"稽核問題合計 {len(issues)} 則")
    for k, n in sorted(by_kind.items(), key=lambda x: -x[1]):
        print(f"   {k:16s} {n}")

    fixes, manual = [], []

    for it in issues:
        sid, en0 = it.get("scene"), (it.get("en") or "").strip()
        sug = (it.get("suggestion") or "").strip()
        kind = it.get("kind", "")
        if sid not in scenes or not en0:
            manual.append((it, "無法定位場景或缺少 en"))
            continue

        _f, sc = scenes[sid]
        hits = []
        for key in ("words", "phrases"):
            for item in sc.get(key, []):
                if item.get("en", "").strip() == en0:
                    hits.append((key, item))
        for item in sc.get("sentences", []):
            if item.get("en", "").strip() == en0:
                hits.append(("sentences", item))

        if not hits:
            manual.append((it, "來源檔找不到這個 en（可能已被改過）"))
            continue
        if len(hits) > 1:
            manual.append((it, "同一個 en 在場景內有多筆，未自動套用"))
            continue

        key, item = hits[0]
        new_en, new_zh = split_suggestion(sug)
        # 只有當 suggestion 整串就是一個值時才敢自動套用
        whole_is_value = bare_value(sug)

        if kind == "ipa":
            # IPA 建議應該整串就是音標
            if new_en and not new_zh and "/" not in sug and re.fullmatch(r"[\wˈˌ.ːɪʊəɜɔʌɒæθðʃʒŋtʃdʒaɪeɪɔə ]+", sug.strip()):
                fixes.append((_f, sc, key, item, {"ipa": sug.strip()}, it))
            else:
                manual.append((it, "IPA 建議無法安全自動解析"))
        elif kind in ("zh-simplified", "zh-has-latin"):
            if new_zh and whole_is_value:
                fixes.append((_f, sc, key, item, {"zh": new_zh}, it))
            else:
                manual.append((it, "中文建議格式無法自動解析"))
        elif kind in ("meaning", "polysemy", "zh-naturalness"):
            if new_zh and whole_is_value and not new_en:
                fixes.append((_f, sc, key, item, {"zh": new_zh}, it))
            elif new_zh and new_en and key == "sentences" and whole_is_value:
                fixes.append((_f, sc, key, item, {"en": new_en, "zh": new_zh}, it))
            elif new_zh and whole_is_value:
                fixes.append((_f, sc, key, item, {"zh": new_zh}, it))
            else:
                manual.append((it, "含指示語氣，需人工確認要改 en 還是 zh"))
        elif kind in ("grammar", "naturalness", "level"):
            if new_en and new_zh and key == "sentences" and whole_is_value:
                fixes.append((_f, sc, key, item, {"en": new_en, "zh": new_zh}, it))
            elif new_zh and not new_en and whole_is_value:
                fixes.append((_f, sc, key, item, {"zh": new_zh}, it))
            else:
                manual.append((it, "英文修正需人工確認"))
        else:
            manual.append((it, f"類型 {kind} 需人工處理"))

    print(f"\n可自動套用 {len(fixes)} 筆 / 需人工 {len(manual)} 筆")

    if not apply:
        print("\n（預覽；加 --apply 才寫入）")
        for f, sc, key, item, patch, it in fixes[:25]:
            print(f"  [{sc['id']}] {key} {item['en']!r} → {patch}")
        return

    by_file = {}
    for f, sc, key, item, patch, it in fixes:
        by_file.setdefault(f, []).append((sc, key, item, patch))

    # 寫回記憶體中「同一份」資料物件（若重新讀檔會把剛才的修改丟掉）
    written = 0
    for f, ops in by_file.items():
        data = file_data.get(f)
        if data is None:
            continue
        for sc, key, item, patch in ops:
            for k, v in patch.items():
                item[k] = v
        f.write_text(json.dumps(data, ensure_ascii=False, indent=1), encoding="utf-8")
        written += 1
        print(f"  已更新 {f.name}（{len(ops)} 筆）")
    if not written:
        print("  ⚠️ 沒有可寫入的檔案")

    # 人工待辦報告
    lines = ["# QA 人工待辦", "",
             f"自動套用 {len(fixes)} 筆；以下 {len(manual)} 筆需要人工判斷。", ""]
    for it, why in manual:
        lines.append(f"- **[{it.get('scene')}]** `{it.get('en', '')}` — {it.get('kind', '')}")
        lines.append(f"  - 問題：{it.get('problem', '')}")
        lines.append(f"  - 建議：{it.get('suggestion', '')}")
        lines.append(f"  - 原因：{why}")
    REPORT.write_text("\n".join(lines), encoding="utf-8")
    print(f"→ {REPORT}")


if __name__ == "__main__":
    main()
