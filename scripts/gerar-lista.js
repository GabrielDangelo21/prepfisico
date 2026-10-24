// Gera imagens/lista.json com todas as imagens da pasta imagens/ (inclui subpastas).
// O Netlify roda este script a cada deploy (ver netlify.toml). Para testar no computador:
//   node scripts/gerar-lista.js
const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, '..', 'imagens');
const walk = d => fs.readdirSync(d, { withFileTypes: true })
  .flatMap(e => e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);

fs.mkdirSync(dir, { recursive: true });
const files = walk(dir)
  .filter(f => /\.(png|jpe?g|gif|webp)$/i.test(f))
  .map(f => path.relative(dir, f).split(path.sep).join('/'))
  .sort();

fs.writeFileSync(path.join(dir, 'lista.json'), JSON.stringify(files, null, 1));
console.log(`imagens/lista.json: ${files.length} imagens`);
