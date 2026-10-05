/* 預覽解析面板產出的「句子結構與詞性對照表」 */
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const root = path.join(__dirname, '..');

const ctx = { console };
ctx.window = ctx;
vm.createContext(ctx);
['js/ipa.js', 'data/scenes.js', 'js/analysis.js'].forEach(f =>
  vm.runInContext(fs.readFileSync(path.join(root, f), 'utf8'), ctx));

const A = ctx.Analysis;

const SENTENCES = [
  'There is a good cartoon on the television now.',
  'Can I have a glass of water, please?',
  'My sister is hungry and wants some bread.',
  'The film was so long that I fell asleep.',
  'She always wears black on special days.',
  'I go to the airport by taxi every Friday.'
];

SENTENCES.forEach(s => {
  console.log('■ ' + s);
  A.structure(s).forEach(r => {
    console.log('   ' + String(r.role).padEnd(14) + String(r.token).padEnd(12) + r.pos);
  });
  console.log('');
});

console.log('── 詞性查表命中率（所有例句）');
const RE = /([A-Za-z0-9']+)/g;
let total = 0, known = 0;
const miss = new Map();
for (const sc of ctx.window.SCENES) {
  for (const s of (sc.sentences || [])) {
    for (const w of (s.en.match(RE) || [])) {
      total++;
      if (A.posOf(w)) known++;
      else miss.set(w.toLowerCase(), (miss.get(w.toLowerCase()) || 0) + 1);
    }
  }
}
console.log('   ' + known + '/' + total + ' = ' + (known / total * 100).toFixed(1) + '%');
const top = [...miss.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20);
console.log('   查不到: ' + top.map(([w, n]) => w + '(' + n + ')').join(' '));
