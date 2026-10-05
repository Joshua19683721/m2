/* 單獨測試 practice.js 的輸入正規化（node tools/test_apostrophe.js）
   對應實際回報的問題：中文輸入法的全形單引號，打不出來 Who's 的 ' */
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const root = path.join(__dirname, '..');

const practiceSrc = fs.readFileSync(path.join(root, 'js/practice.js'), 'utf8');
const from = practiceSrc.indexOf('var SMART_QUOTES');
const to = practiceSrc.indexOf('function onInput');
const c = { console };
c.window = c;
vm.createContext(c);
vm.runInContext(
  practiceSrc.slice(from, to) + '\nthis.__n = { normalizeTyped, stripNoise };', c);
const { normalizeTyped, stripNoise } = c.__n;

let pass = 0, fail = 0;
function eq(name, a, b) {
  if (a === b) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + '  期望 ' + JSON.stringify(b) + '，實際 ' + JSON.stringify(a)); }
}

console.log('全形 → 半形（中文輸入法在中文模式按單引號鍵）');
eq('全形撇號 ＇ 會變成半形撇號', normalizeTyped('＇'), "'");
eq('全形錢號 ＄ 變成半形 $（它本來就不是撇號）', normalizeTyped('＄'), '$');
eq('全形大寫 Ｗ', normalizeTyped('Ｗ'), 'W');
eq('全形小寫 ｈｏ', normalizeTyped('ｈｏ'), 'ho');
eq('全形數字 ３', normalizeTyped('３'), '3');
eq('全形空白', normalizeTyped('a　b'), 'a b');
eq('整句全形 Ｗｈｏ＇ｓ', normalizeTyped('Ｗｈｏ＇ｓ'), "Who's");

console.log('');
console.log('智慧引號 / 自動替換 / 死鍵');
eq('右引號 ’', normalizeTyped('’'), "'");
eq('左引號 ‘', normalizeTyped('‘'), "'");
eq('低引號 ‚', normalizeTyped('‚'), "'");
eq('反引號 `', normalizeTyped('`'), "'");
eq('acute ´', normalizeTyped('´'), "'");
eq('三個引號一起', normalizeTyped('‘’`'), "'''");

console.log('');
console.log('去掉不是答案字元的雜訊（不算打字錯誤）');
eq('中文被丟掉', stripNoise('愛'), '');
eq('標點被丟掉', stripNoise('a,b.c'), 'abc');
eq('空白被丟掉', stripNoise('a b'), 'ab');
eq('正常英文不動', stripNoise("Who's"), "Who's");
eq('中文夾在英文中', stripNoise('a愛b'), 'ab');
eq('先正規化再去雜訊 → 全形撇號留下半形撇號', stripNoise(normalizeTyped('＇')), "'");
eq('先正規化再去雜訊 → 全形中英文', stripNoise(normalizeTyped('Ｗｈｏ')), 'Who');

console.log('');
console.log('實際回報的案例逐字模擬');
const token = "Who's";
[['全形（中文輸入法）', 'Who＇'],
 ['智慧引號（自動替換）', 'Who’'],
 ['半形（正常）', "Who'"]].forEach(function (pair) {
  const label = pair[0], typed = pair[1];
  const normalized = normalizeTyped(typed);
  const value = stripNoise(normalized).slice(0, token.length);
  eq(label + ' → 前綴與答案相符',
    value === token.slice(0, value.length) && value.length === 4, true);
});

console.log('');
console.log('接線檢查（防止日後改版把修正弄掉）');
const onInputSrc = practiceSrc.slice(to, practiceSrc.indexOf('function onKey'));
eq('onInput 有呼叫 normalizeTyped', onInputSrc.indexOf('normalizeTyped(') >= 0, true);
eq('onInput 有呼叫 stripNoise', onInputSrc.indexOf('stripNoise(') >= 0, true);
eq('onInput 先正規化再去雜訊',
  onInputSrc.indexOf('normalizeTyped(') < onInputSrc.indexOf('stripNoise('), true);
const onKeySrc = practiceSrc.slice(practiceSrc.indexOf('function onKey'),
  practiceSrc.indexOf('function updateMark'));
const onKeyCode = onKeySrc.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
const pd = onKeyCode.match(/preventDefault/g) || [];
eq('onKey 只保留 Space 那處 preventDefault，不再擋字元', pd.length <= 1, true);

const codeOnly = practiceSrc.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
eq('每個輸入框都有 compositionstart 監聽', /addEventListener\('compositionstart'/.test(codeOnly), true);
eq('每個輸入框都有 compositionend 監聽', /addEventListener\('compositionend'/.test(codeOnly), true);
eq('compositionend 結束後會補跑一次 onInput',
  /compositionend[\s\S]{0,400}onInput\(\{\s*isComposing:\s*false/.test(codeOnly), true);
const guardAt = codeOnly.indexOf('if (e && e.isComposing) return;');
const normAt = codeOnly.indexOf('normalizeTyped(input.value)');
eq('onInput 在碰到 input.value 之前就先擋下 IME 組字', guardAt > 0 && guardAt < normAt, true);
eq('有 IME 提示元件 imeHint', /imeHint/.test(codeOnly), true);

console.log('');
console.log('通過 ' + pass + '，失敗 ' + fail);
process.exit(fail ? 1 : 0);