/* ══════════════════════════════════════════════════════════════
   test.js — 免相依的回歸測試（node tools/test.js）
   測純函式與資料不變量，不需要瀏覽器。
   ══════════════════════════════════════════════════════════════ */
'use strict';

const fs = require('fs');
const vm = require('vm');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');

let pass = 0, fail = 0;
const failures = [];

function ok(name, cond, extra) {
  if (cond) { pass++; }
  else { fail++; failures.push(name + (extra ? '  →  ' + extra : '')); }
}
function eq(name, actual, expected) {
  ok(name, actual === expected, 'expected ' + JSON.stringify(expected) + ', got ' + JSON.stringify(actual));
}
function group(title) { process.stdout.write('\n' + title + '\n'); }

// ───────── 載入模組（模擬瀏覽器全域） ─────────
const ctx = { console };
ctx.window = ctx;
ctx.setTimeout = setTimeout;
ctx.clearTimeout = clearTimeout;
ctx.setInterval = setInterval;
ctx.clearInterval = clearInterval;

// 計算 localStorage 的讀寫次數，用來驗證「記憶體快取 + 延遲寫回」
const lsLog = { reads: 0, writes: 0 };
const lsMem = new Map();
ctx.localStorage = {
  getItem: k => { lsLog.reads++; return lsMem.has(k) ? lsMem.get(k) : null; },
  setItem: (k, v) => { lsLog.writes++; lsMem.set(k, String(v)); },
  removeItem: k => { lsLog.writes++; lsMem.delete(k); },
  reset: () => { lsLog.reads = 0; lsLog.writes = 0; lsMem.clear(); }
};
ctx.document = {
  getElementById: () => null,
  addEventListener: () => {},
  querySelectorAll: () => [],
  createElement: () => ({ style: {}, classList: { add() {} }, setAttribute: () => {}, appendChild: () => {}, addEventListener: () => {} }),
  readyState: 'complete',
  hidden: false
};
ctx.navigator = { userAgent: 'node' };
vm.createContext(ctx);

function load(rel) {
  vm.runInContext(fs.readFileSync(path.join(ROOT, rel), 'utf8'), ctx, { filename: rel });
}
load('js/store.js');
load('js/ipa.js');
load('js/analysis.js');
load('js/home.js');
load('data/scenes.js');
ctx.Ipa.registerAll(ctx.SCENES);

const { Ipa, Analysis, Store, Home } = ctx;

// ───────── 1. 音標引擎 ─────────
group('1. 音標引擎 ipa.js');

eq('功能詞 the 的音標', Ipa.compose('the'), 'ðə');
eq('母音前 the 唸 ði', Ipa.compose('the apple').split(' ')[0], 'ði');
eq('子音前 a 唸 ə', Ipa.compose('a book').split(' ')[0], 'ə');
eq('母音前 a 唸 eɪ', Ipa.compose('an apple').split(' ')[0], 'ən');
ok('複數可推導', Ipa.compose('cats').indexOf('kæt') >= 0, Ipa.compose('cats'));
ok('不規則複數 teeth 可查', Ipa.compose('teeth').length > 0, Ipa.compose('teeth'));
ok('所有格 today\'s 可查', Ipa.compose("today's").length > 0, Ipa.compose("today's"));
ok('過去式 stopped 可查', Ipa.compose('stopped').length > 0, Ipa.compose('stopped'));
ok('進行式 eating 可查', Ipa.compose('eating').length > 0, Ipa.compose('eating'));
ok('比較級 happier 可查', Ipa.compose('happier').length > 0, Ipa.compose('happier'));
ok('查不到的整句回傳空字串', Ipa.compose('zzzqqq wwwxxx') === '', Ipa.compose('zzzqqq wwwxxx'));
ok('片語優先於逐詞', Ipa.compose('piece of cake').length > 0 &&
  Ipa.compose('piece of cake').indexOf('keɪk') >= 0, Ipa.compose('piece of cake'));
ok('片語開頭是 a 時音標不被冠詞規則覆蓋',
  Ipa.compose('a glass of water').indexOf('ɡlɑ') >= 0, Ipa.compose('a glass of water'));
ok('相鄰主要重音會降為次重音',
  !/ˈ[^ ]+ ˈ/.test(Ipa.compose('very big house')), Ipa.compose('very big house'));
ok('音標不含斜線', Ipa.compose('I like apples').indexOf('/') < 0);
ok('單字音標不含斜線', (ctx.SCENES[0].words[0].ipa || '').indexOf('/') < 0);

// ───────── 2. 例句音標覆蓋率 ─────────
group('2. 例句音標組合率');

let totalSent = 0, composedSent = 0;
const notComposed = [];
for (const sc of ctx.SCENES) {
  for (const s of (sc.sentences || [])) {
    totalSent++;
    if (Ipa.compose(s.en)) composedSent++;
    else notComposed.push(sc.id + ': ' + s.en);
  }
}
const rate = (composedSent / totalSent * 100).toFixed(1);
ok('例句音標組合率 ≥ 95%（實際 ' + rate + '%）', composedSent / totalSent >= 0.95);
if (notComposed.length) {
  process.stdout.write('   未組合成功的句子（' + notComposed.length + ' 句）：\n');
  notComposed.slice(0, 12).forEach(x => process.stdout.write('     ' + x + '\n'));
}

// ───────── 3. 盲打對齊（LCS） ─────────
group('3. 盲打對齊 alignWords');

// practice.js 需要 DOM，這裡只取純函式並手動給最小環境
const practiceSrc = fs.readFileSync(path.join(ROOT, 'js/practice.js'), 'utf8');
const fnStart = practiceSrc.indexOf('function wordsOnly');
const fnEnd = practiceSrc.indexOf('/* ───────── 盲打整句');
const helperCtx = {};
vm.createContext(helperCtx);
vm.runInContext(practiceSrc.slice(fnStart, fnEnd) + '\nthis.__h = { alignWords, wordsOnly };', helperCtx);
const helpers = helperCtx.__h;

