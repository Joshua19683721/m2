/* 診斷：統計所有句子中查不到音標的字，排出最常漏掉的那些 */
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const root = path.join(__dirname, '..');
const ctx = { console };
ctx.window = ctx;
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(root, 'js/ipa.js'), 'utf8'), ctx);
vm.runInContext(fs.readFileSync(path.join(root, 'data/scenes.js'), 'utf8'), ctx);
ctx.Ipa.registerAll(ctx.SCENES);

const RE = /([A-Za-z0-9']+)|([^A-Za-z0-9'\s]+)/g;
const missing = new Map();

for (const sc of ctx.SCENES) {
  for (const s of (sc.sentences || [])) {
    if (ctx.Ipa.compose(s.en)) continue;            // 整句成功 → 不必拆
    const toks = s.en.match(RE) || [];
    for (let i = 0; i < toks.length; i++) {
      const t = toks[i];
      if (!/[A-Za-z0-9']/.test(t)) continue;
      // 這個 token 有沒有被任何片語吃掉？
      const w = t.toLowerCase();
      const covered = /^[A-Za-z0-9']+$/.test(w) &&
        ctx.Ipa.compose(t) !== '';
      if (!covered) missing.set(w, (missing.get(w) || 0) + 1);
    }
  }
}

const sorted = [...missing.entries()].sort((a, b) => b[1] - a[1]);
console.log('查不到音標的字詞種類:', sorted.length);
console.log('出現頻率前 120 名：');
console.log(sorted.slice(0, 120).map(([w, n]) => `${w}(${n})`).join(' '));
console.log('');
console.log('長尾（只出現一次）:', sorted.filter(([, n]) => n === 1).length, '個');
console.log(sorted.filter(([, n]) => n === 1).slice(0, 200).map(([w]) => w).join(' '));
