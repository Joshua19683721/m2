#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
assign_scenes.py — 把 Cambridge A2 Key 完整詞表中「還沒被任何場景涵蓋」的詞，
分派到新增場景（基礎文法 / 動詞 / 形容詞 / 名詞），
輸出 data/_scene_spec_extra.json：每個新場景都有一份「必須全部收進 words」的詞表。

保證：每個未涵蓋詞一定被指派到「恰好一個」新場景；沒被規則命中的會落到
      noun-everyday-misc，因此不會漏。生成器只要照著詞表做，覆蓋率就是 100%。
"""
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FULL = ROOT / "data" / "_a2key_full.json"
COV = ROOT / "data" / "_coverage.json"
OUT = ROOT / "data" / "_scene_spec_extra.json"

def W(raw):
    """把多行空白分隔的字串變成集合。"""
    return {w.strip().lower() for w in raw.split() if w.strip()}

# ═══════════════════════════════════════════════════════════════
# 1) 關鍵字規則：先比對，命中就直接決定場景
# ═══════════════════════════════════════════════════════════════
KEYWORD_RULES = {

    "phrasal-verbs": set(),   # 交給詞性（phr v）

    "grammar-adverbs": W("""
        very too quite rather almost always never often sometimes usually already still just
        soon again maybe probably exactly really enough hardly nearly only even ever
        together else however therefore instead moreover besides actually finally recently
        lately suddenly carefully slowly quickly fast well far near here there now then
        today tonight tomorrow yesterday ago later afterwards before after first next last
        once twice more most less least better worse best outside inside upstairs downstairs
        abroad away back forward ahead apart again elsewhere anywhere somewhere everywhere
        nowhere already yet soon early late long ago nowadays meanwhile suddenly finally
    """),

    "verbs-talking": W("""
        say tell speak talk ask answer shout whisper reply explain describe discuss promise
        agree disagree believe think know understand remember forget mean decide plan hope
        wish want need expect imagine suppose guess realise notice spell translate question
        wonder advise warn consider doubt admit deny mention discuss complain
    """),

    "verbs-daily": W("""
        clean wash dry tidy sweep brush cut open close lock shut switch fix repair build
        make do finish start begin continue stop carry bring take put keep lose find hide
        throw catch break damage destroy mend waste save spend choose pick move lift push pull
        fill empty pour heat cool iron polish protect cover wrap pack fold hang collect clear
        store arrange deliver borrow lend use own tidy
    """),

    "verbs-food": W("""
        eat drink cook boil fry bake roast grill toast serve taste bite chew swallow feed
        order afford add mix stir season buy pay afford
    """),

    "verbs-school": W("""
        learn study teach practise revise review remember forget understand read write spell
        count calculate check test pass fail answer copy draw paint sing play translate
        explain note homework
    """),

    "verbs-moving": W("""
        go come walk run drive ride fly travel leave arrive return stay move cross follow enter
        exit park stop wait hurry catch miss turn climb fall jump swim sail cycle skate ski
        tour visit delay wander travel depart
    """),

    "verbs-feeling": W("""
        become feel seem look appear hurt love hate enjoy prefer worry care mind suffer heal
        relax impress surprise please
    """),

    "verbs-people": W("""
        meet marry introduce visit invite welcome help join lead obey respect admire trust
        depend share give take receive accept refuse thank apologise invite play
    """),

    "adj-people": W("""
        friendly kind polite honest brave clever shy funny serious quiet noisy lazy busy
        handsome pretty beautiful nice lovely cute smart confident strict cheerful patient
        famous popular talented creative curious sociable
    """),

    "adj-things": W("""
        big small large little long short tall high low wide narrow thin thick heavy deep
        soft hard smooth rough sharp fresh clean dirty dry wet hot cold warm cool new old
        modern difficult easy simple cheap expensive delicious safe dangerous strong weak
        rich poor empty full wooden electric striped spotted
    """),

    "adj-quality": W("""
        good bad better best worse worst right wrong true false real correct possible
        impossible important useful useless usual unusual special different similar same
        sure certain likely necessary perfect wonderful excellent brilliant amazing awesome
        fantastic great terrible awful favourite whole double spare local foreign national
        international
    """),

    "adj-emotion": W("""
        glad sad happy sorry unhappy surprised exciting exciting worried worrying frightened
        scary boring interested exciting disappointed excited pleased annoyed upset
    """),

    "noun-animals": W("""
        animal cat dog bird fish horse cow sheep bear lion tiger elephant monkey rabbit mouse
        rat snake frog bee butterfly insect pet duck pig hen goat donkey wolf fox deer
        camel lizard dinosaur whale shark dolphin octopus spider ant mosquito eagle hippo
        giraffe zebra panda penguin crocodile tortoise swan snail jellyfish creature puppy
        kitten beetle
        kangaroo parrot mole bat
    """),

    "noun-plants-garden": W("""
        tree flower grass plant leaf seed garden forest farm field branch root mud soil
        lawn greenhouse hedge vegetable fruit
    """),

    "noun-nature-weather": W("""
        mountain river sea ocean lake island beach sand stone rock cloud sky sun moon star
        space weather earth planet nature countryside desert ice fire air water wildlife
        wing nest burrow
    """),

    "noun-body": W("""
        head hair face eye ear nose mouth tooth tongue neck shoulder arm hand finger leg
        foot toe stomach heart brain blood bone skin beard headache back
    """),

    "noun-clothes-extra": W("""
        backpack bag balloon belt blouse boot bracelet cap coat dress earring glove handbag
        hat hoodie jacket jeans jumper necklace ring scarf shirt shorts skirt sock suit
        sweater tie tights trousers uniform wallet watch perfume leather wool fur cotton
        silk leather heel pocket button belt swimming costume bathing suit tracksuit
        swimsuit sunglasses outfit pyjamas costume
        clothes glasses jewellery raincoat shoe t-shirt purse make-up
    """),

    "noun-food-extra": W("""
        banana carrot chilli chips cola curry dessert garlic jam lemon melon mushroom
        omelette onion pasta pear pepper potato salad salt sauce sausage snack steak
        strawberry sugar toast dinner supper lunch breakfast recipe ingredient cereal
        biscuit candy burger bun lettuce grape mango pineapple
        bean butter cookie honey lemonade meal mineral water oil slice tomato stew
        cream muffin pancake yogurt yoghurt popcorn
    """),

    "noun-home-things": W("""
        sofa wardrobe cupboard mirror key battery button coin envelope tool string rope wire
        thread needle pin box bowl mug drawer cabinet lamp bulb shelf towel soap comb
        toothbrush staircase stairs ceiling floor wall carpet curtain blind radiator
        furniture equipment cooker fridge oven sink
        bathtub blanket bookcase bookshelf chair door glass kitchen sheet shower toilet
        washing machine washing-up window bin bottom case bottle cup dish fork plate
        spoon knife basket table
    """),

    "noun-school-things": W("""
        pencil pen crayon ruler eraser glue scissors backpack geometry geography chemistry
        biology physics vocabulary spelling dictionary timetable subject studies lesson
        homework project pupil headteacher diploma term
    """),

    "noun-tech-media": W("""
        website program printer chatroom app blog email inbox attachment download upload
        password username screen channel file folder document page paragraph website
        technology social media wifi laptop smartphone device program
        cd dvd dvd player cell phone digital camera headphone microphone mobile pc photo
        photograph photography picture selfie speaker telephone television text message
        web net link site address screen keyboard mouse message
    """),

    "noun-sports-games": W("""
        player score gym racket club match race game competition prize sport gymnastics
        fitness yoga swimming pool badminton tennis football basketball volleyball cricket
        hockey baseball rugby golf cycling skating surfing sailing skiing diving climbing
        skateboarding snowboarding windsurfing surfing tennis player footballer player
        cheerleader crowd score stadium
        chess puzzle quiz darts pool skateboard scooter surfboard snowboard soccer
        tennis table tennis basketball olympic
    """),

    "noun-people-roles": W("""
        adult stranger neighbour colleague scientist celebrity businessman businesswoman
        housewife colleague customer passenger person people teenager child baby parent
        guest crew band crowd audience fan follower opponent
        boy dad girlfriend boyfriend man woman queen king mr mrs ms dr mom mum granny
        grandma grandmother grandfather granddad grandchild grandparent kid schoolchild
        staff guide partner member visitor waiter waitress headteacher
    """),

    "noun-places-extra": W("""
        corner court entrance exit basement cellar balcony lift lobby porch fence gate
        bench pavement square park street
        cinema city circus gallery harbour port site hall yard closet room kitchen
        bathroom restaurant hotel station airport museum shop office factory hospital
        church centre center
    """),

    "noun-travel-things": W("""
        ticket seat journey tour guidebook luggage suitcase backpack helmet petrol diesel
        engine wheel wing tyre steering traffic motorway lane crossing tunnel fare
        transport platform
        aeroplane airplane plane police car taxi tram motorbike ship train lorry car
        gas station parking lot road bus coach bicycle bike
    """),

    "noun-money-shopping": W("""
        coin change discount customer credit card sale rent bargain receipt amount budget
        value deal penny pence dollar euro pound
        money cash price bill cost
    """),

    "noun-time-dates": W("""
        april august january february march june july october november december may
        weekend weekday midnight midday lunchtime o'clock century decade date century
        time clock calendar timetable
    """),

    "noun-abstract": W("""
        idea reason chance problem question answer dream wish hope plan news story secret
        information advice help support choice decision fact truth lie mistake danger fear
        surprise meaning example topic opinion experience experiment design invention
        achievement success failure trouble advice promise suggestion research
    """),

    "daily-expressions": set(),   # 交給詞性（exclam / abbrev）

    # 官方詞表裡沒有主題表、也沒有被以上規則命中的零星動詞／形容詞
    "verbs-extra": W("""
        allow belong bother call celebrate cry die dive discover drop earn explore get
        happen hear hold improve include invent kiss laugh let live listen lose offer
        perform prepare print repeat rest ride see sell send set show shut sing sit sleep
        smoke sort sound speak stand steal try wake walk wear work write
        board land arrive return change turn catch pass push pull
    """),

    "adj-extra": W("""
        able advanced aged amazing attractive available blond born broken careful classical
        closed comfortable complete crowded dead dear delicious delayed extinct extra fair
        fat fit flat frightened fun further good-looking healthy helpful horrible huge ill
        indoor kind large little lost loud lucky mad missing natural nervous normal outdoor
        plastic pleasant quiet quick ready relaxed relaxing sad scared sick single slim slow
        special strange successful sunny surprised surprising sweet tasty thirsty tired
        unusual various whole wild wooden young zero
    """),
}

# ═══════════════════════════════════════════════════════════════
# 2) 新場景定義（pos 只在關鍵字沒命中時使用）
# ═══════════════════════════════════════════════════════════════
SCENES = [
    ("grammar-core", "🧩", "基礎文法核心詞", "Core Grammar Words",
     "人稱、指示詞、所有格、情態與助動詞、連接詞——每一句都會用到的高頻詞。",
     "句子骨架，打錯整句語意就錯了，請優先練熟。", ["pron", "det", "mv", "av", "conj"]),
    ("grammar-prepositions", "🧭", "介系詞與方位", "Prepositions",
     "in / on / at / for / of… 地點、時間、方向與固定搭配都在這裡。",
     "中文沒有介系詞，是台灣學生最容易漏掉的一類詞。", ["prep", "prep phr"]),
    ("grammar-adverbs", "⏱️", "常用副詞", "Common Adverbs",
     "程度、時間、頻率、方向副詞——讓句子更自然的那一點點東西。",
     "副詞多半長得像形容詞但位置不同，是拼字練習的大坑。", ["adv"]),
    ("phrasal-verbs", "🔗", "片語動詞", "Phrasal Verbs",
     "get up / look after / turn off… 兩個字合起來才有意義的動詞。",
     "片語動詞要整個背，不要拆成兩個獨立的字去背。", ["phr v"]),
    ("verbs-talking", "💬", "動詞：溝通與想法", "Verbs: Talking & Thinking",
     "say / tell / think / know / understand… 說話與思考的動詞。",
     "注意 say 與 tell、look 與 see、hear 與 listen 的差別。", []),
    ("verbs-daily", "🧹", "動詞：日常與家務", "Verbs: Daily Life",
     "clean / carry / open / close / put / take… 每天在做的事。",
     "put / take / get 這組三兄弟的搭配最常考。", []),
    ("verbs-food", "🍳", "動詞：飲食與烹調", "Verbs: Food & Cooking",
     "eat / drink / cook / boil / taste… 從廚房到餐桌的動詞。",
     "可數名詞後面的 eat / have 要用複數，是本場最大陷阱。", []),
    ("verbs-school", "📖", "動詞：學校與學習", "Verbs: School & Learning",
     "learn / study / practise / pass / remember… 學習相關的動詞。",
     "learn 與 study 意思接近但搭法不同，練的時候要一起記。", []),
    ("verbs-moving", "🚶", "動詞：移動與出行", "Verbs: Moving & Travelling",
     "go / come / walk / drive / travel / arrive… 移動的動詞。",
     "方向副詞放句尾（go home、come back）不要放句首。", []),
    ("verbs-feeling", "💗", "動詞：感覺與狀態", "Verbs: Feeling & State",
     "become / feel / seem / enjoy / worry… 狀態與感受的動詞。",
     "become 後面接形容詞，get 後面也可接形容詞，兩者常一起出題。", []),
    ("verbs-people", "🤝", "動詞：人際與關係", "Verbs: People & Relationships",
     "meet / help / love / marry / join / invite… 跟人有關的動詞。",
     "invite someone to do something 的 to 很容易漏掉。", []),
    ("adj-people", "🙂", "形容詞：形容人", "Adjectives: Describing People",
     "friendly / clever / honest / shy… 用來說一個人怎樣的形容詞。",
     "-ed 形容被/how的感受，-ing 形容主動/how的感受。", []),
    ("adj-things", "🔍", "形容詞：形容物", "Adjectives: Describing Things",
     "big / heavy / beautiful / dangerous… 說一樣東西怎樣的形容詞。",
     "注意 big / large、little / small 這類同義詞的差別。", []),
    ("adj-quality", "📊", "形容詞：性質與程度", "Adjectives: Quality & Degree",
     "good / better / best、important / possible / usual… 性質與比較。",
     "比較級與最高級（-er / -est、more / most）是拼字重災區。", []),
    ("adj-emotion", "🎭", "形容詞：情緒與感覺", "Adjectives: Emotions & Feelings",
     "exciting / boring / worried / pleased… 描述情緒與感受的形容詞。",
     "這組多半有 -ed / -ing 兩種形式，要一起記。", []),
    ("verbs-extra", "🔁", "動詞：其他高頻動詞", "Verbs: More High-Frequency Verbs",
     "主題表沒列、但日常真的會用到的一批動詞，一次補齊。",
     "這組多是簡單現在式動詞，練的是 -s / -ed 這兩個尾巴。", ["v"]),
    ("adj-extra", "🎨", "形容詞：其他形容詞", "Adjectives: More Adjectives",
     "把主題表沒列的形容詞補齊，分大小、狀態與感覺三類。",
     "形容詞拼錯最多的是 -ful / -less / -y 這幾種結尾。", ["adj"]),
    ("noun-animals", "🐾", "名詞：動物與昆蟲", "Nouns: Animals & Insects",
     "cat / bird / insect / animal… 動物單字與片語。",
     "動物名詞的複數很多不規則（mouse → mice）。", []),
    ("noun-plants-garden", "🌿", "名詞：植物與花園", "Nouns: Plants & Garden",
     "tree / flower / seed / plant / garden… 植物與園藝。",
     "grass、leaf、seed 都是不可數名詞，前面不能加 a。", []),
    ("noun-nature-weather", "🌦️", "名詞：大自然與天象", "Nouns: Nature & Sky",
     "mountain / river / cloud / space / wildlife… 自然景觀與天上的東西。",
     "weather 不可數；談天氣好壞用 good / bad，不用 many。", []),
    ("noun-body", "🫀", "名詞：身體與健康", "Nouns: Body & Health",
     "finger / shoulder / stomach / headache… 身體部位與不適。",
     "身體部位前通常不加定冠詞：my head 疼，不是 my the head。", []),
    ("noun-clothes-extra", "👕", "名詞：衣物配件（補充）", "Nouns: Clothes & Accessories",
     "把衣物、鞋襪、配件一次補齊：jacket / jeans / wallet / perfume…",
     "leather / wool / fur / metal 這類材質名詞前通常不加 a。", []),
    ("noun-food-extra", "🍽️", "名詞：食物飲品（補充）", "Nouns: Food & Drink",
     "把食材、菜色與飲料補齊：banana / pasta / steak / lemonade…",
     "食物名詞通常可數，加 s 就變複數（potatoes）。", []),
    ("noun-home-things", "🧰", "名詞：居家用品（補充）", "Nouns: Home & Furniture",
     "sofa / wardrobe / cupboard / mirror / key… 家具與居家雜物。",
     "equipment、furniture 是不可數名詞，永遠不加 s。", []),
    ("noun-school-things", "🎒", "名詞：學校用品與科目", "Nouns: School & Subjects",
     "pencil / timetable / vocabulary / chemistry… 上學會用到與會學到的。",
     "homework 不可數，不能說 a homework。", []),
    ("noun-tech-media", "💾", "名詞：科技與媒體（補充）", "Nouns: Technology & Media",
     "website / program / printer / social media… 螢幕上的東西。",
     "news 不可數，「一則新聞」要說 a piece of news。", []),
    ("noun-sports-games", "🏓", "名詞：運動與遊戲（補充）", "Nouns: Sport & Games",
     "player / score / gym / racket / chess… 運動比賽相關名詞。",
     "match、race、game 都是可數名詞，要加 s。", []),
    ("noun-people-roles", "🧑‍🤝‍🧑", "名詞：人物與職業（補充）", "Nouns: People & Jobs",
     "adult / neighbour / colleague / scientist / celebrity… 各種身分的人。",
     "adult、colleague 是可數名詞，前面要加 a / the。", []),
    ("noun-places-extra", "🏙️", "名詞：地點與空間（補充）", "Nouns: Places & Spaces",
     "corner / cabinet / entrance / basement / bench… 場所與空間。",
     "place、room 這類詞前面通常要加定冠詞 the。", []),
    ("noun-travel-things", "🚗", "名詞：交通與旅行（補充）", "Nouns: Transport & Travel",
     "ticket / seat / journey / luggage / traffic… 路上與行程相關的名詞。",
     "luggage 不可數，「一件行李」要說 a piece of luggage。", []),
    ("noun-money-shopping", "💰", "名詞：金錢與購物（補充）", "Nouns: Money & Shopping",
     "coin / change / credit card / discount / customer… 錢與買賣。",
     "money、cash 不可數，要數幾元才用 a dollar、a pound。", []),
    ("noun-time-dates", "📅", "名詞：時間與月份（補充）", "Nouns: Time, Months & Dates",
     "April / October / o'clock / midday / weekend… 時間與月份。",
     "月份與星期首字母要大寫；日期用 on，月份用 in。", []),
    ("noun-abstract", "💭", "名詞：想法與抽象概念", "Nouns: Ideas & Feelings",
     "idea / reason / chance / trouble / success / opinion… 看不見的概念。",
     "抽象名詞的冠詞要看情況，是學生最容易錯的地方。", []),
    ("daily-expressions", "💬", "日常會話用語", "Everyday Expressions",
     "OK / Wow / Of course / Well done… 真正會用到的固定說法。",
     "這些多半是固定成句，直接整句背最快。", ["exclam", "abbrev"]),
    ("noun-everyday-misc", "✨", "名詞：其他日常詞彙", "Nouns: Everyday Miscellaneous",
     "主題表沒有歸類的零散名詞收在一起，方便一次補齊。",
     "這一組比較雜，建議當成複習清單來過。", ["n", "n pl"]),
]

FALLBACK = "noun-everyday-misc"


def group_of(sid):
    if sid.startswith("grammar-") or sid == "phrasal-verbs":
        return "文法基礎"
    if sid.startswith("verbs-"):
        return "動詞"
    if sid.startswith("adj-"):
        return "形容詞"
    if sid == "daily-expressions":
        return "會話表達"
    return "名詞"


def pos_tokens(pos):
    return {p.strip().lower() for p in re.split(r"[,&]", pos or "") if p.strip()}


def main():
    full = json.loads(FULL.read_text(encoding="utf-8"))
    cov = json.loads(COV.read_text(encoding="utf-8"))
    missing = cov["missing"]

    buckets = {s[0]: [] for s in SCENES}
    for e in missing:
        kl = e["en"].strip().lower()
        toks = pos_tokens(e["pos"])
        parts = kl.split()
        first = parts[0] if parts else kl
        two = " ".join(parts[:2])

        target = None
        if "phr v" in toks:
            target = "phrasal-verbs"
        if target is None:
            for sid, keys in KEYWORD_RULES.items():
                if not keys:
                    continue
                if kl in keys or first in keys or two in keys:
                    target = sid
                    break
        if target is None:
            for sid, _i, _n, _ne, _s, _nt, poss in SCENES:
                if toks & {p.lower() for p in poss}:
                    target = sid
                    break
        if target is None:
            target = FALLBACK

        buckets[target].append({"en": e["en"], "pos": e["pos"],
                                "examples": e.get("examples", [])[:2]})

    out_scenes = []
    for sid, icon, name, name_en, summary, note, poss in SCENES:
        words = buckets[sid]
        if not words:
            continue
        out_scenes.append({
            "id": sid, "icon": icon, "name": name, "nameEn": name_en,
            "summary": summary, "note": note, "group": group_of(sid),
            "wordCount": len(words), "words": words,
        })

    payload = {
        "meta": {
            "generatedFrom": "Cambridge A2 Key Vocabulary List（字母序 1713 條）",
            "reason": "主題表只收錄約 1/3 的詞；其餘是文法詞與一般詞彙，"
                      "依詞性與語義分派到新增場景，確保整份官方詞表 100% 涵蓋。",
            "contract": "生成器必須把每個場景 words 陣列中的所有 en 原樣放進該場景的 words",
        },
        "totalMissing": len(missing),
        "assigned": sum(s["wordCount"] for s in out_scenes),
        "scenes": out_scenes,
    }
    OUT.write_text(json.dumps(payload, ensure_ascii=False, indent=1), encoding="utf-8")

    print(f"未涵蓋 {len(missing)} 條 → 分派到 {len(out_scenes)} 個新場景")
    for s in out_scenes:
        print(f"  {s['id']:22s} {s['wordCount']:4d}  {s['name']}")
    print(f"合計 {payload['assigned']} / {len(missing)}")
    print("→", OUT)


if __name__ == "__main__":
    main()
