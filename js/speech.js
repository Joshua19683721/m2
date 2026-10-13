/* ══════════════════════════════════════════════════════════════
   speech.js — 朗讀（Web Speech API）
   沿用 wordmomo 的做法：速度可調、可連播幾次。

   語音選項：列出所有可以發音的語音，Microsoft Mark 優先。
   沒裝 Mark 的電腦就退回排序後面的其他語音。
   ══════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  var selected = null;
  var onVoices = null;
  var listeners = [];

  function supported() { return 'speechSynthesis' in global; }

  /* 這個 App 優先用微軟的 Mark（en-US）朗讀。 */
  var PREFERRED = /microsoft[\s_-]*mark/i;

  function isPreferred(v) {
    return PREFERRED.test((v.name || '') + ' ' + (v.voiceURI || ''));
  }

  function score(v) {
    var n = (v.name || '') + ' ' + (v.voiceURI || '');
    var s = 0;
    if (isPreferred(v) && /^en[-_]US/i.test(v.lang || '')) s += 100;
    else if (isPreferred(v)) s += 50;
    if (/google/i.test(n)) s += 4;
    if (/samantha|karen|daniel|serena|arthur|martha/i.test(n)) s += 3;
    if (/microsoft/i.test(n)) s += 2;
    if (/natural|neural|enhanced|premium/i.test(n)) s += 2;
    if (v.localService) s += 1;
    return s;
  }

  /** 所有可以發音的語音，依優先序排列 */
  function allVoices() {
    if (!supported()) return [];
    // 複製一份再排序，不要修改 getVoices() 回傳的原陣列
    return speechSynthesis.getVoices().slice()
      .sort(function (a, b) { return score(b) - score(a); });
  }

  /** 預設要用的語音：Microsoft Mark (en-US)，沒有就取排序後第一個 */
  function defaultVoice(list) {
    var us = list.filter(function (v) {
      return isPreferred(v) && /^en[-_]US/i.test(v.lang || '');
    });
    if (us.length) return us[0];
    var any = list.filter(isPreferred);
    if (any.length) return any[0];
    return list[0];
  }

  function init(selectEl) {
    if (!supported()) {
      if (selectEl) selectEl.innerHTML = '<option>此瀏覽器不支援</option>';
      return;
    }

    function fill() {
      var list = allVoices();
      if (selectEl) {
        selectEl.innerHTML = '';
        if (!list.length) {
          selectEl.innerHTML = '<option>找不到語音</option>';
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
      if (list.length && !selected) selected = defaultVoice(list);
      listeners.forEach(function (fn) { fn(list); });
    }

    fill();
    speechSynthesis.onvoiceschanged = fill;
    // 部分瀏覽器第一次 getVoices() 會回空陣列
    var tries = 0;
    var timer = setInterval(function () {
      if (allVoices().length || ++tries > 12) { clearInterval(timer); fill(); }
    }, 250);

    if (selectEl) {
      selectEl.addEventListener('change', function () {
        var parts = (selectEl.value || '').split('|');
        var found = allVoices().filter(function (v) { return v.name === parts[0]; })[0];
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

  /** 語音清單還沒載入就先現挑一個（避免第一句朗讀沒聲音） */
  function currentVoice() {
    if (selected) return selected;
    var list = allVoices();
    if (list.length) selected = defaultVoice(list);
    return selected;
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
    var v = currentVoice();
    var n = Math.max(1, times || 1);
    for (var i = 0; i < n; i++) {
      var u = new SpeechSynthesisUtterance(t);
      if (v) u.voice = v;
      u.lang = (v && v.lang) || 'en-US';
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
    voices: allVoices,
    onChange: function (fn) { listeners.push(fn); },
    current: currentVoice,
    preferred: defaultVoice
  };
})(window);