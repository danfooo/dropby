import { chromium } from 'playwright';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const logoSvg = readFileSync(join(__dirname, 'client/public/logo.svg'), 'utf8');
const logoDataUri = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(logoSvg)}`;

const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    width: 1200px;
    height: 630px;
    background: #ffffff;
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  }
  .card {
    width: 1200px;
    height: 630px;
    background: #f9fafb;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 28px;
    position: relative;
    overflow: hidden;
  }
  .card::before {
    content: '';
    position: absolute;
    top: -180px;
    right: -180px;
    width: 500px;
    height: 500px;
    background: radial-gradient(circle, #d1fae5 0%, transparent 70%);
  }
  .card::after {
    content: '';
    position: absolute;
    bottom: -160px;
    left: -160px;
    width: 420px;
    height: 420px;
    background: radial-gradient(circle, #d1fae5 0%, transparent 70%);
  }
  .logo {
    width: 96px;
    height: 96px;
  }
  .wordmark {
    font-size: 72px;
    font-weight: 700;
    color: #111827;
    letter-spacing: -2px;
  }
  .tagline {
    font-size: 28px;
    color: #6b7280;
    font-weight: 400;
    letter-spacing: -0.3px;
  }
  .dot {
    color: #10b981;
  }
</style>
</head>
<body>
<div class="card">
  <img class="logo" src="${logoDataUri}" />
  <div class="wordmark">dropby<span class="dot">.</span></div>
  <div class="tagline">Spend more time with friends.</div>
</div>
</body>
</html>`;

const browser = await chromium.launch();
const page = await browser.newPage();
await page.setViewportSize({ width: 1200, height: 630 });
await page.setContent(html, { waitUntil: 'networkidle' });
await page.screenshot({ path: join(__dirname, 'client/public/og-image.png'), type: 'png' });
await browser.close();

console.log('✓ og-image.png generated');
