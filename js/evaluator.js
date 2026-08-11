/* 족보 판정 - 5~7장 중 가장 좋은 5장을 찾는다 */
(function (global) {
  'use strict';

  var CAT_NAME = [
    '하이카드',
    '원페어',
    '투페어',
    '트리플',
    '스트레이트',
    '플러시',
    '풀하우스',
    '포카드',
    '스트레이트 플러시'
  ];

  var RL = Cards.RANK_LABEL;

  function descRank(a, b) { return b - a; }

  /* 랭크 집합에서 스트레이트 최고 끝수를 구한다. 없으면 0. A-2-3-4-5는 5를 반환 */
  function straightHigh(rankSet) {
    for (var high = 14; high >= 5; high--) {
      var ok = true;
      for (var i = 0; i < 5; i++) {
        var need = high - i;
        if (need === 1) need = 14; // 휠(A를 1로)
        if (!rankSet[need]) { ok = false; break; }
      }
      if (ok) return high;
    }
    return 0;
  }

  /* high를 끝수로 하는 스트레이트를 이루는 카드 5장을 고른다 */
  function pickStraight(cards, high) {
    var out = [];
    for (var i = 0; i < 5; i++) {
      var need = high - i;
      if (need === 1) need = 14;
      for (var j = 0; j < cards.length; j++) {
        if (cards[j].r === need) { out.push(cards[j]); break; }
      }
    }
    return out;
  }

  function pickByRank(cards, rank, howMany, exclude) {
    var out = [];
    for (var i = 0; i < cards.length && out.length < howMany; i++) {
      if (cards[i].r === rank && (!exclude || exclude.indexOf(cards[i]) === -1)) out.push(cards[i]);
    }
    return out;
  }

  function kickers(cards, used, howMany) {
    var out = [];
    var sorted = cards.slice().sort(function (a, b) { return b.r - a.r; });
    for (var i = 0; i < sorted.length && out.length < howMany; i++) {
      if (used.indexOf(sorted[i]) === -1) out.push(sorted[i]);
    }
    return out;
  }

  /**
   * @param {Array<{r:number,s:string}>} cards 5~7장
   * @returns {{cat:number, tb:number[], best:Array, name:string, detail:string}}
   */
  function evaluate(cards) {
    var byRank = {};   // rank -> count
    var bySuit = { s: [], h: [], d: [], c: [] };
    var i;

    for (i = 0; i < cards.length; i++) {
      var c = cards[i];
      byRank[c.r] = (byRank[c.r] || 0) + 1;
      bySuit[c.s].push(c);
    }

    var rankSet = {};
    var ranksDesc = [];
    for (var k in byRank) {
      var rn = parseInt(k, 10);
      rankSet[rn] = true;
      ranksDesc.push(rn);
    }
    ranksDesc.sort(descRank);

    var flushSuit = null;
    for (var s in bySuit) {
      if (bySuit[s].length >= 5) { flushSuit = s; break; }
    }

    /* 8. 스트레이트 플러시 */
    if (flushSuit) {
      var fCards = bySuit[flushSuit].slice().sort(function (a, b) { return b.r - a.r; });
      var fSet = {};
      for (i = 0; i < fCards.length; i++) fSet[fCards[i].r] = true;
      var sfHigh = straightHigh(fSet);
      if (sfHigh) {
        return {
          cat: 8, tb: [sfHigh],
          best: pickStraight(fCards, sfHigh),
          name: sfHigh === 14 ? '로열 스트레이트 플러시' : '스트레이트 플러시',
          detail: sfHigh === 14 ? '' : RL[sfHigh] + ' 탑'
        };
      }
    }

    /* 숫자별 묶음 정리 */
    var quads = [], trips = [], pairs = [];
    for (i = 0; i < ranksDesc.length; i++) {
      var r = ranksDesc[i];
      if (byRank[r] === 4) quads.push(r);
      else if (byRank[r] === 3) trips.push(r);
      else if (byRank[r] === 2) pairs.push(r);
    }

    /* 7. 포카드 */
    if (quads.length) {
      var qc = pickByRank(cards, quads[0], 4);
      var qk = kickers(cards, qc, 1);
      return {
        cat: 7, tb: [quads[0], qk[0] ? qk[0].r : 0],
        best: qc.concat(qk), name: '포카드', detail: RL[quads[0]] + ' 포카드'
      };
    }

    /* 6. 풀하우스 */
    if (trips.length >= 2 || (trips.length === 1 && pairs.length >= 1)) {
      var tRank = trips[0];
      var pRank = (trips.length >= 2) ? Math.max(trips[1], pairs.length ? pairs[0] : 0) : pairs[0];
      var tc = pickByRank(cards, tRank, 3);
      var pc = pickByRank(cards, pRank, 2);
      return {
        cat: 6, tb: [tRank, pRank],
        best: tc.concat(pc), name: '풀하우스', detail: RL[tRank] + ' 풀하우스'
      };
    }

    /* 5. 플러시 */
    if (flushSuit) {
      var flush5 = bySuit[flushSuit].slice().sort(function (a, b) { return b.r - a.r; }).slice(0, 5);
      return {
        cat: 5, tb: flush5.map(function (x) { return x.r; }),
        best: flush5, name: '플러시', detail: RL[flush5[0].r] + ' 하이 플러시'
      };
    }

    /* 4. 스트레이트 */
    var sHigh = straightHigh(rankSet);
    if (sHigh) {
      return {
        cat: 4, tb: [sHigh],
        best: pickStraight(cards, sHigh), name: '스트레이트', detail: RL[sHigh] + ' 탑'
      };
    }

    /* 3. 트리플 */
    if (trips.length) {
      var t3 = pickByRank(cards, trips[0], 3);
      var t3k = kickers(cards, t3, 2);
      return {
        cat: 3, tb: [trips[0]].concat(t3k.map(function (x) { return x.r; })),
        best: t3.concat(t3k), name: '트리플', detail: RL[trips[0]] + ' 트리플'
      };
    }

    /* 2. 투페어 */
    if (pairs.length >= 2) {
      var hi = pickByRank(cards, pairs[0], 2);
      var lo = pickByRank(cards, pairs[1], 2);
      var tpk = kickers(cards, hi.concat(lo), 1);
      return {
        cat: 2, tb: [pairs[0], pairs[1], tpk[0] ? tpk[0].r : 0],
        best: hi.concat(lo, tpk), name: '투페어', detail: RL[pairs[0]] + '·' + RL[pairs[1]] + ' 투페어'
      };
    }

    /* 1. 원페어 */
    if (pairs.length === 1) {
      var p2 = pickByRank(cards, pairs[0], 2);
      var pk = kickers(cards, p2, 3);
      return {
        cat: 1, tb: [pairs[0]].concat(pk.map(function (x) { return x.r; })),
        best: p2.concat(pk), name: '원페어', detail: RL[pairs[0]] + ' 원페어'
      };
    }

    /* 0. 하이카드 */
    var top5 = cards.slice().sort(function (a, b) { return b.r - a.r; }).slice(0, 5);
    return {
      cat: 0, tb: top5.map(function (x) { return x.r; }),
      best: top5, name: '하이카드', detail: RL[top5[0].r] + ' 하이'
    };
  }

  /* a가 더 세면 양수, 같으면 0, 약하면 음수 */
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

  /* 개인 카드 2장 표기 - AA, AKs(같은 무늬), AKo(다른 무늬) */
  function holeNotation(hole) {
    if (!hole || hole.length < 2) return '';
    /* 표기에서는 10을 T로 줄여 쓴다 */
    function n(r) { return r === 10 ? 'T' : RL[r]; }
    var a = hole[0], b = hole[1];
    var hi = a.r >= b.r ? a : b;
    var lo = a.r >= b.r ? b : a;
    if (hi.r === lo.r) return n(hi.r) + n(lo.r);
    return n(hi.r) + n(lo.r) + (hi.s === lo.s ? 's' : 'o');
  }

  /* 아직 완성되지 않은 드로와 아웃츠(승부를 뒤집을 남은 카드 수)를 센다 */
  function analyzeDraws(hole, board) {
    if (!board || board.length < 3 || board.length >= 5) return null;
    var cards = hole.concat(board);
    var cur = evaluate(cards);
    var kinds = [];
    var outSet = {};

    function key(c) { return c.r + c.s; }

    var seen = {};
    for (var i = 0; i < cards.length; i++) seen[key(cards[i])] = true;

    /* 남은 카드를 한 장씩 넣어 보고 족보가 올라가는지 본다 */
    var full = Cards.createDeck();
    var flushUp = 0, straightUp = 0, bigUp = 0;

    for (var d = 0; d < full.length; d++) {
      var c = full[d];
      if (seen[key(c)]) continue;
      var after = evaluate(cards.concat([c]));
      if (after.cat > cur.cat) {
        outSet[key(c)] = true;
        if (after.cat === 5) flushUp++;
        else if (after.cat === 4) straightUp++;
        else if (after.cat >= 6) bigUp++;
      }
    }

    var outs = Object.keys(outSet).length;
    if (!outs) return null;

    if (flushUp >= 7) kinds.push('플러시 드로');
    if (straightUp >= 6) kinds.push('양방향 스트레이트 드로');
    else if (straightUp > 0) kinds.push('스트레이트 드로');
    if (bigUp > 0 && cur.cat >= 1) kinds.push('족보 상승 가능');

    return { outs: outs, kinds: kinds };
  }

  global.Evaluator = {
    CAT_NAME: CAT_NAME,
    evaluate: evaluate,
    compare: compare,
    label: label,
    holeNotation: holeNotation,
    analyzeDraws: analyzeDraws
  };
})(window);
