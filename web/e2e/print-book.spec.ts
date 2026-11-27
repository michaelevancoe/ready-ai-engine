import { expect, test, type Page } from '@playwright/test';
import { sundayStoryPages } from '../lib/sunday-story.ts';
import { initialVisit } from '../lib/visit.ts';
import { compact, readPdf } from './pdf-text.ts';
import { resetSavedVisit } from './walk-tree.ts';

test.beforeEach(({ request }) => resetSavedVisit(request));

const bookPages = sundayStoryPages(initialVisit()).length;
const examples = [
  [/Rowan, 7/, 'Rowan'],
  [/Maya, 5/, 'Maya'],
  [/Jonah, 9/, 'Jonah'],
] as const;

const headerFooter = {
  displayHeaderFooter: true,
  headerTemplate: '<div style="font-size:9px; width:100%; text-align:center;">Fictional demo</div>',
  footerTemplate:
    '<div style="font-size:9px; width:100%; text-align:center;"><span class="pageNumber"></span></div>',
};

test('Rowan, Maya, and Jonah print one sheet per book page', async ({ page }) => {
  expect(bookPages).toBe(8);
  test.setTimeout(300_000);
  for (const [button, name] of examples) {
    await openStory(page, button, name);
    await expectFittedBook(page, { pictures: true });
    await expectSheets(page, button, name, { format: 'Letter' });
    await expectSheets(page, button, name, { format: 'A4' }, '@page { size: A4; margin: 0.6in; }');
    await expectSheets(page, button, name, { format: 'Letter' }, '@page { size: letter; margin: 0.85in; }');
    await expectSheets(
      page,
      button,
      name,
      { format: 'Letter', ...headerFooter },
      '@page { size: letter; margin: 1in; }',
    );
  }
});

test('a max-length fictional church still prints one sheet per book page', async ({ page }) => {
  test.setTimeout(180_000);
  await openStory(page, /Rowan, 7/, 'Rowan');
  await page.emulateMedia({ media: 'screen' });
  await page.getByRole('link', { name: 'Leader' }).click();
  await page.getByRole('button', { name: 'Church settings' }).click();
  await page.getByLabel('Church name').fill(fictional(200, 'church'));
  await page.getByLabel('Service').fill(fictional(200, 'service'));
  await page.getByLabel('Room', { exact: true }).fill(fictional(200, 'room'));
  await page.getByLabel('Leader', { exact: true }).fill(fictional(200, 'leader'));
  await page.getByLabel('Plan', { exact: true }).fill(fictional(2000, 'plan'));
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByText('Saved')).toBeVisible();
  await page.getByRole('link', { name: 'Parent' }).click();
  await page.emulateMedia({ media: 'print' });
  await expectFittedBook(page, { pictures: false });
  const church = page.locator('.sunday-print-church');
  expect(await fontPt(church)).toBeCloseTo(22, 0);
  const classroom = page.locator('article.sunday-print-page').nth(4).locator('.sunday-print-sentence');
  expect(await fontPt(classroom)).toBeCloseTo(12, 0);
  await expectSheets(page, /Rowan, 7/, 'Rowan', { format: 'Letter' }, undefined, false);
  await expectSheets(page, /Rowan, 7/, 'Rowan', { format: 'A4' }, '@page { size: A4; margin: 0.6in; }', false);
  await expectSheets(
    page,
    /Rowan, 7/,
    'Rowan',
    { format: 'Letter' },
    '@page { size: letter; margin: 0.85in; }',
    false,
  );
  await expectSheets(
    page,
    /Rowan, 7/,
    'Rowan',
    { format: 'Letter', ...headerFooter },
    '@page { size: letter; margin: 1in; }',
    false,
  );
});

async function openStory(page: Page, button: RegExp, name: string): Promise<void> {
  await page.emulateMedia({ media: 'screen' });
  await page.goto('/');
  await page.getByRole('button', { name: button }).click();
  await expect(page.getByRole('button', { name: `Print ${name}'s Sunday story` })).toBeVisible();
  await page.emulateMedia({ media: 'print' });
}

async function expectSheets(
  page: Page,
  button: RegExp,
  name: string,
  options: Parameters<Page['pdf']>[0],
  inject?: string,
  reopen = true,
): Promise<void> {
  if (reopen) await openStory(page, button, name);
  else await page.emulateMedia({ media: 'print' });
  await page.evaluate((css) => {
    const current = document.getElementById('print-case');
    if (css === '') {
      current?.remove();
      return;
    }
    const style = current ?? document.createElement('style');
    style.id = 'print-case';
    style.textContent = css;
    document.head.append(style);
  }, inject ?? '');
  const bytes = await page.pdf({ printBackground: true, preferCSSPageSize: true, ...options });
  const pdf = await readPdf(bytes);
  expect(pdf.pages).toBe(bookPages);
  const packed = compact(pdf.text);
  const visible = await page
    .locator('.sunday-print-title, .sunday-print-church, .sunday-print-subtitle, .sunday-print-sentence, .sunday-print-footer')
    .allTextContents();
  for (const text of visible) expect(packed).toContain(compact(text));
}

async function expectFittedBook(page: Page, options: { pictures: boolean }): Promise<void> {
  const articles = page.locator('article.sunday-print-page');
  await expect(articles).toHaveCount(bookPages);
  const total = await articles.count();
  for (let index = 0; index < total; index += 1) {
    const article = articles.nth(index);
    const box = await article.boundingBox();
    expect(box).not.toBeNull();
    if (box === null) return;
    expect(box.height).toBeLessThanOrEqual(9 * 96 + 1);
    const footer = await article.locator('.sunday-print-footer').boundingBox();
    expect(footer).not.toBeNull();
    if (footer === null) return;
    expect(footer.y + footer.height).toBeLessThanOrEqual(box.y + box.height + 1);
    for (const selector of ['.sunday-print-sentence', '.sunday-print-title', '.sunday-print-church']) {
      const node = article.locator(selector);
      if ((await node.count()) === 0) continue;
      const metrics = await node.evaluate((element) => ({
        scroll: element.scrollHeight,
        client: element.clientHeight,
        text: (element.textContent ?? '').slice(0, 80),
      }));
      expect(metrics.scroll, metrics.text).toBeLessThanOrEqual(metrics.client + 1);
    }
    if (!options.pictures) continue;
    const picture = await article.locator('.sunday-print-picture').boundingBox();
    expect(picture).not.toBeNull();
    if (picture === null) return;
    expect(picture.height).toBeGreaterThanOrEqual(2 * 96);
  }
}

async function fontPt(node: ReturnType<Page['locator']>): Promise<number> {
  const px = await node.evaluate((element) => Number.parseFloat(getComputedStyle(element).fontSize));
  return (px * 72) / 96;
}

function fictional(length: number, label: string): string {
  const unit = `Fictional ${label} `;
  let value = '';
  while (value.length < length) value += unit;
  return value.slice(0, length);
}
