/* Backtest engine: pure functions, no DOM. Works in the browser (window.TPD_BT) and in Node (module.exports).
 *
 * Candle: {t: unix seconds, o, h, l, c, v}
 * Signals are read at the close of a bar and acted on at the OPEN of the next bar, so there is no look-ahead.
 * Stops and targets are checked inside each bar. If one bar touches both, the stop is assumed to hit first.
 */
(function (root) {
  'use strict';

  function sma(a, n) {
    var out = new Array(a.length).fill(NaN), s = 0;
    for (var i = 0; i < a.length; i++) {
      s += a[i];
      if (i >= n) s -= a[i - n];
      if (i >= n - 1) out[i] = s / n;
    }
    return out;
  }

  function ema(a, n) {
    var out = new Array(a.length).fill(NaN), k = 2 / (n + 1), s = 0;
    for (var i = 0; i < a.length; i++) {
      if (i < n - 1) { s += a[i]; continue; }
      if (i === n - 1) { s += a[i]; out[i] = s / n; continue; }
      out[i] = a[i] * k + out[i - 1] * (1 - k);
    }
    return out;
  }

  function rsi(c, n) {
    var out = new Array(c.length).fill(NaN);
    if (c.length <= n) return out;
    var g = 0, l = 0, i, d;
    for (i = 1; i <= n; i++) { d = c[i] - c[i - 1]; if (d > 0) g += d; else l -= d; }
    g /= n; l /= n;
    out[n] = l === 0 ? 100 : 100 - 100 / (1 + g / l);
    for (i = n + 1; i < c.length; i++) {
      d = c[i] - c[i - 1];
      g = (g * (n - 1) + (d > 0 ? d : 0)) / n;
      l = (l * (n - 1) + (d < 0 ? -d : 0)) / n;
      out[i] = l === 0 ? 100 : 100 - 100 / (1 + g / l);
    }
    return out;
  }

  // Highest high / lowest low of the n bars BEFORE bar i (bar i itself excluded).
  function priorExtreme(a, n, isMax) {
    var out = new Array(a.length).fill(NaN);
    for (var i = n; i < a.length; i++) {
      var v = a[i - n];
      for (var j = i - n + 1; j < i; j++) v = isMax ? Math.max(v, a[j]) : Math.min(v, a[j]);
      out[i] = v;
    }
    return out;
  }

  // Returns the position wanted AFTER each bar closes: 1 long, -1 short, 0 flat.
  function signals(cs, st) {
    var n = cs.length, i;
    var c = cs.map(function (x) { return x.c; });
    var h = cs.map(function (x) { return x.h; });
    var l = cs.map(function (x) { return x.l; });
    var d = new Array(n).fill(0), warm = 0, lines = null;

    if (st.type === 'sma' || st.type === 'ema') {
      var fn = st.type === 'sma' ? sma : ema;
      var f = fn(c, st.p1), s = fn(c, st.p2);
      warm = Math.max(st.p1, st.p2);
      for (i = 0; i < n; i++) d[i] = (isNaN(f[i]) || isNaN(s[i])) ? 0 : (f[i] > s[i] ? 1 : -1);
      lines = { f: f, s: s };
    } else if (st.type === 'rsi') {
      var r = rsi(c, st.p1), state = 0;
      warm = st.p1 + 1;
      for (i = 0; i < n; i++) {
        if (isNaN(r[i])) { d[i] = 0; continue; }
        if (state === 0) { if (r[i] < st.lo) state = 1; else if (r[i] > st.hi) state = -1; }
        else if (state === 1 && r[i] >= 50) state = 0;
        else if (state === -1 && r[i] <= 50) state = 0;
        d[i] = state;
      }
    } else if (st.type === 'donchian') {
      var N = st.p1, m = Math.max(2, Math.round(N / 2));
      var hh = priorExtreme(h, N, true), ll = priorExtreme(l, N, false);
      var xh = priorExtreme(h, m, true), xl = priorExtreme(l, m, false);
      var s2 = 0;
      warm = N + 1;
      for (i = 0; i < n; i++) {
        if (isNaN(hh[i])) { d[i] = 0; continue; }
        if (s2 === 0) { if (c[i] > hh[i]) s2 = 1; else if (c[i] < ll[i]) s2 = -1; }
        else if (s2 === 1 && c[i] < xl[i]) s2 = 0;
        else if (s2 === -1 && c[i] > xh[i]) s2 = 0;
        d[i] = s2;
      }
    } else {
      throw new Error('Unknown strategy: ' + st.type);
    }
    if (!st.short) for (i = 0; i < n; i++) if (d[i] < 0) d[i] = 0;
    return { d: d, warm: warm, lines: lines };
  }

  function run(cs, cfg) {
    var n = cs.length;
    var sg = signals(cs, cfg), d = sg.d;
    var start = Math.max(1, Math.min(n - 1, sg.warm + 1));
    var feeR = (cfg.fee || 0) / 100;
    var slF = cfg.sl > 0 ? cfg.sl / 100 : 0, tpF = cfg.tp > 0 ? cfg.tp / 100 : 0;
    var sizeF = Math.min(100, Math.max(1, cfg.size || 100)) / 100;
    var cash = cfg.cap, pos = null, trades = [], eq = new Array(n), blockDir = 0, inPos = 0, i;

    function closePos(idx, price, reason) {
      var gross = (price - pos.entry) * pos.dir * pos.qty;
      var exitFee = price * pos.qty * feeR;
      cash += gross - exitFee;
      var pnl = gross - exitFee - pos.fee;
      trades.push({
        dir: pos.dir, i0: pos.i, i1: idx, t0: cs[pos.i].t, t1: cs[idx].t,
        entry: pos.entry, exit: price, qty: pos.qty, pnl: pnl,
        pct: pnl / (pos.entry * pos.qty) * 100, reason: reason
      });
      pos = null;
    }

    for (i = 0; i < start; i++) eq[i] = cfg.cap;

    for (i = start; i < n; i++) {
      var bar = cs[i], target = d[i - 1];
      if (blockDir !== 0 && target !== blockDir) blockDir = 0;

      if (pos && pos.dir !== target) closePos(i, bar.o, 'signal');

      if (!pos && target !== 0 && target !== blockDir && cash > 0) {
        var qty = (cash * sizeF) / bar.o, fee = bar.o * qty * feeR;
        cash -= fee;
        pos = {
          dir: target, i: i, entry: bar.o, qty: qty, fee: fee,
          stop: slF ? bar.o * (1 - target * slF) : 0,
          tp: tpF ? bar.o * (1 + target * tpF) : 0
        };
      }

      if (pos) {
        var hitSL, hitTP, dir = pos.dir;
        if (dir === 1) { hitSL = pos.stop && bar.l <= pos.stop; hitTP = pos.tp && bar.h >= pos.tp; }
        else { hitSL = pos.stop && bar.h >= pos.stop; hitTP = pos.tp && bar.l <= pos.tp; }
        if (hitSL) {
          closePos(i, dir === 1 ? Math.min(pos.stop, bar.o) : Math.max(pos.stop, bar.o), 'stop');
          blockDir = dir;
        } else if (hitTP) {
          closePos(i, dir === 1 ? Math.max(pos.tp, bar.o) : Math.min(pos.tp, bar.o), 'target');
          blockDir = dir;
        }
      }

      eq[i] = cash + (pos ? (bar.c - pos.entry) * pos.dir * pos.qty : 0);
      if (pos) inPos++;
    }

    if (pos) { closePos(n - 1, cs[n - 1].c, 'end'); eq[n - 1] = cash; }

    var base = cs[start].o;
    var eqCurve = [], bhCurve = [];
    for (i = start; i < n; i++) {
      eqCurve.push({ t: cs[i].t, v: eq[i] });
      bhCurve.push({ t: cs[i].t, v: cfg.cap * cs[i].c / base });
    }

    var peak = cfg.cap, maxDD = 0;
    eqCurve.forEach(function (p) { peak = Math.max(peak, p.v); maxDD = Math.max(maxDD, (peak - p.v) / peak * 100); });
    var wins = trades.filter(function (t) { return t.pnl > 0; }), losses = trades.filter(function (t) { return t.pnl < 0; });
    var gp = wins.reduce(function (a, t) { return a + t.pnl; }, 0), gl = -losses.reduce(function (a, t) { return a + t.pnl; }, 0);
    var net = cash - cfg.cap;

    return {
      trades: trades, eq: eqCurve, bh: bhCurve, start: start, lines: sg.lines, d: d,
      stats: {
        net: net, retPct: net / cfg.cap * 100,
        bhPct: (cs[n - 1].c / base - 1) * 100,
        n: trades.length, winRate: trades.length ? wins.length / trades.length * 100 : 0,
        pf: gl > 0 ? gp / gl : (gp > 0 ? Infinity : 0),
        avgPct: trades.length ? trades.reduce(function (a, t) { return a + t.pct; }, 0) / trades.length : 0,
        maxDD: maxDD, exposure: inPos / (n - start) * 100,
        best: trades.length ? Math.max.apply(null, trades.map(function (t) { return t.pct; })) : 0,
        worst: trades.length ? Math.min.apply(null, trades.map(function (t) { return t.pct; })) : 0
      }
    };
  }

  // Clean raw candles: drop bad rows, sort by time, remove duplicate timestamps.
  function normalize(arr) {
    var ok = arr.filter(function (x) {
      return x && isFinite(x.t) && isFinite(x.o) && isFinite(x.h) && isFinite(x.l) && isFinite(x.c) && x.o > 0 && x.c > 0;
    }).sort(function (a, b) { return a.t - b.t; });
    var out = [];
    ok.forEach(function (x) { if (!out.length || out[out.length - 1].t !== x.t) out.push(x); });
    return out;
  }

  // Naive date strings are read as UTC so the chart shows the same clock times as the file.
  function parseTime(s) {
    s = String(s).trim().replace(/^"|"$/g, '');
    if (/^\d{9,10}$/.test(s)) return +s;
    if (/^\d{12,13}$/.test(s)) return Math.floor(+s / 1000);
    s = s.replace(/^(\d{4})[\/.](\d{1,2})[\/.](\d{1,2})/, '$1-$2-$3');
    var m = s.match(/^(\d{1,2})[-\/.](\d{1,2})[-\/.](\d{4})(.*)$/); // dd-mm-yyyy
    if (m) s = m[3] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[1]).slice(-2) + m[4];
    s = s.replace(/^(\d{4})-(\d)-/, '$1-0$2-').replace(/^(\d{4}-\d{2})-(\d)(?!\d)/, '$1-0$2');
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10)) / 1000;
    if (/^\d{4}-\d{2}-\d{2}[ T]\d{1,2}:\d{2}(:\d{2})?$/.test(s)) s = s.replace(' ', 'T').replace(/T(\d):/, 'T0$1:') + 'Z';
    var ms = Date.parse(s);
    return isNaN(ms) ? NaN : Math.floor(ms / 1000);
  }

  function parseCsv(text) {
    var lines = String(text).replace(/^﻿/, '').split(/\r?\n/).filter(function (x) { return x.trim(); });
    if (lines.length < 3) throw new Error('The file needs a header row and at least two data rows.');
    var head0 = lines[0];
    var sep = head0.split(';').length > head0.split(',').length ? ';' : (head0.indexOf('\t') >= 0 && head0.indexOf(',') < 0 ? '\t' : ',');
    var split = function (l) { return l.split(sep).map(function (x) { return x.trim().replace(/^"|"$/g, ''); }); };
    var head = split(head0).map(function (h) { return h.toLowerCase().replace(/[^a-z]/g, ''); });
    var ix = function (names) { for (var i = 0; i < head.length; i++) if (names.indexOf(head[i]) >= 0) return i; return -1; };
    var iDate = head.indexOf('date') >= 0 ? head.indexOf('date') : ix(['datetime', 'timestamp', 'time', 'dt', 'day']);
    var iTime = head.indexOf('date') >= 0 ? head.indexOf('time') : -1;
    var iO = ix(['open', 'o']), iH = ix(['high', 'h']), iL = ix(['low', 'l']), iC = ix(['close', 'c', 'last', 'price']);
    if (iDate < 0 || iO < 0 || iH < 0 || iL < 0 || iC < 0) {
      throw new Error('Could not find Date, Open, High, Low and Close columns in the header row.');
    }
    var num = function (x) { return parseFloat(String(x).replace(/,/g, '')); };
    var out = [];
    for (var r = 1; r < lines.length; r++) {
      var p = split(lines[r]), d = p[iDate];
      if (iTime >= 0 && p[iTime]) d += ' ' + p[iTime];
      out.push({ t: parseTime(d), o: num(p[iO]), h: num(p[iH]), l: num(p[iL]), c: num(p[iC]), v: 0 });
    }
    var cs = normalize(out);
    if (cs.length < 20) throw new Error('Only ' + cs.length + ' usable candles found. At least 20 are needed. Check the date format and numbers.');
    return cs;
  }

  var api = { sma: sma, ema: ema, rsi: rsi, signals: signals, run: run, normalize: normalize, parseTime: parseTime, parseCsv: parseCsv };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.TPD_BT = api;
})(typeof window !== 'undefined' ? window : globalThis);
