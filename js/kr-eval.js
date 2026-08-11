/* 우리식 족보 판정 - 마운틴과 백스트레이트가 따로 있고, 백스트레이트 플러시가 더 높다 */
(function (global) {
  'use strict';

  /* 낮은 것부터 */
  var CAT_NAME = [
    '탑',                     // 0
    '원페어',                 // 1
    '투페어',                 // 2
    '트리플',                 // 3
    '백스트레이트',           // 4  A-2-3-4-5
    '스트레이트',             // 5
    '마운틴',                 // 6  10-J-Q-K-A
    '플러시',                 // 7
    '풀하우스',               // 8
    '포카드',                 // 9
    '스트레이트 플러시',      // 10
    '백스트레이트 플러시',    // 11
    '로열 스트레이트 플러시'  // 12
  ];

  var RL = Cards.RANK_LABEL;

  /* 같은 무늬로 A-2-3-4-5가 있으면 그 다섯 장을 돌려준다 */
  function findWheelFlush(cards) {
    var bySuit = { s: {}, h: {}, d: {}, c: {} };
    var i;
    for (i = 0; i < cards.length; i++) bySuit[cards[i].s][cards[i].r] = cards[i];
    var need = [14, 2, 3, 4, 5];
    for (var su in bySuit) {
      var ok = true;
      var picked = [];
      for (i = 0; i < need.length; i++) {
        var c = bySuit[su][need[i]];
        if (!c) { ok = false; break; }
        picked.push(c);
      }
      if (ok) return picked;
    }
    return null;
  }

  /* 국제식 판정 결과를 우리식 순위로 옮긴다 */
  function mapCategory(base) {
    switch (base.cat) {
      case 8: // 스트레이트 플러시 계열
        if (base.tb[0] === 14) return 12;
        if (base.tb[0] === 5) return 11;
        return 10;
      case 7: return 9;   // 포카드
      case 6: return 8;   // 풀하우스
      case 5: return 7;   // 플러시
      case 4:             // 스트레이트 계열
        if (base.tb[0] === 14) return 6;   // 마운틴
        if (base.tb[0] === 5) return 4;    // 백스트레이트
        return 5;
      case 3: return 3;
      case 2: return 2;
      case 1: return 1;
      default: return 0;
    }
  }

  function detailFor(cat, base) {
    if (cat === 12 || cat === 11 || cat === 6 || cat === 4) return '';
    return base.detail || '';
  }

  /**
   * @param {Array} cards 5~7장
   * @returns {{cat:number, tb:number[], best:Array, name:string, detail:string}}
   */
  function evaluate(cards) {
    var base = Evaluator.evaluate(cards);
    var cat = mapCategory(base);

    /* 우리식에서는 백스트레이트 플러시가 일반 스트레이트 플러시보다 높다.
       국제식 판정은 이를 가장 낮은 스트레이트 플러시로 보므로 따로 확인한다 */
    if (cat < 11) {
      var wheel = findWheelFlush(cards);
      if (wheel) {
        return {
          cat: 11, tb: [5], best: wheel,
          name: CAT_NAME[11], detail: ''
        };
      }
    }

    return {
      cat: cat,
      tb: base.tb,
      best: base.best,
      name: CAT_NAME[cat],
      detail: detailFor(cat, base)
    };
  }

  function compare(a, b) {
    if (a.cat !== b.cat) return a.cat - b.cat;
    var n = Math.max(a.tb.length, b.tb.length);
    for (var i = 0; i < n; i++) {
      var x = a.tb[i] || 0, y = b.tb[i] || 0;
      if (x !== y) return x - y;
    }
    return 0;
  }

  function label(ev) {
    return ev.detail ? ev.name + ' (' + ev.detail + ')' : ev.name;
  }

  /* 오픈된 카드만으로 누가 세 보이는지 (베팅 순서 정할 때 쓴다) */
  function openStrength(openCards) {
    if (!openCards.length) return { cat: -1, tb: [] };
    if (openCards.length < 5) {
      /* 다섯 장이 안 되면 단순히 짝과 높은 숫자로 견준다 */
      var byRank = {};
      openCards.forEach(function (c) { byRank[c.r] = (byRank[c.r] || 0) + 1; });
      var groups = Object.keys(byRank).map(function (r) {
        return { r: parseInt(r, 10), n: byRank[r] };
      }).sort(function (a, b) { return b.n - a.n || b.r - a.r; });
      return {
        cat: groups[0].n - 1,
        tb: groups.map(function (g) { return g.r; })
      };
    }
    return evaluate(openCards);
  }

  global.KrEval = {
    CAT_NAME: CAT_NAME,
    evaluate: evaluate,
    compare: compare,
    label: label,
    openStrength: openStrength,
    RANK_LABEL: RL
  };
})(window);
