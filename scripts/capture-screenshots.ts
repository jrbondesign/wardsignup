import { chromium } from 'playwright';
import * as path from 'path';

async function captureScreenshots() {
  console.log('Launching browser...');
  const browser = await chromium.launch({
    headless: true
  });
  
  const context = await browser.newContext();
  const page = await context.newPage();
  
  // Load the demo HTML file
  const demoPath = path.join(__dirname, '../artifacts/alignment-fix-demo.html');
  const fileUrl = 'file://' + demoPath;
  
  console.log(`Loading demo page: ${fileUrl}`);
  await page.goto(fileUrl);
  await page.waitForLoadState('networkidle');
  
  // Ensure artifacts directory exists
  await page.evaluate(() => {
    // Wait for Tailwind to load
    return new Promise(resolve => setTimeout(resolve, 500));
  });
  
  console.log('Capturing screenshots...');
  
  // Mobile width - 390px (iPhone 12/13/14)
  console.log('  - Mobile (390px)...');
  await page.setViewportSize({ width: 390, height: 1200 });
  await page.screenshot({ 
    path: path.join(__dirname, '../artifacts/alignment-fix-mobile-390px.png'),
    fullPage: true
  });
  
  // Desktop width - 1280px
  console.log('  - Desktop (1280px)...');
  await page.setViewportSize({ width: 1280, height: 1200 });
  await page.screenshot({ 
    path: path.join(__dirname, '../artifacts/alignment-fix-desktop-1280px.png'),
    fullPage: true
  });
  
  // Capture individual sections for PR
  
  // Before section - mobile
  console.log('  - Before section (mobile)...');
  await page.setViewportSize({ width: 390, height: 1200 });
  const beforeSection = await page.locator('section').first();
  await beforeSection.screenshot({ 
    path: path.join(__dirname, '../artifacts/before-mobile.png')
  });
  
  // After section - mobile
  console.log('  - After section (mobile)...');
  const afterSection = await page.locator('section').nth(1);
  await afterSection.screenshot({ 
    path: path.join(__dirname, '../artifacts/after-mobile.png')
  });
  
  // Before section - desktop
  console.log('  - Before section (desktop)...');
  await page.setViewportSize({ width: 1280, height: 1200 });
  await beforeSection.screenshot({ 
    path: path.join(__dirname, '../artifacts/before-desktop.png')
  });
  
  // After section - desktop
  console.log('  - After section (desktop)...');
  await afterSection.screenshot({ 
    path: path.join(__dirname, '../artifacts/after-desktop.png')
  });
  
  await browser.close();
  console.log('✓ Screenshots captured successfully!');
  console.log('\nScreenshots saved to:');
  console.log('  - /workspace/artifacts/alignment-fix-mobile-390px.png');
  console.log('  - /workspace/artifacts/alignment-fix-desktop-1280px.png');
  console.log('  - /workspace/artifacts/before-mobile.png');
  console.log('  - /workspace/artifacts/after-mobile.png');
  console.log('  - /workspace/artifacts/before-desktop.png');
  console.log('  - /workspace/artifacts/after-desktop.png');
}

captureScreenshots().catch((error) => {
  console.error('Error capturing screenshots:', error);
  process.exit(1);
});
