#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
parse_wordlist.py — 從 Cambridge A2 Key Vocabulary List PDF 抽出完整字母序詞表，
並加上下標題分類（Appendix 2 Topic Lists）與附錄詞組（Appendix 1 Word sets），
輸出成 data/_a2key_full.json，後續用來檢查「專案場景是否涵蓋全部」。
"""
import json
import re
import sys
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data" / "_pdf_raw.txt"
OUT = ROOT / "data" / "_a2key_full.json"

HEADER_RE = re.compile(r"©\s*UCLES\s*2025")
PAGE_RE = re.compile(r"^===== PAGE (\d+) =====$")


def load_pages():
    pages, cur = {}, None
    for line in RAW.read_text(encoding="utf-8").splitlines():
        m = PAGE_RE.match(line.strip())
        if m:
            cur = int(m.group(1))
            pages[cur] = []
            continue
        if cur is not None:
            pages[cur].append(line)
    return pages


def clean(lines):
    """去掉頁首頁尾、PDF 抽出來的空白雜訊。"""
    out = []
    for ln in lines:
        s = ln.rstrip()
        if HEADER_RE.search(s):
            continue
        t = s.strip()
        if t in ("", "Vocabulary List", "Schools", "Key and Key for Schools",
                 "Key for Schools"):
            continue
        if t.startswith("©"):
            continue
        if set(t) <= {" "}:
            continue
        out.append(s)
    return out


HEAD_RE = re.compile(r"^(.+?)\s*\(([^)]*)\)\s*$")
LETTER_RE = re.compile(r"^[A-Z]$")
ALPHA_PAGE_START = 4
ALPHA_PAGE_END = 23

# PDF 文字抽取把例句、國別標記、詞義說明黏進了詞條，這裡逐一修回來。
REPAIR = {
    "board board":            ("board", "n"),
    "card in class":          ("card", "n"),
    "character film":         ("character", "n"),
    "dish washing up":        ("dish", "n"),
    "key book":               ("key", "n"),
    "length minutes":         ("length", "n"),
    "practise well":          ("practise", "v"),
    "sugar suggest (v) + ing office": ("sugar", "n"),
    "fall autumn":            ("fall", "n & v"),
    "so (adv)":               ("so", "conj & adv"),
    "a.m":                    ("a.m.", "adv"),
    "a.m.":                   ("a.m.", "adv"),
    "p.m":                    ("p.m.", "adv"),
    "p.m.":                   ("p.m.", "adv"),
    "guess what?":            ("guess what", "v"),
    "driving/driver's licence driver's license)": ("driver's licence", "n"),
    "kilogramme kilogram)":   ("kilogram", "n"),
    "maths/mathematics math)": ("maths/mathematics", "n"),
    "sugar suggest (v) + ing": ("sugar", "n"),
    "swimming costume bathing suit)": ("swimming costume", "n"),
}

# 上面 key 對不上時，用「包含某段字串」再修一次（PDF 換行位置不固定）
CONTAINS_REPAIR = [
    ("driver's licence", ("driver's licence", "n")),
    ("kilogramme (kg)", ("kilogram", "n")),
    ("maths/mathematics", ("maths/mathematics", "n")),
    ("sugar suggest", ("sugar", "n")),
    ("swimming costume", ("swimming costume", "n")),
    ("guess what", ("guess what", "v")),
]

# 括號內容看起來像詞性縮寫才算 pos，否則是「詞義限定」要丟掉
POS_TOKENS = {
    "n", "v", "adj", "adv", "prep", "pron", "det", "conj", "mv", "av",
    "exclam", "abbrev", "n pl", "phr v", "prep phr", "pl", "sing",
}
POS_JOINERS = {"&", "and", ",", "or", "/"}


def _is_pos(tok):
    tok = tok.strip().lower()
    if not tok:
        return False
    parts = [p for p in re.split(r"[\s,&,/]+", tok) if p]
    if not parts:
        return False
    return all(p in POS_TOKENS for p in parts)


def normalize_head(full):
    """
    full = 整行，例如 "biscuit (n) (Br Eng)" 或 "photograph (n)"
    回傳 (乾淨的詞, 詞性字串)
    """
    full = full.strip().replace("’", "'")
    for probe in (full, full.rstrip("."), full.replace(")", "").rstrip(".")):
        if probe in REPAIR:
            return REPAIR[probe]
    for needle, fixed in CONTAINS_REPAIR:
        if needle in full.lower():
            return fixed

    groups = re.findall(r"\(([^)]*)\)", full)
    head = re.split(r"\(", full, 1)[0].strip()

    if head in REPAIR:
        return REPAIR[head]

    pos = None
    for g in groups:
        if _is_pos(g):
            pos = g
            break

    word = re.sub(r"\s*\(\s*$", "", head)         # 掉一半的括號
    word = word.strip().rstrip(".").strip()
    word = re.sub(r"\s+", " ", word)
    # photo(graph) / gram(me) / blond(e) / yog(h)urt → 取完整形
    word = re.sub(r"([a-z])\(([a-z]+)\)",
                  lambda m: m.group(1) + m.group(2) if len(m.group(2)) <= 3 else m.group(1),
                  word)
    if pos is None:
        for g in groups:
            if g.strip():
                pos = g.strip()
                break
    return word, (pos or "")


def parse_alphabetical(pages):
    """
    PDF 的多欄排版會把例句折成兩行（「• We watched England play against」+
    「France.」）。必須靠「上一行是不是 bullet」來判斷續行，
    否則續行會被誤當成新的詞條。
    """
    entries = []
    letter = ""
    last_was_bullet = False
    pending_skip = False   # 上一行是 "(Br Eng: driver's license)" 這種被截斷的註記

    for pno in range(ALPHA_PAGE_START, ALPHA_PAGE_END + 1):
        for ln in clean(pages.get(pno, [])):
            t = ln.strip()

            # 截斷被折斷的國別註記，例如 "… (Br Eng) (Br Eng:"
            m_cut = re.search(r"\((Br|Am) Eng:?", t)
            if m_cut:
                t = t[: m_cut.start()].strip()
                pending_skip = True

            if not t:
                continue

            if pending_skip and not LETTER_RE.match(t) and not t.startswith("•"):
                # 這一行是國別註記的後半段（"driver's license)"），丟掉
                if not HEAD_RE.match(t):
                    pending_skip = False
                    continue
                pending_skip = False

            if LETTER_RE.match(t):
                letter = t
                last_was_bullet = False
                continue

            if t.startswith("•"):
                ex = t.lstrip("•").strip()
                if entries:
                    if last_was_bullet and entries[-1]["examples"]:
                        entries[-1]["examples"][-1] += " " + ex
                    else:
                        entries[-1]["examples"].append(ex)
                last_was_bullet = True
                continue

            m = HEAD_RE.match(t)
            if not m:
                # 不是詞條 → 視為例句的折行，併進上一個例句；沒有例句就丟掉
                if entries and entries[-1]["examples"]:
                    entries[-1]["examples"][-1] += " " + t
                last_was_bullet = False
                continue

            word, pos = normalize_head(t)
            if not word:
                continue
            entries.append({"en": word, "pos": pos, "letter": letter, "examples": []})
            last_was_bullet = False
    return entries


# ───────────────── Appendix 2：主題分類 ─────────────────
TOPIC_START, TOPIC_END = 25, 32

TOPIC_TITLES = {
    "Appliances", "Clothes and Accessories", "Colours",
    "Communication and Technology", "Documents and Texts", "Education",
    "Entertainment and Media", "Family and Friends", "Food and Drink",
    "Health, Medicine and Exercise", "Hobbies and Leisure", "House and Home",
    "Measurements", "Personal Feelings, Opinions and Experiences",
    "Places: Buildings", "Places: Countryside", "Places: Town and City",
    "Services", "Shopping", "Sport", "The Natural World", "Time",
    "Travel and Transport", "Weather", "Work and Jobs",
}


def parse_topics(pages):
    """Appendix 2 的欄位是 4 欄並排；用標題行切段即可切出各主題的文字塊。"""
    topics, cur, buf = [], None, []
    for pno in range(TOPIC_START, TOPIC_END + 1):
        for ln in clean(pages.get(pno, [])):
            t = ln.strip()
            if t in TOPIC_TITLES:
                if cur:
                    topics.append((cur, buf))
                cur, buf = t, []
                continue
            if cur:
                buf.append(t)
    if cur:
        topics.append((cur, buf))

    out = {}
    for title, lines in topics:
        joined = " ".join(lines)
        # 多欄文字被串成一行；靠 "word word word" 切不開，改成用已知的
        # 詞表比對太麻煩，這裡改存原文，後續以「詞是否在字母表」過濾。
        out[title] = joined
    return out


def parse_word_sets(pages):
    lines = clean(pages.get(24, []))
    blocks, cur, buf = [], None, []
    heads = ("Cardinal numbers", "Ordinal numbers", "Days of the week",
             "Months of the year", "Seasons of the year",
             "Countries, languages and nationalities", "Continents")
    for ln in lines:
        t = ln.strip()
        if t in heads:
            if cur:
                blocks.append((cur, buf))
            cur, buf = t, []
            continue
        if cur:
            buf.append(t)
    if cur:
        blocks.append((cur, buf))
    return {k: " ".join(v) for k, v in blocks}


def main():
    pages = load_pages()
    entries = parse_alphabetical(pages)
    topics = parse_topics(pages)
    sets = parse_word_sets(pages)

    # 去重（同一個詞可能出現兩次，例如 across (adv) / across (adv & prep)）
    uniq, by_key = [], {}
    for e in entries:
        key = e["en"].lower()
        if key in by_key:
            prev = by_key[key]
            if e["pos"] not in prev["pos"]:
                prev["pos"] = prev["pos"] + ", " + e["pos"]
            for x in e["examples"]:
                if x not in prev["examples"]:
                    prev["examples"].append(x)
        else:
            by_key[key] = e
            uniq.append(e)

    data = {
        "meta": {
            "source": "Cambridge English A2 Key / A2 Key for Schools Vocabulary List (UCLES, August 2025)",
            "note": "字母序主詞表 + Appendix 1 詞組 + Appendix 2 主題分類；用於覆蓋率檢查。",
        },
        "count": len(uniq),
        "entries": uniq,
        "wordSets": sets,
        "topicBlocks": topics,
    }
    OUT.write_text(json.dumps(data, ensure_ascii=False, indent=1), encoding="utf-8")

    print(f"字母序詞條：{len(entries)} → 去重後 {len(uniq)}")
    print(f"附錄一詞組：{len(sets)} 組")
    print(f"附錄二主題：{len(topics)} 個")
    letters = {}
    for e in uniq:
        letters[e["letter"]] = letters.get(e["letter"], 0) + 1
    print("各字母詞數：", " ".join(f"{k}:{v}" for k, v in sorted(letters.items())))
    print("→", OUT)


if __name__ == "__main__":
    main()
