'use strict';

/* nativemessagetopdf
 * Drop-in pdfshift replacement for n8n "Body to PDF".
 * Former call: POST https://api.pdfshift.io/v3/convert/pdf
 *   body: { "source": "<html>…{{ $json.html_source }}…</html>", "format": "A4" }
 *   response: File -> n8n binary field "original"
 *
 * New call: POST https://<this-service>/v3/convert/pdf   (alias of /convert)
 *   with the SAME json body. Returns application/pdf bytes.
 * n8n node stays: Method POST, Send Body JSON, Response Format File,
 * Put Output in Field = original.
 *
 * Outlook fidelity: the workflow already passes $json.html_source built as
 *   <html><head><style>…</style></head>
 *   <body><h2>{subject}</h2><pre>{plain-text body}</pre></body></html>
 * Some mails arrive as full Outlook HTML instead. Both are rendered as-is,
 * only wrapped with neat A4 print CSS (no content rewriting, scripts off).
 */

const express = require('express');

const app = express();
app.use(express.json({ limit: '3mb' }));
app.use(express.urlencoded({ extended: false, limit: '3mb' }));

const PORT = process.env.PORT || 3000;
const PAGE_FORMAT = process.env.PDF_PAGE_FORMAT || 'A4';

let browserPromise = null;

async function getBrowser() {
  if (browserPromise) return browserPromise;
  browserPromise = (async () => {
    // Local Windows dev (and anyone with full Chrome): use puppeteer.
    // Render Linux: use serverless chromium build (no system deps).
    if (process.platform === 'win32' || process.env.USE_LOCAL_CHROME === '1') {
      const puppeteer = require('puppeteer-core');
      const exe =
        process.env.CHROME_PATH ||
        'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe';
      return puppeteer.launch({
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
        defaultViewport: { width: 1240, height: 1754, deviceScaleFactor: 2 },
        executablePath: exe,
        headless: 'shell',
      });
    }
    const chromium = require('@sparticuz/chromium');
    const puppeteer = require('puppeteer-core');
    const executablePath = await chromium.executablePath();
    return puppeteer.launch({
      args: [...chromium.args, '--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
      defaultViewport: { width: 1240, height: 1754, deviceScaleFactor: 2 },
      executablePath,
      headless: 'shell',
    });
  })();
  return browserPromise;
}

function pickSource(body = {}) {
  if (typeof body === 'string') return body;
  if (typeof body.source === 'string' && body.source.trim()) return body.source;
  if (typeof body.html_source === 'string' && body.html_source.trim()) return body.html_source;
  if (typeof body.html === 'string' && body.html.trim()) return body.html;
  if (typeof body.content === 'string' && body.content.trim()) return body.content;
  if (body.data && typeof body.data.source === 'string' && body.data.source.trim()) return body.data.source;
  return '';
}

function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Never touch the message itself: strip only executable bits, keep Outlook
// tables/images/branding exactly as supplied, then add print-only styling.
// An export-evidence banner (subject/from/date) is prepended outside the
// original markup so the mail design itself is untouched.
function buildDocument(sourceHtml, meta) {
  const cleaned = String(sourceHtml)
    .replace(/<script[\s\S]*?<\/script\s*>/gi, '')
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '');

  const hasHtml = /<\s*html[\s>]/i.test(cleaned);
  const banner = (meta.subject || meta.from || meta.date)
    ? `<div class="evidence"><div class="ev-subject">${escapeHtml(meta.subject || 'Email message')}</div><div class="ev-meta">${escapeHtml([meta.from, meta.date].filter(Boolean).join('  ·  '))} · exported from Outlook</div></div>`
    : '';
  const inner = hasHtml ? cleaned : `<div class="msg"><h2 class="subject">${escapeHtml(meta.subject || 'Email message')}</h2><div class="body">${cleaned}</div></div>`;

  return `<!doctype html>
<html><head><meta charset="utf-8">
<style>
  @page { size: ${PAGE_FORMAT}; margin: 12mm 10mm 14mm 10mm; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body { font: 12px/1.55 "Segoe UI", Arial, Helvetica, sans-serif; color: #1a1a1a; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .sheet { max-width: 100%; }
  .evidence { border: 1px solid #e0e0e0; border-left: 4px solid #7b1fa2; background: #faf7fd; border-radius: 6px; padding: 8px 12px; margin-bottom: 12px; }
  .ev-subject { font-size: 14px; font-weight: 700; color: #111; }
  .ev-meta { font-size: 10.5px; color: #666; margin-top: 2px; }
  h1.subject, h2.subject { font-size: 17px; line-height: 1.3; margin: 0 0 4px 0; color: #111; }
  pre { white-space: pre-wrap; overflow-wrap: anywhere; font: 12px/1.6 Consolas, "Courier New", monospace; background: #fafafa; border: 1px solid #eee; border-radius: 6px; padding: 10px 12px; margin: 0; }
  table { width: 100% !important; border-collapse: collapse; margin: 10px 0; page-break-inside: auto; }
  th, td { border: 1px solid #ddd; padding: 6px 8px; text-align: left; font-size: 11.5px; vertical-align: top; }
  th { background: #f2f2f2; }
  tr { page-break-inside: avoid; }
  img { max-width: 100% !important; height: auto !important; }
  a { color: #0b5bd3; word-break: break-all; }
  blockquote { border-left: 3px solid #ddd; margin: 8px 0; padding: 4px 10px; color: #444; }
  .footer { margin-top: 12px; font-size: 10px; color: #999; border-top: 1px solid #eee; padding-top: 6px; }
</style>
</head><body><div class="sheet">${banner}${hasHtml ? cleaned.replace(/<\s*head[\s\S]*?<\/\s*head\s*>/i, '').replace(/<\s*\/?\s*html[^>]*>/gi, '').replace(/<\s*\/?\s*body[^>]*>/gi, '') : inner}
<div class="footer">Rendered by nativemessagetopdf · ${escapeHtml(PAGE_FORMAT)} · ${new Date().toISOString().slice(0, 10)}</div>
</div></body></html>`;
}