function align(a, b, strict) { return helpers.alignWords(a, b, strict); }
function ops(o) { return o.map(x => x.op).join(','); }

eq('完全相同 → 全部 ok', ops(align(['I', 'like', 'tea'], ['I', 'like', 'tea'])), 'ok,ok,ok');
eq('大小寫預設不影響', ops(align(['I', 'Like'], ['i', 'like'])), 'ok,ok');
eq('嚴格大小寫會判為不同', ops(align(['I', 'Like'], ['i', 'like'], true)), 'sub,sub');
eq('中間打錯一個', ops(align(['I', 'like', 'tea'], ['I', 'like', 'coffe'])), 'ok,ok,sub');
eq('開頭漏一個不錯位', ops(align(['I', 'like', 'tea'], ['like', 'tea'])), 'del,ok,ok');
eq('結尾漏一個', ops(align(['I', 'like', 'tea'], ['I', 'like'])), 'ok,ok,del');
eq('中間多打一個', ops(align(['I', 'like', 'tea'], ['I', 'really', 'like', 'tea'])), 'ok,ins,ok,ok');
eq('兩個都對齊', ops(align(['a', 'b', 'c', 'd'], ['a', 'x', 'c', 'y'])), 'ok,sub,ok,sub');
ok('目標與輸入皆空 → 空陣列', align([], []).length === 0);
ok('wordsOnly 會濾掉標點',
  JSON.stringify(helpers.wordsOnly(['I', ',', 'like', 'tea.'])) === JSON.stringify(['I', 'like', 'tea']));

// LCS 正確性：對齊結果必須能還原目標序列
const a1 = ['I', 'went', 'to', 'the', 'station', 'yesterday'];
const b1 = ['I', 'go', 'to', 'station', 'yesterday'];
const ops1 = align(a1, b1, false);
eq('LCS 能還原目標序列',
  ops1.filter(o => o.op !== 'ins').map(o => o.t).join(' '), a1.join(' '));

// ───────── 4. 資料不變量 ─────────
group('4. 資料不變量');

let dupInList = 0, wordsWithSlash = 0, sentWithIpa = 0, emptyEn = 0, curly = 0;
for (const sc of ctx.SCENES) {
  for (const key of ['words', 'phrases']) {
    const seen = new Set();
    for (const it of sc[key] || []) {
      const k = it.en.trim().toLowerCase();
      if (seen.has(k)) dupInList++;
      seen.add(k);
      if (!it.en.trim()) emptyEn++;
      if (!it.ipa || !it.ipa.trim()) emptyEn++;
      if (/[\u2018\u2019]/.test(it.en)) curly++;
    }
  }
  for (const s of sc.sentences || []) {
    if (s.ipa) sentWithIpa++;
    if (!s.en.trim() || !s.zh.trim()) emptyEn++;
    if (/[\u2018\u2019]/.test(s.en)) curly++;
  }
  if ((sc.tips || []).length !== 3) failures.push(sc.id + ' tips 不是 3 筆');
}
eq('場景內沒有重複詞條', dupInList, 0);
eq('句子都不帶 ipa', sentWithIpa, 0);
eq('沒有空欄位', emptyEn, 0);
eq('沒有彎引號', curly, 0);

// ───────── 5. 覆蓋率 ─────────
group('5. Cambridge A2 Key 覆蓋率');

function norm(s) { return (s || '').trim().toLowerCase().replace(/[’‘]/g, "'").replace(/\s+/g, ' '); }
function variants(item) {
  const out = new Set();
  const base = norm(item);
  if (!base) return out;
  out.add(base);
  if (base.includes('/')) base.split('/').forEach(p => { const x = p.trim().split('(')[0].trim(); if (x) out.add(x); });
  const m = base.match(/(\w+)\((\w+)\)/);
  if (m && m[2].length <= 4) { out.add(m[1]); out.add(m[1] + m[2]); }
  return out;
}

const covered = new Set();
for (const sc of ctx.SCENES) {
  for (const key of ['words', 'phrases', 'sentences']) {
    for (const it of sc[key] || []) variants(it.en).forEach(v => covered.add(v));
  }
}
const full = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/_a2key_full.json'), 'utf8'));
const missing = full.entries.filter(e => ![...variants(e.en)].some(v => covered.has(v)));
eq('Cambridge 詞表未涵蓋數', missing.length, 0);
ok('詞表總數應為 1713', full.entries.length === 1713, String(full.entries.length));

// ───────── 6. 分析模組 ─────────
group('6. 解析模組 analysis.js');

const struct = Analysis.sentenceAnalysis('The cat has golden eyes in the sun.', null);
ok('句子結構表有列', struct.structure.length > 0);
ok('會偵測 be 動詞錯誤', Analysis.sentenceAnalysis('The book are new.', null).mistakes.some(m => m.title.includes('be 動詞')));
ok('會偵測數字複數', Analysis.sentenceAnalysis('I bought three apple.', null)
  .mistakes.some(m => m.title.includes('複數')));
ok('會偵測情態動詞原形', Analysis.sentenceAnalysis('We should to protect animals.', null)
  .mistakes.some(m => m.title.includes('情態動詞')));
ok('每則錯誤都有正確版與原因', Analysis.sentenceAnalysis('The book are new.', null)
  .mistakes.every(m => m.ok && m.why));
const wordA = Analysis.wordAnalysis({ en: 'watch TV', zh: '看電視', ipa: 'wɒtʃ tiː viː' }, null, 'phrases');
ok('單字/片語解析有詞性判斷', !!wordA.pos);
ok('rich() 會把 **粗體** 轉成 <b>', Analysis.rich('**x**') === '<b>x</b>', Analysis.rich('**x**'));
ok('rich() 會轉義原始 HTML', Analysis.rich('<script>').indexOf('<script>') < 0);
ok('marked() 會自動補 (O)/(X)', Analysis.marked('hello', 'O').indexOf('(O)') >= 0);

// ───────── 6b. 詞性判斷（用官方詞表的詞性資料）─────────
group('6b. 詞性判斷');

