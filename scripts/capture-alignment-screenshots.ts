import { chromium } from '@playwright/test';

async function captureScreenshots() {
  const browser = await chromium.launch();
  const context = await browser.newContext();
  
  // Create two pages - one for before, one for after
  const beforePage = await context.newPage();
  const afterPage = await context.newPage();
  
  // Navigate to admin page (assuming we have test data)
  const testEventId = process.env.TEST_EVENT_ID || 'test-event-id';
  const url = `http://localhost:3000/admin/${testEventId}`;
  
  console.log('Capturing "before" screenshots (with top-2 positioning)...');
  
  // Before: inject old CSS
  await beforePage.goto(url);
  await beforePage.waitForLoadState('networkidle');
  
  // Override the button positioning to simulate "before" state
  await beforePage.addStyleTag({
    content: `
      .relative button[aria-label^="Options for"] {
        top: 0.5rem !important;
        transform: none !important;
      }
    `
  });
  
  // Capture iPhone width (390px)
  await beforePage.setViewportSize({ width: 390, height: 844 });
  await beforePage.screenshot({ 
    path: '/workspace/artifacts/before-mobile-390px.png',
    fullPage: false
  });
  
  // Capture desktop width (1280px)
  await beforePage.setViewportSize({ width: 1280, height: 800 });
  await beforePage.screenshot({ 
    path: '/workspace/artifacts/before-desktop-1280px.png',
    fullPage: false
  });
  
  console.log('Capturing "after" screenshots (with top-1/2 -translate-y-1/2 positioning)...');
  
  // After: use actual current CSS (our fix)
  await afterPage.goto(url);
  await afterPage.waitForLoadState('networkidle');
  
  // Capture iPhone width (390px)
  await afterPage.setViewportSize({ width: 390, height: 844 });
  await afterPage.screenshot({ 
    path: '/workspace/artifacts/after-mobile-390px.png',
    fullPage: false
  });
  
  // Capture desktop width (1280px)
  await afterPage.setViewportSize({ width: 1280, height: 800 });
  await afterPage.screenshot({ 
    path: '/workspace/artifacts/after-desktop-1280px.png',
    fullPage: false
  });
  
  await browser.close();
  console.log('Screenshots captured successfully!');
}

captureScreenshots().catch(console.error);
