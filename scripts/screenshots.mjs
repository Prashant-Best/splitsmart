/**
 * Captures the README screenshots from a running dev stack with seeded demo data:
 *
 *   npm run dev            # database, API and web app
 *   npm run seed           # demo groups
 *   npm run reminders:send --prefix server   # writes the reminder emails to server/.outbox
 *   npm run screenshots
 *
 * Uses an installed Edge or Chrome through playwright-core (no browser download).
 */
import { mkdir, readdir } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright-core';

const BASE = process.env.BASE_URL ?? 'http://localhost:5173';
const OUT = path.resolve('docs/screenshots');
const channel = process.env.BROWSER_CHANNEL ?? (process.platform === 'win32' ? 'msedge' : 'chrome');

await mkdir(OUT, { recursive: true });
const browser = await chromium.launch({ channel });
const context = await browser.newContext({
  viewport: { width: 1360, height: 900 },
  locale: 'en-IN',
  timezoneId: 'Asia/Kolkata',
});
const page = await context.newPage();
const shot = async (name, options = {}) => {
  await page.screenshot({ path: path.join(OUT, `${name}.png`), ...options });
  console.log(`saved docs/screenshots/${name}.png`);
};
const idle = () => page.waitForLoadState('networkidle');
const pause = (ms) => page.waitForTimeout(ms);

// Sign in as the seeded demo user.
await page.goto(`${BASE}/login`);
await page.getByRole('button', { name: 'Use the demo account' }).click();
await page.waitForURL(`${BASE}/`);
await page.getByText('Your groups').waitFor();
await page.getByText(/added|paid/).first().waitFor(); // activity feed loaded
await idle();
await shot('dashboard');

// Goa trip: expenses, balances, the add-expense form and an expense with a receipt.
await page.getByRole('link', { name: /Goa Trip 2026/ }).click();
await page.getByText('Airport snacks').waitFor();
await page.getByText('Rohan Das pays you').waitFor();
await idle();
await shot('group-expenses');

await page.getByRole('tab', { name: 'Balances' }).click();
await page.getByText(/^Verified:/).waitFor();
await idle();
await shot('balances', { fullPage: true });

await page.setViewportSize({ width: 1360, height: 1080 }); // the form is taller than the default
await page.getByRole('button', { name: 'Add expense' }).first().click();
await page.getByLabel('Description').fill('Beach umbrellas');
await page.getByLabel('Amount').fill('1000');
for (const name of ['Kabir Malhotra', 'Meera Iyer', 'Rohan Das']) {
  await page.getByLabel(`Include ${name}`).uncheck();
}
await pause(300);
await shot('add-expense');
await page.keyboard.press('Escape');
await page.setViewportSize({ width: 1360, height: 900 });

await page.getByRole('tab', { name: 'Expenses' }).click();
await page.getByText('Dinner at Sea Breeze Shack').click();
await page.getByRole('img', { name: /Receipt for/ }).waitFor();
await pause(300);
await shot('expense-detail');
await page.keyboard.press('Escape');

// Flat 302: Prashant owes money here, so he gets a UPI QR code to pay.
await page.goto(`${BASE}/`);
await page.getByRole('link', { name: /Flat 302/ }).click();
await page.getByRole('heading', { name: 'Flat 302' }).waitFor();
await page.getByRole('button', { name: /^Pay/ }).first().click();
await page.getByTestId('upi-link').waitFor();
await pause(300);
await shot('settle-up-upi');
await page.keyboard.press('Escape');

await page.getByRole('tab', { name: 'Insights' }).click();
await page.locator('.recharts-label-list text').first().waitFor();
await pause(300);
await shot('insights', { fullPage: true });

// Phone-sized layout.
const phone = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
  locale: 'en-IN',
  timezoneId: 'Asia/Kolkata',
  storageState: await context.storageState(),
});
const phonePage = await phone.newPage();
await phonePage.goto(page.url().replace(/\?.*$/, '?tab=balances'));
await phonePage.getByText(/^Verified:/).waitFor();
await phonePage.screenshot({ path: path.join(OUT, 'mobile.png') });
console.log('saved docs/screenshots/mobile.png');

// The weekly reminder email, as saved by the development mailer.
const outbox = path.resolve('server/.outbox');
const emails = (await readdir(outbox).catch(() => [])).filter((f) => f.includes('prashant')).sort();
if (emails.length > 0) {
  await page.setViewportSize({ width: 760, height: 330 });
  await page.goto(pathToFileURL(path.join(outbox, emails[emails.length - 1])).href);
  await shot('reminder-email', { fullPage: true });
} else {
  console.log('No reminder email in server/.outbox; run `npm run reminders:send --prefix server` first.');
}

await browser.close();