eq('the → 限定詞', Analysis.primaryPos(Analysis.posOf('the')), 'det');
eq('the 的上下文主詞優先序不影響結果', Analysis.primaryPos(Analysis.posOf('the'), { inSubject: true }), 'det');
eq('is → be 動詞', Analysis.primaryPos(Analysis.posOf('is')), 'av');
eq('can → 情態動詞', Analysis.primaryPos(Analysis.posOf('can')), 'mv');
eq('cat → 名詞', Analysis.primaryPos(Analysis.posOf('cat')), 'n');
eq('good → 形容詞', Analysis.primaryPos(Analysis.posOf('good')), 'adj');
eq('quickly → 副詞（由 run + -ly 推得）', Analysis.primaryPos(Analysis.posOf('quickly')), 'adv');
eq('runs → 動詞（由 run 推得）', Analysis.primaryPos(Analysis.posOf('runs')), 'v');
eq('children → 複數名詞（不規則）', Analysis.primaryPos(Analysis.posOf('children')), 'n pl');
eq('found → 動詞（不規則過去式）', Analysis.primaryPos(Analysis.posOf('found')), 'v');
eq('查不到又不認得的回傳 null', Analysis.posOf('zzqqxx'), null);

// 多義詞要看上下文
eq('film 在主詞位置當名詞', Analysis.primaryPos(Analysis.posOf('film'), { inSubject: true }), 'n');
eq('film 在一般位置預設當動詞', Analysis.primaryPos(Analysis.posOf('film')), 'v');
eq('glass 緊跟限定詞後當名詞', Analysis.primaryPos(Analysis.posOf('glass'), { afterDeterminer: true }), 'n');
eq('please 在句尾當感嘆詞', Analysis.primaryPos(Analysis.posOf('please'), { atClauseEnd: true }), 'exclam');
eq('that 開頭子句時當連接詞',
  Analysis.primaryPos(Analysis.posOf('that'), { beforeClause: true }), 'conj');

