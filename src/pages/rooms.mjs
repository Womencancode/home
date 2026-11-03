/* /rooms: private community rooms by discipline, each "Opening soon" until the owner opens it; /rooms/<id>: the room and its
 * "Request access" form, which puts an email on that room's list. No member counts anywhere, by design. */
import { SITE, esc, layout } from '../html.mjs';
import { ROOM_SOON, ROOM_OPEN, roomFeature } from '../rooms.mjs';
import { tick, guards } from './forms.mjs';

const state = (r) => `<span class="room-state${r.open ? ' is-open' : ''}">${r.open ? ROOM_OPEN : ROOM_SOON}</span>`;

/** One room as a card: its state, name, focus and blurb. */
export const roomCard = (r) => `<a class="lesson-card room-card" href="/rooms/${esc(r.id)}" id="${esc(r.id)}">${state(r)}<b>${esc(r.name)}</b>${r.focus ? `<small class="room-focus">${esc(r.focus)}</small>` : ''}<small>${esc(r.blurb)}</small><span class="more">Request access</span></a>`;

/** /rooms: every room with its state. */
export function roomsPage(rooms) {
  const body = `
<section class="page-head"><p class="eyebrow">Rooms</p><h1>Rooms for your <em>discipline</em></h1>
  <p class="lead">Small private rooms where people in the same line of work trade notes, referrals and honest advice. Ask to join a room and we will email you when it opens. Rooms are invite only, so what is said there stays there.</p></section>
<section class="section"><div class="lesson-grid">${rooms.map(roomCard).join('')}</div></section>`;
  return layout({ title: 'Rooms', description: `Private community rooms by discipline on ${SITE.name}. Ask to join.`, path: '/rooms', body, current: '/rooms' });
}

/** /rooms/<id>: the room, and the form to request access. `sent` after a post that went through; `form` carries errors. */
export function roomPage(r, { sent = false, form = {}, env = {} } = {}) {
  const errors = form.errors || {};
  const body = `
<section class="page-head"><p class="eyebrow"><a href="/rooms">Rooms</a> · ${state(r)}</p><h1>${esc(r.name)}</h1>${r.focus ? `<p class="room-focus">${esc(r.focus)}</p>` : ''}<p class="lead">${esc(r.blurb)}</p></section>
<section class="section">${sent ? `<div class="notice success" role="status"><h2>Thank you.</h2><p>${r.open ? 'We read every request and will email you the way in.' : 'You are on the list for this room. We will email you when it opens, and only about that.'} You can <a href="/waitlist/leave">take your address off</a> at any time.</p></div>` : `
<form class="submit-form waitlist-form" method="post" action="/rooms/${esc(r.id)}" novalidate>
  <h2>Request access</h2>
  <input type="hidden" name="feature" value="${esc(roomFeature(r.id))}">
  <div class="field${errors.email ? ' has-error' : ''}"><label for="w-email">Your email</label><p class="hint">Never shown on the site.</p><input id="w-email" name="email" type="email" maxlength="200" autocomplete="email" required>${errors.email ? `<p class="error" role="alert">${esc(errors.email)}</p>` : ''}</div>
  <div class="field${errors.use_case ? ' has-error' : ''}"><label for="w-use_case">What you do, and what you would bring</label><p class="hint">Optional, up to 500 characters. It helps us open the room with the right people.</p><textarea id="w-use_case" name="use_case" rows="4" maxlength="500">${esc(form.use_case || '')}</textarea></div>
  ${tick(errors, 'consent', 'Email me about this room. I can leave the list at any time at /waitlist/leave.')}
  ${guards(env, errors)}
  <p><button class="button primary" type="submit">Request access</button></p>
</form>`}</section>`;
  return layout({ title: r.name, description: `${r.name}: ${r.blurb}`.slice(0, 200), path: `/rooms/${r.id}`, body, current: '/rooms', noindex: sent || !!form.errors });
}
