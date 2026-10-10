/* ══════════════════════════════════════════════════════════════
   test_space.js — 空白鍵行為的回歸測試（node tools/test_space.js）
   需求：
     · 句子還沒打完時按空白鍵 → 朗讀「目前這個單字」的發音
     · 整句都打完後按空白鍵  → 跳到下一句的開頭開始打
   只測 practice.js 的空白鍵分流，不做完整 DOM。
   ══════════════════════════════════════════════════════════════ */
'use strict';

const fs = require('fs');
const vm = require('vm');
const path = require('path');

const ROOT = path.join(__dirname, '..');

let pass = 0, fail = 0;
const failures = [];
function ok(name, cond, extra) {
  if (cond) { pass++; process.stdout.write('  ✓ ' + name + '\n'); }
  else {
    fail++;
    failures.push(name + (extra ? '  → ' + extra : ''));
    process.stdout.write('  ✗ ' + name + (extra ? '  → ' + extra : '') + '\n');
  }
}
function group(t) { process.stdout.write('\n' + t + '\n'); }

/* ───────── 最小假 DOM ───────── */
function classList(initial) {
  var set = {};
  (initial || []).forEach(function (c) { set[c] = true; });
  return {
    add: function (c) { set[c] = true; },
    remove: function (c) { delete set[c]; },
    contains: function (c) { return !!set[c]; },
    toggle: function (c, on) { if (on) set[c] = true; else delete set[c]; }
  };
}

/** 假的單字輸入框 */
function makeInput(i, target, value, done) {
  return {
    tagName: 'INPUT',
    value: value,
    classList: classList(done ? ['word-input', 'correct'] : ['word-input']),
    dataset: { target: target, index: String(i) },
    focus: function () { document.activeElement = this; },
    blur: function () { if (document.activeElement === this) document.activeElement = null; },
    addEventListener: function () {},
    querySelectorAll: function () { return []; },
    closest: function () { return null; }
  };
}

var document = {
  activeElement: null,
  getElementById: function (id) {
    if (id === 'wordsContainer') return container;
    return { style: {}, innerHTML: '', textContent: '', classList: classList(), querySelectorAll: function () { return []; } };
  },
  querySelector: function () { return null; },
  querySelectorAll: function () { return []; },
  addEventListener: function () {},
  readyState: 'complete',
  hidden: false
};

var container = { querySelectorAll: function (sel) { return sel === 'input' ? currentInputs : []; } };
var currentInputs = [];

/* ───────── 載入 practice.js ───────── */
var ctx = { console, document };
ctx.window = ctx;
ctx.setTimeout = setTimeout;
ctx.clearTimeout = clearTimeout;

var said = [];     // Speech.say 收到的文字
var toasted = [];  // App.toast 收到的訊息

ctx.Store = { settings: function () { return { rate: 0.9, strictCase: false, showHints: true }; } };
ctx.Home = {
  state: { mode: 'sentences', scene: { id: 'test-scene' } },
  visibleUnits: function () { return [{ en: 'I am happy', zh: '我很快樂', index: 0 }]; }
};
ctx.Ipa = { tokenize: function (s) { return String(s).split(' '); } };
ctx.Speech = { say: function (text) { said.push(text); return true; }, stop: function () {} };
ctx.App = { toast: function (msg) { toasted.push(msg); }, showView: function () {} };

vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/practice.js'), 'utf8'), ctx, { filename: 'js/practice.js' });

const Practice = ctx.Practice;
Practice.prepare();
Practice.state.index = 0;

/** 換一組輸入框（模擬某一張卡片的 DOM） */
function setup(inputs) {
  currentInputs = inputs;
  document.activeElement = null;
}

/** 模擬按下空白鍵，回傳是否被 preventDefault（= 這個按鍵被吃掉） */
function pressSpace() {
  var prevented = false;
  var evt = { key: ' ', code: 'Space', preventDefault: function () { prevented = true; } };
  // 逐字模式的事件是綁在各輸入框上的 keydown
  Practice.handleSpace();
  return prevented;
}

/* ───────── 1. 句子還沒打完 → 朗讀單字 ───────── */
group('1. 句子還沒打完：空白鍵朗讀目前這個單字');

setup([
  makeInput(0, 'I', 'I', true),
  makeInput(1, 'am', '', false),
  makeInput(2, 'happy', '', false)
]);
document.activeElement = currentInputs[1];   // 剛打好 'I'，游標自動跳到下一格
said = [];
ok('剛打好一個字 → 讀剛剛那個字', Practice.handleSpace() === true && said.length === 1 && said[0] === 'I',
   '說：' + JSON.stringify(said));
ok('這種情況不換張（不會 toast）', toasted.length === 0);

document.activeElement = currentInputs[1];
currentInputs[1].value = 'a';               // 打了一半
said = [];
ok('字打到一半 → 讀游標那個字', Practice.handleSpace() === true && said.length === 1 && said[0] === 'am',
   '說：' + JSON.stringify(said));

