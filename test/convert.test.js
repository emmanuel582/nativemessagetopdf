'use strict';
const fs = require('fs');
const path = require('path');

async function main() {
}

if (require.main === module) {
  (async () => {
    const { spawn } = require('child_process');
    const sample = fs.readFileSync(path.join(__dirname, 'sample-body-invoice.html'), 'utf8');
    const srv = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], { stdio: 'inherit' });
    await new Promise((r) => setTimeout(r, 9000));
    try {
      const res = await fetch('http://localhost:3000/v3/convert/pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source: sample, format: 'A4' }),
      });
      console.log('status', res.status, 'ct', res.headers.get('content-type'));
      const buf = Buffer.from(await res.arrayBuffer());
      console.log('bytes', buf.length, 'magic', buf.subarray(0, 5).toString());
      fs.mkdirSync(path.join(__dirname, 'out'), { recursive: true });
      fs.writeFileSync(path.join(__dirname, 'out', 'sample.pdf'), buf);
      if (!buf.subarray(0, 5).toString().startsWith('%PDF')) throw new Error('not a PDF');
      console.log('TEST PASS');
    } finally {
      srv.kill();
    }
    process.exit(0);
  })().catch((e) => { console.error('TEST FAIL', e); process.exit(1); });
}
