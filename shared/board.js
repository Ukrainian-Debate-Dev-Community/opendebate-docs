/* the workbench page: platform + version switches, the note modal, localStorage notes, export.
   Note keys are "<platform>:<version>:<page id>", kept under webdesign-notes-<platform>;
   export downloads <platform>-pages-notes-<version>.json for the board on screen. */
(function () {
  var WD = window.__WD;
  var store = {};
  function load(key, fallback) {
    try { var v = localStorage.getItem(key); return v == null ? fallback : v; } catch (e) { return fallback; }
  }
  function save(key, value) { try { localStorage.setItem(key, value); } catch (e) {} }
  function notesOf(platform) {
    if (!store[platform]) {
      try { store[platform] = JSON.parse(load('webdesign-notes-' + platform, '{}')) || {}; } catch (e) { store[platform] = {}; }
    }
    return store[platform];
  }

  var ov = document.getElementById('ov'), ta = document.getElementById('m-ta');
  var title = document.getElementById('m-title'), path = document.getElementById('m-path');
  var current = null;

  function where(el) {
    var s = el.closest('.version');
    return { platform: s.dataset.platform, version: s.dataset.version };
  }
  function keyOf(el) { var w = where(el); return w.platform + ':' + w.version + ':' + el.dataset.id; }
  function refresh(el) {
    var n = notesOf(where(el).platform)[keyOf(el)] || '';
    el.classList.toggle('has-note', !!n.trim());
  }

  var notable = document.querySelectorAll('.page, .swag .row');
  notable.forEach(refresh);
  notable.forEach(function (el) {
    el.addEventListener('click', function (e) {
      if (e.target.closest('a')) e.preventDefault();
      current = el;
      title.textContent = el.dataset.t || el.dataset.id;
      var cap = el.querySelector('.cap, .p');
      path.textContent = cap ? cap.textContent.trim().split('\n')[0] : '';
      ta.value = notesOf(where(el).platform)[keyOf(el)] || '';
      ov.classList.add('on');
      ta.focus();
    });
  });
  ta.addEventListener('input', function () {
    if (!current) return;
    var platform = where(current).platform;
    notesOf(platform)[keyOf(current)] = ta.value;
    save('webdesign-notes-' + platform, JSON.stringify(notesOf(platform)));
    refresh(current);
  });
  function close() { ov.classList.remove('on'); current = null; }
  ov.addEventListener('click', function (e) { if (e.target === ov) close(); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') close(); });

  document.getElementById('export').addEventListener('click', function () {
    var platform = document.body.dataset.platform, version = document.body.dataset.version;
    var prefix = platform + ':' + version + ':', notes = notesOf(platform), out = {};
    Object.keys(notes).forEach(function (k) {
      if (k.indexOf(prefix) === 0 && (notes[k] || '').trim()) out[k.slice(prefix.length)] = notes[k].trim();
    });
    var blob = new Blob([JSON.stringify(out, null, 2)], { type: 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = platform + '-pages-notes-' + version + '.json';
    a.click();
  });

  /* the switches: platform buttons, then that platform's versions, newest first.
     The choice lives in the URL hash (#cab/v3.8), so a link opens the same board. */
  var pfBox = document.getElementById('platform'), sel = document.getElementById('version');
  function platformOf(id) {
    for (var i = 0; i < WD.platforms.length; i++) if (WD.platforms[i].id === id) return WD.platforms[i];
    return null;
  }
  function show(platform, version) {
    var pf = platformOf(platform) || platformOf(WD.initial.platform);
    if (pf.versions.indexOf(version) < 0) version = pf.versions[pf.versions.length - 1];
    document.body.dataset.platform = pf.id;
    document.body.dataset.version = version;
    pfBox.querySelectorAll('button').forEach(function (b) {
      b.setAttribute('aria-selected', String(b.dataset.platform === pf.id));
    });
    sel.innerHTML = '';
    pf.versions.slice().reverse().forEach(function (v) {
      var o = document.createElement('option');
      o.value = o.textContent = v;
      sel.appendChild(o);
    });
    sel.value = version;
    document.querySelectorAll('.version').forEach(function (s) {
      s.hidden = !(s.dataset.platform === pf.id && s.dataset.version === version);
    });
    var hash = '#' + pf.id + '/' + version;
    if (location.hash !== hash) history.replaceState(null, '', hash);
  }
  function fromHash() {
    var m = location.hash.slice(1).split('/');
    show(m[0] || WD.initial.platform, m[1] || '');
  }
  pfBox.addEventListener('click', function (e) {
    var b = e.target.closest('button');
    if (b) show(b.dataset.platform, '');
  });
  sel.addEventListener('change', function () { show(document.body.dataset.platform, sel.value); });
  window.addEventListener('hashchange', fromHash);
  fromHash();

  /* theme: auto follows the system; light and dark pin it, like cab's own switch */
  var themeBtn = document.getElementById('theme');
  var LABEL = { auto: 'Auto', light: 'Light', dark: 'Dark' }, NEXT = { auto: 'light', light: 'dark', dark: 'auto' };
  function theme(state) {
    themeBtn.dataset.state = state;
    themeBtn.textContent = LABEL[state];
    themeBtn.title = state === 'auto' ? 'Theme: follows the system' : 'Theme: ' + state;
    if (state === 'auto') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', state);
  }
  theme(load('webdesign-theme', 'auto'));
  themeBtn.addEventListener('click', function () {
    var next = NEXT[themeBtn.dataset.state] || 'auto';
    save('webdesign-theme', next);
    theme(next);
  });
})();
