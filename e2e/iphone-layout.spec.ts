import { test, expect, type Page } from '@playwright/test';

/**
 * iPhone layout regression (WebKit with iPhone emulation): the time sheet must be
 * exactly as wide as the screen, and every field on the create form must stay
 * inside its card. Runs against /demo/create-layout, the real create form in the
 * /create page shell with no sign-in (never served on production).
 *
 * Run: npx playwright test --project=webkit-iphone
 */

const WIDTHS = [320, 375, 390, 430] as const;
const TOL = 0.5;

async function openCreateForm(page: Page) {
  await page.goto('/demo/create-layout', { waitUntil: 'networkidle' });
  await page.locator('#event-date').waitFor();
  await page.getByRole('checkbox', { name: /This event has a time/ }).check();
  await page.getByRole('button', { name: /^Start time,/ }).waitFor();
}

/** Every control inside a create-form card that pokes outside that card. */
async function controlsOutsideCards(page: Page) {
  return page.evaluate((tol) => {
    const bad: string[] = [];
    for (const card of Array.from(document.querySelectorAll<HTMLElement>('form > section'))) {
      const c = card.getBoundingClientRect();
      const title = card.querySelector('h2')?.textContent ?? '?';
      for (const el of Array.from(card.querySelectorAll<HTMLElement>('input:not(.sr-only), select, textarea, button'))) {
        const r = el.getBoundingClientRect();
        if (r.width === 0 && r.height === 0) continue;
        if (r.left < c.left - tol || r.right > c.right + tol) {
          const name = el.getAttribute('aria-label') || el.id || el.textContent?.trim().slice(0, 30) || el.tagName;
          bad.push(`${title}: ${name} [${r.left.toFixed(1)}, ${r.right.toFixed(1)}] outside [${c.left.toFixed(1)}, ${c.right.toFixed(1)}]`);
        }
      }
    }
    return bad;
  }, TOL);
}

for (const width of WIDTHS) {
  test.describe(`iPhone ${width}px`, () => {
    // The project already runs WebKit with iPhone 13 emulation (mobile, touch, 3x); only the width changes.
    test.use({
      viewport: { width, height: 844 },
    });

    test('create form: page has no sideways overflow and every field stays in its card', async ({ page }) => {
      await openCreateForm(page);
      // Show both date fields and an extra time so the busiest layout is checked.
      await page.getByRole('button', { name: /Make this multi-day/ }).click();
      await page.getByRole('button', { name: /Add another time/ }).click();

      const pageWidth = await page.evaluate(() => ({
        inner: window.innerWidth,
        scroll: document.documentElement.scrollWidth,
      }));
      expect(pageWidth.scroll).toBeLessThanOrEqual(pageWidth.inner);
      expect(await controlsOutsideCards(page)).toEqual([]);

      // iOS gives native date inputs an intrinsic min-width; they must be allowed to shrink.
      const dateCss = await page.locator('#event-date').evaluate((el) => {
        const cs = getComputedStyle(el);
        return { minWidth: cs.minWidth, maxWidth: cs.maxWidth, boxSizing: cs.boxSizing };
      });
      expect(dateCss).toEqual({ minWidth: '0px', maxWidth: '100%', boxSizing: 'border-box' });
    });

    test('time sheet is exactly as wide as the screen and nothing in it is clipped', async ({ page }) => {
      await openCreateForm(page);
      await page.getByRole('button', { name: /^Start time,/ }).click();
      const dialog = page.getByRole('dialog');
      await dialog.waitFor();
      // Both minute grids (quarter hours and every 5 minutes).
      for (const pass of [0, 1]) {
        if (pass === 1) await dialog.getByRole('button', { name: 'Show every 5 minutes' }).click();
        const m = await dialog.evaluate((d, tol) => {
          const r = d.getBoundingClientRect();
          const clipped = Array.from(d.querySelectorAll<HTMLElement>('button, h2, p'))
            .map((el) => ({ el, b: el.getBoundingClientRect() }))
            .filter(({ b }) => b.width > 0 && (b.left < r.left + 0 - tol || b.right > r.right + tol || b.left < -tol || b.right > window.innerWidth + tol))
            .map(({ el }) => el.getAttribute('aria-label') || el.textContent?.trim() || el.tagName);
          // Buttons in a grid must not overlap the next column.
          const overlaps: string[] = [];
          for (const g of Array.from(d.querySelectorAll<HTMLElement>('[data-sheet-group]'))) {
            if (g.scrollWidth > g.clientWidth + 1) overlaps.push(`${g.getAttribute('aria-label')} scrollWidth ${g.scrollWidth} > ${g.clientWidth}`);
          }
          return {
            left: r.left,
            width: r.width,
            inner: window.innerWidth,
            scrollWidth: d.scrollWidth,
            clientWidth: d.clientWidth,
            clipped,
            overlaps,
          };
        }, TOL);
        expect(Math.abs(m.left)).toBeLessThanOrEqual(TOL);
        expect(Math.abs(m.width - m.inner)).toBeLessThanOrEqual(TOL);
        expect(m.scrollWidth).toBeLessThanOrEqual(m.clientWidth);
        expect(m.clipped).toEqual([]);
        expect(m.overlaps).toEqual([]);
      }
      await expect(dialog.getByRole('button', { name: 'Cancel' })).toBeInViewport({ ratio: 1 });
      await expect(dialog.getByRole('button', { name: 'PM' })).toBeInViewport({ ratio: 1 });
    });

    test('time sheet follows the visible screen when the page is wider or zoomed (iOS)', async ({ page }) => {
      await openCreateForm(page);
      // Linux WebKit cannot widen its layout viewport the way iOS Safari does when
      // content sticks out, so stand in a visual viewport like the one iOS reports:
      // the visible part starts 24px in and is 1/0.88 times the screen in CSS px.
      const fake = await page.evaluate(() => {
        const scale = 0.88;
        const vv = Object.assign(new EventTarget(), {
          offsetLeft: 24,
          offsetTop: 0,
          pageLeft: 24,
          pageTop: window.scrollY,
          width: window.innerWidth / scale,
          height: window.innerHeight / scale,
          scale,
        });
        Object.defineProperty(window, 'visualViewport', { configurable: true, get: () => vv });
        return { left: vv.offsetLeft, width: vv.width };
      });
      await page.getByRole('button', { name: /^Start time,/ }).click();
      const dialog = page.getByRole('dialog');
      await dialog.waitFor();
      const r = await dialog.evaluate((d) => {
        const b = d.getBoundingClientRect();
        return { left: b.left, width: b.width };
      });
      expect(Math.abs(r.left - fake.left)).toBeLessThanOrEqual(1);
      expect(Math.abs(r.width - fake.width)).toBeLessThanOrEqual(1);
    });
  });
}

test('create-layout fixture does not POST a new event', async ({ page }) => {
  const posts: string[] = [];
  await page.route('**/api/events', async (route) => {
    if (route.request().method() === 'POST') {
      posts.push(route.request().url());
      await route.fulfill({ status: 599, body: 'blocked-by-test' });
      return;
    }
    await route.continue();
  });
  await openCreateForm(page);
  await page.locator('form').evaluate((form) => (form as HTMLFormElement).requestSubmit());
  await page.waitForTimeout(300);
  expect(posts).toEqual([]);
  await expect(page).toHaveURL(/\/demo\/create-layout/);
});
