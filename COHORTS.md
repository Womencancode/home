# Women Can Code: what you fill in

Everything lives in `site/site.json` (certificates in `data/certificates.json`). After an edit, run `node scripts/apps/compose.mjs womencancode` from the Ontold repo. Leave a field empty rather than guess: the site shows "To be announced" or "Terms to be confirmed" until you fill it.

## Wave 1: two groups (`cohorts.items`, Night Owls first)

| Field | What to put | Until you fill it in |
| --- | --- | --- |
| `eventbrite` | Each group's own Eventbrite page (`https://www.eventbrite.…`). | "Booking opens soon" and "Tell me when it opens". |
| `schedule` | When the calls are. Night Owls has a hint, "evenings, UK time, to be announced", shown until you set it. | The hint, or "To be announced". |
| `starts` | First call, `YYYY-MM-DD`. | "To be announced" |
| `seats` | Places, a whole number. | "To be announced" |

Price: £47 a month through Eventbrite (`cohorts.price`).

## The 10 days (`cohorts.challenge`)

`freeDays` (now 1), `eventbrite`, `wave`, `days`. Each day names the GitHub Skills exercise it follows, or says "No GitHub Skills course for this day" and links a free course instead. `levelUps` are optional extras.

## The free product at the end (`reward`)

| Field | What it is | Until filled |
| --- | --- | --- |
| `conditions` | Who gets it. Now: finish the 10 days and launch on day 10. | |
| `hostingFor` | How long free Ontold hosting lasts, in words. | "Terms to be confirmed" |
| `domainRegistrationIncluded` | `true` if you pay for the domain, `false` if she buys it and you set it up. | "Terms to be confirmed" |
| `terms` | The full terms, in a sentence or two. | "Terms to be confirmed" |
| `leaderboardUrl` | The womenintech.me outputs leaderboard. | |

## The finale (`finale`)

`inPerson`: the London meetup venue (optional; "venue to be announced" until set). `album`: the shared photo album link (https). Demo day is online for both groups.

## Awards (`awards`)

`categories[].prize` reads "To be announced" until set. `winners["wave-1"]`: a list of `{ "category", "project", "live" }`, projects only, never people.

## Certificates (`data/certificates.json`)

Only you add these, for a finisher whose project you approved (submitted through `/submit?kind=work`). One entry each: `{ "id": "jo-smith-wave-1", "name", "wave": "wave-1", "project", "live": "https://…", "repo": "https://…" (optional), "date": "YYYY-MM-DD" }`. It appears at `/certificate/<id>`. `/certificate/sample` shows the design.

## Your instructor (`school.instructor`)

`name`, `photo` (a path under `public/`, e.g. `/img/founder.jpg`), `video` (https link to a 20-second hello), `why`, optional `bio` and `links`. Each empty field shows as a marked slot.
