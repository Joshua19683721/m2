/* ══════════════════════════════════════════════════════════════
   test_restore.js — 「跳進去就說已經打完了」的回歸測試
   （node tools/test_restore.js）

   問題：restore() 會把上一輪存下來的續打點填回輸入框，
         如果那一輪其實已經全部打完，就會變成「每一格都填好了」，
         於是 isComplete() 為真 → 直接呼叫 finish()。
         結果：使用者只是跳進來看一眼，就被記成「又完成一次」，
         attempts 一直增加，錯字本也多一筆答對。

   這個測試把那條路釘死：
     · 打完成的卡片不留續打點
     · 續打點是「全對」時，restore() 直接清掉、不填滿、不 finish()
     · 續打點是「打一半」時，仍然只還原已打的部分
     · finish() 同一張只記一次
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

var container = {
  style: {},
  hidden: false,
  children: [],
  appendChild: function (c) { this.children.push(c); return c; },
  querySelectorAll: function (sel) {
    if (sel !== 'input') return [];
    // 從 createElement 出來的假元素樹裡把 input 撈出來
    var out = [];
    (function walk(node) {
      (node.children || []).forEach(function (c) {
        if (c.tagName === 'INPUT') out.push(c);
        walk(c);
      });
    })(this);
    return out;
  }
};
// innerHTML 賦值時要清掉子節點，否則 renderWords 的 box.innerHTML = '' 沒用，
// 舊的輸入框會一直留在樹裡。
Object.defineProperty(container, 'innerHTML', {
  get: function () { return this._html || ''; },
  set: function (v) { this._html = v; if (v === '') this.children = []; }
});
var currentInputs = [];

var els = {};
function el(id) {
  if (!els[id]) els[id] = {
    id: id, style: {}, innerHTML: '', textContent: '', className: '',
    classList: classList(), hidden: false, value: '', dataset: {},
    querySelectorAll: function () { return []; },
    querySelector: function () { return el(id + ' > ' + arguments[0]); },
    addEventListener: function () {},
    focus: function () {}, blur: function () {}
  };
  return els[id];
}

var document = {
  activeElement: null,
  getElementById: function (id) {
    if (id === 'wordsContainer') return container;
    return el(id);
  },
  querySelector: function () { return el('__qs'); },
  querySelectorAll: function () { return []; },
  createElement: function (tag) { return makeEl(tag); },
  addEventListener: function () {},
  readyState: 'complete',
  hidden: false
};

/** renderWords 會 createElement 出真的 DOM 節點，這裡給一個夠用的假元素 */
function makeEl(tag) {
  var listeners = {};
  return {
    tagName: (tag || 'div').toUpperCase(),
    className: '', innerHTML: '', textContent: '', value: '',
    style: {}, dataset: {}, children: [],
    classList: classList(),
    hidden: false,
    appendChild: function (c) { this.children.push(c); return c; },
    addEventListener: function (type, fn) { (listeners[type] = listeners[type] || []).push(fn); },
    dispatchEvent: function (e) {
      (listeners[e.type || ''] || []).forEach(function (fn) { fn(e); });
      return true;
    },
    setAttribute: function () {},
    querySelectorAll: function () { return []; },
    querySelector: function () { return null; },
    closest: function () { return null; },
    focus: function () {}, blur: function () {}
  };
}

/* ───────── localStorage ───────── */
var lsMem = new Map();
var localStorage = {
  getItem: function (k) { return lsMem.has(k) ? lsMem.get(k) : null; },
  setItem: function (k, v) { lsMem.set(k, String(v)); },
  removeItem: function (k) { lsMem.delete(k); },
  clear: function () { lsMem.clear(); }
};

