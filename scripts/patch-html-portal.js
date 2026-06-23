const fs = require('fs');
const path = require('path');

function walk(dir) {
  for (const f of fs.readdirSync(dir)) {
    const p = path.join(dir, f);
    if (fs.statSync(p).isDirectory()) walk(p);
    else if (f.endsWith('.html')) {
      let c = fs.readFileSync(p, 'utf8');
      const o = c;
      if (c.includes('portal.js') && !c.includes('portal-data.js')) {
        c = c.replace(
          /<script src="portal\.js\?v=\d+"><\/script>/g,
          '<script src="portal-data.js?v=1"></script>\n<script src="portal.js?v=11"></script>'
        );
      } else {
        c = c.replace(/portal\.js\?v=\d+/g, 'portal.js?v=11');
      }
      if (c !== o) {
        fs.writeFileSync(p, c);
        console.log('updated', p);
      }
    }
  }
}

walk(path.join(__dirname, '..', 'public'));
