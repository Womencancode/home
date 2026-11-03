import test from 'node:test';
import assert from 'node:assert/strict';
import { tributesConfig, validSourced } from '../src/tributes.mjs';
import { trainConfig, trainPick } from '../src/train.mjs';
import { gapConfig } from '../src/gap.mjs';
import { KINDS, CAREER_KINDS } from '../src/store.mjs';
import { validate } from '../src/submissions.mjs';
import { roleFrom } from '../src/roles.mjs';

/* Tributes, the training calculator and the representation gap are opt-in: a pack without the setting has none of them. */
test('each feature is off unless the pack turns it on', () => {
  assert.equal(tributesConfig({}), null);
  assert.equal(trainConfig({}), null);
  assert.equal(gapConfig({}), null);
  assert.equal(tributesConfig({ tributes: { on: false } }), null);
});

test('a tribute is its own kind, never sent through the general submit form', () => {
  assert.ok(KINDS.includes('tribute') && CAREER_KINDS.includes('tribute'));
  assert.ok(validate({ kind: 'tribute', country: 'GB', title: 'Mrs A', summary: 'x'.repeat(50), consent: 'yes' }).errors.kind);
});

test('a quoted tribute needs a named person, the words and an https source', () => {
  assert.equal(validSourced({ teacher: 'Mr B', line: 'He taught me to love maths.', by: 'Someone' }), false);
  assert.equal(validSourced({ teacher: 'Mr B', line: 'He taught me to love maths.', by: 'Someone', source: { name: 'A paper', url: 'https://example.com/a' } }), true);
});

test('a figure without a source is dropped, and a gap row needs both sourced figures', () => {
  const cfg = trainConfig({ train: { countries: [{ code: 'GB', label: 'England', options: [{ id: 'x', label: 'X', figures: [{ label: 'A', amount: '£1', source: { name: 'The source', url: 'https://example.com' } }, { label: 'B', amount: '£2' }] }] }] } });
  assert.equal(cfg.countries[0].options[0].figures.length, 1);
  assert.equal(trainPick(new URLSearchParams('subject=x'), cfg).country.code, 'GB');
  const fig = { value: 5, label: 'L', release: 'R', year: '2026', url: 'https://r' };
  assert.equal(gapConfig({ gap: { rows: [{ place: 'P', teachers: fig, pupils: null }] } }), null);
  assert.equal(gapConfig({ gap: { rows: [{ place: 'P', teachers: fig, pupils: fig }] } }).rows.length, 1);
});

test('renamed roles keep their old ids through the pack aliases', () => {
  const pack = { roles: { aliases: { old: 'new-one' }, list: [{ id: 'new-one', label: 'New' }] } };
  assert.equal(roleFrom(new URLSearchParams('role=old'), pack).id, 'new-one');
  assert.equal(roleFrom(new URLSearchParams('role=new-one'), pack).id, 'new-one');
});
