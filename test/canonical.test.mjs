import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/worker.mjs';
import { PACK } from '../src/site.mjs';
import { SITE } from '../src/html.mjs';

test('production sends <app>.ontold.site to the brand domain, unless the pack says canonical: false', async () => {
  const r = await worker.fetch(new Request(`https://${PACK.id}.ontold.site/healthz`), { DEPLOYMENT_ENVIRONMENT: 'production' }, { waitUntil() {} });
  if (PACK.canonical === false) assert.equal(r.status, 200, 'held back: the brand domain does not point here yet');
  else { assert.equal(r.status, 301); assert.equal(r.headers.get('location'), `https://${SITE.domain}/healthz`); }
  const preview = await worker.fetch(new Request(`https://${PACK.id}-preview.ontold.site/healthz`), { DEPLOYMENT_ENVIRONMENT: 'preview' }, { waitUntil() {} });
  assert.equal(preview.status, 200, 'the preview is never redirected');
});