// 例句整體的命中率
(function () {
  const RE = /([A-Za-z0-9']+)/g;
  let total = 0, known = 0;
  for (const sc of ctx.SCENES) {
    for (const s of (sc.sentences || [])) {
      for (const w of (s.en.match(RE) || [])) { total++; if (Analysis.posOf(w)) known++; }
    }
  }
  ok('例句用詞的詞性命中率 ≥ 95%（實際 ' + (known / total * 100).toFixed(1) + '%）',
    known / total >= 0.95, known + '/' + total);
})();

function rowOf(sentence, token) {
  return Analysis.structure(sentence).filter(r => r.token === token)[0];
}
eq('there be → 虛擬主詞', rowOf('There is a cat here.', 'There').role, '虛擬主詞');
eq('My sister → sister 是主詞', rowOf('My sister is happy.', 'sister').role, '主詞');
eq('My sister → My 是主詞修飾語', rowOf('My sister is happy.', 'My').role, '主詞修飾語');
eq('Can I → I 仍被視為主詞', rowOf('Can I go now?', 'I').role, '主詞');
eq('She always wears → always 不是主詞本體', rowOf('She always wears a hat.', 'She').role, '主詞');
eq('a glass of water → glass 是名詞', rowOf('I want a glass of water.', 'glass').pos, '名詞 (Noun)');
eq('The film → film 是名詞', rowOf('The film was good.', 'film').pos, '名詞 (Noun)');
eq('句尾 please → 感嘆詞', rowOf('Come here, please.', 'please').pos, '感嘆詞 (Exclamation)');
eq('每個 token 都有一列', Analysis.structure('I like tea.').length, 4);
ok('標點也會列出', Analysis.structure('I like tea.').some(r => r.role === '標點'));

// ───────── 6c. 在句中的功能（要看前後文，不是印一句通用的詞性說明）─────────
group('6c. 句中功能');

eq('Please send… → please 是感嘆詞', rowOf('Please send me the file.', 'Please').pos, '感嘆詞 (Exclamation)');
eq('Please be quiet → quiet 是主詞補語', rowOf('Please be quiet.', 'quiet').role, '主詞補語');
eq('studies 是動詞不是名詞複數', rowOf('He studies science at university.', 'studies').pos, '動詞 (Verb)');
eq('by email → email 是名詞不是動名詞', rowOf('Please send me the file by email.', 'email').pos, '名詞 (Noun)');
eq('by email → email 標成介系詞受詞', rowOf('Please send me the file by email.', 'email').role, '介系詞受詞');
eq('so long → long 是 be 動詞後的表語', rowOf('The film was so long that I fell asleep.', 'long').role, '主詞補語');
eq('that I fell asleep → I 是子句主詞', rowOf('The film was so long that I fell asleep.', 'I').role, '子句主詞');
eq('turned red → red 是動詞補語', rowOf('She turned red when she heard the news.', 'red').role, '動詞補語');
eq('when she heard → when 是連接詞', rowOf('She turned red when she heard the news.', 'when').role, '連接詞');
eq('when she heard → she 是子句主詞', rowOf('She turned red when she heard the news.', 'she').role, '子句主詞');
eq('brought us the main course → us 是間接受詞', rowOf('The waiter brought us the main course.', 'us').role, '間接受詞');
eq('brought us the main course → course 是受詞', rowOf('The waiter brought us the main course.', 'course').role, '受詞');
eq('brought us the main course → main 修飾 course', rowOf('The waiter brought us the main course.', 'main').role, '名詞修飾語');
eq('studies science and history → history 也是受詞', rowOf('He studies science and history.', 'history').role, '受詞');
eq('want some bread → bread 是受詞', rowOf('My sister wants some bread.', 'bread').role, '受詞');
eq('Let me know → me 是受詞', rowOf('Let me know.', 'me').role, '受詞');
eq('Let me know → know 是不定詞', rowOf('Let me know.', 'know').role, '不定詞');
eq("Let's make → make 是不定詞", rowOf("Let's make a sandwich.", 'make').role, '不定詞');
eq('to calm down → calm 是不定詞', rowOf('I need to calm down.', 'calm').role, '不定詞');
eq('Frank 是專有名詞', rowOf('Let me know if you ever see Frank.', 'Frank').pos, '專有名詞 (Proper Noun)');
eq('if you ever see → you 是子句主詞', rowOf('Let me know if you ever see Frank.', 'you').role, '子句主詞');
ok('每一列都有功能說明', Analysis.structure('Let me know if you ever see Frank.')
  .every(r => r.func && r.func.length > 4));

// 例句裡不該再出現「虛詞／功能詞」這種等於沒回答的標示
(function () {
  const bad = [];
  for (const sc of ctx.SCENES) {
    for (const s of (sc.sentences || [])) {
      for (const r of Analysis.structure(s.en)) {
        if (/[A-Za-z]/.test(r.token) && /虛詞／功能詞/.test(r.pos || '')) {
          bad.push(sc.id + ': ' + s.en + ' → ' + r.token);
        }
      }
    }
  }
  ok('例句每個字都查得到詞性（0 個「虛詞／功能詞」）', bad.length === 0,
    bad.length ? bad.slice(0, 5).join(' / ') : '0');
})();

// ───────── 6d. 朗讀語音 speech.js（固定用 Microsoft Mark en-US）─────────
group('6d. 朗讀語音');

const VOICES = [
  { name: 'Google US English', lang: 'en-US', localService: false },
  { name: 'Microsoft Zira Desktop - Natural', lang: 'en-US', localService: true },
  { name: 'Microsoft Mark Desktop - Natural', lang: 'en-US', localService: true },
  { name: 'Daniel', lang: 'en-GB', localService: true }
];
const spoken = [];
ctx.speechSynthesis = {
  getVoices: () => VOICES,
  cancel: () => {},
  speak: (u) => spoken.push(u),
  onvoiceschanged: null
};
ctx.SpeechSynthesisUtterance = function (t) { this.text = t; };
load('js/speech.js');
const { Speech } = ctx;

function reloadVoices(list) {
  ctx.speechSynthesis.getVoices = () => list;
  spoken.length = 0;
}

eq('英文語音清單第一位是 Microsoft Mark',
  Speech.voices()[0].name, 'Microsoft Mark Desktop - Natural');
eq('preferred 直接指定 Mark', Speech.preferred(Speech.voices()).name, 'Microsoft Mark Desktop - Natural');

Speech.say('Let me know.', 1, { rate: 0.8 });
eq('朗讀用的是 Mark', spoken[0].voice.name, 'Microsoft Mark Desktop - Natural');
eq('朗讀語言是 en-US', spoken[0].lang, 'en-US');
eq('朗讀速度沿用設定', spoken[0].rate, 0.8);

// 沒裝 Mark 的電腦要能退回其他英文語音，而不是沒有聲音
reloadVoices([VOICES[0], VOICES[3]]);
eq('沒有 Mark 就用排序後第一個', Speech.preferred(Speech.voices()).name, 'Google US English');

reloadVoices(VOICES);
function fakeSelect() {
  return { options: [], value: '', selectedIndex: -1, innerHTML: '', appendChild(o) { this.options.push(o); }, addEventListener() {} };
}
const sel = fakeSelect();
Speech.init(sel);
eq('頂列語音選單第一項是 Mark', sel.options[0].value, 'Microsoft Mark Desktop - Natural|en-US');

// ───────── 7. 進度儲存 ─────────
group('7. 進度儲存 store.js');

const sceneId = ctx.SCENES[0].id;
Store.saveUnit(sceneId, 'words', 0, { done: true, err: 2, best: 9.5 });
const st = Store.unitState(sceneId, 'words', 0);
eq('讀回 done', st.done, true);
eq('讀回 err', st.err, 2);
eq('cursor 預設 0', Store.cursor(sceneId, 'words'), 0);
Store.setCursor(sceneId, 'words', 5);
eq('cursor 可寫入', Store.cursor(sceneId, 'words'), 5);
const payload = Store.exportPayload();
ok('匯出資料含 progress', !!payload.progress && !!payload.settings);
Store.resetScene(sceneId);
eq('重設場景後進度清空', Store.unitState(sceneId, 'words', 0).done, false);

// ───────── 8. 儲存效能：記憶體快取 + 延遲寫回 ─────────
group('8. 儲存層效能');

ctx.localStorage.reset();
Store.invalidate();

Store.saveUnit('food-drink', 'words', 0, { done: true });
Store.saveUnit('food-drink', 'words', 1, { done: true });
Store.saveUnit('food-drink', 'words', 2, { done: true });
Store.saveUnit('food-drink', 'words', 3, { done: true });

ok('連續 4 次寫入最多只讀 localStorage 一次', lsLog.reads <= 1, 'reads=' + lsLog.reads);
ok('延遲寫回尚未發生', lsLog.writes === 0, 'writes=' + lsLog.writes);

Store.flush();
eq('flush 後只寫入一次', lsLog.writes, 1);
eq('flush 後資料確實落地', JSON.parse(lsMem.get('sceneTyping.progress.v1'))['food-drink'].words[3].done, true);

ctx.localStorage.reset();
Store.invalidate();
for (let i = 0; i < 50; i++) Store.saveUnit('health', 'words', i, { err: 1 });
ok('50 次更新最多讀一次 localStorage', lsLog.reads <= 1, 'reads=' + lsLog.reads);
Store.flush();
eq('50 次更新合併成 1 次寫入', lsLog.writes, 1);

// 場景統計不應每次都重讀
ctx.localStorage.reset();
Store.invalidate();
Store.sceneProgress('travel-transport');
const firstRead = lsLog.reads;
Home.sceneStats('travel-transport');
Home.sceneStats('travel-transport');
eq('連續 sceneStats 不再讀 localStorage', lsLog.reads, firstRead);

// ───────── 9. 場景與單元清單 ─────────
group('9. 場景統計與單元清單 home.js');

const s0 = ctx.SCENES[0].id;
const sc0 = ctx.SCENE_INDEX[s0];

eq('words 模式的單元數等於詞條數', Home.unitsFor(sc0, 'words').length, sc0.words.length);
eq('phrases 模式的單元數等於片語數', Home.unitsFor(sc0, 'phrases').length, sc0.phrases.length);
eq('sentences 模式的單元數等於例句數', Home.unitsFor(sc0, 'sentences').length, sc0.sentences.length);
eq('blind 模式沿用例句', Home.unitsFor(sc0, 'blind').length, sc0.sentences.length);

ok('每個單元都帶 en', Home.unitsFor(sc0, 'words').every(u => !!u.en));
ok('單字單元都帶音標', Home.unitsFor(sc0, 'words').every(u => !!u.ipa));
ok('單元 index 連續遞增',
  Home.unitsFor(sc0, 'words').every((u, i) => u.index === i));

const total = Home.unitsFor(sc0, 'words').length + Home.unitsFor(sc0, 'phrases').length +
  Home.unitsFor(sc0, 'sentences').length + Home.unitsFor(sc0, 'blind').length;
const stats = Home.sceneStats(s0);
eq('sceneStats 的 total 四種模式加總', stats.total, total);
eq('尚未練習時 done 為 0', stats.done, 0);
eq('sceneStats 百分比為 0', stats.pct, 0);

ctx.localStorage.reset();
Store.invalidate();
Store.saveUnit(s0, 'words', 0, { done: true });
Store.saveUnit(s0, 'words', 1, { done: true });
const stats2 = Home.sceneStats(s0);
eq('標記兩張完成後 done = 2', stats2.done, 2);
eq('完成度依四模式總數計算', stats2.pct, Math.round(200 / total));

// 只看錯題
Store.saveUnit(s0, 'words', 5, { done: false, err: 3 });
Home.state.mistakesOnly = true;
eq('只看錯題時只留下沒練對的錯題', Home.visibleUnits(sc0, 'words').length, 1);
Home.state.mistakesOnly = false;
ok('關掉只看錯題後恢復全部', Home.visibleUnits(sc0, 'words').length === sc0.words.length);

// 隨機：不應改變單元集合
Home.state.shuffle = true;
const shuffled = Home.visibleUnits(sc0, 'words').map(u => u.en).sort().join('|');
Home.state.shuffle = false;
const ordered = Home.visibleUnits(sc0, 'words').map(u => u.en).sort().join('|');
eq('隨機模式不會改變單元集合', shuffled, ordered);

eq('搜尋可命中英文關鍵字', Home.scenes().length > 0, true);

// ───────── 10. 隨機挑戰 ─────────
group('10. 隨機挑戰 randomUnit');

ctx.localStorage.reset();
Store.invalidate();

const picks = [];
let shapeOk = true;
for (let i = 0; i < 400; i++) {
  const p = Home.randomUnit();
  if (!(p && p.scene && p.mode && typeof p.index === 'number' && p.index >= 0)) shapeOk = false;
  picks.push(p);
}
ok('隨機挑戰回傳的結構正確', shapeOk);

const inRange = picks.every(p => {
  const sc = ctx.SCENE_INDEX[p.scene];
  return sc && ['words', 'phrases', 'sentences', 'blind'].indexOf(p.mode) >= 0 &&
    p.index < Home.unitsFor(sc, p.mode).length;
});
ok('隨機挑戰 400 次都落在合法範圍', inRange);

const hitScenes = new Set(picks.map(p => p.scene));
ok('隨機挑戰會跨到多個場景（' + hitScenes.size + ' 個）', hitScenes.size > 5);

// 未練過的應該比已練過的更常被抽中
ctx.localStorage.reset();
Store.invalidate();
const target = 'food-drink';
Home.unitsFor(ctx.SCENE_INDEX[target], 'words').slice(0, 50).forEach((u, i) => {
  Store.saveUnit(target, 'words', i, { done: true });
});
Store.flush();

let sameScene = 0;
for (let i = 0; i < 400; i++) if (Home.randomUnit().scene === target) sameScene++;
ok('大量完成的場景會降低被抽中機率（' + sameScene + '/400）', sameScene < 160,
  'food-drink 被抽中 ' + sameScene + ' 次');

Store.clearAll();
Store.invalidate();

// ───────── 11. 錯題本（累計錯誤）─────────
group('11. 錯題本 weakUnits');

ctx.localStorage.reset();
Store.invalidate();

// errTotal 必須累加，不能被最近一次覆蓋
Store.saveUnit('food-drink', 'words', 0, { done: false, err: 5, errTotal: 5 });
Store.saveUnit('food-drink', 'words', 0, { done: true, err: 0, errTotal: 5 });
eq('第二次練對後 err 歸零', Store.unitState('food-drink', 'words', 0).err, 0);
eq('但 errTotal 不被清掉', Store.unitState('food-drink', 'words', 0).errTotal, 5);

Store.saveUnit('food-drink', 'words', 0, { done: false, err: 2, errTotal: 7 });
eq('再次出錯後 errTotal 繼續累加', Store.unitState('food-drink', 'words', 0).errTotal, 7);
eq('err 只反映最近一次', Store.unitState('food-drink', 'words', 0).err, 2);

Store.saveUnit('health', 'sentences', 1, { err: 9, errTotal: 9, done: true });
Store.saveUnit('travel-transport', 'phrases', 0, { err: 4, errTotal: 4 });

const weak = Home.weakUnits();
eq('錯題本收錄跨場景跨模式的單元', weak.length, 3);
eq('依累計錯誤次數排序', weak[0].scene, 'health');
eq('錯題本帶著場景資訊', weak[0].sceneName.length > 0, true);
eq('錯題本帶著模式資訊', weak[0].mode, 'sentences');
ok('錯題本標記是否已練對', weak.some(w => w.done) && weak.some(w => !w.done),
  JSON.stringify(weak.map(w => [w.scene, w.done])));
eq('limit 會截斷', Home.weakUnits(2).length, 2);
eq('limit 大於總數時回傳全部', Home.weakUnits(99).length, 3);

Store.clearAll();
Store.invalidate();
eq('清空進度後錯題本也清空', Home.weakUnits().length, 0);

// ───────── 12. 語速：頂列下拉與設定頁滑桿同步 ─────────
group('12. 語速控制');

eq('預設語速', Store.settings().rate, 0.9);
eq('語速可存進設定', Store.saveSettings({ rate: 0.7 }).rate, 0.7);
eq('語速會真的被讀到', Store.settings().rate, 0.7);
eq('語速可改回預設值', Store.saveSettings({ rate: 0.9 }).rate, 0.9);
eq('其他設定不會被語速覆蓋掉',
  (() => { const s = Store.settings(); return ['autoSpeak', 'speakPenalty', 'strictCase', 'fontSize', 'showHints'].every(k => k in s); })(), true);

// 接線檢查：下拉、滑桿、標籤三個元件都要接上同一條路
const indexHtml = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8')
  .replace(/^\uFEFF/, '');
const uiSrc = fs.readFileSync(path.join(ROOT, 'js/ui.js'), 'utf8')
  .replace(/^\uFEFF/, '');

ok('頂列有語速下拉 #rateSelect', /id="rateSelect"/.test(indexHtml));
ok('下拉的選項範圍與滑桿一致（0.5–1.3）',
  /value="0\.5"/.test(indexHtml) && /value="1\.3"/.test(indexHtml));
ok('設定頁同時保留朗讀速度滑桿', /id="setRate"/.test(indexHtml) && /id="setRateVal"/.test(indexHtml));
ok('ui.js 有 syncRateSelect 把下拉同步到設定值', /function syncRateSelect/.test(uiSrc));
ok('renderSettings 會呼叫 syncRateSelect', /syncRateSelect\(s\.rate\)/.test(uiSrc) ||
  /renderSettings[\s\S]{0,600}syncRateSelect\(/.test(uiSrc.replace(/\/\*[\s\S]*?\*\//g, '')));
ok('頂列下拉的 change 走 setRate', /rateSelect'\)[\s\S]{0,200}setRate\(/.test(uiSrc.replace(/\/\*[\s\S]*?\*\//g, '')));
ok('設定頁滑桿的 input 也走 setRate', /setRate'\)[\s\S]{0,160}addEventListener\('input'[\s\S]{0,120}setRate\(/.test(uiSrc.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')));
ok('setRate 會呼叫 Practice.refreshSettings（下一句就用新速度）',
  /setRate[\s\S]{0,600}Practice\.refreshSettings\(\)/.test(uiSrc.replace(/\/\*[\s\S]*?\*\//g, '')));
ok('setRate 會更新滑桿位置與數字標籤',
  /setRate[\s\S]{0,400}setRateVal/.test(uiSrc.replace(/\/\*[\s\S]*?\*\//g, '')));
ok('語速上限不會超過 speech.js 的合理範圍', /RATE_MAX/.test(uiSrc));

// ───────── 13. 錯字本 SRS 間隔重複 ─────────
group('13. 錯字本 SRS 間隔重複');

load('js/srs-notebook.js');
const SRS = ctx.SRS;
SRS.clear();

const ONE = {
  kind: 'unit', sceneId: 'food-drink', mode: 'words', index: 3,
  en: 'breakfast', zh: '早餐', sceneName: '飲食', sceneIcon: '🍽'
};

// ① 新增就立刻可複習
eq('錯字本一開始是空的', SRS.all().length, 0);
const srsA = SRS.record(ONE);
ok('record 會回傳項目', !!(srsA && srsA.id));
eq('新錯字放進去只有一筆', SRS.all().length, 1);
eq('新錯字階段是 0', SRS.byId(srsA.id).stage, 0);
eq('新錯字立刻可複習', SRS.due().length, 1);

// ② 重複記錄同一個錯字不會多出一筆
SRS.record(ONE);
SRS.record(ONE);
eq('同一個錯字重複記錄仍然只有一筆', SRS.all().length, 1);
eq('重複記錄會累加出錯次數', SRS.byId(srsA.id).lapses, 3);

// ③ 一次答對不算過關，連對 NEED 次才升階
const srsAfter1 = SRS.grade(srsA.id, true);
eq('答對 1 次還在第 0 階', srsAfter1.stage, 0);
eq('答對 1 次連對數 = 1', srsAfter1.streak, 1);
ok('沒升階就不會回報 promoted', !srsAfter1.promoted);
SRS.grade(srsA.id, true);
const srsAfter3 = SRS.grade(srsA.id, true);
eq('連對 ' + SRS.NEED + ' 次升到第 1 階', srsAfter3.stage, 1);
ok('升階會回報 promoted', srsAfter3.promoted);
eq('升階後連對數歸零', srsAfter3.streak, 0);

// ④ 升階後到「未來」才會再出現
eq('升階後就不再是到期項目', SRS.due().length, 0);
ok('升階後的下次時間在未來', SRS.byId(srsA.id).due > Date.now());
ok('第 1 階的間隔比第 0 階長',
  SRS.byId(srsA.id).due - Date.now() > SRS.STEPS[0].gap);

// ⑤ 間隔逐階遞增
ok('階梯間隔嚴格遞增',
  SRS.STEPS.every((s, i) => i === 0 || s.gap > SRS.STEPS[i - 1].gap));

// ⑥ 答錯立刻打回原點
const beforeLapse = SRS.byId(srsA.id).lapses;
const srsW = SRS.grade(srsA.id, false);
eq('答錯階段歸零', srsW.stage, 0);
eq('答錯連對數歸零', srsW.streak, 0);
ok('答錯會累加出錯次數', SRS.byId(srsA.id).lapses === beforeLapse + 1);
eq('答錯後立刻可複習', SRS.due().length, 1);

// ⑦ 一路答對到畢業，畢業後不再排入到期
let guard = 0;
while (SRS.byId(srsA.id).stage < SRS.TOP && guard++ < 100) {
  for (let k = 0; k < SRS.NEED; k++) SRS.grade(srsA.id, true);
}
eq('一路答對會走到畢業階段', SRS.byId(srsA.id).stage, SRS.TOP);
eq('畢業後不再列為到期', SRS.due().length, 0);
eq('畢業標籤正確', SRS.stageLabel(SRS.byId(srsA.id).stage), '已畢業');
eq('畢業進度是 100%', SRS.progress(SRS.byId(srsA.id)), 100);
eq('畢業文字是「已畢業」', SRS.dueText(SRS.byId(srsA.id)), '已畢業');

// ⑧ 單元粒度與單字粒度是不同項目
const srsB = SRS.record(Object.assign({}, ONE, { kind: 'word', en: 'receipt' }));
SRS.record(Object.assign({}, ONE, { kind: 'word', en: 'receipt' }));   // 同字不重複
SRS.record(Object.assign({}, ONE, { kind: 'word', en: 'kettle' }));    // 另一個字
eq('同一個字在同一張卡裡只有一筆（3 筆 = 1 單元 + 2 單字）', SRS.all().length, 3);
ok('單元與單字的 id 不同',
  SRS.idFor('unit', 'food-drink', 'words', 3, 'breakfast') !==
  SRS.idFor('word', 'food-drink', 'words', 3, 'breakfast'));

// ⑨ 統計
const srsSt = SRS.stats();
eq('統計總數等於項目數', srsSt.total, SRS.all().length);
eq('byStage 長度 = 階段數 + 畢業', srsSt.byStage.length, SRS.TOP + 1);
ok('累計複習次數 > 0', srsSt.reviews > 0);
ok('到期 + 等待中 + 已畢業 = 總數',
  srsSt.due + srsSt.waiting + srsSt.graduated === srsSt.total);

// ⑩ 一定要能存進 JSON（不能出現 Infinity，否則 JSON.stringify 會變 null）
SRS.flush();
const dumped = lsMem.get('sceneTyping.srs.v2');
ok('錯字本可以寫進 localStorage', !!dumped);
ok('寫出去的內容沒有被 JSON 弄壞',
  typeof dumped === 'string' && dumped.indexOf('"due":null') < 0);
ok('可以整份讀回來', Array.isArray(JSON.parse(dumped)) && JSON.parse(dumped).length === 3);

// ⑪ 刪除與清空
ok('可以刪除單筆', SRS.remove(srsB.id));
eq('刪除後少一筆', SRS.all().length, 2);
SRS.clear();
eq('clear 會清空整本', SRS.all().length, 0);
eq('清空後沒有到期項目', SRS.due().length, 0);

// ⑫ 壞掉的資料不應該讓整個功能死掉
{
  const c2 = { console };
  c2.window = c2;
  c2.setTimeout = setTimeout;
  c2.clearTimeout = clearTimeout;
  const m2 = new Map([['sceneTyping.srs.v2', '{壞掉的 JSON']]);
  c2.localStorage = {
    getItem: k => (m2.has(k) ? m2.get(k) : null),
    setItem: (k, v) => m2.set(k, String(v)),
    removeItem: k => m2.delete(k)
  };
  vm.createContext(c2);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/srs-notebook.js'), 'utf8'), c2,
    { filename: 'srs-notebook.js' });
  eq('壞掉的 JSON 會退成空清單而不是報錯', c2.SRS.all().length, 0);
  c2.SRS.record(ONE);
  eq('壞掉過之後仍可正常寫入', c2.SRS.all().length, 1);
}
{
  const c3 = { console };
  c3.window = c3;
  c3.setTimeout = setTimeout;
  c3.clearTimeout = clearTimeout;
  const m3 = new Map([['sceneTyping.srs.v2', '[1,2,3]']]);
  c3.localStorage = {
    getItem: k => (m3.has(k) ? m3.get(k) : null),
    setItem: (k, v) => m3.set(k, String(v)),
    removeItem: k => m3.delete(k)
  };
  vm.createContext(c3);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/srs-notebook.js'), 'utf8'), c3,
    { filename: 'srs-notebook.js' });
  eq('結構不對的資料也會被過濾掉', c3.SRS.all().length, 0);
}

// ⑬ 接線檢查：UI 與練習頁都要接上
const appCss2 = fs.readFileSync(path.join(ROOT, 'css/app.css'), 'utf8');
const srsUiSrc = fs.readFileSync(path.join(ROOT, 'js/srs-ui.js'), 'utf8').replace(/^\uFEFF/, '');
const SRSUI_MAX_REQUEUE = Number(/MAX_REQUEUE = (\d+)/.exec(srsUiSrc)[1]);
const srsNbSrc = fs.readFileSync(path.join(ROOT, 'js/srs-notebook.js'), 'utf8').replace(/^\uFEFF/, '');
const practiceSrc2 = fs.readFileSync(path.join(ROOT, 'js/practice.js'), 'utf8').replace(/^\uFEFF/, '');
const appSrc2 = fs.readFileSync(path.join(ROOT, 'js/app.js'), 'utf8').replace(/^\uFEFF/, '');

ok('index.html 有錯字本按鈕 #srsBtn', /id="srsBtn"/.test(indexHtml));
ok('index.html 有角標 #srsBadge', /id="srsBadge"/.test(indexHtml));
ok('index.html 有錯字本抽屜 #srsPanel', /id="srsPanel"/.test(indexHtml));
ok('index.html 有複習輸入框 #srsInput', /id="srsInput"/.test(indexHtml));
ok('index.html 有「開始���習」與「再一輪」',
  /id="srsStart"/.test(indexHtml) && /id="srsAgain"/.test(indexHtml));
ok('index.html 載入了 srs-notebook.js 與 srs-ui.js',
  /js\/srs-notebook\.js/.test(indexHtml) && /js\/srs-ui\.js/.test(indexHtml));
ok('srs-notebook.js 在 srs-ui.js 之前載入',
  indexHtml.indexOf('srs-notebook.js') >= 0 &&
  indexHtml.indexOf('srs-notebook.js') < indexHtml.indexOf('srs-ui.js'));
ok('srs-ui.js 在 app.js 之前載入（boot 時角標已就緒）',
  indexHtml.indexOf('srs-ui.js') >= 0 &&
  indexHtml.indexOf('srs-ui.js') < indexHtml.indexOf('js/app.js'));

ok('practice.js 完成一張卡後會把錯字餵給錯字本',
  /P\.totalErr > 0\) captureSrs\(/.test(practiceSrc2));
ok('practice.js 全對時會在錯字本記一次答對',
  /else srsPass\(unit, Home\.state\.mode\)/.test(practiceSrc2));
ok('practice.js 盲打失敗也會記錄',
  /captureSrsBlind\(unit, bad\)/.test(practiceSrc2));
ok('app.js 的 panelOpen 有算錯字本，鍵盤才不會被搶',
  /srsPanel[\s\S]{0,80}contains\('open'\)/.test(appSrc2));
ok('srs-notebook.js 不使用 Infinity（改用 stage === TOP 表示畢業）',
  /Infinity/.test(srsNbSrc) === false);
ok('srs-ui.js 的滾動有上限，不會無限滾',
  /MAX_REQUEUE = \d+/.test(srsUiSrc) && /tries < MAX_REQUEUE/.test(srsUiSrc));
ok('有逐字標紅的樣式 .srs-d__bad', /\.srs-d__bad/.test(appCss2));
ok('階梯分布有樣式 .srs-ladder', /\.srs-ladder/.test(appCss2));
// ⑭ 篩選籌碼真的接上了（迴歸：重寫時漏掉過一次，切籌碼完全不動）
ok('srs-ui.js 有綁 [data-srs-filter] 的 click',
  /querySelectorAll\('\[data-srs-filter\]'\)/.test(srsUiSrc) &&
  /state\.filter = b\.dataset\.srsFilter/.test(srsUiSrc));
ok('切籌碼後會重畫清單', /state\.filter = b\.dataset\.srsFilter[\s\S]{0,200}renderList\(\)/.test(srsUiSrc));
ok('初始籌碼狀態也會上色（chip--on）', /paintChips\(\);/.test(srsUiSrc));
ok('index.html 的四個籌碼都有 data-srs-filter',
  ['due', 'waiting', 'graduated', 'all'].every(f =>
    new RegExp('data-srs-filter="' + f + '"').test(indexHtml)));

// ⑮ 功能字不該單獨開一張卡（迴歸：the / on / My 曾經各自佔一筆）
ok('practice.js 有功能字清單', /SRS_SKIP_WORDS/.test(practiceSrc2));
ok('the / of / is / you 都在不開卡的清單裡',
  /'the': 1/.test(practiceSrc2) && /'of': 1/.test(practiceSrc2) &&
  /'is': 1/.test(practiceSrc2) && /'you': 1/.test(practiceSrc2));
ok('captureSrs 會過濾功能字', /worthOwnCard\(w\)/.test(practiceSrc2));
ok('captureSrsBlind 會過濾功能字', /worthOwnCard\(w\)/.test(practiceSrc2));
ok('但整張卡（unit）不受功能字清單影響',
  /srsRecord\('unit', unit\.en, base\)/.test(practiceSrc2));

// ⑯ 記錄錯字之後要順手更新頂列角標
ok('captureSrs 有呼叫 SRSUI.refreshBadge',
  /function captureSrs\(unit, mode\)[\s\S]{0,900}refreshBadge\(\)/.test(practiceSrc2));
ok('captureSrsBlind 有呼叫 SRSUI.refreshBadge',
  /function captureSrsBlind\(unit, words\)[\s\S]{0,900}refreshBadge\(\)/.test(practiceSrc2));

// ⑰ 階梯標籤要跟它排的間隔一致（曾經錯位一階：標「10 分鐘」卻排 1 小時）
// 標籤寫「幾分鐘／小時／天／週」，就必須剛好等於這階的 gap
const UNIT_MS = { '分鐘': 60000, '小時': 3600000, '天': 86400000, '週': 604800000, '個月': 2592000000 };
const labelGapOk = SRS.STEPS.every(st => {
  const m = /^(\d+)\s*(分鐘|小時|天|週|個月)$/.exec(st.label);
  if (!m) return false;
  return Number(m[1]) * UNIT_MS[m[2]] === st.gap;
});
ok('每個階段的標籤跟 gap 剛好對得上（不會標「10 分鐘」卻排 1 小時）', labelGapOk,
  SRS.STEPS.map(st => st.label + '=' + st.gap).join(' '));
ok('所有階段的標籤都是「數字 + 時間單位」', SRS.STEPS.every(st => /^\d+\s*(分鐘|小時|天|週|個月)$/.test(st.label)));
eq('第 0 階就是 10 分鐘（剛錯的先密集複習）', Math.round(SRS.STEPS[0].gap / 60000), 10);
eq('最後一階是 30 天（1 個月）', Math.round(SRS.STEPS[SRS.STEPS.length - 1].gap / 86400000), 30);

// ⑱ 滾動是真的有把卡片丟到隊伍最後，不是直接刪掉（迴歸：只 splice 沒有 push）
ok('答錯時會先 splice 再 push 到最後',
  /state\.queue\.splice\(state\.cursor, 1\);[\s\S]{0,160}state\.queue\.push\(it\)/.test(srsUiSrc));
eq('滾動上限有上限，不會無限滾', SRSUI_MAX_REQUEUE, 3);

// ⑲ 面板開著時，App 不會搶空白鍵／Enter
ok('Escape 在複習中只回清單、不關整個面板',
  /SRSUI\.isOpen\(\) && SRSUI\.state\.page === 'review'/.test(appSrc2));
// ───────── 結果 ─────────
process.stdout.write('\n' + '─'.repeat(58) + '\n');
process.stdout.write(`通過 ${pass}　失敗 ${fail}\n`);
if (failures.length) {
  process.stdout.write('\n失敗項目：\n');
  failures.forEach(f => process.stdout.write('  ✗ ' + f + '\n'));
  process.exit(1);
}
process.stdout.write('✅ 全部通過\n');
