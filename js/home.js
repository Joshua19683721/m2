/* ══════════════════════════════════════════════════════════════
   home.js — 場景總覽、搜尋、場景內單元清單
   ══════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };

  var state = {
    scene: null,        // 目前場景物件
    mode: 'words',      // words | phrases | sentences | blind
    search: '',
    filterGroup: '',
    shuffle: false,
    mistakesOnly: false
  };

  /* ───────── 資料 ───────── */
  function scenes() { return (global.SCENES || []); }
  function sceneById(id) { return (global.SCENE_INDEX || {})[id] || null; }
  function groups() { return (global.SCENE_GROUPS || []); }

  /** 某場景＋某模式的單元陣列 */
  function unitsFor(scene, mode) {
    if (!scene) return [];
    if (mode === 'blind') return (scene.sentences || []).map(function (s, i) {
      return { en: s.en, zh: s.zh, ipa: Ipa.compose(s.en), index: i };
    });
    return (scene[mode] || []).map(function (s, i) {
      return { en: s.en, zh: s.zh, ipa: Ipa.ensureIpa(s), index: i };
    });
  }

  /** 依「隨機 / 只看錯題」調整單元順序 */
  function visibleUnits(scene, mode) {
    var units = unitsFor(scene, mode).slice();
    if (state.mistakesOnly) {
      var prog = Store.sceneProgress(scene.id)[mode] || {};
      units = units.filter(function (u) {
        var st = prog[u.index];
        return st && st.err > 0 && !st.done;
      });
    }
    if (state.shuffle) {
      for (var i = units.length - 1; i > 0; i--) {
        var j = Math.floor(Math.random() * (i + 1));
        var t = units[i]; units[i] = units[j]; units[j] = t;
      }
    }
    return units;
  }

  /** 場景完成度 */
  function sceneStats(sceneId) {
    var modes = ['words', 'phrases', 'sentences', 'blind'];
    var total = 0, done = 0, errs = 0;
    var byMode = {};
    modes.forEach(function (m) {
      var t = unitsFor(sceneById(sceneId), m).length;
      var prog = Store.sceneProgress(sceneId)[m] || {};
      var d = 0;
      Object.keys(prog).forEach(function (k) {
        if (prog[k].done) d++;
        errs += prog[k].err || 0;
      });
      byMode[m] = { total: t, done: d };
      total += t; done += d;
    });
    return {
      total: total, done: done, errs: errs, byMode: byMode,
      pct: total ? Math.round(100 * done / total) : 0
    };
  }

  /* ───────── 首頁 ───────── */
  function matchesQuery(scene, q) {
    if (!q) return true;
    q = q.toLowerCase().trim();
    if (!q) return true;
    if ((scene.name || '').toLowerCase().indexOf(q) >= 0) return true;
    if ((scene.nameEn || '').toLowerCase().indexOf(q) >= 0) return true;
    if ((scene.summary || '').toLowerCase().indexOf(q) >= 0) return true;
    var hit = false;
    ['words', 'phrases', 'sentences'].forEach(function (m) {
      (scene[m] || []).forEach(function (it) {
        if (String(it.en).toLowerCase().indexOf(q) >= 0 ||
            String(it.zh || '').indexOf(q) >= 0) hit = true;
      });
    });
    return hit;
  }

  function renderChips() {
    var box = $('homeChips');
    if (!box) return;
    box.innerHTML = '';
    var all = [''].concat(groups());
    all.forEach(function (g) {
      var b = document.createElement('button');
      b.className = 'chip' + ((state.filterGroup === g) ? ' chip--on' : '');
      b.textContent = g || '全部';
      b.addEventListener('click', function () {
        state.filterGroup = (state.filterGroup === g) ? '' : g;
        renderChips(); renderSceneGrid();
      });
      box.appendChild(b);
    });
  }

  function renderSceneGrid() {
    var grid = $('sceneGrid');
    if (!grid) return;
    grid.innerHTML = '';

    var list = scenes().filter(function (s) {
      if (state.filterGroup && s.group !== state.filterGroup) return false;
      return matchesQuery(s, state.search);
    });

    if (!list.length) {
      var e = document.createElement('div');
      e.className = 'empty-hint';
      e.textContent = '找不到符合的場景，換個關鍵字試試。';
      grid.appendChild(e);
      return;
    }

    list.forEach(function (scene) {
      var st = sceneStats(scene.id);
      var card = document.createElement('button');
      card.className = 'scene-card';
      card.innerHTML =
        '<div class="scene-card__top">' +
          '<span class="scene-card__ico">' + scene.icon + '</span>' +
          '<span><span class="scene-card__name">' + Analysis.escapeHtml(scene.name) + '</span><br>' +
          '<span class="scene-card__en">' + Analysis.escapeHtml(scene.nameEn || '') + '</span></span>' +
        '</div>' +
        '<div class="scene-card__sum">' + Analysis.escapeHtml(scene.summary || '') + '</div>' +
        '<div class="scene-card__foot">' +
          '<span class="ring" style="--p:' + st.pct + '"><span class="ring__txt">' + st.pct + '%</span></span>' +
          '<span class="bar"><i style="width:' + st.pct + '%"></i></span>' +
          '<span>' + st.done + '/' + st.total + '</span>' +
        '</div>';
      card.addEventListener('click', function () { openScene(scene.id); });
      grid.appendChild(card);
    });

    // 首頁統計
    var totalAll = 0, doneAll = 0;
    scenes().forEach(function (s) {
      var st = sceneStats(s.id);
      totalAll += st.total; doneAll += st.done;
    });
    var hero = $('heroTotal');
    if (hero) hero.textContent = totalAll;
    var done = $('heroDone');
    if (done) {
      done.textContent = doneAll === 0 ? '尚未開始'
        : '已完成 ' + doneAll + ' / ' + totalAll + ' 個單元';
    }

    renderDaily();
  }

  /* ───────── 今日進度 ───────── */
  function renderDaily() {
    var el = $('heroDaily');
    if (!el) return;
    var cards = Store.todayCount();
    var goal = Store.dailyGoal();
    var pct = Math.min(100, Math.round(cards / goal * 100));
    el.innerHTML =
      '<div class="hero-stat__label">今日挑戰</div>' +
      '<div class="hero-stat__num" style="font-size:1.5rem;color:var(--green)">' +
      cards + ' / ' + goal + '</div>' +
      '<div class="bar" style="margin-top:6px"><i style="width:' + pct + '%"></i></div>' +
      '<div class="hero-stat__sub" style="margin-top:4px">' +
      (cards >= goal ? '今天完成啦 🎉' : '再練 ' + (goal - cards) + ' 張就達標') + '</div>';
  }

  /**
   * 隨機挑一張還沒練過的單元（跨場景、跨模式）。
   * 沒練過的權重設為已練過的 3 倍，全部都練完時就純亂數。
   */
  function randomUnit() {
    var pool = [];
    scenes().forEach(function (sc) {
      Store.MODES.forEach(function (mode) {
        var n = unitsFor(sc, mode).length;
        if (!n) return;
        var prog = Store.sceneProgress(sc.id)[mode] || {};
        for (var i = 0; i < n; i++) {
          var st = prog[i];
          var done = st && st.done;
          var weight = done ? 1 : (st && st.err ? 2 : 3);
          for (var k = 0; k < weight; k++) {
            pool.push({ scene: sc.id, mode: mode, index: i });
          }
        }
      });
    });
    if (!pool.length) return null;
    return pool[Math.floor(Math.random() * pool.length)];
  }

  function startRandom() {
    var pick = randomUnit();
    if (!pick) { global.App.toast('目前沒有可練習的單元'); return; }
    jumpTo(pick.scene, pick.mode, pick.index);
  }

  /** 跳到某個場景／模式／單元（錯題本與隨機挑戰共用） */
  function jumpTo(sceneId, mode, index) {
    openScene(sceneId);
    if (state.mode !== mode) state.mode = mode;
    renderSceneView();
    Practice.prepare();
    Practice.startAt(index);
  }

  /**
   * 錯題本：跨全部場景與模式，挑出「累計錯誤次數」最多的單元。
   * errTotal 是累積的，所以就算後來練對了，弱點仍然留著——這才是需要複習的。
   */
  function weakUnits(limit) {
    var out = [];
    scenes().forEach(function (sc) {
      Store.MODES.forEach(function (mode) {
        var units = unitsFor(sc, mode);
        var prog = Store.sceneProgress(sc.id)[mode] || {};
        units.forEach(function (u) {
          var st = prog[u.index];
          if (!st || !st.errTotal) return;
          out.push({
            scene: sc.id, sceneName: sc.name, sceneIcon: sc.icon,
            mode: mode, index: u.index,
            en: u.en, zh: u.zh, ipa: u.ipa,
            errTotal: st.errTotal, done: !!st.done
          });
        });
      });
    });
    out.sort(function (a, b) { return b.errTotal - a.errTotal; });
    return limit ? out.slice(0, limit) : out;
  }

  function renderWeak() {
    var box = $('weakList');
    if (!box) return;
    box.innerHTML = '';
    var items = weakUnits();
    var countEl = $('weakCount');
    if (countEl) countEl.textContent = items.length ? items.length + ' 個單元曾經打錯' : '';
    if (!items.length) {
      var e = document.createElement('div');
      e.className = 'empty-hint';
      e.textContent = '目前還沒有錯題紀錄，繼續練習就好。';
      box.appendChild(e);
      return;
    }
    items.slice(0, 60).forEach(function (it) {
      var row = document.createElement('button');
      row.className = 'unit-row';
      row.innerHTML =
        '<span class="unit-row__n">' + it.sceneIcon + '</span>' +
        '<span class="unit-row__main">' +
          '<span class="unit-row__en">' + Analysis.escapeHtml(it.en) + '</span>' +
          '<span class="unit-row__zh">' + Analysis.escapeHtml(it.zh || '') +
            '　·　' + Analysis.escapeHtml(it.sceneName) + ' / ' + Store.MODE_LABEL[it.mode] + '</span>' +
        '</span>' +
        '<span class="unit-row__stats">' +
          '<span class="pill pill--bad">累計錯 ' + it.errTotal + ' 次</span>' +
          (it.done ? '<span class="pill pill--ok">已練對</span>' : '') +
        '</span>';
      row.addEventListener('click', function () { jumpTo(it.scene, it.mode, it.index); });
      box.appendChild(row);
    });
  }

  /* ───────── 場景頁 ───────── */
  function renderSceneView() {
    var scene = state.scene;
    if (!scene) return;

    $('sceneIcon').textContent = scene.icon;
    $('sceneName').textContent = scene.name + '　' + (scene.nameEn || '');
    $('sceneSummary').textContent = scene.summary || '';

    var st = sceneStats(scene.id);
    $('sceneProgressFill').style.width = st.pct + '%';
    $('sceneMeta').innerHTML =
      '共 <b>' + st.total + '</b> 個單元 · 已完成 <b>' + st.done + '</b> · ' +
      '累計打字錯誤 <b>' + st.errs + '</b> 次' +
      (scene.note ? '<br>💡 ' + Analysis.escapeHtml(scene.note) : '');

    // 分頁數量
    ['words', 'phrases', 'sentences', 'blind'].forEach(function (m) {
      var el = document.querySelector('[data-n="' + m + '"]');
      if (el) el.textContent = st.byMode[m].total;
    });
    Array.prototype.forEach.call(document.querySelectorAll('#modeTabs .tab'), function (t) {
      t.classList.toggle('tab--on', t.dataset.mode === state.mode);
    });

    renderUnitList();
  }

  function renderUnitList() {
    var scene = state.scene;
    var list = $('unitList');
    list.innerHTML = '';

    var units = visibleUnits(scene, state.mode);
    var prog = Store.sceneProgress(scene.id)[state.mode] || {};
    $('listCount').textContent = state.mistakesOnly
      ? '錯題模式：' + units.length + ' 個單元還沒練對'
      : Store.MODE_LABEL[state.mode] + '：共 ' + units.length + ' 個單元';

    if (!units.length) {
      var e = document.createElement('div');
      e.className = 'empty-hint';
      e.textContent = state.mistakesOnly ? '這個場景沒有錯題了，很棒！' : '這個場景還沒有內容。';
      list.appendChild(e);
      return;
    }

    units.forEach(function (u, i) {
      var s = prog[u.index] || Store.emptyUnit();
      var row = document.createElement('button');
      row.className = 'unit-row';

      var pills = '';
      if (s.done) pills += '<span class="pill pill--ok">✔ 已完成</span>';
      else if (s.err) pills += '<span class="pill pill--bad">錯 ' + s.err + '</span>';
      else pills += '<span class="pill pill--new">未練習</span>';
      if (s.best) pills += '<span class="pill">' + s.best + ' 秒</span>';

      // 盲打模式還沒動過的單元先不給看英文，否則一進清單就看到答案
      var blindHidden = state.mode === 'blind' && !s.done && !s.attempts;
      var enHtml = blindHidden
        ? '<span class="unit-row__en unit-row__en--hidden">▒▒▒▒▒　先自己寫出來</span>'
        : '<span class="unit-row__en">' + Analysis.escapeHtml(u.en) + '</span>';

      row.innerHTML =
        '<span class="unit-row__n">' + String(i + 1).padStart(2, '0') + '</span>' +
        '<span class="unit-row__main">' +
          enHtml +
          (u.zh ? '<span class="unit-row__zh">' + Analysis.escapeHtml(u.zh) + '</span>' : '') +
          (!blindHidden && u.ipa
            ? '<span class="unit-row__ipa">/' + Analysis.escapeHtml(u.ipa) + '/</span>'
            : '') +
        '</span>' +
        '<span class="unit-row__stats">' + pills + '</span>';

      row.addEventListener('click', function () { Practice.startAt(i); });
      list.appendChild(row);
    });
  }

  function openScene(id) {
    var scene = sceneById(id);
    if (!scene) return;
    state.scene = scene;
    Ipa.registerScene(scene);
    App.showView('scene');
    renderSceneView();
  }

  function setMode(mode) {
    state.mode = mode;
    if (state.scene) {
      renderSceneView();
      Practice.prepare();
    }
  }

  function openSceneTab(mode) {
    setMode(mode);
    Practice.startAt(0);
  }

  /* ───────── 初始化 ───────── */
  function init() {
    $('randomBtn').addEventListener('click', startRandom);

    $('sceneSearch').addEventListener('input', function (e) {
      state.search = e.target.value;
      renderSceneGrid();
    });
    $('sceneBack').addEventListener('click', function () { App.showView('home'); });
    $('homeBtn').addEventListener('click', function () { App.showView('home'); });

    $('modeTabs').addEventListener('click', function (e) {
      var t = e.target.closest('.tab');
      if (t) setMode(t.dataset.mode);
    });

    $('shuffleToggle').addEventListener('change', function (e) {
      state.shuffle = e.target.checked; renderUnitList();
    });
    $('mistakesOnly').addEventListener('change', function (e) {
      state.mistakesOnly = e.target.checked; renderUnitList();
    });
    $('listRestartBtn').addEventListener('click', function () { Practice.startAt(0); });
    $('listStartBtn').addEventListener('click', function () {
      var cursor = Store.cursor(state.scene.id, state.mode);
      var units = visibleUnits(state.scene, state.mode);
      if (!units.length) return;
      Practice.startAt(Math.min(cursor, units.length - 1));
    });
    $('sceneResetBtn').addEventListener('click', function () {
      if (!confirm('確定要清除「' + state.scene.name + '」這個場景的練習紀錄嗎？')) return;
      Store.resetScene(state.scene.id);
      renderSceneView();
      App.toast('已重設這個場景的進度');
    });

    renderChips();
    renderSceneGrid();
  }

  global.Home = {
    init: init,
    openScene: openScene,
    renderSceneGrid: renderSceneGrid,
    renderSceneView: renderSceneView,
    renderDaily: renderDaily,
    startRandom: startRandom,
    randomUnit: randomUnit,
    jumpTo: jumpTo,
    weakUnits: weakUnits,
    renderWeak: renderWeak,
    setMode: setMode,
    sceneStats: sceneStats,
    unitsFor: unitsFor,
    visibleUnits: visibleUnits,
    state: state,
    sceneById: sceneById,
    scenes: scenes,
    groups: groups
  };
})(window);
