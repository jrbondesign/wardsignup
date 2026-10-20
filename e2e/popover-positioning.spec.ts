import { test, expect } from '@playwright/test';

// Helpers defined by the inline fixture page in beforeEach.
declare global {
  interface Window {
    showMenu: (buttonId: string) => void;
    menuRect: DOMRect;
    buttonRect: DOMRect;
  }
}

test.describe('Desktop popover positioning', () => {
  test.beforeEach(async ({ page }) => {
    await page.setContent(`
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
    @keyframes fade-in { from { opacity: 0; } to { opacity: 1; } }
    .animate-fade-in { animation: fade-in 0.15s ease-out; }
  </style>
</head>
<body class="bg-[#F4FAFB]">
  <div class="min-h-screen px-10 py-10">
    <div class="max-w-5xl mx-auto">
      <h1 class="font-serif text-4xl text-[#0D2B35] mb-6">Ward Potluck</h1>
      
      <div class="bg-white rounded-2xl shadow-[0_4px_24px_rgba(8,100,126,0.08)] overflow-hidden">
        <div class="px-6 py-4 border-b border-[#0E96B0]/8 bg-gradient-to-r from-[#F4FAFB] to-white">
          <h2 class="font-serif text-xl text-[#0D2B35]">Sunday, June 15, 2026</h2>
        </div>
        <div class="p-6 space-y-3">
          <div class="border border-[#0E96B0]/12 rounded-xl p-4">
            <div class="mt-3 pt-3 border-t border-[#0E96B0]/8">
              <div class="space-y-1.5">
                ${['John Smith', 'Sarah Johnson', 'Emily Rodriguez', 'Michael Chen', 'Jennifer Martinez', 'David Thompson'].map((name, i) => `
                  <div class="bg-[#F4FAFB] border border-[#0E96B0]/8 rounded-lg px-3 py-2.5 relative">
                    <div class="flex items-start gap-2 pr-10">
                      <div class="flex-1 min-w-0">
                        <div class="text-sm font-medium text-[#0D2B35]">${name}</div>
                      </div>
                    </div>
                    <button
                      id="btn-${i}"
                      type="button"
                      class="absolute top-2 right-2 w-11 h-11 flex items-center justify-center rounded-lg text-gray-500"
                    >
                      <svg viewBox="0 0 24 24" fill="currentColor" class="w-5 h-5">
                        <circle cx="12" cy="5" r="2" />
                        <circle cx="12" cy="12" r="2" />
                        <circle cx="12" cy="19" r="2" />
                      </svg>
                    </button>
                  </div>
                `).join('')}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
  
  <div id="menu" style="display: none; position: fixed; min-width: 280px; z-index: 101;" class="bg-white border border-gray-200 rounded-lg shadow-[0_8px_28px_rgba(8,100,126,0.18)]">
    <div class="p-1">
      <button type="button" class="w-full min-h-[36px] px-3 py-2 text-left text-red-600 text-sm font-medium whitespace-nowrap">
        Remove from the 5:00 to 7:00 PM slot
      </button>
    </div>
  </div>
  
  <script>
    function showMenu(buttonId) {
      const button = document.getElementById(buttonId);
      const menu = document.getElementById('menu');
      const buttonRect = button.getBoundingClientRect();
      const menuWidth = 280;
      const menuHeight = 60;
      const gap = 4;
      const viewportHeight = window.innerHeight;
      
      const spaceBelow = viewportHeight - buttonRect.bottom;
      const flipUp = spaceBelow < menuHeight + gap + 10;
      
      const left = buttonRect.right - menuWidth;
      const top = flipUp ? buttonRect.top - menuHeight - gap : buttonRect.bottom + gap;
      
      menu.style.left = left + 'px';
      menu.style.top = top + 'px';
      menu.style.display = 'block';
      
      // Store for testing
      window.menuRect = menu.getBoundingClientRect();
      window.buttonRect = buttonRect;
    }
  </script>
</body>
</html>
    `);
  });

  test('menu aligns with last row button at 1280px', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    
    // Show menu on last row (David Thompson, btn-5)
    await page.evaluate(() => window.showMenu('btn-5'));
    
    const { menuRect, buttonRect } = await page.evaluate(() => ({
      menuRect: window.menuRect,
      buttonRect: window.buttonRect
    }));
    
    console.log('1280px Last Row:');
    console.log(`  Button rect: top=${buttonRect.top}, right=${buttonRect.right}, bottom=${buttonRect.bottom}`);
    console.log(`  Menu rect: top=${menuRect.top}, right=${menuRect.right}, left=${menuRect.left}`);
    console.log(`  Gap below button: ${menuRect.top - buttonRect.bottom}px (should be 4px)`);
    console.log(`  Right edge diff: ${Math.abs(menuRect.right - buttonRect.right)}px (should be <2px)`);
    
    // Menu should be 4px below button (±2px tolerance)
    expect(Math.abs(menuRect.top - buttonRect.bottom - 4)).toBeLessThan(2);
    
    // Menu right edge should align with button right edge (±2px tolerance)
    expect(Math.abs(menuRect.right - buttonRect.right)).toBeLessThan(2);
  });

  test('menu aligns with middle row button at 1280px', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    
    // Show menu on middle row (Emily Rodriguez, btn-2)
    await page.evaluate(() => window.showMenu('btn-2'));
    
    const { menuRect, buttonRect } = await page.evaluate(() => ({
      menuRect: window.menuRect,
      buttonRect: window.buttonRect
    }));
    
    console.log('1280px Middle Row:');
    console.log(`  Button rect: top=${buttonRect.top}, right=${buttonRect.right}, bottom=${buttonRect.bottom}`);
    console.log(`  Menu rect: top=${menuRect.top}, right=${menuRect.right}, left=${menuRect.left}`);
    console.log(`  Gap below button: ${menuRect.top - buttonRect.bottom}px (should be 4px)`);
    console.log(`  Right edge diff: ${Math.abs(menuRect.right - buttonRect.right)}px (should be <2px)`);
    
    expect(Math.abs(menuRect.top - buttonRect.bottom - 4)).toBeLessThan(2);
    expect(Math.abs(menuRect.right - buttonRect.right)).toBeLessThan(2);
  });

  test('menu aligns with last row button at 1024px', async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 900 });
    
    await page.evaluate(() => window.showMenu('btn-5'));
    
    const { menuRect, buttonRect } = await page.evaluate(() => ({
      menuRect: window.menuRect,
      buttonRect: window.buttonRect
    }));
    
    console.log('1024px Last Row:');
    console.log(`  Button rect: top=${buttonRect.top}, right=${buttonRect.right}, bottom=${buttonRect.bottom}`);
    console.log(`  Menu rect: top=${menuRect.top}, right=${menuRect.right}, left=${menuRect.left}`);
    console.log(`  Gap below button: ${menuRect.top - buttonRect.bottom}px (should be 4px)`);
    console.log(`  Right edge diff: ${Math.abs(menuRect.right - buttonRect.right)}px (should be <2px)`);
    
    expect(Math.abs(menuRect.top - buttonRect.bottom - 4)).toBeLessThan(2);
    expect(Math.abs(menuRect.right - buttonRect.right)).toBeLessThan(2);
  });

  test('menu aligns with middle row button at 1024px', async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 900 });
    
    await page.evaluate(() => window.showMenu('btn-2'));
    
    const { menuRect, buttonRect } = await page.evaluate(() => ({
      menuRect: window.menuRect,
      buttonRect: window.buttonRect
    }));
    
    console.log('1024px Middle Row:');
    console.log(`  Button rect: top=${buttonRect.top}, right=${buttonRect.right}, bottom=${buttonRect.bottom}`);
    console.log(`  Menu rect: top=${menuRect.top}, right=${menuRect.right}, left=${menuRect.left}`);
    console.log(`  Gap below button: ${menuRect.top - buttonRect.bottom}px (should be 4px)`);
    console.log(`  Right edge diff: ${Math.abs(menuRect.right - buttonRect.right)}px (should be <2px)`);
    
    expect(Math.abs(menuRect.top - buttonRect.bottom - 4)).toBeLessThan(2);
    expect(Math.abs(menuRect.right - buttonRect.right)).toBeLessThan(2);
  });
});
