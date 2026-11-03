/* The home layout builder (/admin/layout): drag, arrows, style and width per block; each change saves the draft and refreshes the
 * preview. Publish and Back to the default call the same owner-only endpoints. */
(function () {
  var root = document.querySelector('[data-layout-editor]'); if (!root) return;
  var data = JSON.parse(document.getElementById('le-data').textContent);
  var list = root.querySelector('.le-list'), frame = root.querySelector('iframe'), state = root.querySelector('.le-state'), addSel = root.querySelector('#le-add-select');
  var plan = data.draft.slice(), byKey = {}; data.catalogue.forEach(function (c) { byKey[c.block] = c; });
  var timer = null, dragFrom = -1;

  function say(t) { state.textContent = t; }
  function refresh() { frame.src = '/admin/layout/frame?t=' + Date.now(); }
  function post(path, body) {
    return fetch(path, { method: 'POST', headers: { 'content-type': 'application/json' }, credentials: 'same-origin', body: JSON.stringify(body || {}) })
      .then(function (r) { return r.json().then(function (j) { if (!r.ok) throw new Error(j.error || r.status); return j; }); });
  }
  function save() {
    clearTimeout(timer); say('Saving draft…');
    timer = setTimeout(function () {
      post('/admin/layout/draft', { layout: plan }).then(function () { say('Draft saved. Not live until you publish.'); refresh(); })
        .catch(function (e) { say('Could not save: ' + e.message); });
    }, 250);
  }
  function option(value, label, selected) { var o = document.createElement('option'); o.value = value; o.textContent = label; if (selected) o.selected = true; return o; }
  function move(i, j) { if (j < 0 || j >= plan.length) return; var b = plan.splice(i, 1)[0]; plan.splice(j, 0, b); draw(); save(); var h = list.children[j] && list.children[j].querySelector('.le-handle'); if (h) h.focus(); }

  function draw() {
    list.innerHTML = '';
    plan.forEach(function (b, i) {
      var c = byKey[b.block] || { name: b.block, variants: [] };
      var li = document.createElement('li'); li.className = 'le-item'; li.draggable = true; li.dataset.index = i;
      var handle = document.createElement('button'); handle.type = 'button'; handle.className = 'le-handle'; handle.textContent = '⠿'; handle.setAttribute('aria-label', 'Move ' + c.name + ' (use arrow keys)');
      handle.addEventListener('keydown', function (e) { if (e.key === 'ArrowUp') { e.preventDefault(); move(i, i - 1); } if (e.key === 'ArrowDown') { e.preventDefault(); move(i, i + 1); } });
      var name = document.createElement('span'); name.className = 'le-name'; name.textContent = c.name;
      var controls = document.createElement('span'); controls.className = 'le-controls';
      if (c.variants.length) {
        var v = document.createElement('select'); v.setAttribute('aria-label', 'Style of ' + c.name);
        c.variants.forEach(function (x, k) { v.appendChild(option(x, x + (k === 0 ? ' (default)' : ''), (b.variant || c.variants[0]) === x)); });
        v.addEventListener('change', function () { plan[i].variant = v.value; save(); }); controls.appendChild(v);
      }
      var w = document.createElement('select'); w.setAttribute('aria-label', 'Width of ' + c.name);
      data.widths.forEach(function (x) { w.appendChild(option(x, x, (b.width || 'contained') === x)); });
      w.addEventListener('change', function () { plan[i].width = w.value; save(); }); controls.appendChild(w);
      [['↑', 'Move up', function () { move(i, i - 1); }], ['↓', 'Move down', function () { move(i, i + 1); }], ['✕', 'Remove ' + c.name, function () { plan.splice(i, 1); draw(); save(); }]].forEach(function (a) {
        var x = document.createElement('button'); x.type = 'button'; x.className = 'le-btn'; x.textContent = a[0]; x.setAttribute('aria-label', a[1]); x.addEventListener('click', a[2]); controls.appendChild(x);
      });
      li.addEventListener('dragstart', function (e) { dragFrom = i; li.classList.add('dragging'); e.dataTransfer.effectAllowed = 'move'; });
      li.addEventListener('dragend', function () { li.classList.remove('dragging'); });
      li.addEventListener('dragover', function (e) { e.preventDefault(); li.classList.add('over'); });
      li.addEventListener('dragleave', function () { li.classList.remove('over'); });
      li.addEventListener('drop', function (e) { e.preventDefault(); li.classList.remove('over'); if (dragFrom > -1 && dragFrom !== i) move(dragFrom, i); dragFrom = -1; });
      li.appendChild(handle); li.appendChild(name); li.appendChild(controls); list.appendChild(li);
    });
    addSel.innerHTML = ''; data.catalogue.forEach(function (c) { addSel.appendChild(option(c.block, c.name + (plan.some(function (b) { return b.block === c.block; }) ? ' (again)' : ''))); });
  }
  root.querySelector('[data-le-add]').addEventListener('click', function () { plan.push({ block: addSel.value }); draw(); save(); });
  root.querySelector('[data-le-publish]').addEventListener('click', function () { say('Publishing…'); post('/admin/layout/draft', { layout: plan }).then(function () { return post('/admin/layout/publish'); }).then(function () { say('Published. This is now the home page everyone sees.'); }).catch(function (e) { say('Could not publish: ' + e.message); }); });
  root.querySelector('[data-le-reset]').addEventListener('click', function () { if (!confirm('Go back to the default home page? Your draft and published layout will be cleared.')) return; post('/admin/layout/reset').then(function (j) { plan = j.layout; draw(); refresh(); say('Back to the default layout, live now.'); }).catch(function (e) { say('Could not reset: ' + e.message); }); });
  draw();
})();
