/* 컴퓨터 상대 두뇌 - 몬테카를로 승률 계산 + 성향별 의사결정 */
(function (global) {
  'use strict';

  /* 성향: aggr 공격성, tight 요구 승률 기준, bluff 허풍 확률 */
  var PERSONAS = [
    { key: 'tight', label: '신중형', aggr: 0.35, tight: 0.58, bluff: 0.05 },
    { key: 'loose', label: '느슨형', aggr: 0.55, tight: 0.36, bluff: 0.13 },
    { key: 'aggro', label: '공격형', aggr: 0.80, tight: 0.44, bluff: 0.24 },
    { key: 'calm', label: '침착형', aggr: 0.45, tight: 0.50, bluff: 0.08 }
  ];

  function sameCard(a, b) { return a.r === b.r && a.s === b.s; }

  function remainingDeck(dead) {
    var full = Cards.createDeck();
    var out = [];
    for (var i = 0; i < full.length; i++) {
      var used = false;
      for (var j = 0; j < dead.length; j++) {
        if (sameCard(full[i], dead[j])) { used = true; break; }
      }
      if (!used) out.push(full[i]);
    }
    return out;
  }

  /**
   * 무작위 상대 패를 가정한 승률(무승부는 0.5로 계산)
   */
  function equity(hole, board, oppCount, iters) {
    if (oppCount < 1) return 1;
    var deck = remainingDeck(hole.concat(board));
    var needBoard = 5 - board.length;
    var need = needBoard + oppCount * 2;
    if (need > deck.length) return 0.5;

    var win = 0, tie = 0;
    for (var it = 0; it < iters; it++) {
      Cards.shuffle(deck, need);
      var idx = 0;
      var full = board.concat(deck.slice(0, needBoard));
      idx = needBoard;

      var my = Evaluator.evaluate(hole.concat(full));
      var lost = false, tied = false;

      for (var o = 0; o < oppCount; o++) {
        var oppHole = [deck[idx++], deck[idx++]];
        var cmp = Evaluator.compare(my, Evaluator.evaluate(oppHole.concat(full)));
        if (cmp < 0) { lost = true; break; }
        if (cmp === 0) tied = true;
      }
      if (lost) continue;
      if (tied) tie++; else win++;
    }
    return (win + tie * 0.5) / iters;
  }

  /* 실측상 400~900회도 한 번에 10밀리초 미만이라 정확도를 우선한다 */
  /**
   * 모두의 패가 공개된 올인 상황의 실제 승률.
   * 남은 카드가 적으면 전부 세어 보고, 많으면 표본을 뽑는다.
   * @returns {number[]} holes와 같은 순서의 승률(무승부는 지분으로 나눔)
   */
  function knownEquity(holes, board) {
    var dead = board.slice();
    holes.forEach(function (h) { dead = dead.concat(h); });
    var deck = remainingDeck(dead);
    var need = 5 - board.length;
    var wins = holes.map(function () { return 0; });
    var total = 0;

    function score(full) {
      var best = null;
      var evs = holes.map(function (h) {
        var e = Evaluator.evaluate(h.concat(full));
        if (!best || Evaluator.compare(e, best) > 0) best = e;
        return e;
      });
      var winners = [];
      evs.forEach(function (e, i) { if (Evaluator.compare(e, best) === 0) winners.push(i); });
      winners.forEach(function (i) { wins[i] += 1 / winners.length; });
      total++;
    }

    var i, j;
    if (need <= 0) {
      score(board);
    } else if (need === 1) {
      for (i = 0; i < deck.length; i++) score(board.concat([deck[i]]));
    } else if (need === 2) {
      for (i = 0; i < deck.length; i++) {
        for (j = i + 1; j < deck.length; j++) score(board.concat([deck[i], deck[j]]));
      }
    } else {
      for (i = 0; i < 1500; i++) {
        Cards.shuffle(deck, need);
        score(board.concat(deck.slice(0, need)));
      }
    }
    return wins.map(function (w) { return total ? w / total : 0; });
  }

  function itersFor(street) {
    if (street === 'preflop') return 400;
    if (street === 'flop') return 500;
    if (street === 'turn') return 650;
    return 800;
  }

  /**
   * 시작 패 점수 (Chen 방식) - 프리플랍 참여 여부 판단에 쓴다. 범위 대략 -1 ~ 20
   */
  function startingScore(hole) {
    var a = hole[0], b = hole[1];
    var hi = a.r >= b.r ? a : b;
    var lo = a.r >= b.r ? b : a;

    var base;
    if (hi.r === 14) base = 10;
    else if (hi.r === 13) base = 8;
    else if (hi.r === 12) base = 7;
    else if (hi.r === 11) base = 6;
    else base = hi.r / 2;

    var score;
    if (hi.r === lo.r) {
      score = Math.max(5, base * 2);          // 페어
    } else {
      score = base;
      if (hi.s === lo.s) score += 2;          // 같은 무늬
      var gap = hi.r - lo.r - 1;
      if (gap === 1) score -= 1;
      else if (gap === 2) score -= 2;
      else if (gap === 3) score -= 4;
      else if (gap >= 4) score -= 5;
      if (gap <= 1 && hi.r < 12) score += 1;  // 낮은 커넥터 보정
    }
    return Math.ceil(score);
  }

  /**
   * @param ctx {hole, board, oppCount, pot, toCall, chips, minRaiseTo, maxRaiseTo, canRaise,
   *             street, bigBlind, persona, streetBet, position, raises, isPreflopAggressor}
   * @returns {{action:'fold'|'check'|'call'|'raise', amount:number, eq:number}}
   */
  function decide(ctx) {
    var p = ctx.persona;
    var pot = ctx.pot;
    var toCall = ctx.toCall;
    var canRaise = (ctx.canRaise !== false) && ctx.maxRaiseTo > ctx.streetBet + toCall;
    var pos = (typeof ctx.position === 'number') ? ctx.position : 0.5; // 0 얼리 ~ 1 버튼
    var raises = ctx.raises || 0;

    var eq = equity(ctx.hole, ctx.board, ctx.oppCount, itersFor(ctx.street));

    /* 상대가 이번 라운드에 올렸다면 무작위 패보다 강할 확률이 높다 - 승률을 깎아 본다 */
    var adj = eq * Math.pow(0.93, raises);
    var noisy = Math.max(0, Math.min(1, adj + (Math.random() - 0.5) * 0.06));

    /* 늦은 자리일수록 공격적으로, 여러 명이 남았을수록 신중하게 */
    var aggr = Math.min(0.95, p.aggr + pos * 0.18);
    var need = p.tight - pos * 0.05 + Math.max(0, ctx.oppCount - 1) * 0.03;
    var bluffRate = p.bluff * (1 + pos * 0.2) / Math.max(1, ctx.oppCount * 0.8);

    function raiseTo(target) {
      var v = Math.round(target);
      if (v < ctx.minRaiseTo) v = ctx.minRaiseTo;
      if (v > ctx.maxRaiseTo) v = ctx.maxRaiseTo;
      return { action: 'raise', amount: v, eq: eq };
    }
    function betSize(ratio) {
      return ctx.streetBet + toCall + (pot + toCall) * ratio;
    }

    /* ---- 프리플랍: 시작 패 점수를 함께 본다 ---- */
    if (ctx.street === 'preflop') {
      var sc = startingScore(ctx.hole);
      /* 참여선은 성향에서 나온다. 신중할수록 높고, 자리가 늦을수록 낮아진다 */
      var openLine = p.tight * 14 - pos * 2.5 + raises * 2.5;
      var isOpen = raises === 0;   // 아직 아무도 올리지 않은 상태(블라인드만 놓인 상황)

      if (canRaise) {
        if (isOpen && sc >= openLine + 1 && Math.random() < 0.55 + aggr * 0.35) {
          return raiseTo(ctx.streetBet + toCall + ctx.bigBlind * (2 + Math.random() * 1.5));
        }
        if (!isOpen && sc >= openLine + 4 && Math.random() < aggr) {
          return raiseTo(betSize(0.8 + Math.random() * 0.4));   // 강한 패로 재레이즈
        }
      }
      if (toCall <= 0) return { action: 'check', amount: 0, eq: eq };
      /* 참여 기준에 들면 팟 오즈를 따져 콜 */
      if (sc >= openLine - 1 && noisy > toCall / (pot + toCall) - 0.05) {
        return { action: 'call', amount: toCall, eq: eq };
      }
      return { action: 'fold', amount: 0, eq: eq };
    }

    /* ---- 아무도 안 걸었을 때 ---- */
    if (toCall <= 0) {
      if (canRaise) {
        /* 아주 강할 때 가끔 체크로 유인 */
        if (noisy > 0.90 && Math.random() < 0.28) return { action: 'check', amount: 0, eq: eq };
        if (noisy > 0.75) return raiseTo(betSize(0.6 + Math.random() * 0.3));
        if (noisy > 0.60 && Math.random() < aggr) return raiseTo(betSize(0.5));
        /* 프리플랍에서 주도권을 잡았으면 플랍에서 이어 친다 */
        if (ctx.isPreflopAggressor && ctx.street === 'flop' && Math.random() < 0.55 + aggr * 0.25) {
          return raiseTo(betSize(0.45));
        }
        if (noisy > need && Math.random() < aggr * 0.6) return raiseTo(betSize(0.35));
        if (Math.random() < bluffRate) return raiseTo(betSize(0.45));
      }
      return { action: 'check', amount: 0, eq: eq };
    }

    /* ---- 상대 베팅이 있을 때 ---- */
    var potOdds = toCall / (pot + toCall);
    var cheap = toCall <= ctx.bigBlind * 1.5;

    if (canRaise && noisy > 0.86 && Math.random() < 0.75) {
      return raiseTo(betSize(0.6 + Math.random() * 0.4));
    }
    if (canRaise && noisy > 0.72 && Math.random() < aggr * 0.7) {
      return raiseTo(betSize(0.45));
    }
    if (noisy > potOdds + 0.05) return { action: 'call', amount: toCall, eq: eq };
    if (cheap && noisy > 0.30) return { action: 'call', amount: toCall, eq: eq };
    if (canRaise && ctx.street === 'river' && noisy < 0.20 && Math.random() < bluffRate * 0.5) {
      return raiseTo(betSize(0.7));                 // 드문 허풍
    }
    return { action: 'fold', amount: 0, eq: eq };
  }

  global.AI = {
    PERSONAS: PERSONAS,
    equity: equity,
    knownEquity: knownEquity,
    startingScore: startingScore,
    decide: decide
  };
})(window);
