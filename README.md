# nativemessagetopdf

Self-hosted replacement for `POST https://api.pdfshift.io/v3/convert/pdf`, for the n8n **Body to PDF** step.

## n8n wiring (unchanged shape)

* Method: `POST`
* URL: `https://<your-render-service>.onrender.com/v3/convert/pdf`
* Authentication: None (or your own header)
* Send Body: JSON — `{{ JSON.stringify({source:$json.html_source,format:"A4"}) }}`
* Response: Format `File`, Put Output in Field `original`

The service accepts the same payload (`source`, also `html_source` / `html` / `content`) and returns `application/pdf` bytes, so the downstream binary field behaves exactly like pdfshift. It never throws on bad input — an empty source renders a one-page notice PDF (HTTP 200), so the n8n run keeps flowing.

## Rendering

* Outlook HTML is passed through untouched (only `<script>` + inline event handlers stripped).
* Plain `html_source` wrappers (`h2` + `pre`) get neat A4 print CSS: readable fonts, wrapped pre, bordered tables, responsive images, repeated table headers, footer date.
* Engine: headless Chromium (`@sparticuz/chromium` on Render, `puppeteer-core`), `size: A4`, margins `12/10/14mm`, backgrounds printed.

## Local dev

```bash
npm install
node server.js          # :3000
curl -X POST localhost:3000/convert -H "Content-Type: application/json" -d "{\"source\":\"<h1>hi</h1>\"}" --output out.pdf
```

## Render deploy

Push this repo, then Render → New Web Service → select repo:

* Build: `npm install`
* Start: `node server.js`

`render.yaml` is included. No API key needed (add your own header check in `server.js` if you want one).
