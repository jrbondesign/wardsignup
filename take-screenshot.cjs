const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 }
  });
  const page = await context.newPage();
  await page.goto('file:///workspace/demo-mobile-remove-button.html');
  await page.screenshot({ 
    path: '/workspace/mobile-remove-button-demo.png',
    fullPage: true 
  });
  await browser.close();
  console.log('Screenshot saved to mobile-remove-button-demo.png');
})();
