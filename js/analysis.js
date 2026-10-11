/* ══════════════════════════════════════════════════════════════
   analysis.js — 「解析」面板

   詞性判斷以 data/scenes.js 的 SCENE_POS 為主（那份表直接取自 Cambridge
   官方詞表的詞性標註），再用三件事決定多義詞在「這一句」裡是哪一個詞性：
     ① 它在不在主詞位置
     ② 後面是不是接標點／句尾（please, → 感嘆詞）
     ③ 後面是不是「名詞 + 動詞」（that 子句）
   真的查不到才退回詞形規則與啟發式。

   「在句中的功能」不看詞典、看句子：同一個字在不同句子裡扮演的角色
   不同（brought us the file → us 是間接受詞、the file 是受詞），
   所以功能一律由 structure() 依前後文判定，不再只是印一句通用的詞性說明。
   ══════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  /* ═══════════ 詞性資料庫 ═══════════ */
  var POSDB = { single: {}, multi: {} };
  var posLoaded = false;

  function loadPos() {
    var db = global.SCENE_POS;
    if (db && db.single) {
      POSDB.single = db.single;
      POSDB.multi = db.multi || {};
      posLoaded = true;
    }
  }

  /** 延遲載入：不管 data/scenes.js 在本檔之前或之後載入都能運作 */
  function ensurePos() {
    if (!posLoaded) loadPos();
  }

  /* 官方詞表沒有、但句子裡一定會出現的形。
     這份清單是照 tools/analysis_demo.js 掃出「詞表查不到」的字補的，
     補完之後例句裡不再有字被誤判成「虛詞／功能詞」。 */
  var EXTRA_POS = {
    'am': 'av', 'is': 'av', 'are': 'av', 'was': 'av', 'were': 'av',
    'been': 'av', 'be': 'v', 'being': 'v',
    'has': 'av', 'had': 'av', 'having': 'v',
    'does': 'av', 'did': 'av', 'doing': 'v', 'done': 'v',
    "don't": 'adv', "doesn't": 'adv', "didn't": 'adv', "can't": 'mv',
    "won't": 'mv', "isn't": 'adv', "aren't": 'adv', "wasn't": 'adv',
    "weren't": 'adv', "hasn't": 'adv', "haven't": 'adv', "hadn't": 'adv',
    "couldn't": 'adv', "wouldn't": 'adv', "shouldn't": 'adv', "mightn't": 'adv',
    'two': 'n', 'three': 'n', 'four': 'n', 'five': 'n', 'six': 'n',
    'seven': 'n', 'eight': 'n', 'nine': 'n', 'ten': 'n', 'eleven': 'n',
    'twelve': 'n', 'thirteen': 'n', 'fourteen': 'n', 'fifteen': 'n',
    'twenty': 'n', 'thirty': 'n', 'forty': 'n', 'fifty': 'n',
    'hundred': 'n', 'thousand': 'n', 'million': 'n',
    'i': 'pron', 'we': 'pron', 'he': 'pron', 'she': 'pron', 'you': 'pron',
    'it': 'pron', 'they': 'pron', 'me': 'pron', 'him': 'pron', 'us': 'pron',
    'them': 'pron', 'who': 'pron', 'what': 'pron', 'which': 'pron',
    'whose': 'pron', 'whoever': 'pron', 'whatever': 'pron',
    // 不規則過去式
    'bought': 'v', 'made': 'v', 'gave': 'v', 'took': 'v', 'got': 'v',
    'found': 'v', 'gave': 'v', 'saw': 'v', 'paid': 'v', 'sold': 'v',
    'said': 'v', 'went': 'v', 'fell': 'v', 'felt': 'v', 'kept': 'v',
    'left': 'v', 'met': 'v', 'ran': 'v', 'sat': 'v', 'spoke': 'v',
    'wrote': 'v', 'read': 'v', 'ate': 'v', 'came': 'v',
    'broke': 'v', 'won': 'v', 'told': 'v', 'knew': 'v', 'grew': 'v',
    'threw': 'v', 'drew': 'v', 'drove': 'v', 'flew': 'v', 'wore': 'v',
    'began': 'v', 'drank': 'v', 'sang': 'v', 'rang': 'v', 'swam': 'v',
    'forgot': 'v', 'hid': 'v', 'slept': 'v', 'lost': 'v', 'built': 'v',
    'sent': 'v', 'spent': 'v', 'stood': 'v', 'understood': 'v', 'woke': 'v',
    // 不規則複數
    'children': 'n pl', 'men': 'n pl', 'women': 'n pl', 'people': 'n pl',
    'teeth': 'n pl', 'feet': 'n pl', 'mice': 'n pl', 'geese': 'n pl',
    // 狀態形容詞
    'asleep': 'adj', 'alive': 'adj', 'awake': 'adj', 'alone': 'adj',

    /* 掃描 60 個場景的 840 句例句後，補上「官方詞表查不到、但句子裡一定會出現」的字。
     少了這一段，brought / church / queue 這類字會被標成「虛詞／功能詞」。 */
    /* 動詞 */
    'arrange': 'v', 'became': 'v', 'behave': 'v', 'behaves': 'v', 'brought': 'v', 'burn': 'v',
    'chose': 'v', 'compete': 'v', 'complain': 'v', 'feed': 'v', 'froze': 'v', 'fry': 'v',
    'hang': 'v', 'heard': 'v', 'held': 'v', 'hire': 'v', 'hung': 'v', 'imagine': 'v',
    'introduce': 'v', 'knock': 'v', 'lands': 'v', 'learnt': 'v', "let's": 'v', 'lie': 'v',
    'mention': 'v', 'peel': 'v', 'pick': 'v', 'pour': 'v', 'pronounce': 'v', 'protect': 'v',
    'reach': 'v', 'realise': 'v', 'refuse': 'v', 'renew': 'v', 'revise': 'v', 'rub': 'v',
    'solve': 'v', 'stir': 'v', 'suggest': 'v', 'sweep': 'v', 'taught': 'v', 'thought': 'v',
    'warn': 'v',
    /* 名詞或動詞 */
    'count': 'n v', 'heat': 'n v', 'land': 'n v', 'lock': 'n v', 'plug': 'n v', 'reply': 'n v',
    'report': 'n v', 'respect': 'n v', 'rise': 'n v', 'search': 'n v', 'shake': 'n v', 'smile': 'n v',
    'support': 'n v', 'switch': 'n v', 'taste': 'n v', 'touch': 'n v', 'trust': 'n v', 'value': 'n v',
    'wave': 'n v', 'whisper': 'n v', 'type': 'n v', 'page': 'n v', 'hand': 'n v', 'book': 'n v',
    'answer': 'n v', 'change': 'n v', 'check': 'n v', 'clean': 'n v', 'clear': 'n v',
    'cross': 'n v', 'dry': 'n v', 'empty': 'n v', 'exercise': 'n v', 'experience': 'n v',
    'face': 'n v', 'fear': 'n v', 'finish': 'n v', 'force': 'n v', 'form': 'n v',
    'glance': 'n v', 'guess': 'n v', 'guide': 'n v', 'hammer': 'n v', 'handle': 'n v',
    'head': 'n v', 'help': 'n v', 'hit': 'n v', 'hold': 'n v', 'hurry': 'n v',
    'increase': 'n v', 'interest': 'n v', 'interview': 'n v', 'judge': 'n v', 'kick': 'n v',
    'kiss': 'n v', 'knock': 'n v', 'laugh': 'n v', 'look': 'n v', 'love': 'n v',
    'mark': 'n v', 'match': 'n v', 'measure': 'n v', 'message': 'n v', 'mind': 'n v',
    'miss': 'n v', 'model': 'n v', 'name': 'n v', 'need': 'n v', 'note': 'n v',
    'offer': 'n v', 'order': 'n v', 'paint': 'n v', 'park': 'n v', 'pass': 'n v',
    'pay': 'n v', 'phone': 'n v', 'pick': 'n v', 'plan': 'n v', 'plant': 'n v',
    'play': 'n v', 'point': 'n v', 'post': 'n v', 'practise': 'n v', 'practice': 'n v',
    'present': 'n v', 'promise': 'n v', 'question': 'n v', 'rain': 'n v', 'reach': 'n v',
    'record': 'n v', 'report': 'n v', 'request': 'n v', 'rest': 'n v', 'ring': 'n v',
    'risk': 'n v', 'rock': 'n v', 'rule': 'n v', 'run': 'n v', 'save': 'n v',
    'saw': 'n v', 'scare': 'n v', 'search': 'n v', 'shade': 'n v', 'shape': 'n v',
    'share': 'n v', 'shave': 'n v', 'show': 'n v', 'sign': 'n v', 'smell': 'n v',
    'smoke': 'n v', 'sound': 'n v', 'stamp': 'n v', 'start': 'n v', 'stay': 'n v',
    'step': 'n v', 'stop': 'n v', 'study': 'n v', 'surprise': 'n v', 'test': 'n v',
    'thank': 'n v', 'touch': 'n v', 'train': 'n v', 'travel': 'n v', 'treat': 'n v',
    'try': 'n v', 'turn': 'n v', 'use': 'n v', 'visit': 'n v', 'voice': 'n v',
    'vote': 'n v', 'wait': 'n v', 'walk': 'n v', 'wash': 'n v', 'watch': 'n v',
    'water': 'n v', 'wave': 'n v', 'whisper': 'n v', 'win': 'n v', 'wish': 'n v',
    'worry': 'n v', 'wrap': 'n v',
    /* 形容詞或動詞 */
    'calm': 'adj v',
    /* 名詞 */
    'ache': 'n', 'alarm': 'n', 'amount': 'n', 'audience': 'n', 'badge': 'n', 'bandage': 'n',
    'bargain': 'n', 'bell': 'n', 'calf': 'n', 'cave': 'n', 'church': 'n', 'cliff': 'n',
    'composition': 'n', 'continent': 'n', 'control': 'n', 'cough': 'n', 'crash': 'n', 'credit': 'n',
    'cub': 'n', 'cucumber': 'n', 'decision': 'n', 'discovery': 'n', 'edge': 'n', 'frame': 'n',
    'freedom': 'n', 'gorilla': 'n', 'hamster': 'n', 'heater': 'n', 'knee': 'n', 'leader': 'n',
    'lot': 'n', 'media': 'n', 'microwave': 'n', 'nil': 'n', 'officer': 'n', 'planet': 'n',
    'power': 'n', 'pram': 'n', 'queue': 'n', 'rainbow': 'n', 'reception': 'n', 'recycling': 'n',
    'refund': 'n', 'result': 'n', 'salary': 'n', 'scheme': 'n', 'shopkeeper': 'n', 'skill': 'n',
    'terminal': 'n', 'thunder': 'n', 'vacuum': 'n', 'valley': 'n', 'voice': 'n', 'wedding': 'n',
    "what's": 'n', 'whiteboard': 'n',
    /* 名詞（複數） */
    'coins': 'n pl', 'kilos': 'n pl', 'secrets': 'n pl', 'verbs': 'n pl', 'vitamins': 'n pl',
    /* 形容詞 */
    'bigger': 'adj', 'bitter': 'adj', 'careless': 'adj', 'colourful': 'adj', 'dining': 'adj', 'frightening': 'adj',
    'frozen': 'adj', 'generous': 'adj', 'gentle': 'adj', 'grateful': 'adj', 'largest': 'adj', 'lonely': 'adj',
    'main': 'adj', 'narrow': 'adj', 'naughty': 'adj', 'patient': 'adj', 'primary': 'adj', 'proud': 'adj',
    'remote': 'adj', 'salty': 'adj', 'sharp': 'adj', 'silly': 'adj', 'snowy': 'adj', 'social': 'adj',
    'strict': 'adj', 'suitable': 'adj', 'tight': 'adj', 'tiny': 'adj', 'uncomfortable': 'adj', 'useless': 'adj',
    /* 副詞 */
    'completely': 'adv', 'hardly': 'adv', 'honestly': 'adv', 'loudly': 'adv', 'quietly': 'adv',
    /* 連接詞 */
    'although': 'conj',
    /* 介系詞 */
    'onto': 'prep', 'towards': 'prep',
    /* 名詞所有格 */
    "teacher's": 'n poss', "today's": 'n poss',
    /* 代名詞所有格 */
    "everyone's": 'pron poss',
  };

  /* 國籍形容詞（-ish / -ian / -ese）：He is British. 用形容詞，不是專有名詞 */
  var NATIONALITY = {
    british: 1, english: 1, chinese: 1, japanese: 1, french: 1, german: 1,
    italian: 1, spanish: 1, american: 1, irish: 1, welsh: 1, scottish: 1,
    indian: 1, australian: 1, brazilian: 1, russian: 1, european: 1,
    asian: 1, african: 1, canadian: 1, mexican: 1, dutch: 1, swedish: 1,
    norwegian: 1, danish: 1, polish: 1, portuguese: 1, greek: 1,
    turkish: 1, thai: 1, vietnamese: 1, korean: 1, argentine: 1,
    colombian: 1, chilean: 1, cuban: 1, iranian: 1, iraqi: 1, israeli: 1,
    egyptian: 1, nigerian: 1, kenyan: 1, moroccan: 1, pakistani: 1
  };

  /* 句子開頭＋後面接動詞 → 感嘆詞（Please send… / Come here, please.） */
  var EXCLAM_WORDS = {
    please: 1, sorry: 1, hello: 1, hi: 1, hey: 1, welcome: 1,
    congratulations: 1, excuse: 1, well: 1, ok: 1, okay: 1
  };

  var POS_INFO = {
    'n':        { label: '名詞 (Noun)',                      role: 'noun' },
    'n pl':     { label: '名詞（複數） (Noun, plural)',        role: 'noun' },
    'unc n':    { label: '不可數名詞 (Uncountable Noun)',      role: 'noun' },
    'proper':   { label: '專有名詞 (Proper Noun)',              role: 'noun' },
    'n poss':   { label: '名詞所有格 (Noun, possessive)',       role: 'noun' },
    'pron':     { label: '代名詞 (Pronoun)',                    role: 'pron' },
    'pron poss': { label: '代名詞所有格 (Pronoun, possessive)', role: 'pron' },
    'adj':      { label: '形容詞 (Adjective)',                 role: 'adj' },
    'adj v':    { label: '形容詞或動詞 (Adjective / Verb)',    role: 'adj' },
    'n v':      { label: '名詞或動詞 (Noun / Verb)',           role: 'verb' },
    'v':        { label: '動詞 (Verb)',                       role: 'verb' },
    'phr v':    { label: '片語動詞 (Phrasal Verb)',            role: 'verb' },
    'adv':      { label: '副詞 (Adverb)',                     role: 'adv' },
    'prep':     { label: '介系詞 (Preposition)',               role: 'prep' },
    'prep phr': { label: '介系詞片語 (Prepositional Phrase)',  role: 'prep' },
    'det':      { label: '限定詞 (Determiner)',                role: 'det' },
    'conj':     { label: '連接詞 (Conjunction)',              role: 'conj' },
    'mv':       { label: '情態動詞 (Modal Verb)',              role: 'modal' },
    'av':       { label: 'be 動詞／助動詞',                    role: 'verb' },
    'exclam':   { label: '感嘆詞 (Exclamation)',               role: 'exclam' }
  };

  var NOMINAL = { noun: 1, pron: 1, det: 1, adj: 1 };

  function stems(key) {
    var out = [];
    if (/s$/.test(key) && !/(ss|us|is)$/.test(key)) {
      out.push(key.slice(0, -1));
      if (/es$/.test(key)) out.push(key.slice(0, -2));
    }
    if (/ies$/.test(key)) out.push(key.slice(0, -3) + 'y');
    if (/ied$/.test(key)) out.push(key.slice(0, -3) + 'y');
    if (/ed$/.test(key)) {
      var stem = key.slice(0, -2);
      out.push(stem, stem + 'e');
      if (stem.length > 1) out.push(stem.slice(0, -1));
    }
    if (/ing$/.test(key)) {
      var s2 = key.slice(0, -3);
      out.push(s2, s2 + 'e');
      if (s2.length > 1) out.push(s2.slice(0, -1));
    }
    if (/er$/.test(key)) out.push(key.slice(0, -2));
    if (/est$/.test(key)) out.push(key.slice(0, -3));
    return out;
  }

  function normKey(w) {
    return String(w == null ? '' : w).toLowerCase().replace(/[’‘]/g, "'");
  }

  /** 官方詞表的詞性註記偶爾帶補充說明（「adj – for colours」），
      取破折號前的主詞性，否則會因為查不到對應標籤而掉成「虛詞／功能詞」 */
  function normCode(code) {
    var s = String(code == null ? '' : code);
    var i = s.search(/[–—-]/);
    return (i > 0 ? s.slice(0, i) : s).trim();
  }

  function normCodes(codes) {
    return codes.map(normCode).filter(Boolean);
  }

  /** 查一個字（或片語）的詞性代碼陣列；查不到回傳 null */
  function posOf(word) {
    ensurePos();
    var k = normKey(word);
    if (!k) return null;
    var posdb = [];
    if (POSDB.single[k]) posdb = normCodes(POSDB.single[k]);
    else if (POSDB.multi[k]) posdb = normCodes(POSDB.multi[k]);
    else {
      var ss = stems(k);
      for (var i = 0; i < ss.length; i++) {
        if (POSDB.single[ss[i]]) { posdb = normCodes(POSDB.single[ss[i]]); break; }
        if (POSDB.multi[ss[i]]) { posdb = normCodes(POSDB.multi[ss[i]]); break; }
      }
    }
    if (EXTRA_POS[k]) {
      var extra = [EXTRA_POS[k]];
      if (posdb.length) {
        var merged = posdb.slice();
        extra.forEach(function (e) { if (merged.indexOf(e) < 0) merged.push(e); });
        return merged;
      }
      return extra;
    }
    return posdb.length ? posdb : null;
  }

  /* 靜態優先序（沒有上下文時用） */
  var PRIORITY = ['mv', 'av', 'phr v', 'v', 'n v', 'prep', 'det', 'pron', 'conj',
    'prep phr', 'adj', 'adj v', 'adv', 'exclam', 'n pl', 'unc n', 'n'];
  /* 主詞位置的優先序：先當名詞看 */
  var PRIORITY_SUBJ = ['n pl', 'unc n', 'proper', 'n', 'n v', 'pron', 'det', 'adj',
    'adj v', 'adv', 'exclam', 'prep', 'conj', 'v', 'phr v', 'av', 'mv'];

  /* 介系詞後面一定接名詞片語：能當名詞就看名詞（by email / after work）。
     副詞刻意不放進來，否則 after / before 會被誤判成副詞。 */
  var NOMINAL_FIRST = ['n', 'n pl', 'unc n', 'proper', 'n poss', 'n v', 'adj', 'det', 'pron'];

  /* 這些詞在「名詞 + 動詞」的樣子裡是引導子句的連接詞（when she saw…） */
  var CLAUSE_WORDS = {
    when: 1, if: 1, because: 1, although: 1, while: 1, as: 1, that: 1, so: 1,
    than: 1, until: 1, unless: 1, once: 1, before: 1, after: 1
  };

  function pick(codes, order) {
    if (!codes || !codes.length) return null;
    for (var i = 0; i < order.length; i++) {
      if (codes.indexOf(order[i]) >= 0) return order[i];
    }
    return codes[0];
  }

  /** 只在真的有命中時才回傳，沒命中回 null */
  function pickStrict(codes, order) {
    if (!codes || !codes.length) return null;
    for (var i = 0; i < order.length; i++) {
      if (codes.indexOf(order[i]) >= 0) return order[i];
    }
    return null;
  }

  function primaryPos(codes, ctx) {
    if (!codes || !codes.length) return null;
    ctx = ctx || {};
    // 句首的 Please / Sorry / Excuse / Hello / Hey → 直接感嘆詞
    if (ctx.atSentenceStart && codes.indexOf('exclam') >= 0 && EXCLAM_WORDS[normKey(ctx.token)]) {
      return 'exclam';
    }
    // 「please,」這類：後面接標點或句尾 → 感嘆詞
    if (ctx.atClauseEnd && codes.indexOf('exclam') >= 0) return 'exclam';
    // that + 名詞 + 動詞 → 連接詞（that 子句）
    if (ctx.beforeClause && codes.indexOf('conj') >= 0) return 'conj';
    // 名詞／動詞兩用的字：看它站在哪個位置決定
    if (codes.indexOf('n v') >= 0 || codes.indexOf('adj v') >= 0) {
      var isNv = codes.indexOf('n v') >= 0;
      if (ctx.afterDeterminer || ctx.inSubject) return isNv ? 'n' : 'adj';
      if (ctx.afterBe) return 'adj';
      return 'v';
    }
    // to 後面接動詞原形
    if (ctx.afterTo) {
      var inf2 = pick(codes, ['phr v', 'v', 'n v', 'adj v', 'mv', 'av']);
      if (inf2) return inf2;
    }
    // 介系詞後面接名詞片語（真的能當名詞才切，after / before 仍當介系詞）
    if (ctx.afterPreposition) {
      var nom = pickStrict(codes, NOMINAL_FIRST);
      if (nom) return nom;
    }
    // 主詞位置，或緊跟在限定詞後面（the film / a glass）→ 先當名詞看
    if (ctx.inSubject || ctx.afterDeterminer) return pick(codes, PRIORITY_SUBJ);
    return pick(codes, PRIORITY);
  }

  /* 這些詞本身就是限定詞，用來判斷「下一個字大概是不是名詞」 */
  var DET_WORDS = {
    the: 1, a: 1, an: 1, this: 1, that: 1, these: 1, those: 1,
    my: 1, your: 1, his: 1, her: 1, its: 1, our: 1, their: 1,
    some: 1, any: 1, no: 1, every: 1, each: 1, both: 1, all: 1,
    many: 1, much: 1, few: 1, several: 1, another: 1, other: 1,
    one: 1, two: 1, three: 1
  };

  /* 所有格代名詞（my / your / his…）：後面接名詞，不是動詞 */
  var POSSESSIVE_DET = {
    my: 1, your: 1, his: 1, her: 1, its: 1, our: 1, their: 1
  };

  var BE_FORMS = { is: 1, am: 1, are: 1, was: 1, were: 1, be: 1, been: 1, being: 1 };

  function isDetToken(token) { return !!DET_WORDS[normKey(token)]; }

  /* 資料庫查不到時的最後一線啟發式 */
  var FUNCTION_WORDS = {
    the: 'det', a: 'det', an: 'det', this: 'det', these: 'det', those: 'det',
    my: 'det', your: 'det', his: 'det', her: 'det', its: 'det', our: 'det',
    their: 'det', some: 'det', any: 'det', no: 'det', every: 'det', each: 'det',
    both: 'det', all: 'det', many: 'det', much: 'det', few: 'det', several: 'det',
    of: 'prep', in: 'prep', on: 'prep', at: 'prep', to: 'prep', for: 'prep',
    with: 'prep', from: 'prep', by: 'prep', about: 'prep', into: 'prep',
    over: 'prep', under: 'prep', after: 'prep', before: 'prep', between: 'prep',
    through: 'prep', across: 'prep', against: 'prep', without: 'prep',
    during: 'prep', near: 'prep', behind: 'prep', like: 'prep', off: 'prep',
    and: 'conj', but: 'conj', or: 'conj', so: 'conj', because: 'conj',
    if: 'conj', when: 'conj', while: 'conj', than: 'conj', as: 'conj',
    can: 'mv', could: 'mv', will: 'mv', would: 'mv', shall: 'mv', should: 'mv',
    may: 'mv', might: 'mv', must: 'mv',
    how: 'adv', why: 'adv', not: 'adv', never: 'adv', very: 'adv', too: 'adv'
  };

  function guess(token) {
    var w = normKey(token);
    if (FUNCTION_WORDS[w]) return FUNCTION_WORDS[w];
    // X's 所有格：today's date → 名詞所有格
    if (/'s$/.test(w)) {
      var base = w.slice(0, -2);
      if (base && !EXTRA_POS[w]) return /^(i|you|he|she|it|we|they|this|that|there|what|who|let)$/.test(base)
        ? (base === 'let' ? 'v' : (base === 'that' || base === 'this' ? 'det' : 'av'))
        : (POSDB.single[base] && POSDB.single[base].indexOf('pron') >= 0 ? 'pron poss' : 'n poss');
    }
    if (NATIONALITY[w]) return 'adj';
    if (/^\d+$/.test(w)) return 'n';
    if (/ly$/.test(w)) return 'adv';
    if (/(ing|ed)$/.test(w)) return 'v';
    // 首字母大寫但詞表查不到 → 多半是專有名詞（London、English、TV）
    if (/^[A-Z]/.test(String(token))) return 'proper';
    if (/s$/.test(w)) return 'n';
    // 真的認不出來 → 寧可說名詞，也不要貼上「虛詞／功能詞」這個更糟的答案
    return 'n';
  }

  /* ═══════════ 輸出用工具 ═══════════ */
  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function rich(str) {
    return escapeHtml(str)
      .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
      .replace(/\((O|X)\)/g, function (m, k) {
        return '<span class="mark mark-' + k + '">(' + k + ')</span>';
      });
  }

  function marked(text, kind) {
    var s = String(text == null ? '' : text).trim();
    if (/^\((O|X)\)/.test(s)) return rich(s);
    return rich('(' + kind + ') ' + s);
  }

  function info(code) { return POS_INFO[code] || { label: '虛詞／功能詞', role: 'func' }; }

  function roleName(role) {
    switch (role) {
      case 'noun': return '名詞';
      case 'pron': return '代名詞';
      case 'det': return '限定詞';
      case 'adj': return '形容詞';
      case 'adv': return '副詞';
      case 'prep': return '介系詞';
      case 'conj': return '連接詞';
      case 'modal': return '情態動詞';
      case 'verb': return '動詞';
      case 'exclam': return '感嘆詞';
      default: return '虛詞／功能詞';
    }
  }

  /* 這幾個位置看前後就知道是名詞性成分 */
  function isNominalRole(role) { return !!NOMINAL[role]; }

  /* ═══════════ 句子結構與詞性對照表 ═══════════ */

  /** 「動名詞」用的介系詞：後面接 V-ing。to 不算，它是接原形的不定詞 */
  var GERUND_PREPS = {
    of: 1, for: 1, about: 1, without: 1, after: 1, before: 1, in: 1,
    on: 1, at: 1, by: 1, from: 1, like: 1, with: 1, during: 1, between: 1
  };

  /** 從 idx 往後看，同一個名詞片語裡還有沒有別的名詞性成分（用來分辨「間接受詞」） */
  function hasObjectAfter(rows, idx) {
    var next = idx + 1 < rows.length ? rows[idx + 1] : null;
    return !!(next && !next.punct && isNominalRole(next.role));
  }

  /** 往前看有沒有介系詞（要跨過 this / a / big 這種名詞片語的修飾語） */
  function prepBehind(rows, idx) {
    var j = idx - 1;
    if (j < 0 || rows[j].punct) return null;
    if (rows[j].role === 'prep') return rows[j].token;
    while (j >= 0 && !rows[j].punct && isNominalRole(rows[j].role)) j--;
    if (j >= 0 && !rows[j].punct && rows[j].role === 'prep') return rows[j].token;
    return null;
  }

  /** 往前跳過受詞片語與連接詞，看有沒有動詞（science and history → 兩個都是受詞） */
  function objectVerbBehind(rows, idx) {
    var j = idx - 1;
    while (j >= 0 && !rows[j].punct) {
      var role = rows[j].role;
      if (isNominalRole(role) || role === 'adv' || role === 'conj') { j--; continue; }
      break;
    }
    return j >= 0 && !rows[j].punct && rows[j].role === 'verb';
  }

  /** 從 idx 往後看，這一串名詞性成分的尾巴有沒有 be 動詞（→ 表語） */
  function isComplementOf(rows, idx) {
    var j = idx + 1;
    while (j < rows.length && !rows[j].punct && isNominalRole(rows[j].role)) j++;
    return j < rows.length && !rows[j].punct && BE_FORMS[normKey(rows[j].token)];
  }

  /** 這串名詞性成分後面還有沒有動詞（→ 真的子句，不是並列名詞） */
  function clauseHasVerb(rows, idx) {
    for (var j = idx + 1; j < rows.length; j++) {
      if (rows[j].punct) return false;
      if (rows[j].role === 'verb' || rows[j].role === 'modal') return true;
      // 只允許名詞／代名詞／副詞在中間；限定詞、連接詞一出現就代表這不是子句
      if (rows[j].role !== 'noun' && rows[j].role !== 'pron' && rows[j].role !== 'adv') return false;
    }
    return false;
  }

  /** 這個字是不是整個小句的尾巴（後面只剩標點／連接詞／介系詞） */
  function atClauseTail(rows, idx) {
    var next = idx + 1 < rows.length ? rows[idx + 1] : null;
    if (!next) return true;
    return next.punct || next.role === 'conj' || next.role === 'prep';
  }

  /* let me know / help me see：受詞後面接原形，是「讓某人做某事」的不定詞 */
  var LET_LIKE = { let: 1, help: 1, make: 1, lets: 1, "let's": 1 };

  /** 往前跳過形容詞／副詞／連接詞，看是不是接在 be 動詞後面
      （are pale blue and white → blue、white 也是 be 後面的表語） */
  function beBehind(rows, idx) {
    var j = idx - 1;
    while (j >= 0 && !rows[j].punct &&
      (rows[j].role === 'adj' || rows[j].role === 'adv' || rows[j].role === 'conj')) j--;
    return j >= 0 && !rows[j].punct && rows[j].role === 'verb' &&
      BE_FORMS[normKey(rows[j].token)];
  }

  /** 決定一個字在「這一句」裡的功能 */
  function functionOf(r, idx, rows, inf, code) {
    var prev = idx > 0 ? rows[idx - 1] : null;
    var next = idx + 1 < rows.length ? rows[idx + 1] : null;
    var key = normKey(r.token);
    var pRole = prev && !prev.punct ? prev.role : null;
    var pKey = prev && !prev.punct ? normKey(prev.token) : '';
    var afterBe = (pRole === 'verb' && BE_FORMS[pKey]) || beBehind(rows, idx);

    /* 形容詞：看它修飾的是名詞，還是 be 動詞後面的表語 */
    if (inf.role === 'adj') {
      if (afterBe) {
        return { role: '主詞補語', func: '在 be 動詞後面，描述主詞的狀態或特徵' };
      }
      if (pRole === 'verb') {
        if (atClauseTail(rows, idx)) {
          return { role: '動詞補語', func: '補充說明動作之後變成什麼樣子' };
        }
        return { role: '名詞修飾語', func: '放在名詞前面，說明這個名詞是什麼樣子' };
      }
      if (isComplementOf(rows, idx)) {
        return { role: '主詞補語', func: '在 be 動詞後面，描述主詞的狀態或特徵' };
      }
      if (next && isNominalRole(next.role)) {
        return { role: '名詞修飾語', func: '修飾後面的名詞，和它一起構成名詞片語' };
      }
      return { role: '形容詞', func: '修飾名詞；放在 be 動詞後面時是描述主詞' };
    }

    /* 副詞 */
    if (inf.role === 'adv') {
      return { role: '狀語', func: '修飾動詞或整個句子（時間／程度／方式）' };
    }

    /* 名詞、代名詞、專有名詞 */
    if (inf.role === 'noun' || inf.role === 'pron') {
      var prepTok = pRole === 'prep' ? prev.token : prepBehind(rows, idx);
      if (prepTok) {
        return {
          role: '介系詞受詞',
          func: '接在 ' + prepTok + ' 後面，組成介系詞片語，說明「在哪裡／什麼時候／對誰」'
        };
      }
      if (afterBe) {
        return { role: '主詞補語', func: '在 be 動詞後面，告訴我們主詞是什麼或怎樣' };
      }
      if (pRole === 'verb' || objectVerbBehind(rows, idx)) {
        if (hasObjectAfter(rows, idx)) {
          return {
            role: '間接受詞',
            func: '動作的「給誰／對誰」，後面還有一個直接受詞'
          };
        }
        return { role: '受詞', func: '動作的對象，也就是「做什麼」的答案' };
      }
      if (isComplementOf(rows, idx)) {
        return { role: '主詞補語', func: '在 be 動詞後面，告訴我們主詞是什麼或怎樣' };
      }
      if (next && next.role === 'noun') {
        return { role: '名詞修飾語', func: '修飾後面的名詞，和它一起構成名詞片語' };
      }
      if (inf.role === 'pron') {
        return { role: '代名詞', func: '代替前面提過的人或東西，避免重複' };
      }
      if (code === 'proper') {
        return { role: '專有名詞', func: '特定的人、地方或事物名稱，前面通常不加冠詞' };
      }
      if (code === 'n poss' || code === 'pron poss') {
        return { role: '所有格', func: "用 's 表示「某人的」，後面接名詞" };
      }
      return { role: '名詞', func: '句中的名詞成分；可數名詞要依數量決定單複數' };
    }

    /* 動詞 */
    if (inf.role === 'verb' || inf.role === 'modal') {
      if (code === 'mv') {
        return { role: '情態動詞', func: '後面接動詞原形，表示能力、請求、可能性或義務' };
      }
      if (code === 'av') {
        return { role: 'be 動詞', func: '後面接主詞補語；單複數要和主詞一致' };
      }
      if (pRole === 'prep') {
        if (GERUND_PREPS[pKey]) {
          return {
            role: '動名詞',
            func: '前面是介系詞 ' + prev.token + '，所以動詞要用 -ing 形式'
          };
        }
        return { role: '不定詞', func: '前面是 to，動詞要用原形（不加 -s、不加 -ing）' };
      }
      if (pRole === 'modal') {
        return { role: '不定詞', func: '情態動詞後面一律接動詞原形' };
      }
      // let me know / help me see：受詞後面接原形
      if (pRole === 'pron' && idx >= 2 && LET_LIKE[normKey(rows[idx - 2].token)]) {
        return { role: '不定詞', func: 'let / help 後面接「受詞 + 動詞原形」' };
      }
      // Let's make…：let's 後面接動詞原形
      if (pRole === 'verb' && LET_LIKE[pKey]) {
        return { role: '不定詞', func: "Let's 後面接動詞原形（let us + 原形）" };
      }
      if (next && !next.punct && isNominalRole(next.role) && !r.afterDet) {
        return { role: '動詞', func: '這句的主要動作，後面接受詞' };
      }
      return { role: '動詞', func: '句子的主要動作；第三人稱單數要加 s' };
    }

    if (inf.role === 'prep') {
      return { role: '介系詞', func: '後面接名詞或 -ing 形式，不能接動詞原形' };
    }
    if (inf.role === 'det') {
      return { role: '限定詞', func: '放在名詞前面，決定後面的名詞用單數還是複數' };
    }
    if (inf.role === 'conj') {
      return {
        role: '連接詞',
        func: next && !next.punct && isNominalRole(next.role) && clauseHasVerb(rows, idx + 1)
          ? '引導一個子句，後面接「主詞 + 動詞」'
          : '連接前後的詞語（兩個名詞並列，或 so … that … 的前半）'
      };
    }
    if (inf.role === 'exclam') {
      return { role: '感嘆詞', func: '表達請求、道歉或語氣，不參與句子結構' };
    }
    return { role: roleName(inf.role), func: '不影響句子主要意思的虛詞' };
  }

  function structure(sentence) {
    var tokens = (global.Ipa && global.Ipa.tokenize(sentence)) ||
      (String(sentence).match(/([A-Za-z0-9']+)|([^A-Za-z0-9'\s]+)/g) || []);

    /* ── 第一輪：求出每個字「粗略」的詞性 ── */
    var rows = tokens.map(function (tok, idx) {
      if (!/[A-Za-z0-9']/.test(tok)) {
        return { token: tok, punct: true, codes: null, role: 'punct' };
      }
      var codes = posOf(tok);
      if (!codes) {
        var g = guess(tok);
        if (g) codes = [g];
      }
      // 緊跟在限定詞後面的字（the film / a glass）先當名詞看，
      // 否則 firstVerb 會被誤判到 the film 的 film 上
      var prev = idx > 0 ? tokens[idx - 1] : null;
      var nextTok = idx + 1 < tokens.length ? tokens[idx + 1] : null;
      var prevRole = prev && /[A-Za-z0-9']/.test(prev) ? roughRole(prev) : null;
      var afterDet = idx > 0 && isDetToken(prev);
      var row = {
        token: tok, punct: false, codes: codes, afterDet: afterDet,
        role: codes
          ? info(pick(codes, afterDet ? PRIORITY_SUBJ : PRIORITY)).role
          : 'func'
      };
      /* studies / works / lives：詞表只標成「名詞（複數）」，但站在主詞後面
         （He studies… / My sister studies…）時，它其實是第三人稱單數的動詞。 */
      var afterSubject = prevRole === 'pron' || prevRole === 'noun' || prevRole === 'modal';
      if (codes && nounOnlyS(codes, tok) && !afterDet && afterSubject &&
        !POSSESSIVE_DET[normKey(prev)] && !BE_FORMS[normKey(nextTok)]) {
        row.role = 'verb';
        row.codes = codes.concat(['v']);
      }
      /* when she saw… / that I saw…：後面接「名詞 + 動詞」時，
         它在這一句裡是引導子句的連接詞（第二輪也要看到，所以把 conj 加進去） */
      if (CLAUSE_WORDS[normKey(tok)] && idx + 2 < tokens.length &&
        /[A-Za-z0-9']/.test(tokens[idx + 1]) && /[A-Za-z0-9']/.test(tokens[idx + 2]) &&
        isNominalRole(roughRole(tokens[idx + 1])) &&
        ['verb', 'modal'].indexOf(roughRole(tokens[idx + 2])) >= 0) {
        row.role = 'conj';
        row.codes = codes ? codes.concat(['conj']) : ['conj'];
      }
      /* Please / Sorry / Excuse 句首或在 can 後面 → 感嘆詞
         直接看下一個 token 的 codes 有無動詞，避免 roughRole 受 PRIORITY 干擾 */
      var nextCodes = idx + 1 < tokens.length ? posOf(tokens[idx + 1]) : null;
      var nextIsVerb = nextCodes && (nextCodes.indexOf('v') >= 0 || nextCodes.indexOf('n v') >= 0 ||
        nextCodes.indexOf('phr v') >= 0 || nextCodes.indexOf('mv') >= 0 || nextCodes.indexOf('av') >= 0);
      if (EXCLAM_WORDS[normKey(tok)] && (idx === 0 || (prevRole === 'modal' || prevRole === 'exclam')) &&
        nextIsVerb) {
        row.role = 'exclam';
        row.codes = codes ? codes.concat(['exclam']) : ['exclam'];
      }
      /* 兜底：句首就是感嘆詞（Please / Sorry / Excuse / Hello / Hey），
         不管後面是什麼，先強制標成 exclam，免得 firstVerb 誤判 */
      if (idx === 0 && EXCLAM_WORDS[normKey(tok)]) {
        row.role = 'exclam';
        row.codes = codes ? codes.concat(['exclam']) : ['exclam'];
      }
      return row;
    });

    /** 第一輪用的粗略詞性（只為判斷「前一個字是什麼」） */
    function roughRole(token) {
      var c = posOf(token);
      if (!c) c = [guess(token)];
      return info(pick(c, isDetToken(token) ? PRIORITY_SUBJ : PRIORITY)).role;
    }

    function nounOnlyS(codes, tok) {
      if (!/s$/.test(tok) || /(ss|us|is)$/.test(tok)) return false;
      var ok = ['n', 'n pl', 'unc n', 'proper', 'n poss', 'pron poss', 'adv', 'adj', 'exclam'];
      for (var i = 0; i < codes.length; i++) {
        if (ok.indexOf(codes[i]) < 0) return false;
      }
      return codes.length > 0;
    }

    /* ── 第一個動詞 ── */
    var firstVerb = -1;
    for (var i = 0; i < rows.length; i++) {
      if (rows[i].role === 'verb' || rows[i].role === 'modal') { firstVerb = i; break; }
    }

    /* ── 主詞區間：從第一個動詞往前回捲「名詞性」的連續區段（可夾一個副詞） ── */
    var subjIdx = [];
    var j = firstVerb - 1;
    while (j >= 0 && rows[j].role === 'conj') j--;
    while (j >= 0 && (isNominalRole(rows[j].role) || rows[j].role === 'adv')) {
      subjIdx.unshift(j);
      j--;
    }
    // 句首是情態動詞時，主詞在它後面（Can I … / Did you …）
    if (!subjIdx.length && firstVerb >= 0 && rows[firstVerb].role === 'modal') {
      for (var k = firstVerb + 1; k < rows.length; k++) {
        if (isNominalRole(rows[k].role)) { subjIdx = [k]; break; }
        if (rows[k].role !== 'adv') break;
      }
    }
    var subjSet = {};
    subjIdx.forEach(function (x) { subjSet[x] = true; });

    /* ── 連接詞後面的子句主詞（if you … / because he … ） ── */
    var clauseSubj = {};
    for (var c = 0; c < rows.length; c++) {
      if (rows[c].role !== 'conj') continue;
      var t = c + 1;
      while (t < rows.length && !rows[t].punct && rows[t].role === 'adv') t++;
      if (t < rows.length && !rows[t].punct && isNominalRole(rows[t].role) &&
        !subjSet[t] && clauseHasVerb(rows, t)) {
        clauseSubj[t] = rows[c].token;
      }
    }

    /* ── 第二輪：帶上下文重新決定詞性 ── */
    var out = [];
    rows.forEach(function (r, idx) {
      if (r.punct) {
        out.push({
          role: '標點', token: r.token, pos: '標點 (Punctuation)',
          func: '決定句子怎麼斷句；逗號後面的句子用小寫開頭', mark: 'O'
        });
        return;
      }
      var next = rows[idx + 1], after = rows[idx + 2];
      var prevRow = idx > 0 ? rows[idx - 1] : null;
      var nextRole = next && !next.punct ? next.role : null;
      var nextCodes = next && !next.punct ? next.codes : null;
      var nextCanBeVerb = nextCodes && (nextCodes.indexOf('v') >= 0 || nextCodes.indexOf('n v') >= 0 ||
        nextCodes.indexOf('phr v') >= 0 || nextCodes.indexOf('mv') >= 0 || nextCodes.indexOf('av') >= 0);
      var ctx = {
        token: r.token,
        inSubject: !!subjSet[idx],
        afterDeterminer: !!r.afterDet,
        atClauseEnd: !next || next.punct,
        beforeVerb: nextCanBeVerb,
        atSentenceStart: idx === 0,
        afterPreposition: !!(prevRow && !prevRow.punct && prevRow.role === 'prep'),
        afterTo: !!(prevRow && !prevRow.punct && prevRow.role === 'prep' &&
          normKey(prevRow.token) === 'to'),
        afterBe: !!(prevRow && !prevRow.punct && prevRow.role === 'verb' &&
          BE_FORMS[normKey(prevRow.token)]),
        beforeClause: !!(next && after && !next.punct && !after.punct &&
          NOMINAL[info(pick(next.codes || [], PRIORITY)).role] &&
          ['verb', 'modal'].indexOf(info(pick(after.codes || [], PRIORITY)).role) >= 0)
      };
      var code = primaryPos(r.codes, ctx);
      var inf = code ? info(code) : { label: '虛詞／功能詞', role: 'func' };
      var key = normKey(r.token);

      if (key === 'there' && next && BE_FORMS[normKey(next.token)]) {
        out.push({
          role: '虛擬主詞', token: r.token, pos: '虛擬主詞 (Expletive)',
          func: 'There + be 開頭的「there」不代表東西，只是把句子架起來', mark: 'O'
        });
        return;
      }
      if (subjSet[idx]) {
        var isHead = inf.role === 'noun' || inf.role === 'pron';
        out.push({
          role: isHead ? '主詞' : '主詞修飾語',
          token: r.token, pos: inf.label,
          func: isHead
            ? (inf.role === 'pron' ? '句子的主詞（代詞）' : '句子的主詞中心詞')
            : (inf.role === 'det' ? '放在名詞前面，決定後面的名詞用單數還是複數'
              : (inf.role === 'adv' ? '修飾後面的動詞' : '修飾主詞名詞')),
          mark: 'O'
        });
        return;
      }
      if (clauseSubj[idx]) {
        out.push({
          role: '子句主詞', token: r.token, pos: inf.label,
          func: '「' + clauseSubj[idx] + '」引導的子句裡的主詞', mark: 'O'
        });
        return;
      }
      var f = functionOf(r, idx, rows, inf, code);
      out.push({
        role: f.role, token: r.token, pos: inf.label, func: f.func, mark: 'O'
      });
    });

    return out;
  }

  /* ═══════════ 常見錯誤 ═══════════ */
  function mistakes(sentence) {
    var en = sentence;
    var out = [];

    var be = (en.match(/\b(is|am|are|was|were)\b/i) || [])[0];
    if (be) {
      var swap = { is: 'are', am: 'is', are: 'is', was: 'were', were: 'was' }[be.toLowerCase()];
      out.push({
        title: '主詞與 be 動詞不一致',
        bad: en.replace(new RegExp('\\b' + be + '\\b', 'i'), swap),
        ok: en,
        why: 'be 動詞要看主詞決定單複數：「I 用 am」、「you / we / they 用 are」、「he / she / it 單數用 is」。' +
             '中文沒有單複數變化，這是最容易忘記的一條規則。',
        exOkText: 'This **is** my new plan.', exOkZh: '這是我新的計畫。',
        exBadText: 'This **are** my new plan.', exBadNote: '錯誤：This 是單數，be 動詞要用 is'
      });
    }

    var modal = en.match(/\b(can|could|should|would|will|must)\s+([a-z']+)/i);
    if (modal) {
      var base = modal[2].replace(/s$/, '');
      out.push({
        title: '情態動詞後面接動詞原形',
        bad: modal[1] + ' to ' + base,
        ok: modal[1] + ' ' + base,
        why: 'can / could / should / would / will / must 後面一律接動詞原形：不加 to、不加 -s、不加 -ing。',
        exOkText: 'We **should** protect animals.', exOkZh: '我們應該保護動物。',
        exBadText: 'We **should to** protect animals.', exBadNote: '錯誤：should 後面接原形，不加 to'
      });
    }

    var ofM = en.match(/\bof\s+([A-Za-z' -]+)/i);
    if (ofM) {
      out.push({
        title: '介系詞 of 後面的名詞複數',
        bad: ofM[1].replace(/s$/, ''),
        ok: ofM[1],
        why: 'of 是介系詞，後面一定要接名詞或 -ing 形式。前面的名詞若是複數，of 後面的可數名詞也要一起變複數。',
        exOkText: 'There are many **kinds of animals** in the zoo.', exOkZh: '動物園裡有許多種動物。',
        exBadText: 'There are many kinds of **animal** in the zoo.',
        exBadNote: '錯誤：kinds 是複數，of 後面的 animal 也要複數'
      });
    }

    var plural = en.match(/\b(two|three|four|five|six|seven|eight|nine|ten|many|several|a few)\s+([a-z]+)\b/i);
    if (plural && !/s$/.test(plural[2])) {
      var pc = primaryPos(posOf(plural[2])) || '';
      if (pc === 'n' || pc === 'n pl') {
        out.push({
          title: '數字後面的可數名詞要用複數',
          bad: plural[0],
          ok: plural[1] + ' ' + plural[2] + 's',
          why: 'two / three / many 之後面的可數名詞一定要加 s，這是台灣學生最常漏掉的一個字母。',
          exOkText: 'I bought **three apples**.', exOkZh: '我買了三顆蘋果。',
          exBadText: 'I bought **three apple**.', exBadNote: '錯誤：three 後面的可數名詞要用複數'
        });
      }
    }

    if (!out.length) {
      out.push({
        title: '句子結構自我檢查',
        bad: en,
        ok: en,
        why: '先做三個檢查：「① 主詞和 be 動詞有沒有配對」、「② 名詞該不該加 s」、「③ 介系詞（in / on / at / of / for）放對了嗎」。',
        exOkText: 'This **is** my new plan.', exOkZh: '這是我新的計畫。',
        exBadText: 'This **are** my new plan.', exBadNote: '錯誤範例：be 動詞要和主詞一致'
      });
    }
    return out;
  }

  function traps() {
    return [
      '整句打完後再從頭唸一次，特別檢查 s、a / an / the、介系詞這三個地方。',
      '同一個字錯到第 3 次時 App 會自動朗讀，這時請跟著唸，注意每個字母。',
      '標點也要檢查：逗號之後用小寫，句號之後才大寫。',
      '單複數：每句至少檢查一次動詞第三人稱單數與名詞複數。'
    ];
  }

  function strategy(scene) {
    var base = [
      '想不起來時先按 <kbd>Enter</kbd> 重打一次，錯的那個字母會印象最深。',
      '每天練完一張，把錯的那個字圈起來，隔天複習一次，比整句重打有效。'
    ];
    (scene && scene.tips || []).forEach(function (t) { base.push(t); });
    return base;
  }

  /* ═══════════ 單字／片語的解析 ═══════════ */
  function wordAnalysis(item, scene, mode) {
    var en = item.en;
    var words = en.toLowerCase().split(/\s+/);
    var isPhrase = words.length > 1;

    var codes = posOf(en);
    var posGuess;
    if (isPhrase) {
      posGuess = '片語 (Phrase) — ' + (codes ? info(primaryPos(codes)).label : '固定搭配');
    } else if (codes) {
      posGuess = info(primaryPos(codes)).label;
      if (codes.length > 1) {
        posGuess += '（也可作 ' + codes.slice(1).map(function (c) { return info(c).label; }).join('、') + '）';
      }
    } else {
      posGuess = info(guess(en)).label;
    }

    var ms = [];
    if (isPhrase && words.indexOf('a') >= 0) {
      ms.push({
        title: '冠詞 a / an 放錯位置',
        bad: en.replace(/\ba\b/i, 'an'),
        ok: en,
        why: 'a 用在輔音開頭前、an 用在母音開頭前。這是打字練習最常錯的一個字母。',
        exOkText: 'I had **an** apple.', exOkZh: '我有一顆蘋果。',
        exBadText: 'I had **a apple**.', exBadNote: '錯誤：apple 是母音開頭，要用 an'
      });
    }
    if (!isPhrase && /s$/.test(en.toLowerCase()) && !/(ss|us|is)$/.test(en.toLowerCase())) {
      ms.push({
        title: '複數 / 第三人稱單數的 -s',
        bad: en.slice(0, -1), ok: en,
        why: '可數名詞複數與動詞第三人稱單數都要加 s，這個 s 常常打到一半就忘了。',
        exOkText: 'She **watches** TV every night.', exOkZh: '她每天晚上看電視。',
        exBadText: 'She **watch** TV every night.', exBadNote: '錯誤：主詞是第三人稱單數，動詞要加 es'
      });
    }
    if (!ms.length) {
      ms.push({
        title: '把這個' + (isPhrase ? '片語' : '單字') + '放進一個句子裡',
        bad: '—', ok: en,
        why: '單獨背' + (isPhrase ? '片語' : '單字') + '容易忘，搭配句子記才會牢。試著自己造一句含有它的句子。',
        exOkText: 'This is my favourite ' + en + '.',
        exOkZh: '這是我最喜歡的' + (item.zh || '') + '。',
        exBadText: '—', exBadNote: '把正確用法念三遍再往下'
      });
    }

    return {
      kind: mode,
      item: item,
      intro: scene ? ('這組在「' + scene.name + '」場景裡最常出現：' + (scene.summary || '')) : '',
      pos: posGuess,
      structure: null,
      mistakes: ms,
      traps: traps().slice(0, 2),
      strategy: strategy(scene).slice(0, 2)
    };
  }

  function sentenceAnalysis(sentence, scene) {
    return {
      kind: 'sentences',
      structure: structure(sentence),
      mistakes: mistakes(sentence),
      traps: traps(),
      strategy: strategy(scene)
    };
  }

  loadPos();

  global.Analysis = {
    rich: rich,
    marked: marked,
    escapeHtml: escapeHtml,
    structure: structure,
    posOf: posOf,
    primaryPos: primaryPos,
    wordAnalysis: wordAnalysis,
    sentenceAnalysis: sentenceAnalysis
  };
})(window);
