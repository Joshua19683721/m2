/* ══════════════════════════════════════════════════════════════
   ui.js — 解析抽屜、學習統計、設定、Toast、資料匯出
   ══════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };
  var A = Analysis;

  /* ───────── 解析抽屜 ───────── */
  function fieldRow(label, valueHtml) {
    return '<div class="ex-mistake__row"><div class="ex-mistake__label">' + label +
           '</div><div class="ex-mistake__value">' + valueHtml + '</div></div>';
  }

  function mistakeCard(m, i) {
    var html = '<div class="ex-mistake"><div class="ex-mistake__title">錯誤類型 ' + (i + 1) +
               '：' + A.rich(m.title || '') + '</div>';
    if (m.bad && m.bad !== '—') html += fieldRow('錯誤版本', A.marked(m.bad, 'X'));
    html += fieldRow('正確版本', A.marked(m.ok, 'O'));
    html += fieldRow('錯誤原因', A.rich(m.why || ''));
    if (m.exOkText || m.exBadText) {
      html += '<div class="ex-sublabel">範例對照</div>';
      if (m.exOkText) html += '<div class="ex-exline">' + A.marked(m.exOkText, 'O') +
        (m.exOkZh ? ' <span class="zh">（' + A.escapeHtml(m.exOkZh) + '）</span>' : '') + '</div>';
      if (m.exBadText) html += '<div class="ex-exline">' + A.marked(m.exBadText, 'X') +
        (m.exBadNote ? ' <span class="zh">（' + A.escapeHtml(m.exBadNote) + '）</span>' : '') + '</div>';
    }
    return html + '</div>';
  }

  function renderExplain() {
    var unit = Practice.current();
    if (!unit) return;
    var scene = Home.state.scene;
    var mode = Home.state.mode;
    var body = $('explainBody');

    $('explainSub').textContent =
      '第 ' + (Practice.state.index + 1) + ' / ' + Practice.state.units.length + ' 張　·　' +
      Store.MODE_LABEL[mode] + '　·　' + (scene ? scene.name : '');

    var html = '';

    // 還沒打完就來看解析 → 提示是提前預習
    if (mode !== 'blind' && !Practice.isCompletePublic()) {
      var inputs = Array.prototype.slice.call($('wordsContainer').querySelectorAll('input'));
      var done = inputs.filter(function (i) {
        return i.value.toLowerCase() === (i.dataset.target || '').toLowerCase();
      }).length;
      html += '<div class="ex-preview-note">⏳ 這題還沒打完（已完成 ' + done + ' / ' +
              inputs.length + ' 個字），下面是提前預習的解析</div>';
    }

    // 題目
    var ipa = Ipa.ensureIpa(unit);
    html += '<div class="ex-sentence">' +
      '<div class="ex-sentence__en">' + A.marked(unit.en, 'O') + '</div>' +
      '<div class="ex-sentence__meta">中文：' + A.escapeHtml(unit.zh || '—');
    if (ipa) html += '<br>音標：<span class="ex-sentence__ipa">/' + A.escapeHtml(ipa) + '/</span>';
    if (unit.index != null) {
      var st = Store.unitState(scene.id, mode, unit.index);
      html += '<br>紀錄：' + (st.done ? '已完成' : '尚未完成') +
        (st.err ? '　錯誤 ' + st.err + ' 次' : '') +
        (st.best ? '　最佳 ' + st.best + ' 秒' : '');
    }
    html += '</div></div>';

    var data;
    if (mode === 'words' || mode === 'phrases') {
      var src = mode === 'words' ? (scene.words || [])[unit.index] : (scene.phrases || [])[unit.index];
      data = A.wordAnalysis(src || { en: unit.en, zh: unit.zh }, scene, mode);
    } else {
      data = A.sentenceAnalysis(unit.en, scene);
    }

    if (data.intro) html += '<div class="ex-intro">' + A.rich(data.intro) + '</div>';
    if (data.pos) {
      html += '<section class="ex-section"><h3 class="ex-section__title">一、這是什麼</h3>' +
        '<table class="ex-table ex-table--pos"><tbody>' +
        '<tr><td data-label="項目">詞性</td><td data-label="詞性">' + A.rich(data.pos) + '</td></tr>' +
        '<tr><td data-label="項目">中文</td><td data-label="中文">' + A.escapeHtml(unit.zh || '') + '</td></tr>' +
        (ipa ? '<tr><td data-label="項目">音標</td><td data-label="音標">' +
          A.escapeHtml(ipa) + '</td></tr>' : '') +
        '</tbody></table></section>';
    }

    if (data.structure && data.structure.length) {
      html += '<section class="ex-section"><h3 class="ex-section__title">一、句子結構與詞性對照表</h3>' +
        '<table class="ex-table ex-table--pos"><thead><tr>' +
        '<th>項目</th><th>單字</th><th>詞性</th><th>在句中的功能</th><th>標示</th>' +
        '</tr></thead><tbody>';
      data.structure.forEach(function (r) {
        html += '<tr><td data-label="項目">' + A.rich(r.role || '') + '</td>' +
          '<td data-label="單字">' + A.rich(r.token || '') + '</td>' +
          '<td data-label="詞性">' + A.rich(r.pos || '') + '</td>' +
          '<td data-label="功能">' + A.rich(r.func || '') + '</td>' +
          '<td data-label="標示"><span class="mark mark-' + (r.mark === 'X' ? 'X' : 'O') + '">(' +
          (r.mark === 'X' ? 'X' : 'O') + ')</span></td></tr>';
      });
      html += '</tbody></table></section>';
    }

    if (data.mistakes && data.mistakes.length) {
      html += '<section class="ex-section"><h3 class="ex-section__title">' +
        (data.structure ? '二' : '一') + '、常見錯誤與解析</h3>';
      data.mistakes.forEach(function (m, i) { html += mistakeCard(m, i); });
      html += '</section>';
    }

    if (data.traps && data.traps.length) {
      html += '<section class="ex-section"><h3 class="ex-section__title">' +
        (data.structure ? '三' : '二') + '、容易踩的坑</h3><ol class="ex-list ex-list--num">';
      data.traps.forEach(function (t) { html += '<li>' + A.rich(t) + '</li>'; });
      html += '</ol></section>';
    }

    if (data.strategy && data.strategy.length) {
      html += '<section class="ex-section"><h3 class="ex-section__title">' +
        (data.structure ? '四' : '三') + '、練習建議</h3><ol class="ex-list ex-list--num">';
      data.strategy.forEach(function (t) { html += '<li>' + A.rich(t) + '</li>'; });
      html += '</ol></section>';
    }

    body.innerHTML = html;
    body.scrollTop = 0;
  }

  function openExplain() { renderExplain(); $('explainPanel').classList.add('open'); $('explainScrim').classList.add('open'); }
  function closeExplain() { $('explainPanel').classList.remove('open'); $('explainScrim').classList.remove('open'); }
  function toggleExplain() {
    if ($('explainPanel').classList.contains('open')) closeExplain(); else openExplain();
  }

  /* ───────── 統計 ───────── */
  function renderWeak() {
    var body = weakBody;
    if (body) body.hidden = false;
    if (global.Home && Home.renderWeak) Home.renderWeak();
  }

  function renderStats() {
    var s = Store.stats();
    var days = Object.keys(s).sort();
    var cards = 0, chars = 0, errs = 0, secs = 0;
    days.forEach(function (d) {
      cards += s[d].cards || 0;
      chars += s[d].chars || 0;
      errs += s[d].err || 0;
      secs += s[d].seconds || 0;
    });
    // 正確率＝打對的按鍵 ÷ 全部按鍵。這是真實測量，不是估算。
    // （先前這裡寫的是 100 − 錯誤率×3，那個 3 是憑空乘上去的，會把數字講得很漂亮
    //   但不是事實，已經拿掉。）
    var keystrokes = chars + errs;
    var accuracy = keystrokes ? Math.round(chars / keystrokes * 100) : 0;
    var minutes = Math.round(secs / 60);

    var rows = Home.scenes().map(function (scene) {
      var st = Home.sceneStats(scene.id);
      return '<div class="stat-scene">' +
        '<span class="stat-scene__n">' + scene.icon + '</span>' +
        '<span class="stat-scene__t">' + A.escapeHtml(scene.name) + '</span>' +
        '<span class="bar"><i style="width:' + st.pct + '%"></i></span>' +
        '<span class="stat-scene__v">' + st.done + ' / ' + st.total + '</span>' +
        '</div>';
    }).join('');

    $('statsBody').innerHTML =
      '<div class="stat-grid">' +
        '<div class="stat-tile"><div class="stat-tile__n">' + cards + '</div><div class="stat-tile__l">完成單元</div></div>' +
        '<div class="stat-tile"><div class="stat-tile__n">' + chars + '</div><div class="stat-tile__l">總字元</div></div>' +
        '<div class="stat-tile"><div class="stat-tile__n">' + accuracy + '%</div><div class="stat-tile__l">按鍵正確率</div></div>' +
        '<div class="stat-tile"><div class="stat-tile__n">' + errs + '</div><div class="stat-tile__l">累積錯誤</div></div>' +
        '<div class="stat-tile"><div class="stat-tile__n">' + days.length + '</div><div class="stat-tile__l">練習天數</div></div>' +
        '<div class="stat-tile"><div class="stat-tile__n">' + minutes + '</div><div class="stat-tile__l">練習分鐘</div></div>' +
      '</div>' +
      '<h3 class="help-h">各場景完成度</h3>' + rows +
      '<p class="stat-note">按鍵正確率 =（打對的字元 ÷ 全部按鍵）× 100%。只計算你實際完成的單元；中途放棄的不列入。</p>';
  }

  /* ───────── 語速：頂列下拉與設定頁滑桿共用同一個值 ─────────
     頂列的下拉讓練習到一半也能直接改速度，不用先開設定彈窗；
     兩個控制項都走 setRate()，所以永遠是同步的。                  */
  var RATE_MIN = 0.5, RATE_MAX = 1.3;

  /** 設定頁的滑桿是 0.05 步進，可能指到 0.85 這種不在下拉清單裡的值。
      這時候補一個臨時選項，不然兩邊會不同步（下拉空白、滑桿 0.85）。 */
  function syncRateSelect(v) {
    var sel = $('rateSelect');
    if (!sel) return;
    var i;
    for (i = 0; i < sel.options.length; i++) {
      if (parseFloat(sel.options[i].value) === v) { sel.value = sel.options[i].value; return; }
    }
    var extra = Array.prototype.filter.call(sel.options, function (o) {
      return o.dataset && o.dataset.dynamic === '1';
    })[0];
    if (!extra) {
      extra = document.createElement('option');
      extra.dataset.dynamic = '1';
      sel.appendChild(extra);
    }
    extra.value = String(v);
    extra.textContent = v + '×';
    sel.value = String(v);
  }

  function setRate(v, opts) {
    if (typeof v !== 'number' || isNaN(v)) return;
    // 夾在 speech.js 的合理範圍內，避免存進設定的是怪值
    v = Math.max(RATE_MIN, Math.min(RATE_MAX, Math.round(v * 100) / 100));
    Store.saveSettings({ rate: v });
    var range = $('setRate');
    if (range) range.value = String(v);
    var label = $('setRateVal');
    if (label) label.textContent = v;
    syncRateSelect(v);
    Practice.refreshSettings();               // 練習引擎下一句就用新速度
    if (opts && opts.preview) {
      Speech.say('The quick brown fox jumps over the lazy dog.', 1, { rate: v });
    }
  }

  /* ───────── 設定 ───────── */
  function renderSettings() {
    var s = Store.settings();
    $('setAutoSpeak').checked = s.autoSpeak;
    $('setSpeakPenalty').checked = s.speakPenalty;
    $('setStrictCase').checked = s.strictCase;
    $('setRate').value = s.rate;
    $('setRateVal').textContent = s.rate;
    $('setFontSize').value = s.fontSize;
    $('setFontSizeVal').textContent = s.fontSize;
    $('hintToggle').checked = s.showHints;
    syncRateSelect(s.rate);        // 頂列下拉跟著設定值走
  }

  function bindSettings() {
    function bind(id, key, after) {
      var el = $(id);
      if (!el) return;
      var evt = (el.type === 'checkbox') ? 'change' : 'input';
      el.addEventListener(evt, function () {
        var val = (el.type === 'range') ? parseFloat(el.value) : el.checked;
        Store.saveSettings((function () { var o = {}; o[key] = val; return o; })());
        if (after) after(val);
        Practice.refreshSettings();
      });
    }
    bind('setAutoSpeak', 'autoSpeak');
    bind('setSpeakPenalty', 'speakPenalty');
    bind('setStrictCase', 'strictCase', function () { Practice.restart(); });
    // 語速：設定頁滑桿與頂列下拉都要走 setRate()，兩邊才會同步
    var rateRange = $('setRate');
    if (rateRange) rateRange.addEventListener('input', function () { setRate(parseFloat(rateRange.value)); });
    var rateSelect = $('rateSelect');
    if (rateSelect) rateSelect.addEventListener('change', function () {
      setRate(parseFloat(rateSelect.value), { preview: true });
    });
    bind('setFontSize', 'fontSize', function (v) {
      $('setFontSizeVal').textContent = v;
      var wc = $('wordsContainer');
      if (wc) wc.style.fontSize = v + 'px';
    });
    bind('hintToggle', 'showHints', function (v) { Practice.restart(); });

    $('exportProgressBtn').addEventListener('click', function () {
      download('scene-typing-progress-' + Store.today() + '.json',
               JSON.stringify(Store.exportPayload(), null, 2));
    });
    $('exportDataBtn').addEventListener('click', function () {
      var payload = 'window.SCENES = ' + JSON.stringify(Home.scenes(), null, 0) + ';\n' +
        'window.SCENE_INDEX = ' + JSON.stringify(global.SCENE_INDEX, null, 0) + ';\n';
      download('scenes.js', payload);
    });
    $('importProgressBtn').addEventListener('click', function () {
      $('importProgressFile').click();
    });
    $('importProgressFile').addEventListener('change', function (e) {
      var file = e.target.files[0];
      if (!file) return;
      var reader = new FileReader();
      reader.onload = function () {
        try {
          Store.importPayload(JSON.parse(reader.result));
          App.toast('進度已匯入');
          renderSettings();
          Home.renderSceneGrid();
        } catch (err) {
          alert('匯入失敗：' + err.message);
        }
        e.target.value = '';
      };
      reader.readAsText(file);
    });
    $('clearProgressBtn').addEventListener('click', function () {
      if (!confirm('確定要清除這台裝置的所有練習進度與統計嗎？\n（詞庫內容不受影響）')) return;
      Store.clearAll();
      Store.clearStats();
      App.toast('已清除全部進度');
      Home.renderSceneGrid();
    });
  }

  function download(name, text) {
    var blob = new Blob([text], { type: 'application/octet-stream;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    App.toast('已下載 ' + name);
  }

  /* ───────── 彈窗 ───────── */
  function openModal(id) {
    var m = $(id);
    if (!m) return;
    if (id === 'statsModal') { renderStats(); renderWeak(); }
    if (id === 'settingsModal') renderSettings();
    m.hidden = false;
  }
  function closeModal(id) { var m = $(id); if (m) m.hidden = true; }
  function closeAll() {
    closeExplain();
    ['statsModal', 'settingsModal', 'helpModal'].forEach(closeModal);
  }

  function bindModals() {
    $('statsBtn').addEventListener('click', function () { openModal('statsModal'); });
    $('settingsBtn').addEventListener('click', function () { openModal('settingsModal'); });
    $('helpBtn').addEventListener('click', function () { openModal('helpModal'); });
    $('explainScrim').addEventListener('click', closeExplain);
    $('explainClose').addEventListener('click', closeExplain);
    Array.prototype.forEach.call(document.querySelectorAll('[data-close]'), function (b) {
      b.addEventListener('click', function () { closeModal(b.dataset.close); });
    });
    Array.prototype.forEach.call(document.querySelectorAll('.modal'), function (m) {
      m.addEventListener('click', function (e) { if (e.target === m) m.hidden = true; });
    });
  }

  global.UI = {
    init: function () { bindModals(); bindSettings(); renderSettings(); },
    openExplain: openExplain,
    closeExplain: closeExplain,
    toggleExplain: toggleExplain,
    openModal: openModal,
    closeAll: closeAll,
    renderSettings: renderSettings
  };
})(window);
