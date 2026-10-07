/* ported from design/pages-board.html <script> — comment modal + localStorage notes + export.
   Adapted for the versioned workbench: note keys are "<target>:<version>:<page id>",
   export downloads <target>-pages-notes-<version>.json for the version on screen. */
(function () {
  var target = (window.__WD && window.__WD.target) || 'board';
  var KEY = 'webdesign-notes-' + target;
  var notes = {};
  try { notes = JSON.parse(localStorage.getItem(KEY) || '{}'); } catch (e) {}
  var ov = document.getElementById('ov'), ta = document.getElementById('m-ta');
  var title = document.getElementById('m-title'), path = document.getElementById('m-path');
  var current = null;

  function versionOf(el) {
    var v = el.closest('.version');
    return v ? v.dataset.version : '';
  }
  function keyOf(el) { return target + ':' + versionOf(el) + ':' + el.dataset.id; }
  function refresh(el) { el.classList.toggle('has-note', !!(notes[keyOf(el)] || '').trim()); }

  var targets = document.querySelectorAll('.page, .swag .row');
  targets.forEach(refresh);

  targets.forEach(function (el) {
    el.addEventListener('click', function (e) {
      if (e.target.closest('a')) e.preventDefault();
      current = el;
      title.textContent = el.dataset.t || el.dataset.id;
      var cap = el.querySelector('.cap, .p');
      path.textContent = cap ? cap.textContent.trim().split('\n')[0] : '';
      ta.value = notes[keyOf(el)] || '';
      ov.classList.add('on');
      ta.focus();
    });
  });
  ta.addEventListener('input', function () {
    if (!current) return;
    notes[keyOf(current)] = ta.value;
    try { localStorage.setItem(KEY, JSON.stringify(notes)); } catch (e) {}
    refresh(current);
  });
  ov.addEventListener('click', function (e) {
    if (e.target === ov) { ov.classList.remove('on'); current = null; }
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') { ov.classList.remove('on'); current = null; }
  });
  document.getElementById('export').addEventListener('click', function () {
    var version = document.body.dataset.version || '';
    var prefix = target + ':' + version + ':';
    var out = {};
    Object.keys(notes).forEach(function (k) {
      if (k.indexOf(prefix) === 0 && (notes[k] || '').trim()) {
        out[k.slice(prefix.length)] = notes[k].trim();
      }
    });
    var blob = new Blob([JSON.stringify(out, null, 2)], { type: 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = target + '-pages-notes-' + version + '.json';
    a.click();
  });

  /* version switcher */
  var sel = document.getElementById('ver');
  function show(v) {
    document.body.dataset.version = v;
    document.querySelectorAll('.version').forEach(function (d) {
      d.hidden = d.dataset.version !== v;
    });
  }
  if (sel) {
    sel.addEventListener('change', function () { show(sel.value); });
    show(sel.value);
  }
})();
