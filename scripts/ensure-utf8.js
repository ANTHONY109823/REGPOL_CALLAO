const fs = require('fs');
const path = require('path');

function hasLatin1Orphans(buf) {
  const bad = [];
  for (let i = 0; i < buf.length; i++) {
    const c = buf[i];
    if (c < 0x80) continue;
    if ((c & 0xe0) === 0xc0 && i + 1 < buf.length && (buf[i + 1] & 0xc0) === 0x80) {
      i++;
      continue;
    }
    if (
      (c & 0xf0) === 0xe0 &&
      i + 2 < buf.length &&
      (buf[i + 1] & 0xc0) === 0x80 &&
      (buf[i + 2] & 0xc0) === 0x80
    ) {
      i += 2;
      continue;
    }
    if (
      (c & 0xf8) === 0xf0 &&
      i + 3 < buf.length &&
      (buf[i + 1] & 0xc0) === 0x80 &&
      (buf[i + 2] & 0xc0) === 0x80 &&
      (buf[i + 3] & 0xc0) === 0x80
    ) {
      i += 3;
      continue;
    }
    bad.push(i);
  }
  return bad;
}

function convertLatin1FileToUtf8(file) {
  const buf = fs.readFileSync(file);
  const orphans = hasLatin1Orphans(buf);
  if (!orphans.length) return false;
  fs.writeFileSync(file, buf.toString('latin1'), 'utf8');
  return true;
}

const root = path.join(__dirname, '..', 'public');
const files = fs.readdirSync(root).filter((f) => /\.(html|js|css)$/i.test(f));
let converted = 0;
let replacements = 0;
files.forEach((f) => {
  const p = path.join(root, f);
  if (convertLatin1FileToUtf8(p)) converted++;
  const text = fs.readFileSync(p, 'utf8');
  if (text.includes('\uFFFD') || text.includes('ï¿½')) {
    console.error('REPLACEMENT_CHARS', f);
    replacements++;
  }
});

console.log('converted', converted, 'replacementFiles', replacements);
if (replacements) {
  console.error('Run: node scripts/fix-corrupt-accents.js');
  process.exit(1);
}
console.log('OK utf8 clean');
