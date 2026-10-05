/* ══════════════════════════════════════════════════════════════
   analysis.js — 「解析」面板

   詞性判斷以 data/scenes.js 的 SCENE_POS 為主（那份表直接取自 Cambridge
   官方詞表的詞性標註），再用三件事決定多義詞在「這一句」裡是哪一個詞性：
     ① 它在不在主詞位置
     ② 後面是不是接標點／句尾（please, → 感嘆詞）
     ③ 後面是不是「名詞 + 動詞」（that 子句）
   真的查不到才退回詞形規則與啟發式。
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

  /* 官方詞表沒有、但句子裡一定會出現的形 */
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
    'asleep': 'adj', 'alive': 'adj', 'awake': 'adj', 'alone': 'adj'
  };

  var POS_INFO = {
    'n':        { label: '名詞 (Noun)',                      role: 'noun' },
    'n pl':     { label: '名詞（複數） (Noun, plural)',        role: 'noun' },
    'unc n':    { label: '不可數名詞 (Uncountable Noun)',      role: 'noun' },
    'proper':   { label: '專有名詞 (Proper Noun)',              role: 'noun' },
    'adj':      { label: '形容詞 (Adjective)',                 role: 'adj' },
    'v':        { label: '動詞 (Verb)',                       role: 'verb' },
    'phr v':    { label: '片語動詞 (Phrasal Verb)',            role: 'verb' },
    'adv':      { label: '副詞 (Adverb)',                     role: 'adv' },
    'pron':     { label: '代名詞 (Pronoun)',                   role: 'pron' },
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
    return String(w || '').toLowerCase().replace(/[’‘]/g, "'");
  }

  /** 查一個字（或片語）的詞性代碼陣列；查不到回傳 null */
  function posOf(word) {
    ensurePos();
    var k = normKey(word);
    if (!k) return null;
    if (POSDB.single[k]) return POSDB.single[k].slice();
    if (POSDB.multi[k]) return POSDB.multi[k].slice();
    if (EXTRA_POS[k]) return [EXTRA_POS[k]];
    var ss = stems(k);
    for (var i = 0; i < ss.length; i++) {
      if (POSDB.single[ss[i]]) return POSDB.single[ss[i]].slice();
      if (EXTRA_POS[ss[i]]) return [EXTRA_POS[ss[i]]];
    }
    return null;
  }

  /* 靜態優先序（沒有上下文時用） */
  var PRIORITY = ['mv', 'av', 'phr v', 'v', 'prep', 'det', 'pron', 'conj',
    'prep phr', 'adj', 'adv', 'exclam', 'n pl', 'unc n', 'n'];
  /* 主詞位置的優先序：先當名詞看 */
  var PRIORITY_SUBJ = ['n pl', 'unc n', 'proper', 'n', 'pron', 'det', 'adj',
    'adv', 'exclam', 'prep', 'conj', 'v', 'phr v', 'av', 'mv'];

  function pick(codes, order) {
    if (!codes || !codes.length) return null;
    for (var i = 0; i < order.length; i++) {
      if (codes.indexOf(order[i]) >= 0) return order[i];
    }
    return codes[0];
  }

  function primaryPos(codes, ctx) {
    if (!codes || !codes.length) return null;
    ctx = ctx || {};
    // 「please,」這類：後面接標點或句尾 → 感嘆詞
    if (ctx.atClauseEnd && codes.indexOf('exclam') >= 0) return 'exclam';
    // that + 名詞 + 動詞 → 連接詞（that 子句）
    if (ctx.beforeClause && codes.indexOf('conj') >= 0) return 'conj';
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
    if (/^\d+$/.test(w)) return 'n';
    if (/ly$/.test(w)) return 'adv';
    if (/(ing|ed)$/.test(w)) return 'v';
    // 首字母大寫但詞表查不到 → 多半是專有名詞（London、English、TV）
    if (/^[A-Z]/.test(String(token))) return 'proper';
    if (/s$/.test(w)) return 'n';
    return null;
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
      case 'pron': return '代名詞／限定詞';
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

  function roleFunc(role, token) {
    switch (role) {
      case 'noun': return '句中的名詞成分；可數名詞要依數量決定單複數';
      case 'pron': return '代名詞的大小寫取決於它在句中的位置';
      case 'det': return '放在名詞前面，決定後面的名詞用單數還是複數';
      case 'adj': return '修飾名詞；放在 be 動詞後面時是描述主詞';
      case 'adv': return '修飾動詞、形容詞或整個句子';
      case 'prep': return '後面接名詞或 -ing 形式，不能接動詞原形';
      case 'conj': return '連接詞語或子句';
      case 'modal': return '後面一律接動詞原形，不加 to、不加 -s';
      case 'verb': return /^(am|is|are|was|were|been|be)$/i.test(normKey(token))
        ? '表示身分或狀態，必須與主詞單複數一致'
        : '句子的主要動作；第三人稱單數要加 s';
      case 'exclam': return '表達語氣或請求，後面通常接逗號';
      default: return '不影響句子主要意思的虛詞';
    }
  }

  /* ═══════════ 句子結構與詞性對照表 ═══════════ */
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
      var afterDet = idx > 0 && isDetToken(tokens[idx - 1]);
      return {
        token: tok, punct: false, codes: codes, afterDet: afterDet,
        role: codes
          ? info(pick(codes, afterDet ? PRIORITY_SUBJ : PRIORITY)).role
          : 'func'
      };
    });

    /* ── 第一個動詞 ── */
    var firstVerb = -1;
    for (var i = 0; i < rows.length; i++) {
      if (rows[i].role === 'verb' || rows[i].role === 'modal') { firstVerb = i; break; }
    }

    /* ── 主詞區間：從第一個動詞往前回捲「名詞性」的連續區段（可夾一個副詞） ── */
    var subjIdx = [];
    var j = firstVerb - 1;
    while (j >= 0 && rows[j].role === 'conj') j--;
    while (j >= 0 && (NOMINAL[rows[j].role] || rows[j].role === 'adv')) {
      subjIdx.unshift(j);
      j--;
    }
    // 句首是情態動詞時，主詞在它後面（Can I … / Did you …）
    if (!subjIdx.length && firstVerb >= 0 && rows[firstVerb].role === 'modal') {
      for (var k = firstVerb + 1; k < rows.length; k++) {
        if (NOMINAL[rows[k].role]) { subjIdx = [k]; break; }
        if (rows[k].role !== 'adv') break;
      }
    }
    var subjSet = {};
    subjIdx.forEach(function (x) { subjSet[x] = true; });

    /* ── 第二輪：帶上下文重新決定詞性 ── */
    var out = [];
    rows.forEach(function (r, idx) {
      if (r.punct) {
        out.push({ role: '標點', token: r.token, pos: '標點 (Punctuation)',
          func: '標點依中文語氣放置；逗號之後的句子要用小寫開頭', mark: 'O' });
        return;
      }
      var next = rows[idx + 1], after = rows[idx + 2];
      var ctx = {
        inSubject: !!subjSet[idx],
        afterDeterminer: !!r.afterDet,
        atClauseEnd: !next || next.punct,
        beforeClause: !!(next && after && !next.punct && !after.punct &&
          NOMINAL[info(pick(next.codes || [], PRIORITY)).role] &&
          ['verb', 'modal'].indexOf(info(pick(after.codes || [], PRIORITY)).role) >= 0)
      };
      var code = primaryPos(r.codes, ctx);
      var inf = code ? info(code) : { label: '虛詞／功能詞', role: 'func' };
      var key = normKey(r.token);

      if (key === 'there' && next && /^(is|are|was|were)$/i.test(normKey(next.token))) {
        out.push({ role: '虛擬主詞', token: r.token, pos: inf.label,
          func: 'There + be 開頭的「there」不代表東西，只是把句子架起來', mark: 'O' });
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
      out.push({ role: roleName(inf.role), token: r.token, pos: inf.label,
                 func: roleFunc(inf.role, r.token), mark: 'O' });
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
      posGuess = '名詞 (Noun) 或動詞 (Verb) 原形';
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
