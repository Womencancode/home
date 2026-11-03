# Contributing

Thank you. There are three ways in.

**Send a submission.** The quickest: https://blackabc.com/submit. No account needed. A moderator reads it and it goes up on the country page.

**Add an editors' pick.** Open a pull request that adds a line to `data/stories.json` or `data/works.json`, following `CONTENT-GUIDELINES.md`. Run `npm test` and `npm run build` first; the build checks slugs, country codes, years and copy.

**Change the site.** Branch from `develop`, keep the tests green, and open a pull request into `develop`. The page modules are plain template strings; there is no framework to learn. New routes go in `src/worker.mjs` and get a test in `test/worker.test.mjs`. Keep every page working without JavaScript.

A few house rules: no em dashes in copy, no tracking scripts, no vendor names in copy a visitor reads, and nothing that needs a secret in this repository.
