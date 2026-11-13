import assert from 'node:assert/strict';
import { test } from 'node:test';
import { classifyDemoPath, dispatchDemo, NOINDEX, ROBOTS_TXT } from '../web/lib/public-demo.ts';

test('demo paths split robots, the engine, and the page', () => {
  assert.equal(classifyDemoPath('/robots.txt'), 'robots');
  assert.equal(classifyDemoPath('/robots.txt/extra'), 'page');
  assert.equal(classifyDemoPath('/v1'), 'engine');
  assert.equal(classifyDemoPath('/v1/intake/profile'), 'engine');
  assert.equal(classifyDemoPath('/'), 'page');
  assert.equal(classifyDemoPath('/healthz'), 'page');
});

test('every demo response is noindex, and robots.txt disallows all crawlers', async () => {
  let pageCalls = 0;
  let engineCalls = 0;
  const handlers = {
    page: async () => {
      pageCalls += 1;
      return new Response('page', { status: 200, headers: { 'content-type': 'text/html' } });
    },
    engine: async () => {
      engineCalls += 1;
      return new Response('{"error":"invalid_input"}', {
        status: 400,
        headers: { 'content-type': 'application/json' },
      });
    },
  };

  const robots = await dispatchDemo(new Request('https://example.com/robots.txt'), handlers);
  assert.equal(robots.status, 200);
  assert.equal(robots.headers.get('X-Robots-Tag'), NOINDEX);
  assert.equal(await robots.text(), ROBOTS_TXT);
  assert.equal(ROBOTS_TXT, 'User-agent: *\nDisallow: /\n');

  const engine = await dispatchDemo(new Request('https://example.com/v1/intake/profile'), handlers);
  assert.equal(engine.headers.get('X-Robots-Tag'), NOINDEX);
  assert.equal(await engine.text(), '{"error":"invalid_input"}');

  const page = await dispatchDemo(new Request('https://example.com/'), handlers);
  assert.equal(page.headers.get('X-Robots-Tag'), NOINDEX);
  assert.equal(await page.text(), 'page');
  assert.equal(pageCalls, 1);
  assert.equal(engineCalls, 1);
});