function errorDocument(message) {
  return buildDocument(`<p><strong>Could not render message.</strong></p><p>${escapeHtml(message)}</p>`, { subject: 'Render notice' });
}

async function htmlToPdfBuffer(html) {
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await page.setContent(html, { waitUntil: ['domcontentloaded', 'networkidle0'], timeout: 25000 });
    await page.emulateMediaType('print');
    return await page.pdf({ format: PAGE_FORMAT, printBackground: true, preferCSSPageSize: false, margin: { top: '12mm', bottom: '14mm', left: '10mm', right: '10mm' }, timeout: 25000 });
  } finally {
    await page.close().catch(() => {});
  }
}

async function handleConvert(req, res) {
  const started = Date.now();
  try {
    const source = pickSource(req.body);
    const b = req.body || {};
    const d = b.data || {};
    const meta = {
      subject: b.subject || d.subject || '',
      from: b.from || d.from || b.sender || '',
      date: b.date || d.date || b.receivedDateTime || '',
    };
    // "No error": even an empty source returns a valid PDF (notice page).
    const html = source ? buildDocument(source, meta) : errorDocument('Empty source received; expected JSON like {"source":"<html>…","format":"A4"}.');
    const pdf = Buffer.from(await htmlToPdfBuffer(html));
    res.writeHead(200, {
      'Content-Type': 'application/pdf',
      'Content-Length': String(pdf.length),
      'Content-Disposition': 'inline; filename="message.pdf"',
      'X-Render-Ms': String(Date.now() - started),
    });
    return res.end(pdf);
  } catch (err) {
    try {
      const pdf = Buffer.from(await htmlToPdfBuffer(errorDocument(String((err && err.message) || err))));
      res.writeHead(200, {
        'Content-Type': 'application/pdf',
        'Content-Length': String(pdf.length),
        'Content-Disposition': 'inline; filename="message.pdf"',
        'X-Render-Error': '1',
      });
      return res.end(pdf);
    } catch (e2) {
      return res.status(500).json({ ok: false, error: String((e2 && e2.message) || e2) });
    }
  }
}

app.get('/', (req, res) => res.json({ ok: true, service: 'nativemessagetopdf', usage: 'POST /convert or POST /v3/convert/pdf with {"source":"<html>..","format":"A4"} -> application/pdf' }));
app.get('/health', (req, res) => res.json({ ok: true }));
app.post('/convert', handleConvert);
app.post('/v3/convert/pdf', handleConvert); // pdfshift-compatible alias

app.listen(PORT, () => console.log(`nativemessagetopdf listening on :${PORT}`));