/* ───────── 練習進度 ───────── */
var progress = {};
var sessions = [];
var Store = {
  settings: function () { return { rate: 0.9, strictCase: false, showHints: true }; },
  MODE_LABEL: { words: '單字', phrases: '片語', sentences: '句子', blind: '盲打' },
  setCursor: function () {},
  unitState: function (s, m, i) { return progress[s + '|' + m + '|' + i] || { done: false, errTotal: 0, attempts: 0 }; },
  saveUnit: function (s, m, i, patch) {
    var k = s + '|' + m + '|' + i;
    var cur = progress[k] || { done: false, errTotal: 0, attempts: 0 };
    for (var key in patch) if (Object.prototype.hasOwnProperty.call(patch, key)) cur[key] = patch[key];
    progress[k] = cur;
  },
  recordSession: function (d) { sessions.push(d); }
};

var Home = {
  state: { mode: 'words', scene: { id: 'test-scene' } },
  visibleUnits: function () { return [{ en: 'I am happy', zh: '我很快樂', index: 0 }]; }
};

var Ipa = {
  tokenize: function (s) { return String(s).split(' '); },
  ensureIpa: function () { return ''; }
};

var said = [];
var Speech = { say: function (t) { said.push(t); return true; }, stop: function () {} };
var App = { toast: function () {}, showView: function () {} };

