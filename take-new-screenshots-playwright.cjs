const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

async function takeScreenshots() {
  // Ensure artifacts directory exists
  const artifactsDir = '/opt/cursor/artifacts';
  if (!fs.existsSync(artifactsDir)) {
    fs.mkdirSync(artifactsDir, { recursive: true });
  }

  const browser = await chromium.launch({
    headless: true,
  });

  const screenshots = [
    { file: 'demo-three-dots-mobile.html', output: 'screenshot-three-dots-menu-mobile.png', width: 390, height: 900 },
    { file: 'demo-confirm-dialog-mobile.html', output: 'screenshot-confirm-dialog-mobile.png', width: 390, height: 900 },
    { file: 'demo-three-dots-desktop.html', output: 'screenshot-three-dots-menu-desktop.png', width: 1280, height: 1024 },
    { file: 'demo-confirm-dialog-desktop.html', output: 'screenshot-confirm-dialog-desktop.png', width: 1280, height: 1024 },
  ];

  for (const { file, output, width, height } of screenshots) {
    const page = await browser.newPage();
    await page.setViewportSize({ width, height });
    
    const htmlPath = `file://${path.join(__dirname, file)}`;
    await page.goto(htmlPath, { waitUntil: 'networkidle' });
    
    // Wait a bit for animations/fonts to load
    await page.waitForTimeout(500);
    
    await page.screenshot({
      path: path.join(artifactsDir, output),
      fullPage: false
    });
    
    console.log(`✓ ${output}`);
    await page.close();
  }

  await browser.close();
  console.log('All screenshots captured!');
}

takeScreenshots().catch(console.error);