document.activeElement = currentInputs[1];   // 點回第一個空格，前面沒有字
currentInputs[0].value = ''; currentInputs[0].classList.remove('correct');
currentInputs[1].value = '';
said = [];
ok('第一個字還沒打 → 讀第一個字', Practice.handleSpace() === true && said.length === 1 && said[0] === 'I',
   '說：' + JSON.stringify(said));

document.activeElement = null;               // 整句打完前失去焦點
currentInputs[0].value = 'I'; currentInputs[0].classList.add('correct');
currentInputs[1].value = 'am'; currentInputs[1].classList.add('correct');
said = [];
ok('沒有焦點時 → 讀第一個還沒打好的字', Practice.handleSpace() === true && said.length === 1 && said[0] === 'happy',
   '說：' + JSON.stringify(said));

setup([]);
ok('沒有任何輸入框 → 不處理（留給瀏覽器預設）', Practice.handleSpace() === false);

/* ───────── 2. 整句都打完 → 跳到下一張 ───────── */
group('2. 整句都打完：空白鍵跳到下一張');

setup([
  makeInput(0, 'I', 'I', true),
  makeInput(1, 'am', 'am', true),
  makeInput(2, 'happy', 'happy', true)
]);
document.activeElement = null;               // 最後一個字打完後輸入框會失焦
said = []; toasted = [];
ok('整句打完 → 回傳 true（呼叫端要 preventDefault）', Practice.handleSpace() === true);
ok('整句打完 → 不再朗讀單字', said.length === 0);
ok('整句打完 → 換到下一張（目前只有一張，所以是 toast 提示）',
   toasted.length === 1 && toasted[0].indexOf('都練過一輪') >= 0, 'toast：' + toasted[0]);

/* ───────── 3. 盲打模式：送出前空白鍵要能打字 ───────── */
group('3. 盲打模式：還沒送出正確答案時空白鍵照樣輸入');

ctx.Home.state.mode = 'blind';
setup([makeInput(0, 'I', '', false)]);
said = []; toasted = [];
ok('還沒送出 → 不處理（空白字元要能打進去）', Practice.handleSpace() === false);
ok('還沒送出 → 不朗讀、不換張', said.length === 0 && toasted.length === 0);

Practice.state.blindDone = true;             // 模擬整句送出去而且全對
ok('blindDone() 回報送出狀態', Practice.blindDone() === true);
ok('已送出正確答案 → 換下一張', Practice.handleSpace() === true && toasted.length === 1,
   'toast：' + toasted[0]);

ctx.Home.state.mode = 'sentences';
Practice.state.blindDone = false;

/* ───────── 4. 接線檢查 ───────── */
group('4. 接線檢查（防止改版把分流弄掉）');

const practiceSrc = fs.readFileSync(path.join(ROOT, 'js/practice.js'), 'utf8')
  .replace(/^\uFEFF/, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
const onKeySrc = practiceSrc.slice(practiceSrc.indexOf('function onKey'),
  practiceSrc.indexOf('function updateMark'));
ok('onKey 的空白鍵交給 handleSpace，不再一律 next()',
   /if \(e\.key === ' ' \|\| e\.code === 'Space'\)\s*\{\s*e\.preventDefault\(\);\s*handleSpace\(\);/
     .test(onKeySrc));
ok('onKey 沒有其他地方再呼叫 next()', onKeySrc.indexOf('next(') < 0);
ok('handleSpace 依 isComplete() 分流', /function handleSpace[\s\S]{0,400}isComplete\(\)/.test(practiceSrc));
ok('盲打模式有 blindDone 旗標', /P\.blindDone\s*=\s*true/.test(practiceSrc) &&
  /P\.blindDone\s*=\s*false/.test(practiceSrc));
ok('Practice 有匯出 handleSpace', /handleSpace:\s*handleSpace/.test(practiceSrc));

const appSrc = fs.readFileSync(path.join(ROOT, 'js/app.js'), 'utf8')
  .replace(/^\uFEFF/, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
ok('app.js 在文件層接手空白鍵（整句打完後輸入框已失焦）',
  /Practice\.handleSpace\(\)/.test(appSrc));
ok('app.js 盲打送出後空白鍵換張', /Practice\.blindDone\(\)/.test(appSrc));
ok('app.js 的空白鍵分支不會重複處理輸入框已吃掉的按鍵',
  /!e\.defaultPrevented/.test(appSrc));

process.stdout.write('\n──────────────────────────────────────────────────────────\n');
process.stdout.write('通過 ' + pass + '　失敗 ' + fail + '\n');
if (fail) {
  failures.forEach(function (f) { process.stdout.write('  ✗ ' + f + '\n'); });
  process.exit(1);
}
process.stdout.write('✅ 全部通過\n');
