/* ══════════════════════════════════════════════════════════════
   app.js — 啟動、畫面切換、快捷鍵、Toast
   ══════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };

  var current = 'home';

  /* ───────── 網址 hash 路由（可分享／可回上一頁） ─────────
     #practice/<sceneId>/<mode>/<index>   直接開啟某一張練習
     #scene/<sceneId>/<mode>              直接開啟某個場景
  */
  function readHash() {
    var h = decodeURIComponent(location.hash || '').replace(/^#/, '');
    var p = h.split('/').filter(Boolean);
    if (!p.length) return null;
    if (p[0] === 'practice' && p[1]) {
      return { view: 'practice', scene: p[1], mode: p[2] || 'words', index: parseInt(p[3], 10) || 0 };
    }
    if (p[0] === 'scene' && p[1]) {
      return { view: 'scene', scene: p[1], mode: p[2] || 'words' };
    }
    return null;
  }

  var suppressHash = false;

  function writeHash(view, sceneId, mode, index) {
    if (suppressHash) return;
    var next;
    if (view === 'practice') next = '#practice/' + sceneId + '/' + mode + '/' + (index || 0);
    else if (view === 'scene') next = '#scene/' + sceneId + '/' + mode;
    else next = '#home';
    if (location.hash !== next) {
      suppressHash = true;
      history.replaceState(null, '', next);
      setTimeout(function () { suppressHash = false; }, 0);
    }
  }

  function applyHash() {
    var r = readHash();
    if (!r) return false;
    if (!Home.sceneById(r.scene)) return false;
    if (r.view === 'practice') {
      Home.openScene(r.scene);
      if (Home.state.mode !== r.mode) Home.setMode(r.mode);
      Practice.startAt(r.index || 0);
      return true;
    }
    Home.openScene(r.scene);
    if (Home.state.mode !== r.mode) Home.setMode(r.mode);
    return true;
  }

  function showView(name) {
    current = name;
    ['home', 'scene', 'practice'].forEach(function (v) {
      var el = $('view' + v.charAt(0).toUpperCase() + v.slice(1));
      if (el) el.classList.toggle('view--active', v === name);
    });
    if (name !== 'practice' && global.Practice) Practice.stopTimer();
    if (name === 'home') Home.renderSceneGrid();
    var scene = Home.state && Home.state.scene;
    writeHash(name, scene && scene.id, Home.state && Home.state.mode,
              Practice.state.index);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  /* ───────── Toast ───────── */
  var toastTimer = null;
  function toast(msg) {
    var el = $('toast');
    if (!el) return;
    el.textContent = msg;
    requestAnimationFrame(function () { el.classList.add('show'); });
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.classList.remove('show'); }, 3000);
  }

  /* ───────── 快捷鍵 ───────── */
  function typing() {
    var a = document.activeElement;
    return a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA');
  }

  /** 有彈窗／抽屜開著的時候不要搶按鍵 */
  function panelOpen() {
    return !!document.querySelector('.modal:not([hidden])') ||
           !!($('explainPanel') && $('explainPanel').classList.contains('open'));
  }

  function bindKeys() {
    document.addEventListener('keydown', function (e) {
      // Alt 組合：任何畫面都吃
      if (e.altKey) {
        var k = (e.key || '').toLowerCase();
        if (k === 'z') { e.preventDefault(); current === 'practice' ? UI.toggleExplain() : UI.openModal('helpModal'); return; }
        if (e.key === "'" || e.code === 'Quote') { e.preventDefault(); if (current === 'practice') Practice.speakUnit(); return; }
        if (k === 'w') { e.preventDefault(); if (current === 'practice') Practice.speakWord(); return; }
        if (k === 'p') { e.preventDefault(); if (current === 'practice') Practice.prev(); return; }
        if (k === 'n') { e.preventDefault(); if (current === 'practice') Practice.next(); return; }
        return;
      }

      if (e.key === 'Escape') { UI.closeAll(); return; }

      if (current === 'practice') {
        if (document.activeElement && document.activeElement.id === 'blindInput') {
          if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); Practice.submitBlind(); return; }
          // 盲打：整句還沒送出去之前，空白鍵要能正常輸入；
          //       送出去而且全對之後，按空白鍵改成跳到下一句。
          if ((e.key === ' ' || e.code === 'Space') && Practice.blindDone()) {
            e.preventDefault();
            Practice.next();
            return;
          }
          return;
        }
        if (e.key === 'Enter') {
          var a = document.activeElement;
          if (a && a.tagName === 'BUTTON') return;
          e.preventDefault();
          Practice.restart();
          return;
        }
        if (e.key === 'ArrowRight' && !typing()) { e.preventDefault(); Practice.next(); return; }
        if (e.key === 'ArrowLeft' && !typing()) { e.preventDefault(); Practice.prev(); return; }
        // 空白鍵：句子還沒打完 → 朗讀目前這個單字；整句都打完 → 跳到下一張。
        // 逐字模式的輸入框自己已經吃掉空白鍵（e.defaultPrevented），這裡不會重複處理；
        // 整句打完後輸入框會失焦，就由這裡接手換張。
        if ((e.key === ' ' || e.code === 'Space') && !e.defaultPrevented && !panelOpen()) {
          var ae = document.activeElement;
          if (ae && ae.tagName === 'BUTTON') return;   // 焦點在按鈕上時留給按鈕
          if (Practice.handleSpace()) e.preventDefault();
        }
      }
    });
  }

  /* ───────── 啟動 ───────── */
  function boot() {
    if (!global.SCENES || !SCENES.length) {
      document.body.innerHTML =
        '<div style="max-width:640px;margin:80px auto;padding:24px;font-family:sans-serif;color:#fff">' +
        '<h2>⚠️ 讀不到場景資料</h2>' +
        '<p style="color:#b9c0d0;line-height:2">請確認 <code>data/scenes.js</code> 存在，' +
        '或先執行 <code>python tools/build_scenes.py</code> 產生詞庫檔。</p></div>';
      return;
    }

    global.SCENE_INDEX = global.SCENE_INDEX || {};
    SCENES.forEach(function (s) { global.SCENE_INDEX[s.id] = s; });

    // 把各場景的音標註冊進全域字典，句子音標才有辦法即時組合
    Ipa.registerAll(SCENES);

    // 設定列的字級套用
    var s = Store.settings();
    document.documentElement.style.setProperty('--type-size', s.fontSize + 'px');

    Speech.init($('voiceSelect'));
    Home.init();
    UI.init();
    bindKeys();

    // 事件
    $('practiceBack').addEventListener('click', Practice.back);
    $('explainBtn').addEventListener('click', UI.toggleExplain);
    $('speakBtn').addEventListener('click', Practice.speakUnit);
    $('wordSpeakBtn').addEventListener('click', Practice.speakWord);
    $('prevBtn').addEventListener('click', Practice.prev);
    $('nextBtn').addEventListener('click', Practice.next);
    $('restartBtn').addEventListener('click', Practice.restart);
    $('imeHintClose').addEventListener('click', function () {
      var h = $('imeHint'); if (h) h.style.display = 'none';
    });

    if (!applyHash()) showView('home');
    window.addEventListener('hashchange', function () { if (!applyHash()) showView('home'); });

    // ?explain=1 / ?stats=1 直接開啟對應面板（也方便外部連結帶進來）
    if (/[?&]explain=1/.test(location.search)) {
      setTimeout(function () { UI.openExplain(); }, 300);
    }
    if (/[?&]stats=1/.test(location.search)) {
      setTimeout(function () { UI.openModal('statsModal'); }, 300);
    }

    console.log('[場景式英文輸入練習] 場景 ' + SCENES.length + ' 個 · 音標字典 ' + Ipa.size() + ' 筆');
  }

  global.App = {
    showView: showView, toast: toast, boot: boot,
    view: function () { return current; },
    // 讓其他模組可以用 App.Practice.xxx 的寫法取用
    Practice: global.Practice, Store: global.Store, Home: global.Home, Ipa: global.Ipa
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})(window);
