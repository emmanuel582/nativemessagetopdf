'use strict';
const fs = require('fs');
const path = require('path');

(async () => {
  const file = process.argv[2] || 'test/sample-outlook-styled.html';
  const out = process.argv[3] || 'test/out/render-remote.pdf';
  const html = fs.readFileSync(file, 'utf8');
  const payload = JSON.stringify({
    source: html,
    format: 'A4',
    subject: 'Invoice 16073 - From CTP Plumbing and Drainage',
    from: 'intake@pinktax.com.au',
    date: '2026-10-12',
  });
  for (let i = 0; i < 5; i++) {
    try {
      const r = await fetch('https://nativemessagetopdf.onrender.com/v3/convert/pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: payload,
      });
      const b = Buffer.from(await r.arrayBuffer());
      console.log('render:', r.status, r.headers.get('content-type'), b.length, b.subarray(0, 5).toString());
      fs.mkdirSync(path.dirname(out), { recursive: true });
      fs.writeFileSync(out, b);
      break;
    } catch (e) {
      console.log('try' + i, (e.cause && e.cause.code) || e.message);
      await new Promise((r) => setTimeout(r, 15000));
    }
  }
})().catch((e) => { console.error('FAIL', e); process.exit(1); });
