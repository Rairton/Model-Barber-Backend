const fs = require('fs');
const path = require('path');
const vm = require('vm');
const target = path.resolve(__dirname, '..', 'Assets', 'script.js');
try {
  const src = fs.readFileSync(target, 'utf8');
  // Compile to get precise line/column
  new vm.Script(src, { filename: target });
  console.log('SYNTAX OK for', target);
} catch (e) {
  console.error('SYNTAX ERROR in', target);
  console.error(e.message);
  if (e.stack) console.error(e.stack);
  process.exit(1);
}
