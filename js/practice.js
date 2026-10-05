/* ══════════════════════════════════════════════════════════════
   practice.js — 輸入練習引擎
   逐字模式：每個字／詞一個輸入框，只接受「正確答案的前綴」；
            同一個字錯 3 次自動浮出提示並朗讀（沿用 wordmomo 的做法）。
   盲打模式：整句一次打完，逐詞比對標紅。
   ══════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };

  var P = {
    units: [],        // 目前這個場景＋模式的單元
    index: 0,
    errCounts: [],    // 每個輸入框的錯誤次數
    hinted: [],       // 是否已顯示浮水印
    startedAt: 0,
    typedChars: 0,
    totalErr: 0,
    timer: null
  };

  var settings = Store.settings();

  /* ───────── 準備 ───────── */
  function prepare() {
    P.units = Home.visibleUnits(Home.state.scene, Home.state.mode);
  }

  function unitAt(i) { return P.units[i] || null; }

  /* ───────── 進入某一張 ───────── */
  function startAt(i) {
    if (!P.units.length) prepare();
    if (!P.units.length) {
      App.toast('這個場景目前沒有可練習的單元');
      return;
    }
    App.showView('practice');
    render(Math.max(0, Math.min(i, P.units.length - 1)));
  }

  function restart() {
    render(P.index);
  }

  /* ───────── 計時 ───────── */
  function startTimer() {
    P.startedAt = Date.now();
    P.typedChars = 0;
    P.totalErr = 0;
    clearInterval(P.timer);
    P.timer = setInterval(tick, 100);
    tick();
  }

  function stopTimer() { clearInterval(P.timer); P.timer = null; }

  function tick() {
    var el = $('liveTime');
    if (!el) return;
    el.textContent = ((Date.now() - P.startedAt) / 1000).toFixed(1);
    var cpm = $('liveWpm');
    if (cpm) {
      var secs = (Date.now() - P.startedAt) / 1000;
      cpm.textContent = secs > 1 ? Math.round(P.typedChars / secs * 60) : '0';
    }
  }

  /* ───────── 渲染 ───────── */
  function render(index) {
    var unit = unitAt(index);
    if (!unit) return;
    P.index = index;
    Store.setCursor(Home.state.scene.id, Home.state.mode, index);

    var blind = Home.state.mode === 'blind';
    $('interactiveArea').querySelector('#blindWrap').hidden = !blind;
    $('wordsContainer').hidden = blind;
    $('wordsContainer').style.display = blind ? 'none' : 'flex';

    // 標題列
    var tag = Home.state.scene.icon + ' ' + Home.state.scene.name + '　·　' +
              Store.MODE_LABEL[Home.state.mode];
    $('practiceSceneTag').innerHTML = '<span class="chip">' + Analysis.escapeHtml(tag) + '</span>';
    $('practiceFill').style.width = Math.round(100 * (index + 1) / P.units.length) + '%';

    $('promptZh').textContent = unit.zh || '';
    var ipa = Ipa.ensureIpa(unit);

    // 盲打模式不能直接把答案（英文原句）顯示出來
    // 英文原句只在「勾選提示」時顯示：
    //   勾選   → 中文 + 英文原句 + 音標 + 逐字浮水印
    //   不勾選 → 中文 + 音標（英文原句與浮水印都藏起來，靠中文自己打出來）
    // 盲打模式本來就不能顯示答案，一律只給中文。
    var showEn = !blind && settings.showHints;
    $('promptEn').textContent = showEn ? unit.en : '';
    $('promptEn').style.display = showEn ? 'block' : 'none';
    $('promptIpa').textContent = (blind || !ipa) ? '' : '/' + ipa + '/';
    $('promptIpa').style.display = (blind || !ipa) ? 'none' : 'inline-block';

    hideBanner();
    if (imeHint) imeHint.style.display = 'none';
    startTimer();

    if (blind) renderBlind(unit);
    else renderWords(unit);

    warnIfImeNeeded(unit.en);
    if (settings.autoSpeak) Speech.say(unit.en, 1, { rate: settings.rate });
  }

  function fontSize() {
    return settings.fontSize || 32;
  }

  /* ───────── 中文輸入法的提示 ───────── */
  var composing = false;

  function setComposing(on) {
    composing = on;
    var hint = $('imeHint');
    if (hint) hint.style.display = on ? 'flex' : 'none';
    if (on) Speech.stop();
  }

  /** 含撇號的單元先提醒一次要切英文輸入法 */
  function warnIfImeNeeded(token) {
    if (!token || token.indexOf("'") < 0) return;
    var hint = $('imeHint');
    if (!hint) return;
    hint.style.display = 'flex';
    setTimeout(function () {
      if (!composing && hint) hint.style.display = 'none';
    }, 2800);
  }

  function renderWords(unit) {
    var box = $('wordsContainer');
    box.innerHTML = '';
    box.style.fontSize = fontSize() + 'px';
    box.style.height = '';

    var tokens = Ipa.tokenize(unit.en);
    P.errCounts = [];
    P.hinted = [];
    var wi = 0;

    tokens.forEach(function (token) {
      if (/[A-Za-z0-9']/.test(token)) {
        var idx = wi;
        P.errCounts[idx] = 0;
        P.hinted[idx] = false;

        var boxEl = document.createElement('div');
        boxEl.className = 'word-box';

        var wrapper = document.createElement('div');
        wrapper.className = 'input-wrapper';
        wrapper.style.width = 'calc(' + Math.max(token.length, 1) + 'ch + 1.4em)';
        wrapper.style.minWidth = '2.4em';

        var mark = document.createElement('div');
        mark.className = 'watermark-layer';
        if (settings.showHints) mark.innerHTML = '<span class="wm-untyped">' + esc(token) + '</span>';

        var input = document.createElement('input');
        input.type = 'text';
        input.className = 'word-input';
        input.dataset.target = token;
        input.dataset.index = idx;
        input.autocomplete = 'off';
        input.autocorrect = 'off';
        input.autocapitalize = 'off';
        input.spellcheck = false;
        input.maxLength = token.length;   // 第一道防線：長度不會超過目標字
        // 只透露「位置」與「長度」，不透露答案本身
        input.setAttribute('aria-label', '第 ' + (idx + 1) + ' 個字，共 ' + token.length + ' 個字母');

        input.addEventListener('focus', function () { wrapper.classList.add('focus'); });
        input.addEventListener('blur', function () { wrapper.classList.remove('focus'); });
        input.addEventListener('input', function (e) { onInput(e, input, wrapper, mark, token, idx); });
        input.addEventListener('keydown', function (e) { onKey(e, input, token, idx); });
        input.addEventListener('paste', function (e) { e.preventDefault(); });

        /* 中文輸入法的「合成中」狀態：組字過程中瀏覽器會一直送 input 事件，
           這時候去動 input.value 會把 IME 的組合狀態弄壞，結果撇號根本打不出來。
           所以組字中完全不要碰，確定（commit）之後再交給 onInput 處理。 */
        input.addEventListener('compositionstart', function () {
          setComposing(true);
        });
        input.addEventListener('compositionend', function (e) {
          setComposing(false);
          // commit 之後瀏覽器不一定會再送一次 input，這裡主動補一次
          onInput({ isComposing: false }, input, wrapper, mark, token, idx);
        });

        wrapper.appendChild(mark);
        wrapper.appendChild(input);
        boxEl.appendChild(wrapper);
        box.appendChild(boxEl);
        wi++;
      } else {
        var s = document.createElement('span');
        s.className = 'punctuation';
        s.textContent = token;
        box.appendChild(s);
      }
    });

    // 還原這一張打到一半的進度
    restore();

    setTimeout(function () {
      var inputs = Array.prototype.slice.call(box.querySelectorAll('input'));
      var target = inputs.filter(function (i) { return !i.classList.contains('correct'); })[0] || inputs[0];
      if (target) target.focus();
    }, 40);
  }

  function renderBlind(unit) {
    $('blindInput').value = '';
    $('blindDiff').innerHTML = '打完整句後按 <b>Enter</b> 送出，App 會逐詞標出對錯。';
    $('blindLine').innerHTML = '輸入前不會顯示任何提示，打完送出才比對。';
    setTimeout(function () { $('blindInput').focus(); }, 40);
  }

  /* ───────── 輸入處理 ───────── */
  function eq(a, b) {
    return settings.strictCase ? (a === b) : (a.toLowerCase() === b.toLowerCase());
  }

  /**
   * 把「看起來像、但不是半形 ASCII」的字元轉成半形。
   *
   * 為什麼需要：中文輸入法在中文模式下按單引號鍵，打出來的是**全形** ＇（U+FF07）；
   * 某些排版／自動替換會把 ' 變成智慧引號 ’（U+2019）；macOS 預設鍵盤的 ' 鍵
   * 是死鍵（Dead key），先按不會產生字元，要等下一個鍵。
   * 這些在螢幕上跟半形 ' 幾乎一樣，但比對時會被判定成打錯，於是學生一直卡在
   * 「Who's」打不出來。
   *
   * 規則：
   *   全形 ！～（U+FF01–U+FF5E）→ 一律減 0xFEE0 變成半形（連 ' 和 ＇ 都會變成 '）
   *   智慧引號 / 反引號 / 死鍵acute → 半形 '
   *   全形空白 → 半形空白
   */
  var SMART_QUOTES = '‘’‚‛`´ˋ';

  function normalizeTyped(s) {
    var str = String(s == null ? '' : s);
    var out = '';
    for (var i = 0; i < str.length; i++) {
      var c = str[i];
      var code = str.charCodeAt(i);
      if (code >= 0xFF01 && code <= 0xFF5E) {      // 全形字元
        out += String.fromCharCode(code - 0xFEE0);
      } else if (SMART_QUOTES.indexOf(c) >= 0) {   // 各種「像撇號」的引號
        out += "'";
      } else if (c === '　') {                    // 全形空白
        out += ' ';
      } else {
        out += c;
      }
    }
    return out;
  }

  /** 只留下「答案字元」；其餘（全形殘留、中文、標點）靜默丟棄，不算打字錯誤 */
  function stripNoise(s) {
    var str = String(s == null ? '' : s);
    var out = '';
    for (var i = 0; i < str.length; i++) {
      if (/[A-Za-z0-9']/.test(str[i])) out += str[i];
    }
    return out;
  }

  function onInput(e, input, wrapper, mark, token, idx) {
    /* ① IME 組字中：完全不碰輸入框。組字時去動 input.value 會破壞 IME 的組合狀態，
          結果中文模式下按單引號鍵根本打不出來。確定後由 compositionend 接手。 */
    if (e && e.isComposing) return;

    /* ② 先正規化（全形／智慧引號 → 半形），讓學生看到轉換後的結果 */
    var normalized = normalizeTyped(input.value);
    if (normalized !== input.value) input.value = normalized;

    /* ③ 丟掉不屬於答案字元的雜訊。這是輸入法／鍵盤配置的產物，
          不是打錯，所以不記錯誤、不震動。 */
    var value = stripNoise(input.value);
    if (value !== input.value) input.value = value;

    /* ④ 長度鉗制：輸入框永遠不可能比目標字長 */
    if (value.length > token.length) {
      value = value.slice(0, token.length);
      input.value = value;
    }

    /* ④ 到這裡剩下的都是「答案字元」，接下來不符就是真的打錯了 */
    if (!eq(value.slice(0, token.length), token.slice(0, value.length))) {
      // 打錯：退回上一個正確字元
      input.value = value.slice(0, -1);
      input.classList.add('error');
      wrapper.classList.add('error');
      wrapper.classList.remove('correct');
      input.classList.remove('correct');
      P.errCounts[idx] = (P.errCounts[idx] || 0) + 1;
      P.totalErr++;
      $('liveErr').textContent = P.totalErr;

      if (P.errCounts[idx] >= 3) {
        P.hinted[idx] = true;
        if (settings.showHints) mark.innerHTML = '<span class="wm-untyped">' + esc(token) + '</span>';
        var times = parseInt($('repeatCountSelect').value, 10) || 3;
        var say = settings.speakPenalty ? currentUnit().en : token;
        Speech.say(say, times, { rate: settings.rate });
      }
      return;
    }

    // 打對
    input.classList.remove('error');
    wrapper.classList.remove('error');
    P.typedChars++;

    if (settings.showHints) updateMark(input, mark, token);

    if (eq(value, token)) {
      input.value = token;
      mark.innerHTML = '';
      input.classList.add('correct');
      wrapper.classList.add('correct');
      focusNext(idx);
      if (isComplete()) finish();
      else save();
    } else {
      save();
    }
  }

  function onKey(e, input, token, idx) {
    if (e.key === ' ' || e.code === 'Space') {
      e.preventDefault();
      next();   // Space 一律跳下一張，不管這一張打完沒有
    }
    if (e.key === 'Backspace' || e.key === 'Delete' || e.key === 'ArrowLeft' ||
        e.key === 'ArrowRight' || e.ctrlKey || e.metaKey || e.key === 'Enter') return;

    /* 不再預先擋下「不像答案字元」的按鍵。
       先前這裡會 preventDefault 掉任何非 [A-Za-z0-9'] 的字元，結果中文輸入法
       在中文模式按單引號鍵（產生全形 ＇）時被整個吃掉，學生根本打不出來。
       現在一律放行，交給 onInput 統一正規化 + 去掉雜訊。 */
    if (e.key === 'Dead') return;          // 死鍵：字元會跟著下一個鍵一起出來
  }

  function updateMark(input, mark, token) {
    var value = input.value || '';
    var n = Math.min(value.length, token.length);
    if (!n) {
      mark.innerHTML = '<span class="wm-untyped">' + esc(token) + '</span>';
      return;
    }
    mark.innerHTML =
      '<span class="wm-typed">' + esc(token.slice(0, n)) + '</span>' +
      '<span class="wm-untyped">' + esc(token.slice(n)) + '</span>';
  }

  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function inputs() {
    return Array.prototype.slice.call($('wordsContainer').querySelectorAll('input'));
  }

  function focusNext(i) {
    var list = inputs();
    if (i + 1 < list.length) list[i + 1].focus();
    else if (list[i]) list[i].blur();
  }

  function isComplete() {
    if (Home.state.mode === 'blind') return false;
    var list = inputs();
    if (!list.length) return false;
    return list.every(function (i) { return eq(i.value, i.dataset.target); });
  }

  /* ───────── 完成 ───────── */
  function currentUnit() { return unitAt(P.index) || { en: '', zh: '', index: 0 }; }

  function finish() {
    var unit = currentUnit();
    var secs = (Date.now() - P.startedAt) / 1000;
    var prev = Store.unitState(Home.state.scene.id, Home.state.mode, unit.index);

    Store.saveUnit(Home.state.scene.id, Home.state.mode, unit.index, {
      done: true,
      err: P.totalErr,
      // errTotal 是「累計」錯誤次數：err 只留最近一次的，
      // 錯題本要靠 errTotal 才不會在練對一次之後就把弱點忘掉。
      errTotal: (prev.errTotal || 0) + P.totalErr,
      attempts: (prev.attempts || 0) + 1,
      best: prev.best ? Math.min(prev.best, secs) : Math.round(secs * 10) / 10,
      lastAt: Date.now()
    });

    Store.recordSession({
      cards: 1,
      words: inputs().length,
      err: P.totalErr,
      chars: P.typedChars,
      seconds: secs
    });

    stopTimer();
    showBanner(
      '✔ <strong>' + esc(unit.en) + '</strong> 完成！用時 ' + secs.toFixed(1) + ' 秒・錯誤 ' +
      P.totalErr + ' 次　|　按 <strong>Space</strong> 下一張、<strong>Enter</strong> 重練',
      false);

  }

  function showBanner(html, isError) {
    var b = $('statusBanner');
    b.innerHTML = html;
    b.classList.toggle('is-error', !!isError);
    b.classList.add('show');
  }
  function hideBanner() {
    var b = $('statusBanner');
    b.classList.remove('show');
  }

  /* ───────── 盲打比對用的純函式（可獨立測試） ───────── */

  /** 只要文字：丟掉純標點，並把黏在字上的標點剝掉（Ipa.tokenize 已先切開，這裡多一層保險） */
  function wordsOnly(tokens) {
    return (tokens || [])
      .map(function (t) { return String(t).replace(/^[^\w']+|[^\w']+$/g, ''); })
      .filter(function (t) { return t.length > 0; });
  }

  /**
   * 以 LCS 對齊兩個詞序列，產生 [{op, t, u}]。
   * op = ok（相同） / sub（打錯） / del（漏掉） / ins（多打）
   * 用 LCS 而不是逐一對齊，才不會在漏一個字之後整句都錯位。
   */
  function alignWords(a, b, strictCase) {
    var n = a.length, m = b.length;
    var eq = function (x, y) {
      return strictCase ? x === y : x.toLowerCase() === y.toLowerCase();
    };
    // dp[i][j] = a[i..] 與 b[j..] 的 LCS 長度
    var dp = [];
    for (var i = 0; i <= n; i++) dp.push(new Array(m + 1).fill(0));
    for (i = n - 1; i >= 0; i--) {
      for (var j = m - 1; j >= 0; j--) {
        dp[i][j] = eq(a[i], b[j]) ? dp[i + 1][j + 1] + 1
          : Math.max(dp[i + 1][j], dp[i][j + 1]);
      }
    }
    var out = [], x = 0, y = 0;
    while (x < n && y < m) {
      if (eq(a[x], b[y])) {
        out.push({ op: 'ok', t: a[x], u: b[y] }); x++; y++; continue;
      }
      var down = dp[x + 1][y];   // 跳過目標端這個詞
      var right = dp[x][y + 1];  // 跳過輸入端這個詞
      if (down > right) {
        // 目標端這個詞在輸入裡找不到對應 → 漏打
        out.push({ op: 'del', t: a[x], u: null }); x++;
      } else if (right > down) {
        // 輸入端多出來的詞
        out.push({ op: 'ins', t: null, u: b[y] }); y++;
      } else {
        // 兩邊 長度一樣 → 視為同一個位置打錯
        out.push({ op: 'sub', t: a[x], u: b[y] }); x++; y++;
      }
    }
    while (x < n) { out.push({ op: 'del', t: a[x], u: null }); x++; }
    while (y < m) { out.push({ op: 'ins', t: null, u: b[y] }); y++; }
    return out;
  }

  /* ───────── 盲打整句 ───────── */
  function submitBlind() {
    var unit = currentUnit();
    var typed = $('blindInput').value.trim();
    if (!typed) { $('blindInput').focus(); return; }

    var target = unit.en;
    var t = Ipa.tokenize(target);
    var u = Ipa.tokenize(typed);

    // 只比對文字，標點不列入計分（盲打模式不強迫學生處理標點）
    var tw0 = wordsOnly(t), uw0 = wordsOnly(u);
    var ops = alignWords(tw0, uw0, settings.strictCase);

    var html = '', wrong = [], missing = [], extra = [];
    ops.forEach(function (op) {
      if (op.op === 'ok') {
        html += '<span class="tok-good">' + esc(op.t) + '</span> ';
      } else if (op.op === 'sub') {
        html += '<span class="tok-bad">' + esc(op.t) + '</span> ';
        wrong.push(op.t + ' → ' + op.u);
      } else if (op.op === 'del') {
        html += '<span class="tok-bad">' + esc(op.t) + '</span> ';
        missing.push(op.t);
      } else {
        html += '<span class="tok-extra">+' + esc(op.u) + '</span> ';
        extra.push(op.u);
      }
    });
    $('blindLine').innerHTML = html.trim();

    var secs = (Date.now() - P.startedAt) / 1000;
    var total = tw0.length || 1;
    var right = ops.filter(function (o) { return o.op === 'ok'; }).length;
    var acc = Math.max(0, Math.round(right / total * 100));
    var detail = [];
    if (wrong.length) detail.push('打錯：' + wrong.join('、'));
    if (missing.length) detail.push('漏掉：' + missing.join('、'));
    if (extra.length) detail.push('多打了：' + extra.join('、'));
    if (!detail.length) detail.push('完全正確，一個字都沒差！');

    $('blindDiff').innerHTML =
      '正確率 <b>' + acc + '%</b>　·　用時 <b>' + secs.toFixed(1) + '</b> 秒<br>' +
      detail.join('<br>');

    if (wrong.length || missing.length || extra.length) {
      showBanner('✗ 還有 ' + (wrong.length + missing.length + extra.length) + ' 個地方要修正，看上面的紅字。' +
        '　按 <strong>Enter</strong> 再打一次', true);
      var bprev = Store.unitState(Home.state.scene.id, 'blind', unit.index);
      var berr = wrong.length + missing.length + extra.length;
      Store.saveUnit(Home.state.scene.id, 'blind', unit.index, {
        err: berr,
        errTotal: (bprev.errTotal || 0) + berr,
        attempts: (bprev.attempts || 0) + 1
      });
      return;
    }

    var prev = Store.unitState(Home.state.scene.id, 'blind', unit.index);
    Store.saveUnit(Home.state.scene.id, 'blind', unit.index, {
      done: true, err: 0, attempts: (prev.attempts || 0) + 1,
      best: prev.best ? Math.min(prev.best, secs) : Math.round(secs * 10) / 10,
      lastAt: Date.now()
    });
    Store.recordSession({ cards: 1, words: t.length, err: 0, chars: u.length, seconds: secs });

    showBanner('✔ 整句完全正確！按 <strong>Space</strong> 下一張、<strong>Enter</strong> 再打一次', false);
  }

  /* ───────── 進度保存 ───────── */
  function save() {
    var unit = currentUnit();
    var done = inputs().filter(function (i) {
      return eq(i.value, i.dataset.target);
    }).map(function (i) { return Number(i.dataset.index); });
    try {
      localStorage.setItem('sceneTyping.partial.' + Home.state.scene.id + '.' + Home.state.mode,
        JSON.stringify({ unit: unit.en, done: done }));
    } catch (e) {}
  }

  function restore() {
    var unit = currentUnit();
    var raw;
    try {
      raw = localStorage.getItem('sceneTyping.partial.' + Home.state.scene.id + '.' + Home.state.mode);
    } catch (e) { return; }
    if (!raw) return;
    var data;
    try { data = JSON.parse(raw); } catch (e) { return; }
    if (!data || data.unit !== unit.en) return;
    inputs().forEach(function (input) {
      var idx = Number(input.dataset.index);
      if (data.done.indexOf(idx) >= 0) {
        input.value = input.dataset.target;
        input.classList.add('correct');
        var w = input.closest('.input-wrapper');
        if (w) w.classList.add('correct');
      }
    });
    if (isComplete()) finish();
  }

  /* ───────── 切換 ───────── */
  function next() {
    if (P.index < P.units.length - 1) render(P.index + 1);
    else App.toast('這個場景的單元都練過一輪了 🎉');
  }
  function prev() { if (P.index > 0) render(P.index - 1); }

  function back() {
    stopTimer();
    App.showView('scene');
    Home.renderSceneView();
  }

  /* ───────── 說話 ───────── */
  function speakUnit() {
    var u = currentUnit();
    if (u.en) Speech.say(u.en, 1, { rate: settings.rate });
  }
  function speakWord() {
    if (Home.state.mode === 'blind') { speakUnit(); return; }
    var list = inputs();
    var active = document.activeElement;
    var target = (active && active.dataset && active.dataset.target) ? active.dataset.target
      : (list.filter(function (i) { return !i.classList.contains('correct'); })[0] || list[0]);
    if (target) Speech.say(target.dataset ? target.dataset.target : target, 1, { rate: settings.rate });
  }

  function refreshSettings() { settings = Store.settings(); }

  global.Practice = {
    prepare: prepare,
    startAt: startAt,
    restart: restart,
    render: render,
    next: next,
    prev: prev,
    back: back,
    speakUnit: speakUnit,
    speakWord: speakWord,
    submitBlind: submitBlind,
    alignWords: alignWords,
    wordsOnly: wordsOnly,
    normalizeTyped: normalizeTyped,
    stripNoise: stripNoise,
    isCompletePublic: isComplete,
    refreshSettings: refreshSettings,
    stopTimer: stopTimer,
    current: currentUnit,
    state: P
  };
})(window);