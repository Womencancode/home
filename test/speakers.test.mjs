import test from 'node:test';
import assert from 'node:assert/strict';
import { SPEAKERS, validSpeaker, speakersEnabled, filterSpeakers } from '../src/speakers.mjs';
import { speakersRoute, speakersBlock } from '../src/pages/speakers.mjs';
import { validate } from '../src/submissions.mjs';
import { catalogue } from '../src/content.mjs';
import { searchAnswer } from '../src/ask.mjs';
import { opportunitiesPage } from '../src/pages/opportunities.mjs';
import { TYPES } from '../src/opportunities.mjs';
import { layout } from '../src/html.mjs';
import { PACK } from '../src/site.mjs';
import { HOME_BLOCKS } from '../src/pages/home.mjs';

const ada = { id: 'ada', name: 'Ada Example', role: 'Researcher', org: 'Example Lab', topics: ['ai', 'research'], country: 'GB', city: 'London', url: 'https://example.com/ada', source: 'Example News' };
const bea = { id: 'bea', name: 'Bea Example', role: 'Founder', org: 'Example Co', topics: ['business'], country: 'NG', city: null, url: 'https://example.com/bea', source: 'Example Daily' };
const q = (s) => new URLSearchParams(s);
const now = new Date('2026-10-29T12:00:00Z');
const speakerForm = { kind: 'speaker', country: 'GB', city: 'Leeds', title: 'Cara Example', creator: 'Example Institute', speaker_topic: 'ai-ethics', summary: 'Speaks about fairness in machine learning and how to audit models for bias.', url: 'https://example.com/cara', consent: 'yes', speaker_consent: 'yes' };

test('no data and no approved submissions: /speakers is 404 and there is no nav door', async () => {
  assert.equal(speakersRoute('/speakers', q(''), [], { pack: { speakers: false } }).status, 404);
  assert.equal(speakersRoute('/stories', q(''), []), null);
  assert.equal(speakersEnabled([], { speakers: false }), false);
  assert.equal(speakersBlock(4, []), '');
  if (!speakersEnabled()) assert.ok(!layout({ title: 't', path: '/', body: '' }).includes('href="/speakers"'));
  else assert.ok(layout({ title: 't', path: '/', body: '' }).includes('href="/speakers"'));
});

test('topic and country filters narrow the list, and the organiser box links to nominate', async () => {
  const all = [ada, bea];
  assert.deepEqual(filterSpeakers(all, { topic: 'ai' }).map((s) => s.id), ['ada']);
  assert.deepEqual(filterSpeakers(all, { country: 'NG' }).map((s) => s.id), ['bea']);
  const html = await speakersRoute('/speakers', q('topic=business'), all, { pack: { speakers: false } }).text();
  assert.ok(html.includes('Bea Example') && !html.includes('Ada Example'));
  assert.ok(html.includes('href="/submit?kind=speaker"') && html.includes('Organising a panel?'));
  assert.ok(html.includes('href="https://example.com/bea"'));
  const gb = await speakersRoute('/speakers', q('country=GB'), all).text();
  assert.ok(gb.includes('Ada Example') && !gb.includes('Bea Example'));
});

test('a speaker submission without consent is rejected; with it, it validates', () => {
  const { speaker_consent, ...without } = speakerForm;
  const bad = validate(without, now);
  assert.equal(bad.ok, false); assert.ok(bad.errors.speaker_consent);
  const good = validate(speakerForm, now);
  assert.equal(good.ok, true, JSON.stringify(good.errors));
  assert.equal(good.value.medium, 'ai-ethics');
  assert.equal(validate({ ...speakerForm, speaker_topic: 'cooking' }, now).ok, false);
  assert.equal(validate({ ...speakerForm, summary: `${speakerForm.summary} Write to cara@example.com.` }, now).ok, false);
});

