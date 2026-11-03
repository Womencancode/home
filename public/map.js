/* The map explorer (/map): MapLibre with OpenFreeMap tiles recoloured to the house palette, country shapes lit by their entries, city
 * pins and event dots from /api/places. A panel beside the map lists what is coming up and every place; choosing a card or a pin
 * opens it in the panel with its pictures and directions. On a phone the panel sits under the map. */
(function () {
  'use strict';
  var root = document.querySelector('[data-street-map]');
  if (!root || !window.maplibregl || !window.topojson) return;
  maplibregl.setWorkerUrl('/vendor/maplibre-gl-csp-worker.js');
  var HEAT = ['#2a2630', '#5b4a2e', '#7d6334', '#a8833f', '#d9ac58'];
  var heat = function (n) { return !n ? 0 : n === 1 ? 1 : n <= 3 ? 2 : n <= 7 ? 3 : 4; };
  var body = document.getElementById('explore-body');
  var tabs = root.querySelectorAll('[data-tab]');
  var narrow = window.matchMedia('(max-width: 900px)');

  var map = new maplibregl.Map({ container: 'street-map', style: 'https://tiles.openfreemap.org/styles/positron', center: [10, 15], zoom: 1.4, minZoom: 1, maxZoom: 18, attributionControl: { compact: true }, cooperativeGestures: window.matchMedia('(pointer: coarse)').matches });
  window.__blackabcMap = map;
  map.addControl(new maplibregl.NavigationControl({ visualizePitch: false }), 'top-right');
  map.addControl(new maplibregl.FullscreenControl(), 'top-right');
  map.addControl(new maplibregl.GeolocateControl({ trackUserLocation: false }), 'top-right');

  /* Positron is light; repaint it in the site's near-black and brass so it sits inside the page. */
  var darken = function () {
    map.getStyle().layers.forEach(function (l) {
      try {
        var id = l.id.toLowerCase();
        if (l.type === 'background') map.setPaintProperty(l.id, 'background-color', '#0d0c10');
        else if (l.type === 'fill') map.setPaintProperty(l.id, 'fill-color', /water|ocean|sea|lake|river/.test(id) ? '#0f1420' : /park|wood|grass|forest|landcover/.test(id) ? '#141a16' : /building/.test(id) ? '#1d1a22' : '#16141a');
        else if (l.type === 'line') map.setPaintProperty(l.id, 'line-color', /water|river|stream/.test(id) ? '#16203a' : /boundary|admin/.test(id) ? '#4a4252' : /motorway|trunk|primary/.test(id) ? '#3a3340' : '#26222c');
        else if (l.type === 'symbol' && l.layout && l.layout['text-field']) { map.setPaintProperty(l.id, 'text-color', /place|country|state|city/.test(id) ? '#d8cfc2' : '#9a9184'); map.setPaintProperty(l.id, 'text-halo-color', '#0b0b0e'); map.setPaintProperty(l.id, 'text-halo-width', 1.2); }
      } catch (e) { /* a layer without that property */ }
    });
  };

  var el = function (tag, cls, text) { var n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
  var link = function (href, text, cls, ext) { var a = el('a', cls, text); a.href = href; if (ext) { a.target = '_blank'; a.rel = 'noopener'; } return a; };
  var thumb = function (img, label) {
    var f = el('span', 'xp-thumb' + (img ? '' : ' none'));
    if (img) { var i = el('img'); i.src = img.src; i.alt = ''; i.loading = 'lazy'; i.decoding = 'async'; i.referrerPolicy = 'no-referrer'; f.appendChild(i); } else f.textContent = label || '';
    return f;
  };
  var data = null, tab = 'events', hoverId = null;

  var highlight = function (source, i) {
    if (hoverId) map.setFeatureState(hoverId, { hot: false });
    hoverId = source == null ? null : { source: source, id: i };
    if (hoverId) map.setFeatureState(hoverId, { hot: true });
  };
  var card = function (p, kind, i) {
    var b = el('button', 'xp-card'); b.type = 'button';
    b.appendChild(thumb(p.img, p.flag));
    var t = el('span', 'xp-text');
    t.appendChild(el('span', 'xp-kicker', kind === 'event' ? (p.now ? 'On now' : p.countdown) : p.count + (p.count === 1 ? ' entry' : ' entries')));
    t.appendChild(el('span', 'xp-title', p.name));
    t.appendChild(el('span', 'xp-sub', kind === 'event' ? p.flag + ' ' + p.place + ' · ' + p.when : p.flag + ' ' + (p.entries[0] ? p.entries[0].title : '')));
    b.appendChild(t);
    b.addEventListener('mouseenter', function () { highlight(kind === 'event' ? 'events' : 'pins', i); });
    b.addEventListener('mouseleave', function () { highlight(null); });
    b.addEventListener('click', function () { open(kind, i, true); });
    return b;
  };
  var renderList = function () {
    body.textContent = '';
    var list = tab === 'events' ? data.events : data.pins;
    var focus = root.getAttribute('data-focus');
    var wrap = el('div', 'xp-list'), shown = 0;
    list.forEach(function (p, i) { if (focus && p.country !== focus) return; shown += 1; wrap.appendChild(card(p, tab === 'events' ? 'event' : 'pin', i)); });
    if (!shown) wrap.appendChild(el('p', 'muted', 'Nothing here yet.'));
    body.appendChild(wrap);
    body.scrollTop = 0;
  };
  var open = function (kind, i, fly) {
    var p = (kind === 'event' ? data.events : data.pins)[i];
    if (!p) return;
    if (fly) map.flyTo({ center: [p.lon, p.lat], zoom: Math.max(map.getZoom(), kind === 'event' ? 11 : 6), essential: true });
    body.textContent = '';
    var d = el('article', 'xp-detail');
    var back = el('button', 'xp-back', '← Back to the list'); back.type = 'button'; back.addEventListener('click', renderList); d.appendChild(back);
    if (p.img) { var hero = el('figure', 'xp-hero'); var im = el('img'); im.src = p.img.src; im.alt = ''; im.referrerPolicy = 'no-referrer'; hero.appendChild(im); if (p.img.credit) hero.appendChild(el('figcaption', 'credit', p.img.credit)); d.appendChild(hero); }
    d.appendChild(el('p', 'xp-kicker', kind === 'event' ? (p.now ? 'On now' : p.countdown) + (p.series ? ' · Part of ' + p.series : '') : p.count + (p.count === 1 ? ' entry' : ' entries')));
    var h = el('h2', 'xp-name'); h.appendChild(link(p.href, p.name)); d.appendChild(h);
    d.appendChild(el('p', 'xp-sub', kind === 'event' ? p.flag + ' ' + p.place + ' · ' + p.when : p.flag + ' ' + p.name));
    if (p.entries && p.entries.length) {
      var ul = el('ul', 'xp-entries');
      p.entries.forEach(function (e) {
        var li = el('li'); var a = link(e.href, null, 'xp-entry');
        a.appendChild(thumb(e.img, ''));
        var tx = el('span', 'xp-text'); tx.appendChild(el('span', 'xp-kicker', e.kind + (e.year ? ' · ' + e.year : ''))); tx.appendChild(el('span', 'xp-title', e.title)); a.appendChild(tx);
        li.appendChild(a); ul.appendChild(li);
      });
      d.appendChild(ul);
    }
    var acts = el('p', 'xp-actions');
    acts.appendChild(link(p.href, kind === 'event' ? 'Event page' : 'All of ' + p.name.split(',')[0], 'button small primary'));
    acts.appendChild(link(p.maps.google, 'Google Maps', 'button small ghost', true));
    acts.appendChild(link(p.maps.osm, 'OpenStreetMap', 'button small ghost', true));
    d.appendChild(acts);
    body.appendChild(d);
    body.scrollTop = 0;
    if (narrow.matches) root.querySelector('.explore-panel').scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  tabs.forEach(function (b) {
    b.addEventListener('click', function () {
      tab = b.getAttribute('data-tab');
      tabs.forEach(function (x) { x.setAttribute('aria-selected', String(x === b)); });
      if (data) renderList();
    });
  });

  map.on('load', function () {
    darken();
    Promise.all([fetch('/geo/countries-50m.json').then(function (r) { return r.json(); }), fetch('/api/places').then(function (r) { return r.json(); })]).then(function (res) {
      var topo = res[0]; data = res[1];
      var focus = root.getAttribute('data-focus'), ev = root.getAttribute('data-event');
      var shapes = topojson.feature(topo, topo.objects.countries);
      shapes.features.forEach(function (f) { var n = data.countries[f.id] || 0; f.properties = { code: f.id, count: n, heat: heat(n) }; });
      map.addSource('countries', { type: 'geojson', data: shapes });
      map.addLayer({ id: 'countries-fill', type: 'fill', source: 'countries', paint: { 'fill-color': ['match', ['get', 'heat'], 1, HEAT[1], 2, HEAT[2], 3, HEAT[3], 4, HEAT[4], HEAT[0]], 'fill-opacity': ['interpolate', ['linear'], ['zoom'], 1, 0.55, 5, 0.3, 8, 0.08] } });
      map.addLayer({ id: 'countries-line', type: 'line', source: 'countries', paint: { 'line-color': '#c9a35c', 'line-opacity': ['interpolate', ['linear'], ['zoom'], 1, 0.25, 6, 0.5], 'line-width': 0.6 } });
      var pts = function (list, kind) { return { type: 'FeatureCollection', features: list.map(function (p, i) { return { type: 'Feature', id: i, geometry: { type: 'Point', coordinates: [p.lon, p.lat] }, properties: { i: i, kind: kind, count: p.count || 1, soon: p.soon ? 1 : 0, name: p.name } }; }) }; };
      map.addSource('pins', { type: 'geojson', data: pts(data.pins, 'pin') });
      map.addSource('events', { type: 'geojson', data: pts(data.events, 'event') });
      var hot = ['boolean', ['feature-state', 'hot'], false];
      map.addLayer({ id: 'pins', type: 'circle', source: 'pins', paint: { 'circle-color': '#e2bf74', 'circle-radius': ['+', ['interpolate', ['linear'], ['get', 'count'], 1, 4, 10, 10], ['case', hot, 5, 0]], 'circle-stroke-color': ['case', hot, '#fff1cc', '#0b0b0e'], 'circle-stroke-width': ['case', hot, 3, 1.2] } });
      map.addLayer({ id: 'events', type: 'circle', source: 'events', paint: { 'circle-color': ['case', ['==', ['get', 'soon'], 1], '#ff8a5c', '#a8553a'], 'circle-radius': ['case', hot, 11, 6], 'circle-stroke-color': '#fff1e6', 'circle-stroke-width': ['case', hot, 3, ['==', ['get', 'soon'], 1], 1.5, 0.6] } });
      map.addLayer({ id: 'pin-labels', type: 'symbol', source: 'pins', minzoom: 4, layout: { 'text-field': ['get', 'name'], 'text-font': ['Noto Sans Regular'], 'text-size': 12, 'text-offset': [0, 1.2], 'text-anchor': 'top', 'text-optional': true }, paint: { 'text-color': '#f3eee6', 'text-halo-color': '#0b0b0e', 'text-halo-width': 1.4 } });

      /* A name on hover; the detail goes to the panel. */
      var tip = new maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: 12, className: 'xp-tip' });
      ['pins', 'events'].forEach(function (layer) {
        map.on('mousemove', layer, function (e) { var f = e.features[0]; map.getCanvas().style.cursor = 'pointer'; tip.setLngLat(f.geometry.coordinates).setText(f.properties.name).addTo(map); });
        map.on('mouseleave', layer, function () { map.getCanvas().style.cursor = ''; tip.remove(); });
        map.on('click', layer, function (e) { tip.remove(); open(layer === 'events' ? 'event' : 'pin', e.features[0].properties.i, false); });
      });
      map.on('click', 'countries-fill', function (e) {
        if (map.queryRenderedFeatures(e.point, { layers: ['pins', 'events'] }).length) return;
        window.location.href = '/country/' + e.features[0].properties.code.toLowerCase();
      });
      map.on('mouseenter', 'countries-fill', function () { map.getCanvas().style.cursor = 'pointer'; });

      if (focus) {
        var f = shapes.features.filter(function (x) { return x.id === focus; })[0];
        if (f) { var b = new maplibregl.LngLatBounds(); (function walk(c) { if (typeof c[0] === 'number') b.extend(c); else c.forEach(walk); })(f.geometry.coordinates); map.fitBounds(b, { padding: 40, maxZoom: 7, duration: 0 }); }
      }
      renderList();
      if (ev) { var k = -1; data.events.forEach(function (x, i) { if (x.id === ev) k = i; }); if (k >= 0) { map.jumpTo({ center: [data.events[k].lon, data.events[k].lat], zoom: 11 }); open('event', k, false); } }
    }).catch(function () { body.insertAdjacentHTML('afterbegin', '<p class="notice">The map data did not load. <a href="/countries">Browse every country</a>.</p>'); });
  });
})();
