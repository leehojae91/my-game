/* 맞고 점수 계산 */
(function (global) {
  'use strict';

  function group(cards) {
    var g = { 광: [], 열: [], 띠: [], 피: [] };
    cards.forEach(function (c) { g[c.t].push(c); });
    return g;
  }

  function piCount(cards) {
    return cards.reduce(function (a, c) { return a + GoCards.piValue(c); }, 0);
  }

  function hasMonths(cards, months) {
    return months.every(function (m) {
      return cards.some(function (c) { return c.m === m; });
    });
  }

  /**
   * @returns {{total:number, parts:Array<{name:string, point:number}>,
   *            gwang:number, yeol:number, tti:number, pi:number}}
   */
  function score(cards) {
    var g = group(cards);
    var parts = [];
    var total = 0;

    /* 광 */
    var gw = g['광'].length;
    var hasBi = g['광'].some(function (c) { return c.sub === '비광'; });
    var gwPoint = 0;
    if (gw >= 5) gwPoint = 15;
    else if (gw === 4) gwPoint = 4;
    else if (gw === 3) gwPoint = hasBi ? 2 : 3;
    if (gwPoint) { parts.push({ name: gw + '광', point: gwPoint }); total += gwPoint; }

    /* 열끗 */
    var yn = g['열'].length;
    if (yn >= 5) { parts.push({ name: '열끗 ' + yn + '장', point: yn - 4 }); total += yn - 4; }
    if (hasMonths(g['열'], [2, 4, 8])) { parts.push({ name: '고도리', point: 5 }); total += 5; }

    /* 띠 */
    var tn = g['띠'].length;
    if (tn >= 5) { parts.push({ name: '띠 ' + tn + '장', point: tn - 4 }); total += tn - 4; }
    var hong = g['띠'].filter(function (c) { return c.sub === '홍단'; }).length;
    var cheong = g['띠'].filter(function (c) { return c.sub === '청단'; }).length;
    var cho = g['띠'].filter(function (c) { return c.sub === '초단'; }).length;
    if (hong >= 3) { parts.push({ name: '홍단', point: 3 }); total += 3; }
    if (cheong >= 3) { parts.push({ name: '청단', point: 3 }); total += 3; }
    if (cho >= 3) { parts.push({ name: '초단', point: 3 }); total += 3; }

    /* 피 */
    var pn = piCount(g['피']);
    if (pn >= 10) { parts.push({ name: '피 ' + pn + '장', point: pn - 9 }); total += pn - 9; }

    return {
      total: total, parts: parts,
      gwang: gw, yeol: yn, tti: tn, pi: pn
    };
  }

  /* 고 횟수에 따른 덤 */
  function goBonus(goCount) {
    if (goCount <= 0) return { add: 0, mult: 1 };
    if (goCount === 1) return { add: 1, mult: 1 };
    if (goCount === 2) return { add: 2, mult: 1 };
    return { add: 2, mult: Math.pow(2, goCount - 2) };
  }

  /**
   * 최종 점수 = (기본 점수 + 고 덤) × 고 배수 × 박 배수
   */
  function finalScore(winnerCards, loserCards, goCount, opts) {
    var w = score(winnerCards);
    var l = score(loserCards);
    var bonus = goBonus(goCount);
    var base = w.total + bonus.add;
    var mult = bonus.mult;
    var flags = [];

    /* 피박: 진 사람 피가 다섯 장 이하 */
    if (l.pi <= 5) { mult *= 2; flags.push('피박'); }
    /* 광박: 진 사람 광이 없는데 이긴 사람이 광 점수를 냈다 */
    if (l.gwang === 0 && w.gwang >= 3) { mult *= 2; flags.push('광박'); }
    /* 멍박: 진 사람 열끗이 없는데 이긴 사람이 일곱 장 이상 */
    if (l.yeol === 0 && w.yeol >= 7) { mult *= 2; flags.push('멍박'); }
    /* 고박: 고를 부른 쪽이 졌다 */
    if (opts && opts.goBak) { mult *= 2; flags.push('고박'); }

    return {
      base: base, mult: mult, total: base * mult,
      flags: flags, detail: w, loserDetail: l, goCount: goCount
    };
  }

  global.GoScore = {
    score: score,
    goBonus: goBonus,
    finalScore: finalScore,
    piCount: piCount
  };
})(window);
