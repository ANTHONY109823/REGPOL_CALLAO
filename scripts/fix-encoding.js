/**
 * Corrige texto UTF-8 leído como Latin-1 (mojibake) en archivos HTML/JS del portal.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', 'public');

const MOJIBAKE_RE = /Ã.|â€.|âœ.|âš.|ðŸ.|â­.|â€¢|â†'|â‰|âˆ'|Ã"|Ãš|Ã‰|Ã'|Â /;

function fixMojibake(text) {
  const lines = text.split(/\r?\n/);
  return lines.map(function(line) {
    if (!MOJIBAKE_RE.test(line)) return line;
    try {
      const fixed = Buffer.from(line, 'latin1').toString('utf8');
      if (fixed.includes('\uFFFD')) return line;
      return fixed;
    } catch (e) {
      return line;
    }
  }).join('\n');
}

function fixFile(rel) {
  const file = path.join(ROOT, rel);
  if (!fs.existsSync(file)) return { rel, changed: false };
  const orig = fs.readFileSync(file, 'utf8');
  let text = orig;
  text = text.replace(/^\uFEFF/, '');
  text = text.replace(/^\?<!DOCTYPE/i, '<!DOCTYPE');
  text = fixMojibake(text);
  const changed = text !== orig.replace(/^\uFEFF/, '').replace(/^\?<!DOCTYPE/i, '<!DOCTYPE');
  if (changed) fs.writeFileSync(file, text, 'utf8');
  return { rel, changed };
}

const targets = fs.readdirSync(ROOT).filter(function(f) {
  return /\.(html|js)$/i.test(f);
});

let count = 0;
targets.forEach(function(f) {
  const r = fixFile(f);
  if (r.changed) {
    count++;
    console.log('fixed:', f);
  }
});
console.log('Total archivos corregidos:', count);
