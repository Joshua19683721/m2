/* ══════════════════════════════════════════════════════════════
   store.js — 本機進度、設定、單元狀態的保存與統計

   設計重點：記憶體快取 + 延遲寫回。
   原本每打一個字就會把整份進度 JSON 讀出來、parse、寫回去，
   進度檔一大就會在打字時卡頓。現在：
     · 讀取只做一次，之後走記憶體
     · 寫入合併成延遲寫回（400ms 內的多次變更只寫一次）
     · 離開頁面 / 分頁隱藏時一定會寫回去，不會漏
   ══════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  var KEY_PROGRESS = 'sceneTyping.progress.v1';
  var KEY_SETTINGS  = 'sceneTyping.settings.v1';
  var KEY_STATS     = 'sceneTyping.stats.v1';
  var KEY_CURSOR    = 'sceneTyping.cursor.v1';

  var FLUSH_MS = 400;

  var cache = Object.create(null);    // key → 已解析的內容
  var timers = Object.create(null);   // key → 延遲寫回的計時器

  /* 單元狀態：{ done, err, best, lastAt, attempts } */
  function emptyUnit() {
    return { done: false, err: 0, errTotal: 0, best: null, lastAt: 0, attempts: 0 };
  }

  var DEFAULT_SETTINGS = {
    autoSpeak: true,        // 換單元時自動朗讀
    speakPenalty: false,    // 錯字時朗讀整句而非單字
    strictCase: false,      // 比對時大小寫必須完全正確
    rate: 0.9,              // 朗讀速度
    fontSize: 32,           // 打字字級
    showHints: true,        // 浮水印提示
  };

  /* ───────── 低層讀寫 ───────── */
  function read(key, fallback) {
    if (key in cache) return cache[key];
    var value = fallback;
    try {
      var raw = global.localStorage.getItem(key);
      if (raw) {
        var parsed = JSON.parse(raw);
        if (parsed !== null && parsed !== undefined) value = parsed;
      }
    } catch (e) { /* 讀不到就用預設值 */ }
    cache[key] = value;
    return value;
  }

  function flush(key) {
    if (!timers[key]) return false;
    clearTimeout(timers[key]);
    delete timers[key];
    try {
      global.localStorage.setItem(key, JSON.stringify(cache[key]));
      return true;
    } catch (e) { return false; }
  }

  function flushAll() {
    Object.keys(timers).forEach(flush);
  }

  /** 寫入：immediate=false 時延遲合併，避免連續打字時反覆序列化 */
  function write(key, value, immediate) {
    cache[key] = value;
    if (immediate) return flush(key) || true;
    if (timers[key]) clearTimeout(timers[key]);
    timers[key] = setTimeout(function () { flush(key); }, FLUSH_MS);
    return true;
  }

  function remove(key) {
    if (timers[key]) { clearTimeout(timers[key]); delete timers[key]; }
    delete cache[key];
    try { global.localStorage.removeItem(key); } catch (e) {}
  }

  // 離開頁面時務必寫回
  if (global.addEventListener) {
    global.addEventListener('pagehide', flushAll);
    global.addEventListener('beforeunload', flushAll);
    if (global.document && global.document.addEventListener) {
      global.document.addEventListener('visibilitychange', function () {
        if (global.document.hidden) flushAll();
      });
    }
  }

  /* ───────── 進度 ───────── */
  // 進度結構：{ [sceneId]: { [mode]: { [unitIndex]: unitState } } }
  function progress() { return read(KEY_PROGRESS, {}); }

  function unitState(sceneId, mode, index) {
    var p = progress();
    var s = p[sceneId] && p[sceneId][mode];
    return (s && s[index]) || emptyUnit();
  }

  function saveUnit(sceneId, mode, index, patch) {
    var p = progress();
    if (!p[sceneId]) p[sceneId] = {};
    if (!p[sceneId][mode]) p[sceneId][mode] = {};
    var cur = p[sceneId][mode][index] || emptyUnit();
    for (var k in patch) if (Object.prototype.hasOwnProperty.call(patch, k)) cur[k] = patch[k];
    p[sceneId][mode][index] = cur;
    write(KEY_PROGRESS, p);       // 延遲寫回
    return cur;
  }

  function sceneProgress(sceneId) {
    var p = progress();
    return (p[sceneId] && {
      words: p[sceneId].words || {},
      phrases: p[sceneId].phrases || {},
      sentences: p[sceneId].sentences || {},
      blind: p[sceneId].blind || {}
    }) || { words: {}, phrases: {}, sentences: {}, blind: {} };
  }

  function resetScene(sceneId) {
    var p = progress();
    delete p[sceneId];
    write(KEY_PROGRESS, p);
    var c = read(KEY_CURSOR, {});
    if (c[sceneId]) { delete c[sceneId]; write(KEY_CURSOR, c); }
  }

  function clearAll() {
    [KEY_PROGRESS, KEY_STATS, KEY_CURSOR].forEach(remove);
  }

  /* ───────── 游標（每個場景＋模式記住練到第幾張） ───────── */
  function cursor(sceneId, mode) {
    var c = read(KEY_CURSOR, {});
    return (c[sceneId] && c[sceneId][mode] != null) ? c[sceneId][mode] : 0;
  }

  function setCursor(sceneId, mode, index) {
    var c = read(KEY_CURSOR, {});
    if (!c[sceneId]) c[sceneId] = {};
    c[sceneId][mode] = index;
    write(KEY_CURSOR, c);
  }

  /* ───────── 設定 ───────── */
  function settings() {
    var s = read(KEY_SETTINGS, {});
    var out = {};
    for (var k in DEFAULT_SETTINGS) {
      out[k] = (s[k] === undefined) ? DEFAULT_SETTINGS[k] : s[k];
    }
    return out;
  }

  function saveSettings(patch) {
    var s = settings();
    for (var k in patch) if (Object.prototype.hasOwnProperty.call(patch, k)) s[k] = patch[k];
    write(KEY_SETTINGS, s, true);   // 設定改動少，直接寫
    return s;
  }

  function resetSettings() {
    cache[KEY_SETTINGS] = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
    write(KEY_SETTINGS, cache[KEY_SETTINGS], true);
    return settings();
  }

  /* ───────── 統計 ───────── */
  // 統計結構：{ [dayKey]: { cards, words, err, chars, seconds } }
  function today() {
    var d = new Date();
    return d.getFullYear() + '-' +
      String(d.getMonth() + 1).padStart(2, '0') + '-' +
      String(d.getDate()).padStart(2, '0');
  }

  function recordSession(data) {
    var s = read(KEY_STATS, {});
    var day = today();
    if (!s[day]) s[day] = { cards: 0, words: 0, err: 0, chars: 0, seconds: 0 };
    var t = s[day];
    t.cards += data.cards || 0;
    t.words += data.words || 0;
    t.err += data.err || 0;
    t.chars += data.chars || 0;
    t.seconds += (data.seconds || 0);
    write(KEY_STATS, s);
  }

  function stats() { return read(KEY_STATS, {}); }

  function clearStats() { remove(KEY_STATS); }

  /** 今日重設的目標（每天 20 張），供「今日挑戰」使用 */
  function dailyGoal() { return 20; }

  function todayCount() {
    var s = stats()[today()];
    return s ? s.cards : 0;
  }

  /* ───────── 匯出 / 匯入 ───────── */
  function exportPayload() {
    flushAll();
    return {
      app: 'scene-typing',
      version: 1,
      exportedAt: new Date().toISOString(),
      progress: progress(),
      cursor: read(KEY_CURSOR, {}),
      stats: stats(),
      settings: settings()
    };
  }

  function importPayload(obj) {
    if (!obj || typeof obj !== 'object' || !obj.progress) {
      throw new Error('檔案格式不正確：缺少 progress 欄位');
    }
    if (obj.cursor) write(KEY_CURSOR, obj.cursor, true);
    if (obj.stats) write(KEY_STATS, obj.stats, true);
    if (obj.settings) write(KEY_SETTINGS, obj.settings, true);
    write(KEY_PROGRESS, obj.progress, true);
  }

  global.Store = {
    MODES: ['words', 'phrases', 'sentences', 'blind'],
    MODE_LABEL: { words: '單字', phrases: '片語', sentences: '句子', blind: '盲打整句' },
    emptyUnit: emptyUnit,
    unitState: unitState,
    saveUnit: saveUnit,
    sceneProgress: sceneProgress,
    progress: progress,
    resetScene: resetScene,
    clearAll: clearAll,
    cursor: cursor,
    setCursor: setCursor,
    settings: settings,
    saveSettings: saveSettings,
    resetSettings: resetSettings,
    recordSession: recordSession,
    stats: stats,
    clearStats: clearStats,
    dailyGoal: dailyGoal,
    todayCount: todayCount,
    today: today,
    exportPayload: exportPayload,
    importPayload: importPayload,
    flush: flushAll,
    invalidate: function (key) {
      // 快取被丟掉後，若仍有延遲寫回排著，會把舊值寫回去 → 先清掉
      var keys = key ? [key] : Object.keys(cache);
      keys.forEach(function (k) {
        if (timers[k]) { clearTimeout(timers[k]); delete timers[k]; }
        delete cache[k];
      });
    }
  };
})(window);
