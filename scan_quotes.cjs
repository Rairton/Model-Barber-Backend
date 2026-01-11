const fs = require('fs');
const path = require('path');
const target = path.resolve(__dirname, '..', 'Assets', 'script.js');
const src = fs.readFileSync(target, 'utf8');
let backticks = 0;
let single = 0, double = 0;
for (let i=0;i<src.length;i++){
  const ch = src[i];
  const prev = src[i-1];
  if (ch==='`' && prev!=='\\') backticks++;
  if (ch==='\'' && prev!=='\\') single++;
  if (ch==='"' && prev!=='\\') double++;
}
console.log('Backticks:', backticks, '(parity', backticks%2===0?'even':'odd',')');
console.log('Single quotes count:', single, 'Double quotes count:', double);