test('an approved speaker submission shows on /speakers', async () => {
  const v = validate(speakerForm, now).value;
  const cat = catalogue([{ ...v, id: 7, status: 'approved', reviewed_at: now.toISOString(), created_at: now.toISOString() }]);
  assert.equal(cat.speakers.length, 1);
  assert.ok(!cat.stories.some((s) => s.title === 'Cara Example'));
  const html = await speakersRoute('/speakers', q('topic=ai-ethics'), cat.speakers, { pack: { speakers: false } }).text();
  assert.ok(html.includes('Cara Example') && html.includes('Example Institute'));
});

test("this site's speakers are valid: no email-like strings, http(s) urls, unique ids", () => {
  assert.equal(new Set(SPEAKERS.map((s) => s.id)).size, SPEAKERS.length);
  for (const s of SPEAKERS) {
    assert.ok(validSpeaker(s), `speaker ${s.id} is malformed`);
    assert.ok(!/[^\s@]+@[^\s@]+\.[^\s@]+/.test(JSON.stringify(s)), `${s.id} has an email-like string`);
    assert.match(s.url, /^https?:\/\//);
  }
  assert.equal(validSpeaker({ ...ada, url: 'javascript:alert(1)' }), false);
  assert.equal(validSpeaker({ ...ada, role: 'ada@example.com' }), false);
  if (SPEAKERS.length) { assert.ok(speakersEnabled()); assert.ok(HOME_BLOCKS.speakers({ cat: { speakers: [] } }).includes('href="/speakers"')); }
  assert.equal(typeof PACK.copy['speakers.lead'], 'string');
});

test('Ask routes "find a woman speaker on AI ethics" and "manel" to /speakers', () => {
  const r = searchAnswer('find a woman speaker on AI ethics', { speakersOn: true });
  assert.equal(r.results[0].href, '/speakers?topic=ai-ethics');
  assert.equal(searchAnswer('help me fix my manel about privacy', { speakersOn: true }).results[0].href, '/speakers?topic=privacy');
  assert.equal(searchAnswer('manel', { speakersOn: true }).results[0].href, '/speakers');
  assert.ok(!searchAnswer('find a speaker on ai', { speakersOn: false }).results.some((x) => x.kind === 'speakers'));
});

test('calls for speakers are an opportunity kind: chip, soonest first, passed ones hidden, and the /speakers line', async () => {
  assert.ok(TYPES.includes('cfp'));
  const base = { organiser: 'Example Conf', fields: ['ai'], remote: true, countries: [], url: 'https://example.com/cfp', checked: true };
  const items = [{ ...base, id: 'late', title: 'Late CFP', type: 'cfp', deadline: '2026-12-20' }, { ...base, id: 'soon', title: 'Soon CFP', type: 'cfp', deadline: '2026-11-05' }, { ...base, id: 'gone', title: 'Gone CFP', type: 'cfp', deadline: '2026-01-01' }, { ...base, id: 'hack', title: 'A Hack', type: 'hackathon', deadline: '2026-11-01' }];
  const html = opportunitiesPage(q('category=cfp'), { items, now });
  assert.ok(html.includes('Calls for speakers and papers'));
  assert.ok(html.includes('Soon CFP') && html.includes('Late CFP') && !html.includes('Gone CFP') && !html.includes('A Hack'));
  assert.ok(html.indexOf('Soon CFP') < html.indexOf('Late CFP'));
  assert.ok(!opportunitiesPage(q(''), { items: items.filter((o) => o.type !== 'cfp'), now }).includes('Calls for speakers and papers'));
  const withCfp = await speakersRoute('/speakers', q(''), [ada], { cfp: true }).text();
  assert.ok(withCfp.includes('href="/opportunities?category=cfp"') && withCfp.includes('Want to be on stage?'));
  assert.ok(!(await speakersRoute('/speakers', q(''), [ada], { cfp: false }).text()).includes('category=cfp'));
  assert.equal(validate({ kind: 'opportunity', country: 'GB', title: 'Example CFP', creator: 'Example Conf', opp_type: 'cfp', opp_field: 'ai', opp_deadline: '2026-12-01', summary: 'Talks wanted on applied machine learning, thirty minutes each.', url: 'https://example.com/cfp', consent: 'yes' }, now).ok, true);
});
