/* Small enhancements only. Every page works without this file. */
(function () {
  'use strict';
  /* The composer's tabs set what the box asks for; the form still posts the tab without this. */
  document.addEventListener('change', function (e) {
    var t = e.target;
    if (!t || !t.matches || !t.matches('.oc-tab input')) return;
    var box = document.getElementById('ch-idea');
    if (box && t.getAttribute('data-placeholder')) box.setAttribute('placeholder', t.getAttribute('data-placeholder'));
  });
  /* A picture that will not load (a publisher refusing hotlinks) becomes the flag cover, never a broken box with alt text. */
  var swap = function (img) {
    var feat = img.closest('a.feature');
    if (feat) { img.remove(); feat.classList.add('no-photo'); return; }
    var fig = img.closest('figure.card-media, figure.hero-photo, .xp-hero, .xp-thumb');
    (window.__abcFailedImages = window.__abcFailedImages || []).push(img.currentSrc || img.src);
    if (!fig || fig.dataset.failed) return;
    fig.dataset.failed = '1';
    if (fig.matches('figure.card-media')) { var d = document.createElement('div'); d.className = 'card-media no-photo'; d.setAttribute('aria-hidden', 'true'); var f = document.createElement('span'); f.className = 'cover-flag'; f.textContent = fig.dataset.flag || ''; d.appendChild(f); fig.replaceWith(d); }
    else if (fig.matches('.xp-thumb')) { img.remove(); fig.classList.add('none'); }
    else fig.remove();
  };
  /* Share bars: the device share sheet when there is one, and a copy button where the clipboard is available. */
  document.querySelectorAll('.share').forEach(function (bar) {
    var url = bar.dataset.shareUrl.replace(/^https:\/\/[^/]+/, location.origin), title = bar.dataset.shareTitle;
    var native = bar.querySelector('.share-native'), copy = bar.querySelector('.share-copy');
    if (navigator.share) { native.hidden = false; native.addEventListener('click', function () { navigator.share({ title: title, url: url }).catch(function () {}); }); }
    if (navigator.clipboard) { copy.hidden = false; copy.addEventListener('click', function () { navigator.clipboard.writeText(url).then(function () { copy.textContent = 'Link copied'; setTimeout(function () { copy.textContent = 'Copy link'; }, 2000); }); }); }
  });
  /* Language menu: the visitor's browser language is offered first. Where Chrome has an on-device translator for it, the page is
     translated in place, nothing leaves the device; otherwise the link opens Google Translate's copy of this page. */
  document.querySelectorAll('.lang-menu').forEach(function (menu) {
    var links = menu.querySelectorAll('[data-lang]'), reset = menu.querySelector('.lang-reset');
    var here = location.origin + location.pathname + location.search;
    links.forEach(function (a) { a.href = 'https://translate.google.com/translate?sl=en&tl=' + a.dataset.lang + '&u=' + encodeURIComponent(here); });
    var mine = (navigator.language || '').slice(0, 2).toLowerCase();
    var own = menu.querySelector('[data-lang="' + mine + '"]');
    if (own) own.parentNode.parentNode.prepend(own.parentNode);
    var original = null;
    var textNodes = function () { var w = document.createTreeWalker(document.getElementById('main'), NodeFilter.SHOW_TEXT, { acceptNode: function (n) { return n.nodeValue.trim().length > 1 && !n.parentNode.closest('[translate="no"],script,style,code') ? 1 : 3; } }); var out = []; while (w.nextNode()) out.push(w.currentNode); return out; };
    links.forEach(function (a) {
      a.addEventListener('click', function (ev) {
        if (!('Translator' in self)) return;
        var lang = a.dataset.lang;
        ev.preventDefault();
        Translator.availability({ sourceLanguage: 'en', targetLanguage: lang }).then(function (state) {
          if (state === 'unavailable') { location.href = a.href; return; }
          return Translator.create({ sourceLanguage: 'en', targetLanguage: lang }).then(function (tr) {
            var nodes = textNodes();
            if (!original) original = nodes.map(function (n) { return [n, n.nodeValue]; });
            document.documentElement.lang = lang;
            reset.hidden = false; menu.open = false;
            return nodes.reduce(function (p, n) { return p.then(function () { return tr.translate(n.nodeValue).then(function (t) { n.nodeValue = t; }); }); }, Promise.resolve());
          });
        }).catch(function () { location.href = a.href; });
      });
    });
    reset.addEventListener('click', function () { if (original) original.forEach(function (x) { x[0].nodeValue = x[1]; }); document.documentElement.lang = 'en'; reset.hidden = true; menu.open = false; });
  });
  /* The masthead bar after a cover shows once the cover's masthead has scrolled away (without script it simply shows). */
  var mastBar = document.querySelector('.mast-bar[data-after-cover]'), mastMark = document.querySelector('.mast .mag-masthead');
  if (mastBar) {
    if (mastMark && 'IntersectionObserver' in window) new IntersectionObserver(function (es) { mastBar.classList.toggle('is-shown', !es[es.length - 1].isIntersecting); }).observe(mastMark);
    else mastBar.classList.add('is-shown');
  }
  /* YouTube embeds ask for captions and, where the channel has them, dubbed audio in the visitor's language. */
  var ui = (navigator.language || 'en').slice(0, 2);
  document.querySelectorAll('.embed-youtube iframe').forEach(function (f) { if (ui !== 'en' && f.src.indexOf('hl=') < 0) f.src += (f.src.indexOf('?') < 0 ? '?' : '&') + 'hl=' + ui + '&cc_lang_pref=' + ui + '&cc_load_policy=1'; });
  /* Ask BlackABC: a question typed or spoken (the browser's own speech recognition), answered from /api/ask; a written answer is read
     aloud when the voice is on. Read-aloud on stories uses the browser's own voices. */
  var dlg = document.querySelector('dialog.ask'), openers = document.querySelectorAll('.ask-open');
  if (dlg && openers.length && dlg.showModal) {
    openers.forEach(function (o) { o.hidden = false; });
    var out = dlg.querySelector('.ask-out'), input = dlg.querySelector('input[name=q]'), mic = dlg.querySelector('.ask-mic');
    var speak = function (text) { if (window.speechSynthesis && text) { speechSynthesis.cancel(); var u = new SpeechSynthesisUtterance(text); u.lang = document.documentElement.lang || 'en'; speechSynthesis.speak(u); } };
    var KINDS = { opportunity: 'Opportunity', event: 'Event', story: 'Story', news: 'News', work: 'Work', talent: 'Talent', lesson: 'Lesson', door: 'Open door', speaker: 'Speaker', speakers: 'Speakers', festivals: 'Festivals' };
    var run = function (q, spoken) {
      out.textContent = 'Looking…';
      fetch('/api/ask?q=' + encodeURIComponent(q)).then(function (r) { return r.json(); }).then(function (j) {
        out.textContent = '';
        if (j.answer) { var tag = document.createElement('p'); tag.className = 'ai-tag'; tag.textContent = 'AI-written answer'; out.appendChild(tag); var p = document.createElement('p'); p.className = 'ask-answer'; p.textContent = j.answer; out.appendChild(p); if (spoken) speak('This answer is written by AI. ' + j.answer); }
        var ul = document.createElement('ul'); ul.className = 'ask-results';
        (j.results || []).forEach(function (x) { var li = document.createElement('li'); var a = document.createElement('a'); a.href = x.href; if (x.kind === 'news') { a.target = '_blank'; a.rel = 'noopener nofollow'; } var k = document.createElement('span'); k.className = 'ask-kind'; k.textContent = KINDS[x.kind] || x.kind; a.appendChild(k); a.appendChild(document.createTextNode(' ' + x.title)); li.appendChild(a); if (x.note) { var n = document.createElement('span'); n.className = 'muted small'; n.textContent = ' · ' + x.note; li.appendChild(n); } ul.appendChild(li); });
        if (!(j.results || []).length && !j.answer) { var none = document.createElement('p'); none.className = 'muted'; none.textContent = 'Nothing yet for that. Try fewer words, or a country or field.'; out.appendChild(none); }
        else out.appendChild(ul);
        if (spoken && !j.answer && (j.results || []).length) speak('I found ' + j.results.length + ' things. The first is ' + j.results[0].title + '.');
      }).catch(function () { out.textContent = 'That did not work. Please try again.'; });
    };
    openers.forEach(function (o) { o.addEventListener('click', function () { dlg.showModal(); input.focus(); }); });
    dlg.querySelector('.ask-form').addEventListener('submit', function (e) { e.preventDefault(); if (input.value.trim()) run(input.value.trim(), false); });
    var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) mic.hidden = true;
    else mic.addEventListener('click', function () {
      var rec = new SR(); rec.lang = navigator.language || 'en-GB'; rec.interimResults = false;
      mic.classList.add('on'); out.textContent = 'Listening…';
      rec.onresult = function (ev) { var q = ev.results[0][0].transcript; input.value = q; run(q, true); };
      rec.onerror = function () { out.textContent = 'I could not hear that. Try again, or type it.'; };
      rec.onend = function () { mic.classList.remove('on'); };
      rec.start();
    });
  }
  document.querySelectorAll('[data-listen]').forEach(function (b) {
    if (!window.speechSynthesis) return;
    b.hidden = false;
    b.addEventListener('click', function () {
      if (speechSynthesis.speaking) { speechSynthesis.cancel(); b.textContent = '▶ Listen'; return; }
      var root = document.querySelector(b.dataset.listen);
      var text = Array.prototype.map.call(root.querySelectorAll('h1, .article-lead, .follow, p.chips'), function (n) { return n.textContent; }).join('. ');
      var u = new SpeechSynthesisUtterance(text); u.lang = document.documentElement.lang || 'en'; u.onend = function () { b.textContent = '▶ Listen'; };
      speechSynthesis.speak(u); b.textContent = '■ Stop';
    });
  });
  /* Watch: a still becomes the privacy-enhanced player only when tapped, captions in the visitor's language. */
  document.querySelectorAll('.watch-play').forEach(function (b) {
    b.addEventListener('click', function () {
      var f = document.createElement('iframe'); var lang = (navigator.language || 'en').slice(0, 2);
      f.src = 'https://www.youtube-nocookie.com/embed/' + b.dataset.yt + '?autoplay=1&playsinline=1&hl=' + lang + '&cc_lang_pref=' + lang;
      f.allow = 'autoplay; encrypted-media; picture-in-picture'; f.allowFullscreen = true; f.title = b.getAttribute('aria-label');
      b.replaceWith(f);
    });
  });
  /* Home: the what's-on panel can be closed (remembered for this visitor); the mini map can be enlarged over the page. */
  var store = { get: function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } }, set: function (k, v) { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) {} } };
  document.querySelectorAll('[data-closable]').forEach(function (p) {
    var key = 'blackabc-closed-' + p.dataset.closable, re = document.querySelector('[data-reopen="' + p.dataset.closable + '"]');
    var shut = function (v) { p.hidden = v; if (re) re.hidden = !v; store.set(key, v ? '1' : null); };
    if (store.get(key)) shut(true);
    p.querySelector('.panel-close').addEventListener('click', function () { shut(true); });
    if (re) re.addEventListener('click', function () { shut(false); });
  });
  var mini = document.querySelector('.mini-map');
  if (mini) {
    var grow = mini.querySelector('.mini-map-grow');
    grow.addEventListener('click', function () { var on = mini.classList.toggle('big'); grow.setAttribute('aria-expanded', String(on)); grow.setAttribute('aria-label', on ? 'Close the map' : 'Enlarge the map'); grow.title = grow.getAttribute('aria-label'); document.body.classList.toggle('mini-map-open', on); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && mini.classList.contains('big')) grow.click(); });
  }
  document.addEventListener('error', function (e) { if (e.target && e.target.tagName === 'IMG') swap(e.target); }, true);
  document.querySelectorAll('img').forEach(function (img) { if (img.complete && img.naturalWidth === 0 && img.getAttribute('src')) swap(img); });
  /* Live filter for country tiles and the talent list: the same input the form posts, applied as you type. */
  document.querySelectorAll('input[data-filter]').forEach(function (input) {
    var selector = input.getAttribute('data-filter') === 'person' ? '.person' : '.tile';
    var items = Array.prototype.slice.call(document.querySelectorAll(selector));
    var headings = Array.prototype.slice.call(document.querySelectorAll('.region, .letter, .region h3'));
    input.addEventListener('input', function () {
      var q = input.value.trim().toLowerCase();
      items.forEach(function (el) { el.classList.toggle('hide', !!q && (el.getAttribute('data-name') || '').indexOf(q) === -1); });
      headings.forEach(function (h) {
        var scope = h.classList.contains('region') ? h : h.parentElement;
        var visible = scope.querySelectorAll(selector + ':not(.hide)').length;
        if (h.classList.contains('letter')) { var ul = h.nextElementSibling; visible = ul ? ul.querySelectorAll('.person:not(.hide)').length : 0; }
        h.style.display = q && !visible ? 'none' : '';
      });
    });
  });
  /* Forms that take a moment on the server (sending a sign-in email, a submission) say so at once instead of looking dead. */
  document.querySelectorAll('form[method=post]').forEach(function (f) {
    f.addEventListener('submit', function () {
      var b = f.querySelector('button[type=submit]'); if (!b || b.disabled) return;
      b.dataset.label = b.textContent; b.disabled = true; b.setAttribute('aria-busy', 'true');
      b.textContent = f.action.indexOf('/admin/login') > -1 ? 'Sending your link…' : 'Sending…';
    });
  });
  window.addEventListener('pageshow', function (e) { if (e.persisted) document.querySelectorAll('button[aria-busy=true]').forEach(function (b) { b.disabled = false; b.removeAttribute('aria-busy'); if (b.dataset.label) b.textContent = b.dataset.label; }); });
  /* The submission form: show the fields that matter for the chosen kind. Nothing is removed, only de-emphasised. */
  var form = document.querySelector('.submit-form');
  if (form && form.querySelector('input[name=kind]')) {
    var apply = function () {
      var kind = (form.querySelector('input[name=kind]:checked') || {}).value || 'story';
      form.querySelectorAll('.kind').forEach(function (k) { k.classList.toggle('selected', k.querySelector('input').checked); });
      var show = { creator: kind !== 'correction' && kind !== 'event', medium: kind === 'work' || kind === 'talent', year: kind !== 'opportunity' && kind !== 'speaker', category: kind === 'story' || kind === 'event', start_date: kind === 'event', end_date: kind === 'event' };
      var opp = form.querySelector('.opp-fields-in'); if (opp) opp.hidden = kind !== 'opportunity'; var spk = form.querySelector('.speaker-fields-in'); if (spk) spk.hidden = kind !== 'speaker';
      Object.keys(show).forEach(function (name) { var f = form.querySelector('#f-' + name); if (f && f.closest('.field')) f.closest('.field').hidden = !show[name]; });
      var title = form.querySelector('label[for=f-title]');
      var who = form.querySelector('label[for=f-creator]'); if (who) who.textContent = kind === 'opportunity' ? 'Who runs it' : kind === 'speaker' ? 'Where they work' : 'Who';
      if (title) title.textContent = kind === 'opportunity' ? 'Name of the opportunity' : kind === 'talent' || kind === 'speaker' ? 'Name' : kind === 'work' ? 'Title of the work' : kind === 'event' ? 'Name of the event' : kind === 'correction' ? 'Which page or entry' : 'Headline';
      var dates = form.querySelector('.event-dates'); if (dates) dates.hidden = kind !== 'event';
    };
    form.addEventListener('change', apply);
    apply();

    /* Free text first: read the visitor's own words for country, city, dates, year, link and kind, fill those fields, and point at
       what is still missing. Everything stays editable; nothing is sent until they press Send. */
    var quick = form.querySelector('.quick');
    if (quick) {
      quick.hidden = false;
      var MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
      var iso = function (d, m, y) { return y + '-' + String(m).padStart(2, '0') + '-' + String(d).padStart(2, '0'); };
      var set = function (name, value, filled) { var f = form.querySelector('#f-' + name); if (!f || !value || f.value) return; f.value = value; f.closest('.field').classList.add('auto'); filled.push(f.closest('.field').querySelector('label').textContent); };
      quick.querySelector('.quick-go').addEventListener('click', function () {
        var text = quick.querySelector('textarea').value.trim(), filled = [];
        if (!text) return;
        var low = text.toLowerCase();
        var url = (text.match(/https?:\/\/\S+/) || [])[0];
        var kind = /\b(wrong|incorrect|out of date|typo|should say|correction)\b/.test(low) ? 'correction'
          : /\b(festival|carnival|concert|conference|fair|tickets?|parade|screening|expo|summit|gala|show on)\b/.test(low) && /\d{1,2}(st|nd|rd|th)?\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)|(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+\d{1,2}/.test(low) ? 'event'
          : /\b(i am|i'm|my work|my portfolio|hire me)\b/.test(low) ? 'talent'
          : /\b(album|ep|single|mixtape|film|documentary|novel|book|series|podcast|exhibition|play)\b/.test(low) && !/\b(won|wins|award|record|opened|opens|named)\b/.test(low) ? 'work' : 'story';
        var radio = form.querySelector('input[name=kind][value=' + kind + ']'); if (radio && !form.querySelector('input[name=kind]:checked:not([value=story])')) { radio.checked = true; apply(); }
        var sel = form.querySelector('#f-country');
        var opts = Array.prototype.slice.call(sel.options).filter(function (o) { return o.value; }).sort(function (a, b) { return b.text.length - a.text.length; });
        var hit = opts.filter(function (o) { return new RegExp('\\b' + o.text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'i').test(text); })[0];
        if (hit && !sel.value) { sel.value = hit.value; sel.dispatchEvent(new Event('change', { bubbles: true })); sel.closest('.field').classList.add('auto'); filled.push('Country'); }
        var range = low.match(/(\d{1,2})(?:st|nd|rd|th)?\s*(?:-|to|–)\s*(\d{1,2})(?:st|nd|rd|th)?\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+(\d{4})/);
        var one = low.match(/(\d{1,2})(?:st|nd|rd|th)?\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*,?\s+(\d{4})/) || null;
        var us = low.match(/(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})/);
        var start = range ? iso(range[1], MONTHS[range[3]], range[4]) : one ? iso(one[1], MONTHS[one[2]], one[3]) : us ? iso(us[2], MONTHS[us[1]], us[3]) : '';
        if (kind === 'event') { set('start_date', start, filled); if (range) set('end_date', iso(range[2], MONTHS[range[3]], range[4]), filled); }
        set('year', (start && start.slice(0, 4)) || (text.match(/\b(19|20)\d{2}\b/) || [])[0], filled);
        set('url', url, filled);
        var words = text.replace(/https?:\/\/\S+/g, '').trim();
        set('summary', words, filled);
        var first = words.split(/(?<=[.!?])\s+/)[0].replace(/[.!?]$/, '');
        set('title', first.length <= 120 ? first : first.slice(0, 117).replace(/\s+\S*$/, '') + '…', filled);
        var finish = function () {
          var missing = Array.prototype.slice.call(form.querySelectorAll('.field:not([hidden]) [required]')).filter(function (f) { return !f.value && f.closest('.quick') === null; });
          var res = quick.querySelector('.quick-result');
          res.innerHTML = '';
          var b = document.createElement('b'); b.textContent = filled.length ? 'Filled in: ' + filled.join(', ') + '. ' : 'We could not pick anything out. ';
          res.appendChild(b);
          res.appendChild(document.createTextNode(missing.length ? 'Still needed: ' + missing.map(function (f) { return f.closest('.field').querySelector('label').textContent; }).join(', ') + '.' : 'Please check everything below, then press Send.'));
          (missing[0] || form.querySelector('[type=submit]')).focus();
        };
        if (sel.value) {
          fetch('/api/cities?country=' + sel.value).then(function (r) { return r.json(); }).then(function (d) {
            var city = (d.cities || []).sort(function (a, b) { return b.length - a.length; }).filter(function (c) { return new RegExp('\\b' + c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'i').test(text); })[0];
            set('city', city, filled); finish();
          }).catch(finish);
        } else finish();
      });
    }
  }
})();

