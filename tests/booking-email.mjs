// Checks the booking form's email sending with FormSubmit faked, so no real email is sent.
// Run: npm i --no-save playwright && npx playwright install chromium && node tests/booking-email.mjs
// (set CHROMIUM_PATH to use a browser you already have)
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const sendingHtml = html.replace("const BOOKING_EMAIL = '';", "const BOOKING_EMAIL = 'test@example.com';");
assert.notEqual(sendingHtml, html, 'BOOKING_EMAIL line not found in index.html');

const ok = { status: 200, contentType: 'application/json', body: '{"success":"true","message":"sent"}' };
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });

async function open(pageHtml, reply) {
  const page = await browser.newPage(), sent = [];
  page.on('pageerror', e => { throw e; });
  await page.route('https://formsubmit.co/**', r => { sent.push(r.request().postDataJSON()); return reply(r); });
  await page.setContent(pageHtml);
  await page.click('#sampleBtn');
  await page.click('#bookForm button[type=submit]');
  return { page, sent };
}

// Success: one email, confirmation shown.
{
  const { page, sent } = await open(sendingHtml, r => r.fulfill(ok));
  await page.waitForSelector('#confirmCard:not([hidden])');
  const ref = await page.textContent('#refNo');
  assert.equal(sent.length, 1);
  assert.equal(sent[0]._subject, `New booking inquiry ${ref}`);
  assert.equal(sent[0].Name, 'Thandi Mokoena');
  assert.match(await page.textContent('#confirmNote'), /emailed/);

  // Editing and resending keeps the same reference and says "Updated".
  await page.click('#editBtn');
  await page.fill('#fPhone', '082 555 0199');
  await page.click('#bookForm button[type=submit]');
  await page.waitForSelector('#confirmCard:not([hidden])');
  assert.equal(sent.length, 2);
  assert.equal(sent[1]._subject, `Updated booking inquiry ${ref}`);
  assert.equal(sent[1].Phone, '082 555 0199');
  assert.equal(await page.textContent('#refNo'), ref);
  await page.close();
}

// Failures: no confirmation, error shown, typed data kept.
for (const [name, reply] of [
  ['not activated', r => r.fulfill({ status: 200, contentType: 'application/json', body: '{"success":"false","message":"This form needs Activation."}' })],
  ['server error', r => r.fulfill({ status: 500, body: 'oops' })],
  ['offline', r => r.abort()],
]) {
  const { page } = await open(sendingHtml, reply);
  await page.waitForFunction(() => document.querySelector('#formStatus').textContent);
  assert.ok(await page.isHidden('#confirmCard'), `${name}: confirmation must not show`);
  assert.match(await page.textContent('#formStatus'), /couldn't be sent/, name);
  assert.equal(await page.inputValue('#fName'), 'Thandi Mokoena', `${name}: form data kept`);
  assert.ok(await page.isEnabled('#bookForm button[type=submit]'), `${name}: button usable again`);
  await page.close();
}

// Demo mode (empty address): nothing is sent.
{
  const { page, sent } = await open(html, r => r.fulfill(ok));
  await page.waitForSelector('#confirmCard:not([hidden])');
  assert.equal(sent.length, 0);
  assert.match(await page.textContent('#confirmNote'), /nothing was sent/);
  await page.close();
}

await browser.close();
console.log('booking-email: all checks passed');
