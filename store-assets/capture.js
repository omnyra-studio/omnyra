/**
 * Omnyra AI — App Store Asset Capture
 *
 * Exports all store assets to /store-assets/output/ as PNG files.
 *
 * Usage:
 *   cd store-assets
 *   npm install
 *   node capture.js
 *
 * Outputs:
 *   output/icons/app-icon-1024x1024.png
 *   output/icons/play-store-icon-512x512.png
 *   output/feature/feature-graphic-1024x500.png
 *   output/ios/01-home-1290x2796.png
 *   output/ios/02-script-1290x2796.png
 *   output/ios/03-voice-1290x2796.png
 *   output/ios/04-image-1290x2796.png
 *   output/ios/05-avatar-1290x2796.png
 *   output/android/01-home-1080x1920.png
 *   output/android/02-script-1080x1920.png
 *   output/android/03-voice-1080x1920.png
 *   output/android/04-image-1080x1920.png
 *   output/android/05-avatar-1080x1920.png
 */

const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

const ROOT = __dirname;

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function fileUrl(rel) {
  const abs = path.resolve(ROOT, rel);
  return 'file:///' + abs.replace(/\\/g, '/');
}

async function captureHtml(page, htmlPath, outputPath, width, height, dpr = 1) {
  await page.setViewport({ width, height, deviceScaleFactor: dpr });
  await page.goto(fileUrl(htmlPath), { waitUntil: 'networkidle2', timeout: 15000 });
  await new Promise(r => setTimeout(r, 500)); // allow animations to settle
  await page.screenshot({ path: outputPath, type: 'png', fullPage: false });
  console.log(`  ✓ ${path.relative(ROOT, outputPath)}`);
}

async function captureSvg(page, svgPath, outputPath, width, height) {
  const svgContent = fs.readFileSync(path.resolve(ROOT, svgPath), 'utf8');
  const html = `<!DOCTYPE html><html><head><style>
    *{margin:0;padding:0;box-sizing:border-box;}
    body{width:${width}px;height:${height}px;overflow:hidden;background:transparent;}
    svg{display:block;}
  </style></head><body>${svgContent}</body></html>`;
  const tmpPath = path.resolve(ROOT, '_tmp_icon.html');
  fs.writeFileSync(tmpPath, html);
  await page.setViewport({ width, height, deviceScaleFactor: 1 });
  await page.goto('file:///' + tmpPath.replace(/\\/g, '/'), { waitUntil: 'networkidle0' });
  await page.screenshot({ path: outputPath, type: 'png', omitBackground: false });
  fs.unlinkSync(tmpPath);
  console.log(`  ✓ ${path.relative(ROOT, outputPath)}`);
}

const SCREENS = [
  { file: 'screens/01-home.html',   name: '01-home'   },
  { file: 'screens/02-script.html', name: '02-script' },
  { file: 'screens/03-voice.html',  name: '03-voice'  },
  { file: 'screens/04-image.html',  name: '04-image'  },
  { file: 'screens/05-avatar.html', name: '05-avatar' },
];

// iOS: 1290x2796 = 430 × 932 @3x
const IOS_VIEWPORT = { w: 430, h: 932, dpr: 3 };

// Android: 1080x1920 = 360 × 640 @3x
const ANDROID_VIEWPORT = { w: 360, h: 640, dpr: 3 };

async function main() {
  console.log('\n Omnyra AI — generating store assets…\n');

  ensureDir(path.join(ROOT, 'output/icons'));
  ensureDir(path.join(ROOT, 'output/feature'));
  ensureDir(path.join(ROOT, 'output/ios'));
  ensureDir(path.join(ROOT, 'output/android'));

  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  const page = await browser.newPage();

  // ── Icons ──────────────────────────────────────────────────────────────
  console.log('Icons:');
  await captureSvg(page, 'icons/app-icon-1024.svg',
    path.join(ROOT, 'output/icons/app-icon-1024x1024.png'), 1024, 1024);
  await captureSvg(page, 'icons/play-store-icon-512.svg',
    path.join(ROOT, 'output/icons/play-store-icon-512x512.png'), 512, 512);

  // ── Feature graphic ────────────────────────────────────────────────────
  console.log('\nFeature graphic:');
  await captureHtml(page, 'feature/feature-graphic.html',
    path.join(ROOT, 'output/feature/feature-graphic-1024x500.png'), 1024, 500);

  // ── iOS screenshots (1290×2796 = 430×932 @3x) ─────────────────────────
  console.log('\niOS screenshots (1290×2796):');
  for (const s of SCREENS) {
    await captureHtml(page, s.file,
      path.join(ROOT, `output/ios/${s.name}-1290x2796.png`),
      IOS_VIEWPORT.w, IOS_VIEWPORT.h, IOS_VIEWPORT.dpr);
  }

  // ── Android screenshots (1080×1920 = 360×640 @3x) ─────────────────────
  console.log('\nAndroid screenshots (1080×1920):');
  for (const s of SCREENS) {
    await captureHtml(page, s.file,
      path.join(ROOT, `output/android/${s.name}-1080x1920.png`),
      ANDROID_VIEWPORT.w, ANDROID_VIEWPORT.h, ANDROID_VIEWPORT.dpr);
  }

  await browser.close();
  console.log('\n Done! All assets saved to store-assets/output/\n');
}

main().catch(err => { console.error(err); process.exit(1); });
