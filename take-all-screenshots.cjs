const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 }
  });
  const page = await context.newPage();
  
  // Take screenshot for spots type
  await page.goto('file:///workspace/demo-spots-type.html');
  await page.screenshot({ 
    path: '/workspace/screenshot-spots-type-390px.png',
    fullPage: true 
  });
  console.log('Screenshot saved: screenshot-spots-type-390px.png');
  
  // Take screenshot for items type
  await page.goto('file:///workspace/demo-items-type.html');
  await page.screenshot({ 
    path: '/workspace/screenshot-items-type-390px.png',
    fullPage: true 
  });
  console.log('Screenshot saved: screenshot-items-type-390px.png');
  
  // Take screenshot for RSVP type
  await page.goto('file:///workspace/demo-rsvp-type.html');
  await page.screenshot({ 
    path: '/workspace/screenshot-rsvp-type-390px.png',
    fullPage: true 
  });
  console.log('Screenshot saved: screenshot-rsvp-type-390px.png');
  
  await browser.close();
})();
