'use strict';
const http = require('http');
const fs   = require('fs');
const path = require('path');
const dir  = path.join(__dirname, '..', 'screenshots');

if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.writeHead(200); res.end(); return; }

  if (req.method === 'POST' && req.url === '/save') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const { page, data } = JSON.parse(body);
        const b64 = data.replace(/^data:image\/(jpeg|png|jpg);base64,/, '');
        const file = path.join(dir, `${page}.jpg`);
        fs.writeFileSync(file, Buffer.from(b64, 'base64'));
        console.log(`✅ Saved: ${file} (${(b64.length * 0.75 / 1024).toFixed(0)} KB)`);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, file }));
      } catch (e) {
        console.error('Save error:', e.message);
        res.writeHead(500);
        res.end(JSON.stringify({ error: e.message }));
      }
    });
  } else {
    res.writeHead(404); res.end();
  }
});

server.listen(3001, () => console.log('📸 Screenshot receiver running on http://localhost:3001'));