/* The live map: a tooltip on hover, a spotlight that moves from city to city, and a pulse at the city for every real event from
 * /api/activity (someone shared something; something went live). The page works without any of this. */
(function () {
  'use strict';
  var section = document.querySelector('[data-live-map]');
  if (!section) return;
  var svg = section.querySelector('svg.world-map');
  var frame = section.querySelector('.map-frame');
  var pulses = svg.querySelector('.pulses');
  var tip = section.querySelector('.map-tip');
  var caption = section.querySelector('.map-caption');
  var list = section.querySelector('.live-list');
  var zoomed = svg.classList.contains('zoomed');
  var k = Number(svg.getAttribute('data-k')) || 1;
  var lands = Array.prototype.slice.call(svg.querySelectorAll('.land'));
  var pins = Array.prototype.slice.call(svg.querySelectorAll('.pin'));
  var byCode = {};
  lands.forEach(function (el) { byCode[el.getAttribute('data-code')] = el; });
  var pinAt = function (code, city) {
    for (var i = 0; i < pins.length; i++) if (pins[i].getAttribute('data-code') === code && (!city || pins[i].getAttribute('data-city') === city)) return pins[i];
    return null;
  };
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var entries = function (n) { return n ? n + (n === 1 ? ' entry' : ' entries') : 'nothing yet, be the first'; };

  svg.addEventListener('pointermove', function (e) {
    var el = e.target.closest && e.target.closest('.ev, .pin, .land');
    if (!el) { tip.hidden = true; return; }
    var r = frame.getBoundingClientRect();
    tip.textContent = el.getAttribute('data-name') + ' · ' + (el.getAttribute('data-when') || entries(Number(el.getAttribute('data-count'))));
    tip.style.left = Math.min(e.clientX - r.left + 14, r.width - 200) + 'px';
    tip.style.top = (e.clientY - r.top + 14) + 'px';
    tip.hidden = false;
  });
  svg.addEventListener('pointerleave', function () { tip.hidden = true; });

  var ring = function (cx, cy, strong) {
    if (cx == null || cy == null) return;
    (strong ? [0, 700] : [0]).forEach(function (delay) {
      var c = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      c.setAttribute('cx', cx); c.setAttribute('cy', cy); c.setAttribute('r', String((strong ? 9 : 6) * (zoomed ? k * 1.7 : 1)));
      c.setAttribute('class', strong ? 'ring strong' : 'ring');
      c.style.animationDelay = delay + 'ms';
      c.addEventListener('animationend', function () { c.remove(); });
      pulses.appendChild(c);
    });
  };
  var flash = function (el, cls, ms) {
    el.classList.remove(cls); void el.getBoundingClientRect(); el.classList.add(cls);
    setTimeout(function () { el.classList.remove(cls); }, ms);
  };
  /* An event: the pin at its city if there is one, else the country, glows and a ring spreads from the exact point. */
  var light = function (e, strong) {
    var land = byCode[e.country];
    var pin = pinAt(e.country, e.city || '');
    if (land && strong) { land.classList.add('lit-now'); setTimeout(function () { land.classList.remove('lit-now'); }, 45000); }
    if (pin) flash(pin, strong ? 'flash' : 'spot', strong ? 2800 : 3000);
    else if (land) flash(land, 'spot', 2800);
    var x = e.x != null ? e.x : pin ? pin.getAttribute('cx') : land ? land.getAttribute('data-cx') : null;
    var y = e.y != null ? e.y : pin ? pin.getAttribute('cy') : land ? land.getAttribute('data-cy') : null;
    if (!reduce && !(x === '0' && y === '0')) ring(x, y, strong);
  };

  var spots = pins.length ? pins.slice() : lands.filter(function (el) { return Number(el.getAttribute('data-count')) > 0; });
  for (var i = spots.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = spots[i]; spots[i] = spots[j]; spots[j] = t; }
  var at = 0;
  var spotlight = function () {
    if (!spots.length || document.hidden) return;
    var el = spots[at++ % spots.length];
    var isPin = el.classList.contains('pin');
    light({ country: el.getAttribute('data-code'), city: isPin ? el.getAttribute('data-city') : '', x: isPin ? el.getAttribute('cx') : null, y: isPin ? el.getAttribute('cy') : null }, false);
    caption.textContent = '';
    var a = document.createElement('a');
    var city = isPin && el.getAttribute('data-city');
    a.href = '/country/' + el.getAttribute('data-slug') + (city ? '?city=' + encodeURIComponent(city) : '');
    a.textContent = 'Spotlight · ' + el.getAttribute('data-name') + ' · ' + entries(Number(el.getAttribute('data-count')));
    caption.appendChild(a);
  };
  if (!reduce && spots.length && caption) { spotlight(); setInterval(spotlight, 3800); }

  var ago = function (iso) {
    var s = Math.max(0, (Date.now() - Date.parse(iso)) / 1000);
    if (s < 60) return 'just now';
    if (s < 3600) return Math.floor(s / 60) + ' min ago';
    if (s < 86400) return Math.floor(s / 3600) + ' h ago';
    return Math.floor(s / 86400) + ' d ago';
  };
  var shown = [];
  var render = function (fresh) {
    shown = fresh.concat(shown).slice(0, 6);
    list.textContent = '';
    shown.forEach(function (e, n) {
      var li = document.createElement('li');
      if (n < fresh.length) li.className = 'new';
      var time = document.createElement('time'); time.setAttribute('datetime', e.at); time.textContent = ago(e.at);
      var a = document.createElement('a'); a.href = e.url || ('/country/' + e.slug); a.textContent = e.text;
      li.appendChild(time); li.appendChild(a); list.appendChild(li);
    });
  };
  var since = '', seen = {};
  var poll = function (first) {
    fetch('/api/activity' + (since ? '?since=' + encodeURIComponent(since) : ''), { cache: 'no-store' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) {
        if (!j) return;
        since = j.now;
        var fresh = (j.events || []).filter(function (e) { if (seen[e.id]) return false; seen[e.id] = 1; return true; });
        if (!fresh.length) return;
        render(fresh);
        var pulse = (first ? fresh.slice(0, 3) : fresh).slice().reverse();
        pulse.forEach(function (e, n) { setTimeout(function () { light(e, true); }, 600 + n * 900); });
      })
      .catch(function () {});
  };
  poll(true);
  setInterval(function () { if (!document.hidden) poll(false); }, 15000);
})();

