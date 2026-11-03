# Environments

How a change gets from a branch to blackabc.com. Same contract as Onloved's: `develop` is where work merges, `main` is what production runs, and nothing deploys from a laptop.

| Branch | Worker | Address | Database |
| --- | --- | --- | --- |
| `develop` | `blackabc-preview` | https://blackabc-preview.ontold.site | D1 `blackabc-preview` |
| `main` | `blackabc` | https://blackabc.ontold.site, and the owner's own domain once attached | D1 `blackabc` |

## The path of a change

1. A feature branch opens a pull request into `develop`. CI (`.github/workflows/ci.yml`, job `validate`) runs `npm test` and `npm run build`.
2. When CI is green, the `app-deploy` lane in the Ontold repository merges the PR into `develop` and deploys the exact `develop` commit to `blackabc-preview`, with `configure.mjs` writing the staging config from the staging bindings. The preview refuses the production database by construction.
3. The `app-promote` lane opens the `develop` to `main` pull request. A person reviews and merges it.
4. The `app-deploy` lane with `"environment": "production"` deploys the exact `main` commit to the `blackabc` Worker, after CI has passed on it, and applies any new migrations first.

The Ontold repository holds the Cloudflare credentials and the GitHub App that may write here. This repository holds no secrets, so a fork or a compromised dependency here cannot deploy anything.

## Secrets on the Workers

Set once per Worker with `wrangler secret put`, never in config:

- `ADMIN_TOKEN`: opens `/admin`.
- `RATE_SALT`: salts the rate-limit hash.
- `TURNSTILE_SECRET` (and the `TURNSTILE_SITE_KEY` var): the human check.
- `NATIONALFF_API_KEY` (optional): the festival directory key, for sites whose pack sets `festivalDirectory`. Without it `/festivals` shows the directory's anonymous page of five. The deploy lane does not set it; a deploy leaves a value set by hand in place.

`keep_vars` is set in generated configs so a deploy never drops a var that was set by hand.

## Migrations

`migrations/*.sql` are applied with `wrangler d1 migrations apply <database> --remote` by the deploy lanes before the Worker is deployed. Locally, `npm run migrate:local`.
