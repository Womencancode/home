# Masthead as the header

A site can make its masthead the one header on every page. It is off by default; with it off, every page renders exactly as before.

## Setting

In the pack's `site/site.json`:

```json
"masthead": { "mode": "nav", "sticky": true }
```

- `mode`: `"nav"` turns it on. Anything else, or no key, is off.
- `sticky` (default `true`): the condensed bar sticks to the top of the window. With `false` the bar is in the page flow, and a cover page has no bar after the cover.

The wordmark is read from `cover.words` (`[{ text, accent, small }]`), the same list the magazine cover uses. A pack without `cover.words` falls back to its copy `wordmark`. The menu is the site menu (`cover.strap: "nav"`, or any value that is not a list); a list in `cover.strap` stays the cover's strapline.

## Markup

There is exactly one `<header>` element per page.

**Page with a cover** (the home page when the cover hero renders). The masthead is the header, inside the cover card:

```html
<div class="mag-cover">
  <header class="mast">
    <a class="mag-masthead" href="/" aria-label="{Site} home" translate="no"><span>Women in</span> <span class="mh-accent">Tech</span></a>
    <div class="mag-top">
      <nav class="mag-strapline" aria-label="Sections">...site menu...</nav>
      <div class="mast-side"><p class="mag-issue">...</p><div class="mast-tools">{Ask}{Language}</div></div>
    </div>
  </header>
  ...the rest of the cover...
</div>
```

Before `<main>` the page also carries the condensed bar, which is not a header:

```html
<div class="mast-bar is-sticky" data-after-cover>...bar contents...</div>
```

and in `<head>`:

```html
<noscript><style>.mast-bar[data-after-cover]{position:sticky;transform:none;visibility:visible}</style></noscript>
```

**Page without a cover.** The condensed bar is the header:

```html
<header class="mast-bar is-sticky"><div class="mast-bar-in">
  <a class="mast-brand" href="/" aria-label="{Site} home" translate="no">{words}</a>
  <!--live-moment-->
  <details class="mast-menu"><summary aria-label="Menu"><span class="mast-menu-icon" aria-hidden="true"></span><span class="mast-label">Menu</span></summary>
    <nav class="site-nav" aria-label="Main">...site menu...</nav></details>
  <div class="mast-tools">{Ask}{Language}</div>
</div></header>
```

`{Ask}` is `<button class="ask-open" aria-label="Ask" hidden>` (shown by script, since it opens a dialog). `{Language}` is the `<details class="lang-menu">` menu whose summary is labelled "Read in your language" and whose items are plain links, so it works with script off.

## Behaviour

- After a cover, the bar starts hidden (`position:fixed`, moved up, `visibility:hidden`). `app.js` watches the cover's wordmark with an IntersectionObserver and adds `is-shown` to the bar once the wordmark has left the window, removing it when it comes back. Without IntersectionObserver the bar is shown at once.
- Without script, the `<noscript>` rule puts the bar in the page above the cover, always visible.
- The menu toggle and the Language menu are `<details>` elements: they open and close with script off.
- On phones (760px and below) Menu, Ask and Language show only their icons. The words are hidden with the clip technique, not `display:none`, and every control also has an `aria-label`, so their accessible names stay.

## CSS variables

Structure lives in the engine's `public/styles.css`. A pack sets these on `:root` and adds only type (weight, case, letter spacing):

| Variable | Default | Used for |
| --- | --- | --- |
| `--mast-bg` | `var(--bg)` | bar ground, menu and Language panels |
| `--mast-ink` | `var(--ink)` | bar text and buttons |
| `--mast-accent` | `var(--accent)` | the accent word, hover and current page |
| `--mast-line` | `var(--line)` | bar rule and button borders |
| `--mast-font` | `var(--display, var(--serif))` | the bar wordmark |
| `--mast-ui-font` | `var(--sans)` | Menu, Ask and Language labels |
| `--mast-h` | `56px` | bar minimum height |
| `--mast-max` | `var(--max)` | bar content width |
| `--mast-on-cover` | `#fff` | Ask and Language text on the cover photograph |
| `--mast-on-cover-line` | white at 55% | their border on the cover |
| `--mast-on-cover-bg` | black at 30% | their ground on the cover |

Example from a pack:

```css
:root{--mast-bg:var(--paper);--mast-ink:var(--ink);--mast-line:var(--ink);--mast-accent:var(--accent);--mast-font:var(--display)}
.mast-brand{font-weight:700;text-transform:uppercase}
```

## For another site implementing the same model

1. One setting decides it; off leaves the old header untouched.
2. One `<header>` per page: the masthead when there is a cover, the condensed bar otherwise.
3. The wordmark comes from one word list shared by the cover and the bar.
4. Menu, Ask and Language render inside the masthead markup, so on a card cover they are inside the card.
5. The bar after a cover is shown by an IntersectionObserver on the wordmark, and shown outright without script.
6. Icon-only controls on phones keep their accessible names.
7. The engine ships structure and neutral defaults; colours and fonts come only from the site's variables.