/* The submission form's city suggestions follow the chosen country. */
(function () {
  'use strict';
  var select = document.getElementById('f-country');
  var datalist = document.getElementById('city-list');
  if (!select || !datalist) return;
  select.addEventListener('change', function () {
    datalist.textContent = '';
    if (!select.value) return;
    fetch('/api/cities?country=' + encodeURIComponent(select.value))
      .then(function (r) { return r.ok ? r.json() : { cities: [] }; })
      .then(function (j) { (j.cities || []).forEach(function (name) { var o = document.createElement('option'); o.value = name; datalist.appendChild(o); }); })
      .catch(function () {});
  });
})();
/* "I'm a…" (src/roles.mjs): a chosen role is remembered in this browser, and the front page opens on it next time. The server
 * renders ?role= on its own, so with this file off the chips still work as links. */
(function () {
  'use strict';
  var picker = document.querySelector('[data-roles]');
  if (!picker) return;
  var KEY = 'abc-role';
  var known = [].map.call(picker.querySelectorAll('[data-role]'), function (a) { return a.getAttribute('data-role'); });
  var asked = new URLSearchParams(location.search).get('role');
  var get = function () { try { return localStorage.getItem(KEY) || ''; } catch (e) { return ''; } };
  var set = function (v) { try { if (v && v !== 'all') localStorage.setItem(KEY, v); else localStorage.removeItem(KEY); } catch (e) { /* storage off: links still work */ } };
  if (asked) set(known.indexOf(asked) >= 0 ? asked : '');
  else { var saved = get(); if (saved && saved !== 'all' && known.indexOf(saved) >= 0) { location.replace('/?role=' + encodeURIComponent(saved) + location.hash); return; } }
  picker.addEventListener('click', function (e) { var a = e.target.closest && e.target.closest('[data-role]'); if (a) set(a.getAttribute('data-role')); });
})();
