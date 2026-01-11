const fs = require('fs');
const path = require('path');
const target = path.resolve(__dirname, '..', 'Assets', 'script.js');
let src = fs.readFileSync(target, 'utf8');
// crude removal of strings/template literals to avoid misleading parens
src = src.replace(/`[\s\S]*?`/g, '');
src = src.replace(/'(?:\\'|[^'])*'/g, '');
src = src.replace(/"(?:\\"|[^"])*"/g, '');
let openP=0, closeP=0, openB=0, closeB=0, openC=0, closeC=0;
for (const ch of src){
  if (ch==='(') openP++;
  else if (ch===')') closeP++;
  else if (ch==='[') openB++;
  else if (ch===']') closeB++;
  else if (ch==='{') openC++;
  else if (ch==='}') closeC++;
}
console.log('() =>', openP, closeP, 'diff', openP-closeP);
console.log('[] =>', openB, closeB, 'diff', openB-closeB);
console.log('{} =>', openC, closeC, 'diff', openC-closeC);
