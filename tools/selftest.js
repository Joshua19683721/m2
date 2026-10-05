/* 快速自我檢查：在 Node 裡載入 ipa.js 與 scenes.js，驗證句子音標組合 */
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const root = path.join(__dirname, '..');
const ctx = { console };
ctx.window = ctx;
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(root, 'js/ipa.js'), 'utf8'), ctx);
vm.runInContext(fs.readFileSync(path.join(root, 'data/scenes.js'), 'utf8'), ctx);

const I = ctx.Ipa;
I.registerAll(ctx.SCENES);

console.log('場景數 :', ctx.SCENES.length);
console.log('音標字典:', I.size(), '筆');

// 統計句子音標的組合成功率
let total = 0, ok = 0;
const samples = [];
for (const sc of ctx.SCENES) {
  for (const s of (sc.sentences || [])) {
    total++;
    const ipa = I.compose(s.en);
    if (ipa) { ok++; if (samples.length < 8) samples.push([s.en, ipa]); }
    else if (samples.length < 8) samples.push([s.en, '✗ 組合失敗']);
  }
}
console.log('句子音標組合成功率:', ok + '/' + total, '(' + ((ok / total) * 100).toFixed(1) + '%)');
console.log('---');
samples.forEach(([en, ipa]) => console.log(en, '\n   ', ipa));

// 詞彙多寡
let w = 0, p = 0;
for (const sc of ctx.SCENES) { w += (sc.words || []).length; p += (sc.phrases || []).length; }
console.log('---');
console.log('單字', w, '片語', p);
