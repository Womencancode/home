# WomenCanCode

**Women who build real software with AI, and understand it well enough to own it.** womencancode.com, built on the ABC engine on top of the
WomenABC pack. The courses belong to their providers (freeCodeCamp, The Odin Project, Harvard CS50, MDN, Python for Everybody,
GitHub Skills): we link to them, credit them and never copy them.

| Path | What it does |
| --- | --- |
| `src/wcc.mjs` | The Worker entry: wraps the engine's Worker, adds the home blocks, `/tracks` and `/live`, and the menu links. |
| `src/tracks.mjs` | Tracks, track pages, `/live` and the About your instructor block. |
| `data/tracks.json` | One free course per track, with the quote from its own page that says it is free, and when it was checked. |
| `site/site.json` | Copy, the home layout, `school` (hero, steps, instructor), and `cohorts` with the 10-day `challenge`. |
| `src/build.mjs` | Home blocks: the describe-what-you-want box (server answer, mirrored by `public/wcc-build.js`), instructor, examples, Wave 1 groups, tools, go deeper, the free product. |
| `src/finale.mjs` | Day 10 finale, `/certificate/<id>`, `/awards`, `/winners/<wave>`, `/ideas`, resources by level. |
| `src/credential.mjs` | Open Badges 3.0 credentials: JCS canonicalisation, the eddsa-jcs-2022 Data Integrity proof (Ed25519, WebCrypto only), Multikey, did:web, hashed recipient, the LinkedIn add-to-profile link. |
| `src/certificates.mjs` | `/certificate/<id>` (A4 landscape), `.json`, `/badge.svg` (baked), `/card.svg` (1200x627), `/verify/<id>`, `/.well-known/did.json`, `/credentials/revocations`. |
| `src/certadmin.mjs`, `src/certstore.mjs`, `migrations/0014_credentials.sql` | `/admin/certificates`: owner-only approve, issue (sign and store in D1), revoke. |
| `src/certifications.mjs`, `data/certifications.json` | `/certifications`, the optional `wcc-certifications` home block, "Your instructor's progress", and `/admin/certifications` (show/hide and done, in `site_settings`). |
| `public/examples/` | Real example pages and their Playwright screenshots (`shots/`). |
| `public/skin.css` | The workbench skin: paper, ink, violet and lime. |
| `COHORTS.md` | The fields the founder fills in. |

## The certificate signing key

The private key is the Worker secret `WCC_ISSUER_KEY` (an Ed25519 private JWK). Nobody pastes it anywhere. Push
`{"app": "womencancode", "nonce": 1}` to `.github/dispatch-requests/issuer-key.json` (or run `issuer-key.yml` from the Actions tab): the
runner makes the key, stores it only as the repository secret `WOMENCANCODE_ISSUER_KEY`, and prints the public key in the run summary.
The next deploy (`app-deploy.yml`) hands it to the Worker. If the run cannot write secrets, it discards the key and its summary gives
the by-hand steps. Rotating the key makes every earlier certificate fail to verify, so do it only with `replace: true` on purpose.
