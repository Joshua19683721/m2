/* ══════════════════════════════════════════════════════════════
   srs-ui.js — 錯字本面板 + 滾動過關複習

   兩個畫面在同一個抽屜裡切換：

   ▸ 清單：統計、階梯分布、篩選、逐筆管理
   ▸ 複習：一次一張卡，用打字「主動回憶」而不是翻答案對照

   滾動過關是什麼？
   ────────────────────────────────────────────────
   一輪複習把所有到期項目排成一條隊伍。答對就往下一張走；
   答錯不懲罰你，而是把你這張卡「滾」到隊伍最後面，讓你在這一輪的
   尾巴再打一次同一個字。比「錯了就停下來重來」有效，因為錯的那個字
   是在你還記得它的時候又被寫一次，而不是隔天重新想起。

   同一張卡最多滾 3 次：再錯就交給 SRS 排到下次到期，
   否則一張很難的字會把整輪拖不完。

   順帶用到的複習技巧：
     · 主動回憶（先自己打出來再看答案）— 比反覆閱讀強得多
     · 中文預設藏起來 — 逼自己先想英文
     · 自我評分 — 不想打字也可以按「會了 / 不會」
     · 逐字標紅 — 看到自己錯在哪一個字母，而不是只看到「錯了」
   ══════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };
  function esc(s) {
    var v = s == null ? '' : String(s);
    return global.Analysis ? Analysis.escapeHtml(v) : v;
  }

  /** 一張卡最多在同一輪裡被滾幾次 */
  var MAX_REQUEUE = 3;
  /** 一輪最多問幾張 */
  var BATCH = 30;

  var FILTER_LABEL = {
    due: '待複習',
    waiting: '學習中',
    graduated: '已畢業',
    all: '全部'
  };

  var state = {
    page: 'list',        // list | review
    filter: 'due',       // due | waiting | graduated | all
    sort: 'stage',       // stage | due | adds
    showZh: false,       // 複習時中文要不要露出來
    queue: [],           // 本輪隊伍（項目物件）
    tries: null,         // itemId → 這一輪已經被滾幾次
    cursor: 0,
    tally: null,
    locked: false        // 判完分鎖住輸入，避免連按送出重複計分
  };

  function blankTally() {
    return { asked: 0, ok: 0, wrong: 0, promoted: 0, startedAt: Date.now() };
  }

  /* ───────── 比對 ───────── */

  /** 沿用練習頁的規則：先正規化全形／智慧引號，再比大小寫 */
  function norm(s) {
    var v = String(s == null ? '' : s);
    if (global.Practice && Practice.normalizeTyped) v = Practice.normalizeTyped(v);
    return v.trim();
  }

  function eq(a, b) {
    var x = norm(a);
    var y = norm(b);
    return Store.settings().strictCase ? x === y : x.toLowerCase() === y.toLowerCase();
  }

  /** 逐字比對，把打錯的字母標紅（長度不同也能看得很清楚） */
  function diff(typed, target) {
    var n = Math.max(typed.length, target.length);
    if (!n) return '<span class="srs-d__bad">（空白）</span>';
    var out = '';
    for (var i = 0; i < n; i++) {
      var t = typed[i];
      var g = target[i];
      if (t === undefined && g === undefined) break;
      if (t === g) out += esc(t);
      else if (t === undefined) out += '<span class="srs-d__miss">' + esc(g) + '</span>';
      else if (g === undefined) out += '<span class="srs-d__bad">' + esc(t) + '</span>';
      else out += '<span class="srs-d__bad">' + esc(t) + '</span>';
    }
    return out;
  }

  /* ───────── 清單畫面 ───────── */

  function filtered() {
    var now = Date.now();
    var list = SRS.all().filter(function (x) {
      if (state.filter === 'due') return x.stage < SRS.TOP && x.due <= now;
      if (state.filter === 'waiting') return x.stage < SRS.TOP && x.due > now;
      if (state.filter === 'graduated') return x.stage >= SRS.TOP;
      return true;
    });
    if (state.sort === 'due') list.sort(function (a, b) { return a.due - b.due; });
    else if (state.sort === 'adds') list.sort(function (a, b) { return (b.adds || 0) - (a.adds || 0); });
    return list;
  }

  function tile(n, label, cls) {
    return '<div class="srs-tile ' + (cls || '') + '"><div class="srs-tile__n">' + n +
      '</div><div class="srs-tile__l">' + esc(label) + '</div></div>';
  }

  function renderStats() {
    var s = SRS.stats();
    var host = $('srsStats');
    if (host) {
      host.innerHTML =
        tile(s.total, '錯字總數', '') +
        tile(s.due, '現在可複習', 'srs-tile--due') +
        tile(s.waiting, '等待中', 'srs-tile--wait') +
        tile(s.graduated, '已畢業', 'srs-tile--done');
    }

    var bar = $('srsLadder');
    if (bar) {
      var max = Math.max(1, s.total);
      var html = '<div class="srs-ladder">';
      for (var i = 0; i <= SRS.TOP; i++) {
        var n = s.byStage[i] || 0;
        html +=
          '<div class="srs-ladder__row">' +
            '<span class="srs-ladder__lb">' + esc(i === SRS.TOP ? '畢業' : SRS.stageLabel(i)) + '</span>' +
            '<span class="srs-ladder__bar"><i style="width:' + Math.round(n / max * 100) + '%"></i></span>' +
            '<span class="srs-ladder__n">' + n + '</span>' +
          '</div>';
      }
      bar.innerHTML = html + '</div>';
    }

    var startBtn = $('srsStart');
    if (startBtn) {
      startBtn.disabled = s.due <= 0;
      startBtn.textContent = s.due > 0 ? '▶ 開始複習（' + s.due + ' 張）' : '▶ 開始複習';
    }

    var sub = $('srsSubtitle');
    if (sub) {
      sub.textContent = s.total === 0
        ? '還沒有錯字紀錄'
        : '複習 ' + s.reviews + ' 次 · 答錯 ' + s.lapses + ' 次 · 連對 ' + SRS.NEED + ' 次升一階';
    }
    refreshBadge();
  }

  function renderList() {
    var host = $('srsList');
    if (!host) return;
    var list = filtered();
    var countEl = $('srsCount');
    if (countEl) {
      countEl.textContent = FILTER_LABEL[state.filter] + ' ' + list.length + ' 筆';
    }
    host.innerHTML = '';
    if (!list.length) {
      var hint = document.createElement('div');
      hint.className = 'empty-hint';
      hint.textContent = state.filter === 'due'
        ? '現在沒有到期的項目。等一下回來，或先去練習打錯幾個字。'
        : '這一類目前沒有項目。';
      host.appendChild(hint);
      return;
    }
    list.slice(0, 200).forEach(function (it) { host.appendChild(row(it)); });
    if (list.length > 200) {
      var more = document.createElement('div');
      more.className = 'srs-more';
      more.textContent = '只顯示前 200 筆，還有 ' + (list.length - 200) + ' 筆。';
      host.appendChild(more);
    }
  }

  function row(it) {
    var el = document.createElement('div');
    el.className = 'srs-row' + (it.stage >= SRS.TOP ? ' srs-row--done' : '');

    var tags = ['<span class="srs-row__stage srs-stage--' + it.stage + '">' +
      esc(SRS.stageLabel(it.stage)) + '</span>'];
    if (it.kind === 'word') tags.push('<span class="srs-row__tag">句中單字</span>');
    tags.push('<span class="srs-row__due">' + esc(SRS.dueText(it)) + '</span>');
    if (it.streak) {
      tags.push('<span class="srs-row__tag srs-row__tag--ok">連對 ' + it.streak + '/' + SRS.NEED + '</span>');
    }

    el.innerHTML =
      '<div class="srs-row__main">' +
        '<div class="srs-row__en">' + esc(it.en) + '</div>' +
        '<div class="srs-row__sub">' +
          (it.zh ? '<span class="zh">' + esc(it.zh) + '</span>　' : '') +
          (it.ipa ? '<span class="ipa">/' + esc(it.ipa) + '/</span>　' : '') +
          '<span class="srs-row__from">' + esc(it.sceneIcon || '') + ' ' + esc(it.sceneName || '') +
            ' / ' + esc(Store.MODE_LABEL[it.mode] || it.mode) + '</span>' +
        '</div>' +
        (it.context ? '<div class="srs-row__ctx">' + esc(it.context) + '</div>' : '') +
        '<div class="srs-row__tags">' + tags.join('') + '</div>' +
      '</div>' +
      '<div class="srs-row__side">' +
        '<span class="srs-row__bar"><i style="width:' + SRS.progress(it) + '%"></i></span>' +
        '<span class="srs-row__err">錯 ' + (it.lapses || 1) + ' 次</span>' +
        '<div class="srs-row__btns">' +
          (it.kind === 'unit' && it.sceneId
            ? '<button class="srs-mini" data-act="go" data-id="' + esc(it.id) + '">回去練</button>'
            : '') +
          '<button class="srs-mini srs-mini--warn" data-act="reset" data-id="' + esc(it.id) + '">重置</button>' +
          '<button class="srs-mini srs-mini--danger" data-act="del" data-id="' + esc(it.id) + '">刪除</button>' +
        '</div>' +
      '</div>';
    return el;
  }

  function onListClick(e) {
    var btn = e.target.closest ? e.target.closest('[data-act]') : null;
    if (!btn) return;
    var it = SRS.byId(btn.dataset.id);
    if (!it) { renderStats(); renderList(); return; }

    if (btn.dataset.act === 'del') {
      SRS.remove(it.id);
    } else if (btn.dataset.act === 'reset') {
      SRS.record({
        kind: it.kind, sceneId: it.sceneId, mode: it.mode, index: it.index,
        en: it.en, zh: it.zh, ipa: it.ipa, context: it.context,
        sceneName: it.sceneName, sceneIcon: it.sceneIcon
      });
    } else if (btn.dataset.act === 'go') {
      close();
      if (global.Home && Home.jumpTo) Home.jumpTo(it.sceneId, it.mode, it.index);
      return;
    }
    renderStats();
    renderList();
  }

  /* ───────── 複習畫面（滾動過關）───────── */

  function startReview() {
    var list = SRS.due(BATCH);
    if (!list.length) {
      if (global.App && App.toast) App.toast('現在沒有到期的項目');
      return;
    }
    state.queue = list.slice();
    state.tries = {};
    state.cursor = 0;
    state.tally = blankTally();
    state.locked = false;
    setPage('review');
    showCard();
  }

  function setPage(page) {
    state.page = page;
    var list = $('srsPageList');
    var review = $('srsPageReview');
    if (list) list.hidden = page !== 'list';
    if (review) review.hidden = page !== 'review';
    var back = $('srsBack');
    if (back) back.hidden = page === 'list';
  }

  function currentItem() { return state.queue[state.cursor] || null; }

  function showCard() {
    var it = currentItem();
    if (!it) { showSummary(); return; }

    state.locked = false;
    var input = $('srsInput');
    var fb = $('srsFeedback');
    if (fb) { fb.hidden = true; fb.innerHTML = ''; }

    $('srsPos').textContent = (state.cursor + 1) + ' / ' + state.queue.length;
    $('srsRoundBar').style.width =
      Math.round(state.cursor / state.queue.length * 100) + '%';
    $('srsCardStage').textContent = SRS.stageLabel(it.stage);
    $('srsCardStage').className = 'srs-card__stage srs-stage--' + it.stage;
    $('srsCardFrom').textContent = (it.sceneIcon || '') + ' ' + (it.sceneName || '') +
      ' / ' + (Store.MODE_LABEL[it.mode] || it.mode);
    $('srsCardCtx').textContent = it.context || '';
    $('srsCardCtx').hidden = !it.context;
    $('srsCardIpa').textContent = it.ipa ? '/' + it.ipa + '/' : '';
    $('srsCardIpa').hidden = !it.ipa;
    $('srsCardZh').textContent = it.zh || '';
    $('srsCardZh').hidden = !state.showZh || !it.zh;

    var play = $('srsPlay');
    var sum = $('srsSummary');
    if (play) play.hidden = false;
    if (sum) { sum.hidden = true; sum.innerHTML = ''; }

    if (input) {
      input.value = '';
      input.className = 'srs-input';
      input.placeholder = it.kind === 'word' ? '打出這個字' : '打出整個單元';
      input.focus();
    }
  }

  function showSummary() {
    var t = state.tally || blankTally();
    var box = $('srsSummary');
    if (!box) return;
    var secs = Math.max(1, Math.round((Date.now() - t.startedAt) / 1000));
    var rate = t.asked ? Math.round(t.ok / t.asked * 100) : 100;
    var left = SRS.stats().due;

    var play = $('srsPlay');
    if (play) play.hidden = true;
    box.hidden = false;
    box.innerHTML =
      '<h3 class="srs-sum__title">🎉 這一輪結束</h3>' +
      '<div class="srs-sum__grid">' +
        tile(t.asked, '問了幾次', '') +
        tile(t.ok, '答對', 'srs-tile--done') +
        tile(t.wrong, '答錯', 'srs-tile--due') +
        tile(t.promoted, '升階', 'srs-tile--wait') +
      '</div>' +
      '<p class="srs-sum__note">正確率 ' + rate + '%　·　用時 ' + secs + ' 秒</p>' +
      '<p class="srs-sum__note">答錯的卡這一輪都再打過一次，還沒記熟的交給 SRS 排下次。</p>' +
      (left > 0
        ? '<p class="srs-sum__note">還有 <b>' + left + '</b> 張到期，按「再一輪」繼續。</p>'
        : '<p class="srs-sum__note">沒有其他到期項目了，今天的錯字都掃完了 👍</p>');

    var again = $('srsAgain');
    if (again) again.disabled = left <= 0;

    if (global.App && App.toast) {
      App.toast('這一輪：答對 ' + t.ok + ' / ' + t.asked + ' 次');
    }
    renderStats();
    renderList();
  }

  /** 判一次分 */
  function judge(typed, ok) {
    var it = currentItem();
    if (!it) return;
    var res = SRS.grade(it.id, ok);
    var fb = $('srsFeedback');
    var input = $('srsInput');
    var t = state.tally;

    if (input) input.className = 'srs-input ' + (ok ? 'is-ok' : 'is-bad');

    if (ok) {
      t.asked++; t.ok++;
      if (res && res.promoted) {
        t.promoted++;
        if (fb) {
          fb.hidden = false;
          fb.className = 'srs-feedback is-ok';
          fb.innerHTML = '✔ 對了！' + (res.graduated
            ? '這一項<b>畢業</b>了。'
            : '升到「' + esc(SRS.stageLabel(res.stage)) + '」，下次 ' + esc(SRS.dueText(it)) + '再練。');
        }
      } else if (fb) {
        fb.hidden = false;
        fb.className = 'srs-feedback is-ok';
        fb.innerHTML = '✔ 對了　·　連對 ' + (res ? res.streak : 0) + ' / ' + SRS.NEED +
          '，滿 ' + SRS.NEED + ' 次升一階';
      }
      state.locked = true;
      setTimeout(advance, 850);
      return;
    }

    // ── 答錯：這張卡滾到本輪最後 ──
    t.asked++; t.wrong++;
    var tries = (state.tries[it.id] || 0);
    var requeued = tries < MAX_REQUEUE;

    if (fb) {
      fb.hidden = false;
      fb.className = 'srs-feedback is-bad';
      fb.innerHTML =
        '<div class="srs-d"><span class="srs-d__lb">你打的</span><span class="srs-d__v">' +
          diff(typed, it.en) + '</span></div>' +
        '<div class="srs-d"><span class="srs-d__lb">正確</span><span class="srs-d__v">' +
          esc(it.en) + '</span></div>' +
        (it.zh ? '<div class="srs-d"><span class="srs-d__lb">中文</span>' + esc(it.zh) + '</div>' : '') +
        '<div class="srs-d__note">' + (requeued
          ? '這一張滾到本輪最後面，稍後再打一次（還能滾 ' + (MAX_REQUEUE - tries) + ' 次）。'
          : '這一張已經重打 ' + MAX_REQUEUE + ' 次，先放到下次。') + '</div>';
    }

    // 滾動：把這一張從游標位置拔掉，再丟到隊伍最後面。
    // 游標不動，原本排在後面的一張會自動補到這個位置，
    // 這張則會在本輪的尾巴再出現一次（趁還記得它的時候再寫一次）。
    state.queue.splice(state.cursor, 1);
    if (requeued) {
      state.tries[it.id] = tries + 1;
      state.queue.push(it);
    }
    state.locked = true;
    setTimeout(function () {
      if (state.cursor >= state.queue.length) showSummary();
      else showCard();
    }, 2600);
  }

  function advance() {
    state.cursor++;
    if (state.cursor >= state.queue.length) showSummary();
    else showCard();
  }

  function submitTyped() {
    if (state.locked) return;
    var input = $('srsInput');
    if (!input) return;
    var it = currentItem();
    if (!it) return;
    var typed = input.value.trim();
    if (!typed) { input.focus(); return; }
    judge(typed, eq(typed, it.en));
  }

  function retry() {
    if (state.locked) return;
    var fb = $('srsFeedback');
    if (fb) { fb.hidden = true; fb.innerHTML = ''; }
    var input = $('srsInput');
    if (input) { input.value = ''; input.className = 'srs-input'; input.focus(); }
  }

  function backToList() {
    state.queue = [];
    state.tries = {};
    state.cursor = 0;
    state.locked = false;
    setPage('list');
    renderStats();
    renderList();
  }

  /* ───────── 開關 ───────── */

  function open(page) {
    var panel = $('srsPanel');
    var scrim = $('srsScrim');
    if (!panel || !scrim) return;
    if (global.UI && UI.closeExplain) UI.closeExplain();
    panel.classList.add('open');
    scrim.classList.add('open');
    setPage(page === 'review' && state.queue.length ? 'review' : 'list');
    renderStats();
    renderList();
    if (state.page === 'review') showCard();
  }

  function close() {
    var panel = $('srsPanel');
    var scrim = $('srsScrim');
    if (panel) panel.classList.remove('open');
    if (scrim) scrim.classList.remove('open');
    backToList();
  }

  function isOpen() {
    var panel = $('srsPanel');
    return !!(panel && panel.classList.contains('open'));
  }

  function refreshBadge() {
    var b = $('srsBadge');
    if (!b) return;
    var n = 0;
    try { n = SRS.stats().due; } catch (e) { n = 0; }
    b.textContent = n > 99 ? '99+' : String(n);
    b.hidden = n <= 0;
  }

  /* ───────── 綁定 ───────── */

  function bind() {
    $('srsBtn').addEventListener('click', function () { isOpen() ? close() : open('list'); });
    $('srsClose').addEventListener('click', close);
    $('srsScrim').addEventListener('click', close);
    $('srsStart').addEventListener('click', startReview);
    $('srsBack').addEventListener('click', backToList);
    $('srsAgain').addEventListener('click', startReview);
    $('srsSubmit').addEventListener('click', submitTyped);
    $('srsRetry').addEventListener('click', retry);

    $('srsList').addEventListener('click', onListClick);

    // 篩選籌碼：待複習 / 學習中 / 已畢業 / 全部
    var chips = Array.prototype.slice.call(document.querySelectorAll('[data-srs-filter]'));
    function paintChips() {
      chips.forEach(function (b) {
        b.classList.toggle('chip--on', b.dataset.srsFilter === state.filter);
      });
    }
    chips.forEach(function (b) {
      b.addEventListener('click', function () {
        state.filter = b.dataset.srsFilter;
        paintChips();
        renderList();
      });
    });
    paintChips();

    var zhBtn = $('srsZhToggle');
    if (zhBtn) {
      zhBtn.addEventListener('click', function () {
        state.showZh = !state.showZh;
        zhBtn.setAttribute('aria-pressed', state.showZh ? 'true' : 'false');
        zhBtn.textContent = state.showZh ? '🙈 藏起中文' : '👁 顯示中文';
        if (state.page === 'review') {
          var it = currentItem();
          var zh = $('srsCardZh');
          if (zh && it) { zh.textContent = it.zh || ''; zh.hidden = !state.showZh || !it.zh; }
        }
      });
    }

    var speakBtn = $('srsSpeak');
    if (speakBtn) {
      speakBtn.addEventListener('click', function () {
        var it = currentItem();
        if (it && global.Speech && Speech.say) {
          Speech.say(it.en, 1, { rate: Store.settings().rate });
        }
      });
    }

    $('srsNo').addEventListener('click', function () {
      if (state.locked) return;
      var input = $('srsInput');
      judge(input ? input.value.trim() : '', false);
    });
    $('srsYes').addEventListener('click', function () {
      if (state.locked) return;
      var it = currentItem();
      if (it) judge(it.en, true);
    });

    $('srsClear').addEventListener('click', function () {
      if (!confirm('確定要清空整本錯字本嗎？進度無法復原。')) return;
      SRS.clear();
      renderStats();
      renderList();
    });

    var sortSel = $('srsSort');
    if (sortSel) sortSel.addEventListener('change', function () {
      state.sort = sortSel.value;
      renderList();
    });

    var input = $('srsInput');
    if (input) {
      input.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') { e.preventDefault(); submitTyped(); }
      });
      // 貼上全形／智慧引號時先正規化，和練習頁同一套規則
      input.addEventListener('input', function () {
        if (!global.Practice || !Practice.normalizeTyped) return;
        var clean = Practice.normalizeTyped(input.value);
        if (clean !== input.value) input.value = clean;
      });
    }

    document.addEventListener('keydown', function (e) {
      if (e.altKey && (e.key || '').toLowerCase() === 'b') {
        e.preventDefault();
        isOpen() ? close() : open('list');
        return;
      }
      if (!isOpen() || state.page !== 'review') return;
      if (e.altKey && (e.key || '').toLowerCase() === 'h') {
        e.preventDefault();
        if (zhBtn) zhBtn.click();
      }
    });
  }

  global.SRSUI = {
    open: open,
    close: close,
    isOpen: isOpen,
    startReview: startReview,
    backToList: backToList,
    refreshBadge: refreshBadge,
    render: function () { renderStats(); renderList(); },
    MAX_REQUEUE: MAX_REQUEUE,
    BATCH: BATCH,
    state: state
  };

  function init() {
    bind();
    var need = $('srsNeed');
    if (need) need.textContent = String(SRS.NEED);
    refreshBadge();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})(window);