/* Write the Wrangler config for one environment from the bindings a deploy lane hands over, so the committed wrangler.json never carries a
 * real database id and staging can never be pointed at production storage by accident.
 *   ENVIRONMENT=preview|production BINDINGS='{"databaseId":"…","productionDatabaseId":"…","customDomain":"blackabc.com","accessTeamDomain":"…","accessAud":"…"}' node configure.mjs
 * liveUrl, previewUrl and studioUrl become LIVE_URL, PREVIEW_URL and STUDIO_URL, which the owner's page shows as the site's addresses.
 * notifyUrl becomes the NOTIFY_URL var (where sign-in mail is sent from); accessTeamDomain and accessAud, when given, become the
 * ACCESS_TEAM_DOMAIN and ACCESS_AUD vars for the optional Access door. Secrets (OWNER_EMAILS, NOTIFY_TOKEN, ADMIN_TOKEN, RATE_SALT) are
 * set on the Worker, never written here.
 * Prints the path it wrote. Refuses a staging config whose database id equals the production one. */
import { readFileSync, writeFileSync } from 'node:fs';

/* "preview" is what a person sees in Ontold before pushing live; "staging" is accepted as its older name. */
const asked = String(process.env.ENVIRONMENT || '').trim();
const environment = asked === 'staging' ? 'preview' : asked;
if (!['preview', 'production'].includes(environment)) throw Error('ENVIRONMENT must be preview or production');
const bindings = JSON.parse(process.env.BINDINGS || '{}');
if (!/^[0-9a-f-]{36}$/i.test(String(bindings.databaseId || ''))) throw Error('BINDINGS.databaseId must be a D1 database id');
if (environment === 'preview' && bindings.productionDatabaseId && bindings.productionDatabaseId === bindings.databaseId) throw Error('the preview refuses the production database');

const base = JSON.parse(readFileSync(new URL('./wrangler.json', import.meta.url), 'utf8'));
const app = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')).name;
const name = environment === 'production' ? app : `${app}-preview`;
const config = {
  ...base,
  name,
  vars: { ...base.vars, DEPLOYMENT_ENVIRONMENT: environment, ...(bindings.notifyUrl ? { NOTIFY_URL: bindings.notifyUrl } : {}), ...(bindings.liveUrl ? { LIVE_URL: bindings.liveUrl } : {}), ...(bindings.previewUrl ? { PREVIEW_URL: bindings.previewUrl } : {}), ...(bindings.studioUrl ? { STUDIO_URL: bindings.studioUrl } : {}), ...(bindings.accessTeamDomain && bindings.accessAud ? { ACCESS_TEAM_DOMAIN: bindings.accessTeamDomain, ACCESS_AUD: bindings.accessAud } : {}) },
  d1_databases: [{ binding: 'DB', database_name: name, database_id: bindings.databaseId, migrations_dir: 'migrations' }],
  /* Mail goes to the notify Worker over a service binding: a Worker calling another on the same zone by URL is not reliable. */
  services: [{ binding: 'NOTIFY', service: bindings.notifyService || 'ontold-mcp' }],
  /* Secrets (ADMIN_TOKEN, RATE_SALT, TURNSTILE_SECRET) are set on the Worker, not here; keep_vars keeps what is already set. */
  keep_vars: true,
};
if (bindings.customDomain) config.routes = [{ pattern: bindings.customDomain, custom_domain: true }, ...(environment === 'production' ? [{ pattern: `www.${bindings.customDomain}`, custom_domain: true }] : [])];
else if (environment === 'production') config.workers_dev = true;
else config.workers_dev = true;
delete config.$schema;
const out = new URL(`./wrangler.${environment}.json`, import.meta.url);
writeFileSync(out, JSON.stringify(config, null, 2) + '\n');
console.log(out.pathname);
