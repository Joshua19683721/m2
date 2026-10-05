/* ══════════════════════════════════════════════════════════════
   speech.js — 朗讀（Web Speech API）
   沿用 wordmomo 的做法：挑英文語音、速度可調、可連播幾次。
   ══════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  var selected = null;
  var onVoices = null;
  var listeners = [];

  function supported() { return 'speechSynthesis' in global; }

  function score(v) {
    var n = (v.name || '') + ' ' + (v.voiceURI || '');
    var s = 0;
    if (/google/i.test(n)) s += 4;
    if (/samantha|karen|daniel|serena|arthur|martha/i.test(n)) s += 3;
    if (/microsoft/i.test(n)) s += 2;
    if (/natural|neural|enhanced|premium/i.test(n)) s += 2;
    if (v.localService) s += 1;
    return s;
  }

  function englishVoices() {
    if (!supported()) return [];
    return speechSynthesis.getVoices()
      .filter(function (v) { return /^en/i.test(v.lang || ''); })
      .sort(function (a, b) { return score(b) - score(a); });
  }

  function init(selectEl) {
    if (!supported()) {
      if (selectEl) selectEl.innerHTML = '<option>此瀏覽器不支援</option>';
      return;
    }

    function fill() {
      var list = englishVoices();
      if (selectEl) {
        selectEl.innerHTML = '';
        if (!list.length) {
          selectEl.innerHTML = '<option>找不到英文語音</option>';
        } else {
          list.forEach(function (v) {
            var o = document.createElement('option');
            o.value = v.name + '|' + v.lang;
            o.textContent = v.name + '  (' + v.lang + ')';
            selectEl.appendChild(o);
          });
          if (selected) {
            for (var i = 0; i < list.length; i++) {
              if (list[i].name === selected.name) { selectEl.selectedIndex = i; break; }
            }
          }
        }
      }
      if (list.length && !selected) selected = list[0];
      listeners.forEach(function (fn) { fn(list); });
    }

    fill();
    speechSynthesis.onvoiceschanged = fill;
    // 部分瀏覽器第一次 getVoices() 會回空陣列
    var tries = 0;
    var timer = setInterval(function () {
      if (englishVoices().length || ++tries > 12) { clearInterval(timer); fill(); }
    }, 250);

    if (selectEl) {
      selectEl.addEventListener('change', function () {
        var parts = (selectEl.value || '').split('|');
        var found = englishVoices().filter(function (v) { return v.name === parts[0]; })[0];
        if (found) selected = found;
      });
    }
  }

  function clean(text) {
    return String(text || '')
      .replace(/[’‘]/g, "'")
      .replace(/[^a-zA-Z0-9\s']/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * 朗讀文字。
   * @param {string} text
   * @param {number} times 連播次數
   * @param {object} opts  { rate }
   */
  function say(text, times, opts) {
    if (!supported() || !text) return false;
    var t = clean(text);
    if (!t) return false;
    opts = opts || {};
    speechSynthesis.cancel();
    var n = Math.max(1, times || 1);
    for (var i = 0; i < n; i++) {
      var u = new SpeechSynthesisUtterance(t);
      if (selected) u.voice = selected;
      u.lang = (selected && selected.lang) || 'en-GB';
      u.rate = opts.rate || 0.9;
      u.pitch = 1;
      speechSynthesis.speak(u);
    }
    return true;
  }

  function stop() { if (supported()) speechSynthesis.cancel(); }

  global.Speech = {
    init: init,
    say: say,
    stop: stop,
    supported: supported,
    voices: englishVoices,
    onChange: function (fn) { listeners.push(fn); },
    current: function () { return selected; }
  };
})(window);
