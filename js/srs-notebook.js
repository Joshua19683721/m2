/* ══════════════════════════════════════════════════════════════
   srs-notebook.js — 錯字本資料層（間隔重複 SRS）

   為什麼要自己寫一個 SRS，而不是照著 errTotal 排？
   ────────────────────────────────────────────────
   統計頁的「錯題本」是「至今打錯幾次」的名單：它告訴你哪裡最弱，
   但不會告訴你「現在該複習哪一張」。SRS 補上的就是這件事：

     1. 間隔越拉越長 —— 剛錯的字 10 分鐘後再看一次，之後 1 小時、
        8 小時、1 天、3 天、1 週、2 週。剛錯的記憶最脆弱，先密集複習；
        已經熟的字再塞回來只是浪費時間。
     2. 連續答對才算過關 —— 一次猜對不算，連對 3 次才升一階。
        偶爾蒙對的字會在下一階立刻現形，所以不用擔心假進度。
     3. 答錯立刻打回原點 —— 而不是慢慢降階。錯就是錯，這一階白費了。

   記錄兩種粒度：
     kind = 'unit' → 整張卡（單字／片語／整句）
     kind = 'word' → 句子裡被打錯的那一個字（複習最快、最有效）

   存 localStorage，同 store.js 的作風：記憶體快取 + 延遲寫回。
   ══════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  var KEY = 'sceneTyping.srs.v2';
  var FLUSH_MS = 500;

  var MIN = 60 * 1000;
  var HOUR = 60 * MIN;
  var DAY = 24 * HOUR;

  /* 階梯：stage 越大，下次複習的間隔越長。
     label 說的就是「這一階會排到多久之後」，
     所以畫面上的標籤跟 dueText() 講的一定是同一件事，不會打架。 */
  var STEPS = [
    { label: '10 分鐘', gap: 10 * MIN },
    { label: '1 小時',  gap: 1 * HOUR },
    { label: '8 小時',  gap: 8 * HOUR },
    { label: '1 天',    gap: 1 * DAY },
    { label: '3 天',    gap: 3 * DAY },
    { label: '1 週',    gap: 7 * DAY },
    { label: '2 週',    gap: 14 * DAY },
    { label: '1 個月',  gap: 30 * DAY }
  ];
  var TOP = STEPS.length;      // stage === TOP 代表畢業
  var NEED = 3;                // 連續答對幾次才升階

  var cache = null;
  var timer = null;

  /* ───────── 儲存 ───────── */

  function read() {
    if (cache) return cache;
    try {
      var raw = global.localStorage.getItem(KEY);
      var data = raw ? JSON.parse(raw) : [];
      // 壞掉的資料不要讓整個功能死掉，退成空清單
      cache = (Array.isArray(data) ? data : []).filter(function (x) {
        return x && typeof x.id === 'string' && typeof x.en === 'string' && x.en;
      });
    } catch (e) {
      cache = [];
    }
    return cache;
  }

  function write() {
    if (!cache) return;
    clearTimeout(timer);
    timer = null;
    try {
      global.localStorage.setItem(KEY, JSON.stringify(cache));
    } catch (e) { /* 配額滿或隱私模式：靜默放棄，這輪進度只留在記憶體 */ }
  }

  /** 變更後呼叫：短時間內的多次變更合併成一次寫入 */
  function touch() {
    if (timer) clearTimeout(timer);
    timer = setTimeout(write, FLUSH_MS);
  }

  /* ───────── 項目 ───────── */

  /** 同一張卡、同一個字算同一筆；句子裡的同一個字也算同一筆。 */
  function makeId(kind, sceneId, mode, index, en) {
    return kind + '|' + sceneId + '|' + mode + '|' + index + '|' +
      String(en).toLowerCase().replace(/\s+/g, ' ');
  }

  function byId(id) {
    var list = read();
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }

  /**
   * 記一次錯。
   * @param o {{kind, sceneId, mode, index, en, zh, ipa, context, sceneName, sceneIcon}}
   * @returns {object|null} 新增或更新後的項目
   */
  function record(o) {
    if (!o || !o.en) return null;
    var list = read();
    var id = makeId(o.kind || 'unit', o.sceneId || '', o.mode || '', o.index == null ? 0 : o.index, o.en);
    var now = Date.now();
    var it = byId(id);

    if (it) {
      // 又錯一次：回到第 0 階，等一下就要再看
      it.stage = 0;
      it.streak = 0;
      it.due = now;
      it.lapses = (it.lapses || 0) + 1;
      it.adds = (it.adds || 0) + 1;
      it.lastAt = now;
      // 後來補上的脈絡（例如句子更新了）就更新掉
      if (o.zh) it.zh = o.zh;
      if (o.ipa) it.ipa = o.ipa;
      if (o.context) it.context = o.context;
      if (o.sceneName) it.sceneName = o.sceneName;
      if (o.sceneIcon) it.sceneIcon = o.sceneIcon;
    } else {
      it = {
        id: id,
        kind: o.kind || 'unit',
        sceneId: o.sceneId || '',
        mode: o.mode || '',
        index: o.index == null ? 0 : o.index,
        en: o.en,
        zh: o.zh || '',
        ipa: o.ipa || '',
        context: o.context || '',
        sceneName: o.sceneName || '',
        sceneIcon: o.sceneIcon || '📝',
        stage: 0,
        streak: 0,
        due: now,
        reps: 0,
        lapses: 1,
        adds: 1,
        addedAt: now,
        lastAt: 0
      };
      list.push(it);
    }
    touch();
    return it;
  }

  /**
   * 下一個到期時間。stage >= TOP 代表畢業 → 回傳 0（從不排入到期）。
   * 這裡一定要夾住，否則從最後一階升上畢業時會去讀 STEPS[TOP] 而爆掉。
   */
  function nextDue(stage, now) {
    return stage >= TOP ? 0 : now + STEPS[stage].gap;
  }

  /**
   * 記一次複習結果。
   * @returns {{stage, streak, promoted:boolean, graduated:boolean}|null}
   */
  function grade(id, ok) {
    var it = byId(id);
    if (!it) return null;
    var now = Date.now();
    it.reps = (it.reps || 0) + 1;
    it.lastAt = now;

    if (ok) {
      it.streak = (it.streak || 0) + 1;
      if (it.streak >= NEED && it.stage < TOP) {
        it.stage++;
        it.streak = 0;
        it.due = nextDue(it.stage, now);
      } else if (it.stage >= TOP) {
        it.due = 0;                              // 畢業，不再排時間
      } else {
        // 這一階還沒滿，先照原來的間隔排下次
        it.due = nextDue(it.stage, now);
      }
    } else {
      it.stage = 0;
      it.streak = 0;
      it.lapses = (it.lapses || 0) + 1;
      it.due = now;
    }
    touch();
    return {
      stage: it.stage,
      streak: it.streak,
      promoted: ok && it.stage > 0,
      graduated: it.stage >= TOP
    };
  }

  /** 到期可複習的：先複習階梯低的（還不熟的），同階先到期先複習 */
  function due(limit) {
    var now = Date.now();
    var list = read().filter(function (x) {
      return x.stage < TOP && x.due <= now;
    });
    list.sort(function (a, b) {
      if (a.stage !== b.stage) return a.stage - b.stage;
      return a.due - b.due;
    });
    return limit ? list.slice(0, limit) : list;
  }

  /** 全部（畢業的排最後） */
  function all() {
    return read().slice().sort(function (a, b) {
      var ag = a.stage >= TOP, bg = b.stage >= TOP;
      if (ag !== bg) return ag ? 1 : -1;
      if (a.stage !== b.stage) return a.stage - b.stage;
      return a.due - b.due;
    });
  }

  function remove(id) {
    var list = read();
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === id) { list.splice(i, 1); touch(); return true; }
    }
    return false;
  }

  function clear() {
    cache = [];
    write();
  }

  /** 把整份錯字本併進已有的匯出／匯入 payload */
  function exportData() { return read().slice(); }
  function importData(rows) {
    if (!Array.isArray(rows)) return 0;
    var list = read();
    var n = 0;
    rows.forEach(function (x) {
      if (!x || typeof x.id !== 'string' || typeof x.en !== 'string') return;
      if (byId(x.id)) return;
      list.push(x);
      n++;
    });
    if (n) touch();
    return n;
  }

  /* ───────── 統計 ───────── */

  function stats() {
    var list = read();
    var now = Date.now();
    var out = {
      total: list.length,
      due: 0,
      waiting: 0,
      graduated: 0,
      byStage: [],
      reviews: 0,
      lapses: 0
    };
    for (var i = 0; i <= TOP; i++) out.byStage.push(0);
    list.forEach(function (x) {
      if (x.stage >= TOP) out.graduated++;
      else if (x.due <= now) out.due++;
      else out.waiting++;
      out.byStage[Math.min(x.stage, TOP)]++;
      out.reviews += x.reps || 0;
      out.lapses += x.lapses || 0;
    });
    return out;
  }

  /** 還有多久到期（毫秒）；畢業回傳 null，還沒到期回傳正數 */
  function timeLeft(it) {
    if (it.stage >= TOP) return null;
    return Math.max(0, it.due - Date.now());
  }

  function stageLabel(stage) {
    if (stage >= TOP) return '已畢業';
    return STEPS[Math.max(0, Math.min(TOP - 1, stage))].label;
  }

  /** 「還有 3 天」／「現在就能複習」／「已畢業」 */
  function dueText(it) {
    var ms = timeLeft(it);
    if (ms === null) return '已畢業';
    if (ms <= 0) return '現在可複習';
    var m = Math.ceil(ms / MIN);
    if (m < 60) return m + ' 分鐘後';
    var h = Math.ceil(m / 60);
    if (h < 24) return h + ' 小時後';
    return Math.ceil(h / 24) + ' 天後';
  }

  /** 進度條百分比：畢業 100% */
  function progress(it) {
    return Math.round(Math.min(1, it.stage / TOP) * 100);
  }

  global.SRS = {
    /* 記錄 */
    record: record,
    grade: grade,
    remove: remove,
    clear: clear,
    /* 讓 practice.js 算出同一張卡的 id，才能在「重練原卡」時也算答對 */
    idFor: function (kind, sceneId, mode, index, en) {
      return makeId(kind, sceneId, mode, index, en);
    },
    /* 查詢 */
    byId: byId,
    due: due,
    all: all,
    stats: stats,
    /* 顯示用 */
    stageLabel: stageLabel,
    dueText: dueText,
    timeLeft: timeLeft,
    progress: progress,
    /* 匯出／匯入 */
    exportData: exportData,
    importData: importData,
    /* 常數 */
    NEED: NEED,
    TOP: TOP,
    STEPS: STEPS,
    flush: write
  };
})(window);