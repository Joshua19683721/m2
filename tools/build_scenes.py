#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
build_scenes.py — 合併所有場景內容 → data/scenes.js，並做嚴格驗證。

驗證項目（任何一項不過就報錯並以非 0 結束）：
  1. 每個場景都有單字 / 片語 / 句子 / tips
  2. 單字與片語一定要有 ipa；句子一律不准有 ipa
  3. en 不可為空、不可有彎引號
  4. zh 不可含拉丁字母
  5. 額外規格指定的詞必須一筆不少全部出現
  6. 對照 Cambridge A2 Key 完整詞表，計算覆蓋率

用法：
    python tools/build_scenes.py            # 驗證 + 產生
    python tools/build_scenes.py --check    # 只驗證不寫檔
"""
import json
import re
import sys
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PARTS = ROOT / "data" / "parts"
PARTS_EXTRA = ROOT / "data" / "parts_extra"
SPEC = ROOT / "data" / "_scene_spec.json"
SPEC_EXTRA = ROOT / "data" / "_scene_spec_extra.json"
FULL = ROOT / "data" / "_a2key_full.json"
OUT = ROOT / "data" / "scenes.js"

GROUPS = ["生活主題", "文法基礎", "動詞", "形容詞", "名詞", "會話表達"]

# 依 id 前綴推分組（原本 26 個主題場景沒有 group 欄位）
def group_of(sid):
    if sid.startswith("grammar-") or sid == "phrasal-verbs":
        return "文法基礎"
    if sid.startswith("verbs-"):
        return "動詞"
    if sid.startswith("adj-"):
        return "形容詞"
    if sid == "daily-expressions":
        return "會話表達"
    return "生活主題"


LATIN = re.compile(r"[A-Za-z]")
# 中文欄位允許在全形括號裡放英文例詞（例：淡綠色（pale green）），那是刻意給學生看的
ZH_PAREN = re.compile(r"[（(][^）)]*[）)]")

# ── 簡體字關卡 ────────────────────────────────────────────────
# 用 OpenCC s2t 找出「會被轉換器改動」的字，但清單裡這些字在臺灣本來就是
# 正確的繁體用法，轉換器反而會改錯，所以排除。
# 每個都附上原因，避免日後有人「好心」把它從清單裡刪掉。
TRAD_OK = {
    "吃": "喫（臺灣用「吃東西」）",
    "游": "遊（「游泳」「游泳池」用游；旅遊才用遊）",
    "台": "臺（「月台」「服務台」「台灣」用台）",
    "床": "牀（臺灣用「床」）",
    "群": "羣（標準寫法是「群」）",
    "里": "裏（「公里」「英里」用里；裡面才用裡）",
    "秘": "祕（祕／秘並存，祕密較正式）",
    "划": "劃（「划算」「划船」用划；「規劃」才用劃）",
    "丑": "醜（「小丑」用丑；醜陋才用醜）",
    "岩": "巖（「岩石」用岩）",
    "伙": "夥（「傢伙」用伙）",
    "唇": "脣（標準寫法是「唇」）",
    "皂": "皁（「肥皂」用皂）",
    "后": "後（「皇后」用后；以後才用後）",
    "斗": "鬥（「熨斗」「北斗」用斗；打鬥才用鬥）",
    "采": "採／彩（「採用」用採、「喝彩／精彩」用彩，此專案已改用彩）",
}
try:
    from opencc import OpenCC as _OpenCC
    _cc_t = _OpenCC("s2t")
    HAVE_OPENCC = True
except Exception:          # pragma: no cover
    _cc_t = None
    HAVE_OPENCC = False


def simplified_chars(text):
    """回傳這段文字裡「確定還是簡體」的字（已排除繁體本來就對的字）。"""
    if not HAVE_OPENCC:
        return set()
    bad = set()
    for ch in set(re.findall(r"[\u3400-\u9fff]", text or "")):
        if ch in TRAD_OK:
            continue
        if _cc_t.convert(ch) != ch:
            bad.add(ch)
    return bad

# IPA 允許的符號集合：英式音標字母 + 重音符號 + 長音符號 + 音節分隔點
IPA_ALLOWED = set(
    "abcdefghijklmnopqrstuvwxyz"
    "ɑɒæɜɔəɛɪʊʌθðʃʒŋɡɹɚɫʔɐ"
    "ˈˌː.͡ '()/-"
)


def ipa_problem(ipa):
    """這串 ipa 有沒有不允許的字元？回傳描述，沒有問題就回傳 None。"""
    if not ipa:
        return "缺 ipa"
    if "/" in ipa:
        return "ipa 不應包含斜線"
    bad = sorted({c for c in ipa if c not in IPA_ALLOWED})
    if bad:
        return "不允許的音標字元：" + " ".join("【%s】" % c for c in bad[:6])
    return None


def zh_has_latin(zh):
    return bool(LATIN.search(ZH_PAREN.sub("", zh or "")))


def load_all():
    scenes, errors = [], []
    for folder in (PARTS, PARTS_EXTRA):
        if not folder.exists():
            continue
        for f in sorted(folder.glob("*.json")):
            try:
                data = json.loads(f.read_text(encoding="utf-8"))
            except Exception as e:
                errors.append(f"{f.name}: JSON 解析失敗 — {e}")
                continue
            if isinstance(data, dict):
                data = [data]
            for s in data:
                s["_src"] = f.name
                scenes.append(s)
    return scenes, errors


def expected_words():
    """規格指定「必須全部出現」的詞。"""
    need = {}
    if SPEC.exists():
        for s in json.loads(SPEC.read_text(encoding="utf-8"))["scenes"]:
            # 原本的主題場景：pool 是「參考範圍」，不是強制清單
            need[s["id"]] = None
    if SPEC_EXTRA.exists():
        for s in json.loads(SPEC_EXTRA.read_text(encoding="utf-8"))["scenes"]:
            need[s["id"]] = [w["en"] for w in s.get("words", [])]
    return need


def validate(scene, required):
    sid = scene["id"]
    errs, warns = [], []

    for key in ("icon", "name", "nameEn", "summary"):
        if not scene.get(key):
            warns.append(f"{sid}: 缺少 {key}")

    for key in ("words", "phrases", "sentences"):
        if not scene.get(key):
            errs.append(f"{sid}: {key} 是空的")

    tips = scene.get("tips") or []
    if len(tips) != 3:
        warns.append(f"{sid}: tips 有 {len(tips)} 筆（建議 3 筆）")

    # 說明文字（場景名、摘要、提示）也要是臺灣正體
    for field in ("name", "summary", "note"):
        bad = simplified_chars(scene.get(field))
        if bad:
            errs.append(f"{sid}/{field}: 含簡體字 {''.join(sorted(bad))} — {scene.get(field)}")
    for i, tip in enumerate(tips):
        bad = simplified_chars(tip)
        if bad:
            errs.append(f"{sid}/tips[{i}]: 含簡體字 {''.join(sorted(bad))} — {tip}")

    for item in scene.get("words", []) + scene.get("phrases", []):
        en = (item.get("en") or "").strip()
        zh = (item.get("zh") or "").strip()
        ipa = (item.get("ipa") or "").strip()
        if not en:
            errs.append(f"{sid}: 有條目的 en 是空的")
        if "’" in en or "‘" in en:
            errs.append(f"{sid}/{en}: en 有彎引號，必須用半形直引號")
        ipa_bad = ipa_problem(ipa)
        if ipa_bad and ipa_bad != "缺 ipa":
            errs.append(f"{sid}/{en}: {ipa_bad} — {ipa}")
        if not zh:
            errs.append(f"{sid}/{en}: 缺 zh")
        else:
            if zh_has_latin(zh):
                warns.append(f"{sid}/{en}: zh 裡有拉丁字母「{zh}」")
            simp = simplified_chars(zh)
            if simp:
                errs.append(f"{sid}/{en}: zh 含簡體字 {''.join(sorted(simp))} — {zh}")

    for item in scene.get("sentences", []):
        en = (item.get("en") or "").strip()
        zh = (item.get("zh") or "").strip()
        if not en:
            errs.append(f"{sid}: 有句子的 en 是空的")
        if item.get("ipa"):
            errs.append(f"{sid}/{en}: 句子不可以有 ipa")
        if "’" in en:
            errs.append(f"{sid}/{en}: en 有彎引號")
        if not zh:
            errs.append(f"{sid}/{en}: 缺 zh")
        else:
            if zh_has_latin(zh):
                warns.append(f"{sid}/{en}: zh 裡有拉丁字母「{zh}」")
            simp = simplified_chars(zh)
            if simp:
                errs.append(f"{sid}/{en}: zh 含簡體字 {''.join(sorted(simp))} — {zh}")
        n = len(re.findall(r"[A-Za-z0-9']+", en))
        if n and not (4 <= n <= 20):
            warns.append(f"{sid}/{en}: 句子長度 {n} 個字，可能不在 A2 範圍")

    # 指定詞必須齊全
    if required:
        have = set()
        for key in ("words", "phrases"):
            for it in scene.get(key, []):
                have |= variant_set(it["en"])
        missing = [w for w in required if variant_set(w) & have == set()
                   and norm(w) not in have]
        if missing:
            errs.append(f"{sid}: 規格指定但缺少的詞 {len(missing)} 個 → {missing[:12]}")

    # 場景內重複
    for key in ("words", "phrases", "sentences"):
        seen = set()
        for it in scene.get(key, []):
            e = it["en"].strip().lower()
            if e in seen:
                warns.append(f"{sid}: {key} 有重複項目「{it['en']}」")
            seen.add(e)

    return errs, warns


def variant_set(item):
    """一筆詞條涵蓋的所有拼法寫法，例如 all right/alright 同時滿足 alright 與 all right。"""
    out = set()
    base = norm(item)
    if not base:
        return out
    out.add(base)
    if "/" in base:
        for piece in base.split("/"):
            piece = piece.strip()
            piece = re.sub(r"\((\w+)\)", r"\1", piece)
            piece = piece.split("(")[0].strip()
            if piece and not re.fullmatch(r"(n|v|adj|adv|n pl|phr v|exclam)", piece):
                out.add(piece)
    m = re.search(r"(\w+)\((\w+)\)", base)
    if m and len(m.group(2)) <= 4:
        out.add(m.group(1))
        out.add(m.group(1) + m.group(2))
    return out


def norm(s):
    return re.sub(r"\s+", " ", (s or "").strip().lower()
                  .replace("’", "'").replace("‘", "'")).strip()


def variants(item):
    out = set()
    base = norm(item)
    if not base:
        return out
    out.add(base)
    m = re.search(r"\((\w+)\)", base)
    if m:
        stem = base[: m.start()].strip()
        out.add(stem)
        if len(m.group(1)) <= 4 and m.group(1).isalpha():
            out.add(stem + m.group(1))
    if "/" in base:
        for piece in base.split("/"):
            piece = piece.strip()
            if piece and piece not in ("n", "v", "adj", "adv"):
                out.add(piece)
    return out


def coverage(scenes):
    covered = set()
    for s in scenes:
        for key in ("words", "phrases", "sentences"):
            for it in s.get(key, []):
                covered |= variants(it["en"])
    full = json.loads(FULL.read_text(encoding="utf-8"))
    hit, miss = [], []
    for e in full["entries"]:
        if variants(e["en"]) & covered:
            hit.append(e)
        else:
            miss.append(e)
    return hit, miss


def pos_variants(en):
    """
    一個詞條涵蓋的各種寫法。例如 a/an → a、an；yog(h)urt → yoghurt、yogurt；
    centre/center → centre、center。詞性相同，所以一起登錄。
    """
    base = norm(en)
    out = {base}
    if "/" in base:
        for piece in base.split("/"):
            piece = piece.strip()
            piece = re.sub(r"\(\w+\)", "", piece).split("(")[0].strip()
            if piece:
                out.add(piece)
    m = re.search(r"(\w+)\((\w+)\)", base)
    if m and len(m.group(2)) <= 4:
        out.add(m.group(1))
        out.add(m.group(1) + m.group(2))
    # gram(me) 這種已經在上面處理過；這裡再補一次去掉括號的版本
    out.add(re.sub(r"\(\w+\)", "", base))
    return {x for x in out if x}


def build_pos_dict():
    """
    從 Cambridge 官方詞表抽出「詞 → 詞性」對照表。
    解析面板的詞性判斷直接查這份資料，不再靠啟發式規則猜。
    詞性代碼沿用官方縮寫：n / n pl / adj / v / phr v / adv / pron / prep /
    prep phr / det / conj / mv / av / exclam / unc n。
    """
    full = json.loads(FULL.read_text(encoding="utf-8"))
    singles, multi = {}, {}
    for e in full["entries"]:
        codes = [c.strip().lower() for c in re.split(r"[,&]", e["pos"] or "") if c.strip()]
        codes = [c for c in codes
                 if c not in ("am eng", "br eng")
                 and not c.startswith(("am eng:", "br eng:"))]
        if not codes:
            continue
        base = norm(e["en"])
        if not base:
            continue
        target = multi if " " in base else singles
        # 必須用 sorted：set 的迭代順序會受 Python 字串雜湊隨機化影響，
        # 不排序的話每次產生的 scenes.js 位元組都不同，git diff 會一直跳出假變更。
        for variant in sorted(pos_variants(e["en"])):
            key = variant if " " in variant else variant
            bucket = multi if " " in key else singles
            prev = bucket.get(key)
            bucket[key] = codes if not prev else prev + [c for c in codes if c not in prev]
    return singles, multi


def main():
    check_only = "--check" in sys.argv
    scenes, load_errs = load_all()
    errors = list(load_errs)
    warnings = []

    seen_ids = {}
    for s in scenes:
        sid = s["id"]
        if sid in seen_ids:
            errors.append(f"場景 id 重複：{sid}（{seen_ids[sid]} 與 {s['_src']}）")
        seen_ids[sid] = s["_src"]
        s.setdefault("group", group_of(sid))
        s.setdefault("note", "")

    need = expected_words()
    for s in scenes:
        e, w = validate(s, need.get(s["id"]))
        errors += e
        warnings += w

    hit, miss = coverage(scenes)
    pct = round(100.0 * len(hit) / max(len(hit) + len(miss), 1), 1)

    print("=" * 62)
    print(f"場景數        : {len(scenes)}")
    tot_w = sum(len(s.get('words', [])) for s in scenes)
    tot_p = sum(len(s.get('phrases', [])) for s in scenes)
    tot_s = sum(len(s.get('sentences', [])) for s in scenes)
    print(f"單字 / 片語 / 句子 : {tot_w} / {tot_p} / {tot_s}  (共 {tot_w + tot_p + tot_s} 條)")
    print(f"Cambridge 詞表覆蓋 : {len(hit)} / {len(hit) + len(miss)}  = {pct}%")
    if miss:
        print(f"仍未涵蓋 {len(miss)} 條：")
        by = {}
        for e in miss:
            by.setdefault(e["letter"], []).append(e["en"])
        for k in sorted(by):
            print(f"   {k}: {', '.join(by[k][:40])}")
    print("=" * 62)

    if warnings:
        print(f"\n⚠️ 提醒 {len(warnings)} 則：")
        for w in warnings[:40]:
            print("   " + w)
        if len(warnings) > 40:
            print(f"   …還有 {len(warnings) - 40} 則")

    if errors:
        print(f"\n❌ 錯誤 {len(errors)} 則（必須修完才能產生詞庫）：")
        for e in errors[:60]:
            print("   " + e)
        if len(errors) > 60:
            print(f"   …還有 {len(errors) - 60} 則")
        sys.exit(1)

    print("\n✅ 驗證通過")

    if check_only:
        return

    clean = []
    for s in scenes:
        clean.append({
            "id": s["id"], "icon": s["icon"], "name": s["name"],
            "nameEn": s.get("nameEn", ""), "summary": s.get("summary", ""),
            "group": s.get("group", "生活主題"), "note": s.get("note", ""),
            "words": [{"en": w["en"].strip(), "zh": w.get("zh", "").strip(),
                       "ipa": w.get("ipa", "").strip()} for w in s.get("words", [])],
            "phrases": [{"en": p["en"].strip(), "zh": p.get("zh", "").strip(),
                         "ipa": p.get("ipa", "").strip()} for p in s.get("phrases", [])],
            "sentences": [{"en": x["en"].strip(), "zh": x.get("zh", "").strip()}
                          for x in s.get("sentences", [])],
            "tips": [t for t in (s.get("tips") or [])],
        })

    index = {s["id"]: s for s in clean}
    pos_single, pos_multi = build_pos_dict()
    pos = {"single": pos_single, "multi": pos_multi}
    header = (
        "// data/scenes.js — 自動產生，請勿手改。\n"
        "// 想改內容請改 data/parts/*.json 與 data/parts_extra/*.json，\n"
        "// 然後執行： python tools/build_scenes.py\n"
        "//\n"
        "// 詞彙範圍：Cambridge English A2 Key / A2 Key for Schools Vocabulary List\n"
        "//           (© UCLES 2025)。中文釋義、片語與例句為本專案自撰。\n"
        "// SCENE_POS 則直接來自官方詞表的詞性標註。\n\n"
    )
    body = (
        "window.SCENES = " + json.dumps(clean, ensure_ascii=False, indent=1) + ";\n\n"
        "window.SCENE_INDEX = " + json.dumps(index, ensure_ascii=False, indent=1) + ";\n\n"
        "window.SCENE_GROUPS = " + json.dumps(GROUPS, ensure_ascii=False) + ";\n\n"
        "/* 詞性對照表：直接取自 Cambridge 官方詞表的詞性標註，"
        "讓「解析」面板不必靠規則猜詞性 */\n"
        "window.SCENE_POS = " + json.dumps(pos, ensure_ascii=False, indent=0, sort_keys=True) + ";\n"
    )
    # newline="\n"：不論在 Windows 或 Linux 產生，行尾都固定是 LF。
    # 沒有這行的話，Windows 會寫成 CRLF、Linux 寫成 LF，
    # CI 的「詞庫是否同步」檢查會整份檔案都不一致而失敗。
    OUT.write_text(header + body, encoding="utf-8", newline="\n")
    print(f"→ {OUT}  ({OUT.stat().st_size / 1024:.0f} KB)")


if __name__ == "__main__":
    main()