var ctx = { console, document, localStorage, Store, Home, Ipa, Speech, App };
ctx.window = ctx;
ctx.setTimeout = setTimeout;
ctx.clearTimeout = clearTimeout;
ctx.setInterval = setInterval;
ctx.clearInterval = clearInterval;
ctx.Analysis = { escapeHtml: function (s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;'); } };

vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/practice.js'), 'utf8'), ctx, { filename: 'js/practice.js' });

const Practice = ctx.Practice;
Practice.prepare();
Practice.state.index = 0;

const KEY = 'sceneTyping.partial.test-scene.words';
const attempts = () => Store.unitState('test-scene', 'words', 0).attempts;
const done = () => Store.unitState('test-scene', 'words', 0).done;
/* renderWords 會用 createElement 建出新的輸入框，所以一律從容器讀，
   不要沿用 setup() 傳進去的舊陣列（那些已經不是畫面上的元素了）。 */
const liveInputs = () => container.querySelectorAll('input');
const filled = () => liveInputs().map(function (i) { return i.value; });
const green = () => liveInputs().filter(function (i) { return i.classList.contains('correct'); }).length;

/** 把某一張卡的輸入框換成指定的狀態 */
function setup(inputs) {
  currentInputs = inputs;
  document.activeElement = null;
}

/** 模擬使用者把整句打完 */
function typeAll() {
  liveInputs().forEach(function (inp) {
    var tok = inp.dataset.target;
    inp.focus();
    inp.value = '';
    for (var i = 0; i < tok.length; i++) {
      inp.value += tok[i];
      inp.dispatchEvent(new Event('input', { bubbles: true }));
    }
  });
}

/* ───────── 1. 打完一張卡 ───────── */
group('1. 打完一張卡：記一次完成，續打點清掉');

setup([makeInput(0, 'I', '', false), makeInput(1, 'am', '', false), makeInput(2, 'happy', '', false)]);
Practice.render(0);
typeAll();
eq('done = true', done(), true);
eq('attempts = 1', attempts(), 1);
eq('完成後續打點被清掉', localStorage.getItem(KEY), null);
eq('完成時有記一筆 session', sessions.length, 1);

/* ───────── 2. 跳回已完成的卡片 ───────── */
group('2. 跳回已完成的卡片：不該自動填滿、不該再記一次');

// 模擬「上一輪已經全部打完」留下來的續打點（舊版 save() 會留這種東西）
localStorage.setItem(KEY, JSON.stringify({ unit: 'I am happy', done: [0, 1, 2] }));
setup([makeInput(0, 'I', '', false), makeInput(1, 'am', '', false), makeInput(2, 'happy', '', false)]);
Practice.render(0);

eq('輸入框仍然是空的', filled().join('|'), '||');
eq('沒有被標成已打對', green(), 0);
eq('attempts 沒有增加', attempts(), 1);
eq('done 沒有被重寫', done(), true);
eq('全對的續打點被清掉', localStorage.getItem(KEY), null);
eq('沒有多記 session', sessions.length, 1);

/* ───────── 3. 跳回「打到一半」的卡片 ───────── */
group('3. 跳回打到一半的卡片：只還原已打的部分');

// 這一題是「打到一半」，所以上一輪不該有完成紀錄
progress = {};
localStorage.setItem(KEY, JSON.stringify({ unit: 'I am happy', done: [0, 1] }));
setup([makeInput(0, 'I', '', false), makeInput(1, 'am', '', false), makeInput(2, 'happy', '', false)]);
Practice.render(0);

eq('前兩個字有被還原', filled()[0] + '|' + filled()[1], 'I|am');
eq('第三個字還是空的', filled()[2], '');
eq('已還原的會標綠', green(), 2);
eq('attempts 沒有增加（上一輪沒完成過）', attempts(), 0);
eq('done 仍然是 false', done(), false);
eq('沒有多記 session', sessions.length, 1);

/* ───────── 4. 把剩下的打完 ───────── */
group('4. 把剩下的打完：這才算一次完成');

typeAll();
eq('done = true', done(), true);
eq('attempts 變成 1', attempts(), 1);
eq('續打點被清掉', localStorage.getItem(KEY), null);
eq('session 變成 2 筆', sessions.length, 2);

/* ───────── 5. finish() 同一張只記一次 ───────── */
group('5. finish() 同一張只記一次');

var before = attempts();
// 模擬 restore() 與 onInput() 同時觸發 finish() 的情況
Practice.render(0);          // 會清掉 P.finished
typeAll();                   // 第一次 finish()
var afterFirst = attempts();
eq('第一次打完 attempts +1', afterFirst, before + 1);

// 再打一次不應該再記（同一張、同一次練習）
typeAll();
eq('重複呼叫 finish 不會再記', attempts(), afterFirst);
eq('session 沒有多一筆', sessions.length, 3);

/* ───────── 6. 換一張會解鎖 ───────── */
group('6. 換一張會解鎖，可以重新記');

Practice.render(0);
typeAll();
eq('換一張之後可以重新記', attempts(), afterFirst + 1);

/* ───────── 7. 續打點壞掉不該炸掉 ───────── */
group('7. 續打點壞掉不該炸掉');

localStorage.setItem(KEY, '{壞掉的 JSON');
setup([makeInput(0, 'I', '', false), makeInput(1, 'am', '', false), makeInput(2, 'happy', '', false)]);
var threw = false;
try { Practice.render(0); } catch (e) { threw = true; }
eq('壞掉的續打點不會讓 render 炸掉', threw, false);
eq('壞掉的續打點不會被還原', filled().join('|'), '||');

localStorage.setItem(KEY, JSON.stringify({ unit: '完全不同的句子', done: [0] }));
setup([makeInput(0, 'I', '', false), makeInput(1, 'am', '', false), makeInput(2, 'happy', '', false)]);
threw = false;
try { Practice.render(0); } catch (e) { threw = true; }
eq('unit 對不上時不會還原', threw, false);
eq('unit 對不上時輸入框是空的', filled().join('|'), '||');

/* ───────── 結果 ───────── */
Practice.stopTimer();   // 清掉 render() 開的計時器，否則 process 不會結束
process.stdout.write('\n' + '─'.repeat(58) + '\n');
process.stdout.write(`通過 ${pass}　失敗 ${fail}\n`);
if (failures.length) {
  process.stdout.write('\n失敗項目：\n');
  failures.forEach(f => process.stdout.write('  ✗ ' + f + '\n'));
  process.exit(1);
}
process.stdout.write('✅ 全部通過\n');

function eq(name, a, b) {
  ok(name, a === b, 'expected ' + JSON.stringify(b) + ', got ' + JSON.stringify(a));
}