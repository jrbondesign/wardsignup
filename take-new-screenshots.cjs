const puppeteer = require('puppeteer');
const path = require('path');

async function takeScreenshots() {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const screenshots = [
    { file: 'demo-three-dots-mobile.html', output: 'screenshot-three-dots-menu-mobile.png', width: 390, height: 900 },
    { file: 'demo-confirm-dialog-mobile.html', output: 'screenshot-confirm-dialog-mobile.png', width: 390, height: 900 },
    { file: 'demo-three-dots-desktop.html', output: 'screenshot-three-dots-menu-desktop.png', width: 1280, height: 1024 },
    { file: 'demo-confirm-dialog-desktop.html', output: 'screenshot-confirm-dialog-desktop.png', width: 1280, height: 1024 },
  ];

  for (const { file, output, width, height } of screenshots) {
    const page = await browser.newPage();
    await page.setViewport({ width, height });
    
    const htmlPath = `file://${path.join(__dirname, file)}`;
    await page.goto(htmlPath, { waitUntil: 'networkidle0' });
    
    await page.screenshot({
      path: path.join('/opt/cursor/artifacts', output),
      fullPage: false
    });
    
    console.log(`✓ ${output}`);
    await page.close();
  }

  await browser.close();
  console.log('All screenshots captured!');
}

takeScreenshots().catch(console.error);
