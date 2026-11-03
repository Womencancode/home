# Ontold MCP in the site admin

The site owner can use the full Ontold MCP tool surface from `/admin/ontold`,
as their own Ontold account. Visitors get nothing yet.

Switch it on per pack in `site/site.json`:

```json
"ontold": { "mcp": true }
```

Optional keys: `tools` (an allow-list of tool names; empty means every tool
Ontold lists for the connection), `scopes` (OAuth scopes to ask for; empty means
Ontold's full set, which the owner still reviews on the consent page) and
`origin` (`https://ontold.com` by default; only ontold.com or a host under it,
such as `https://staging.ontold.com`, is accepted, never a `.site` address).

Off (no key, or `mcp` not exactly `true`) means no route, no admin link and no
outbound call. The rendered pages are byte-identical to a site without the code.

Code: `src/partners/ontold.mjs`. Tests: `test/ontold.test.mjs`.

## What exists upstream, and what this uses

There are two Ontold MCP servers in the repo:

1. `https://ontold.com/mcp` (`platform/src/modules/images/lib/mcp.js`,
   `mcp-ontold.js`). This is the one ChatGPT and Claude use, with `quote`,
   `make`, `list_skills`, `search_library`, `list_library` and the rest. Every
   call needs an OAuth access token a signed-in person granted
   (`oauth.principal`, `oimg_...`). There is no anonymous tool.
2. The `ontold-mcp` Worker (`workers/mcp`), bound to every site as `env.NOTIFY`.
   The sites use it only for sign-in mail at `/notify` with `NOTIFY_TOKEN`. Its
   `/mcp` has a different, smaller tool set, needs an API token, the operator
   header or `MCP_TOKEN`, and answers 410 on any `*.ontold.site` host. The
   binding authorises nothing on `/mcp`, so this feature does not use it.

Account linking is the one in `platform/src/modules/images/lib/oauth.js`, the
same door ChatGPT and Claude go through: OAuth 2.1, a public client registered
with RFC 7591 (`/oauth/register`), `/oauth/authorize` with PKCE S256, and
`/oauth/token` (access tokens last an hour; refresh tokens 30 days, rotate, and
a grant ends after 90 days, when the owner connects again). Any https return
address is accepted, so a site Worker can be a client without upstream changes.

## The flow

1. The owner signs in to `/admin` with the emailed link (`OWNER_EMAILS`).
2. `/admin/ontold` shows **Connect Ontold**. The site registers itself once as a
   client (`<site name> admin`, return address
   `https://<site>/admin/ontold/callback`), stores a sealed PKCE verifier under
   a random state, and sends the owner to ontold.com.
3. On ontold.com the owner signs in and approves. The consent page marks the
   client as unverified, which is honest: it is not ChatGPT or Claude.
4. The callback checks the state was issued by this site, is under ten minutes
   old and belongs to the same owner, then trades the code for tokens.
5. Every later call is JSON-RPC to `<origin>/mcp` with the owner's bearer,
   refreshing it when it has run out.

The page offers a **Make something** form (`quote`, then a **Yes, make it**
button that calls `make` with `confirm` set to the quote just shown) and a
generic runner for every tool Ontold lists (`tools/list`).

## Trust model

- **Who may act:** only an owner signed in by email. The `ADMIN_TOKEN` cookie is
  not a person and is refused. Each owner links their own account, stored under
  a hash of their email. `principalFor()` is the single place this is decided.
- **Where the token lives:** D1 `site_settings`, sealed with AES-256-GCM under a
  key derived (HKDF) from the existing `RATE_SALT` secret. No new secret. It is
  never written to a page, a cookie, a URL or a log. Without `RATE_SALT` the
  site refuses to connect rather than store it in the clear. Rotating
  `RATE_SALT` just means connecting again.
- **Spending:** the site never decides to spend. `quote` is free and returns a
  price. `make` runs only when the owner presses yes on that quote; Ontold
  itself refuses a paid job without a `confirm`, and any `approval_needed` link
  it returns is shown to the owner as **Approve on Ontold**.
- **Forgery:** POSTs with a foreign `Origin` are refused; the owner cookie is
  `SameSite=Lax` and scoped to `/admin`. Connect is a link (GET), because the
  site's CSP has `form-action 'self'`.
- **Ending it:** **Disconnect Ontold** deletes the sealed link and revokes the
  refresh token at `/oauth/revoke`. A 401 from Ontold, or a refused refresh,
  deletes it too. The owner can also revoke it on ontold.com.

## Known limits

- Refresh tokens rotate, and Ontold treats a reused one as copied and ends the
  grant. Two admin tabs refreshing at the very same moment can therefore end the
  connection; the owner then connects again. Nothing is spent or leaked.
- Staging (`staging.ontold.com`) sits behind Cloudflare Access with only `/mcp`
  bypassed. If `/oauth/*` is not bypassed too, connecting to staging will not
  work from a site Worker; production `ontold.com` has no such gate.
- Not exercised against the live ontold.com from here: the tests use a mocked
  Ontold that follows the platform's OAuth and MCP code.

## Visitors, later

Nothing for visitors now. To open it to signed-in visitors with their own Ontold
accounts: give `principalFor()` a visitor session (returning
`{ kind: 'visitor', id }`), add a visitor return address, and keep the same
calls. Links are already keyed by `kind` and id, so no visitor can reach an
owner's link. Spending stays with each person's own quote and approval.

## Other Ontold wiring the sites already had (unchanged)

- Create hero "Make it" (`pack.create.composer`): `GET /create` sends the brief
  to `https://ontold.com/?compose=...`, which `App.tsx` feeds into the normal
  intake. No sign-in on the site.
- Ask (`/api/ask`): searches the site's own data; an optional written answer
  from `AI_ENGINE_URL` when `AI_ENGINE` is `on`. No deploy sets these.
- `STUDIO_URL`: the owner's link to the app in Ontold, on `/admin`.
