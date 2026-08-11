/* 컴퓨터 상대 두뇌 - 몬테카를로 승률 계산 + 성향별 의사결정 */
(function (global) {
  'use strict';

  /* 성향: aggr 공격성, tight 요구 승률 기준, bluff 허풍 확률 */
  var PERSONAS = [
    { key: 'tight', label: '신중형', aggr: 0.35, tight: 0.60, bluff: 0.05 },
    { key: 'loose', label: '느슨형', aggr: 0.55, tight: 0.44, bluff: 0.13 },
    { key: 'aggro', label: '공격형', aggr: 0.80, tight: 0.50, bluff: 0.24 },
    { key: 'calm', label: '침착형', aggr: 0.45, tight: 0.53, bluff: 0.08 }
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

  function itersFor(street) {
    if (street === 'preflop') return 240;
    if (street === 'flop') return 260;
    if (street === 'turn') return 320;
    return 420;
  }

  /**
   * @param ctx {hole, board, oppCount, pot, toCall, chips, minRaiseTo, maxRaiseTo,
   *             street, bigBlind, persona, streetBet}
   * @returns {{action:'fold'|'check'|'call'|'raise', amount:number, eq:number}}
   */
  function decide(ctx) {
    var p = ctx.persona;
    var eq = equity(ctx.hole, ctx.board, ctx.oppCount, itersFor(ctx.street));
    var noisy = Math.max(0, Math.min(1, eq + (Math.random() - 0.5) * 0.06));
    var pot = ctx.pot;
    var toCall = ctx.toCall;
    var canRaise = ctx.maxRaiseTo > ctx.minRaiseTo - 1 && ctx.chips > toCall;

    function raiseTo(target) {
      var v = Math.round(target);
      if (v < ctx.minRaiseTo) v = ctx.minRaiseTo;
      if (v > ctx.maxRaiseTo) v = ctx.maxRaiseTo;
      return { action: 'raise', amount: v, eq: eq };
    }

    /* 아무도 안 걸었을 때 */
    if (toCall <= 0) {
      if (canRaise) {
        if (noisy > 0.78) return raiseTo(ctx.streetBet + pot * (0.6 + Math.random() * 0.35));
        if (noisy > 0.62 && Math.random() < p.aggr) return raiseTo(ctx.streetBet + pot * 0.5);
        if (noisy > p.tight && Math.random() < p.aggr * 0.6) return raiseTo(ctx.streetBet + pot * 0.35);
        if (ctx.board.length >= 3 && Math.random() < p.bluff) return raiseTo(ctx.streetBet + pot * 0.45);
      }
      return { action: 'check', amount: 0, eq: eq };
    }

    /* 상대 베팅이 있을 때 */
    var potOdds = toCall / (pot + toCall);
    var cheap = toCall <= ctx.bigBlind * 1.5;

    if (canRaise && noisy > 0.84 && Math.random() < 0.75) {
      return raiseTo(ctx.streetBet + toCall + (pot + toCall) * (0.55 + Math.random() * 0.4));
    }
    if (canRaise && noisy > 0.70 && Math.random() < p.aggr * 0.7) {
      return raiseTo(ctx.streetBet + toCall + (pot + toCall) * 0.45);
    }
    if (noisy > potOdds + 0.06) return { action: 'call', amount: toCall, eq: eq };
    if (cheap && noisy > 0.30) return { action: 'call', amount: toCall, eq: eq };
    if (canRaise && ctx.street === 'river' && noisy < 0.22 && Math.random() < p.bluff * 0.5) {
      return raiseTo(ctx.streetBet + toCall + (pot + toCall) * 0.7); // 드문 허풍
    }
    return { action: 'fold', amount: 0, eq: eq };
  }

  global.AI = {
    PERSONAS: PERSONAS,
    equity: equity,
    decide: decide
  };
})(window);
