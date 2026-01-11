const fs = require('fs');
const path = require('path');
const target = path.resolve(__dirname, '..', 'Assets', 'script.js');
const src = fs.readFileSync(target, 'utf8');
let level = 0, line = 1, col = 0;
let mode = null; // 'single' 'double' 'backtick' 'regex' maybe
for (let i=0;i<src.length;i++){
  const ch = src[i];
  const prev = src[i-1];
  if (ch==='\n'){ line++; col=0; continue; } else col++;
  if (mode){
    if (mode==='single' && ch==='\'' && prev!=='\\') mode=null;
    else if (mode==='double' && ch==='"' && prev!=='\\') mode=null;
    else if (mode==='backtick' && ch==='`' && prev!=='\\') mode=null;
    continue;
  } else {
    if (ch==='\''){ mode='single'; continue; }
    if (ch==='"'){ mode='double'; continue; }
    if (ch==='`'){ mode='backtick'; continue; }
    if (ch==='{'){ level++; }
    else if (ch==='}'){ level--; if (level<0){ console.log('Curly level negative at line', line, 'col', col); process.exit(0);} }
  }
}
console.log('Final curly level', level);
