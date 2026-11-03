/* "Describe what you want to build", live as you type. The same keyword table the server uses (src/build.mjs), read from the page;
 * no AI is called and nothing is sent anywhere. With JavaScript off, the form submits and the server answers. */
(function () {
  var data = document.getElementById('wcc-projects'), input = document.getElementById('wcc-q'), out = document.getElementById('wcc-answer');
  if (!data || !input || !out) return;
  var t = JSON.parse(data.textContent);
  var esc = function (s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  function match(text) {
    var words = String(text || '').toLowerCase().replace(/[^a-z0-9\- ]+/g, ' ').split(/\s+/).filter(Boolean), best = null, hits = 0;
    t.projects.forEach(function (p) {
      var n = words.filter(function (w) { return p.words.indexOf(w) >= 0 || p.words.some(function (k) { return k.length > 4 && w.indexOf(k) === 0; }); }).length;
      if (n > hits) { best = p; hits = n; }
    });
    return best || t.fallback;
  }
  function render() {
    var q = input.value.trim().slice(0, 200);
    if (!q) { out.innerHTML = ''; return; }
    var p = match(q), days = Object.keys(p.days).map(function (n) { return '<li><span class="wcc-dn">Day ' + n + '</span><b>' + esc(t.titles[n] || 'Day ' + n) + '</b><span>' + esc(p.days[n]) + '</span></li>'; }).join('');
    out.innerHTML = '<p class="wcc-answer-h">Closest example: <b>' + esc(p.label) + '</b>. Here is what your 10 days, in two 5-day levels, would build.</p><ol class="wcc-answer-days">' + days + '</ol><p class="wcc-answer-end"><b>It ends live, and hosted free.</b> Finish Level 2 and your tool is hosted free on Ontold, with your own domain set up for you. <a href="#free-product">' + esc(t.tbc) + '</a>.</p>';
  }
  var timer; input.addEventListener('input', function () { clearTimeout(timer); timer = setTimeout(render, 120); });
})();
