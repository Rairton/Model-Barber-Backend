const fs = require('fs');
const path = require('path');
const target = path.resolve(__dirname, '..', 'Assets', 'script.js');
try {
  const src = fs.readFileSync(target, 'utf8');
  new Function(src);
  console.log('SYNTAX OK for', target);
} catch (e) {
  console.error('SYNTAX ERROR in', target);
  console.error(e.message);
  if (e.stack) console.error(e.stack);
  process.exit(1);
}
