const fs = require('fs');
const path = require('path');
const vm = require('vm');
const target = path.resolve(__dirname, '..', 'Assets', 'script.js');
const src = fs.readFileSync(target, 'utf8');
const lines = src.split(/\r?\n/);
let low = 1, high = lines.length, bad = -1;
// Binary search for the earliest failing line count
while (low <= high) {
  const mid = Math.floor((low + high) / 2);
  const snippet = lines.slice(0, mid).join('\n');
  try {
    new vm.Script(snippet, { filename: target });
    low = mid + 1;
  } catch (e) {
    bad = mid;
    high = mid - 1;
  }
}
if (bad === -1) {
  console.log('No syntax error found via incremental compile.');
  process.exit(0);
}
console.log('First failing line:', bad);
const start = Math.max(1, bad - 5);
const end = Math.min(lines.length, bad + 5);
for (let i = start; i <= end; i++) {
  const prefix = (i === bad ? '>> ' : '   ');
  console.log(prefix + i + ': ' + lines[i - 1]);
}
