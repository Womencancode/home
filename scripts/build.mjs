/* The build: prove the data is sound and the Worker bundles. There is no compile step for the pages, so "build" means the checks a deploy
 * must pass: every record well formed, every country code real, no duplicate slugs, no em dashes in copy, and a dry-run bundle. */
import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const read = (p) => JSON.parse(readFileSync(new URL(`../${p}`, import.meta.url), 'utf8'));
const countries = read('data/countries.json');
const stories = read('data/stories.json');
const works = read('data/works.json');
const codes = new Set(countries.map((c) => c.code));
const problems = [];
const year = new Date().getUTCFullYear() + 1;

if (codes.size !== countries.length) problems.push('duplicate country codes');
for (const c of countries) if (!/^[A-Z]{2}$/.test(c.code) || !c.name || !c.region || !c.subregion) problems.push(`country malformed: ${JSON.stringify(c)}`);

const slugs = new Set();
const check = (kind, list, fields) => {
  for (const r of list) {
    const where = `${kind} ${r.slug || '(no slug)'}`;
    if (!/^[a-z0-9-]{3,80}$/.test(r.slug || '')) problems.push(`${where}: bad slug`);
    if (slugs.has(r.slug)) problems.push(`${where}: duplicate slug`); slugs.add(r.slug);
    if (!codes.has(r.country)) problems.push(`${where}: unknown country ${r.country}`);
    if (!Number.isInteger(r.year) || r.year < 1000 || r.year > year) problems.push(`${where}: bad year`);
    for (const f of fields) if (typeof r[f] !== 'string' || r[f].trim().length < 3) problems.push(`${where}: missing ${f}`);
    if (JSON.stringify(r).includes('—')) problems.push(`${where}: em dash in copy`);
    if (r.url && !/^https?:\/\//.test(r.url)) problems.push(`${where}: url must be absolute`);
  }
};
check('story', stories, ['title', 'summary', 'category']);
check('work', works, ['title', 'creator', 'blurb', 'medium']);
for (const s of stories) if (!Array.isArray(s.people)) problems.push(`story ${s.slug}: people must be a list`);

/* A pack with the job board on lists only jobs that show their pay, link to the employer's own posting and say when they were checked. */
const site = read('site/site.json');
if (site.careers && site.careers.jobs) {
  const { jobProblems } = await import('../src/jobs.mjs');
  for (const o of read('data/opportunities.json').filter((x) => x.type === 'job')) for (const p of jobProblems(o)) problems.push(`job ${o.id}: ${p}`);
}

if (problems.length) { console.error(problems.join('\n')); process.exit(1); }
console.log(`data ok: ${countries.length} countries, ${stories.length} stories, ${works.length} works`);

/* The bundle, without deploying. Skipped when wrangler is not installed (a data-only check) and when BUILD_SKIP_BUNDLE=1. */
if (process.env.BUILD_SKIP_BUNDLE !== '1' && existsSync(new URL('../node_modules/wrangler', import.meta.url))) {
  mkdirSync(new URL('../dist', import.meta.url), { recursive: true });
  execFileSync('npx', ['wrangler', 'deploy', '--dry-run', '--outdir', 'dist'], { stdio: 'inherit', cwd: new URL('..', import.meta.url) });
  console.log('bundle ok');
} else console.log('bundle skipped (wrangler not installed or BUILD_SKIP_BUNDLE=1)');
