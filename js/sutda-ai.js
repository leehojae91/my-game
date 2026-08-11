/* 섯다 상대 두뇌 */
(function (global) {
  'use strict';

  function sameCard(a, b) { return a.m === b.m && a.i === b.i; }

  function remainingDeck(dead) {
    var full = Hwatu.createDeck();
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
   * 내 패가 이길 확률. 상대 패는 남은 화투에서 무작위로 가정한다.
   */
  function equity(myCards, myNeed, oppCount, cardsPerHand, iters) {
    if (oppCount < 1) return 1;
    var deck = remainingDeck(myCards);
    var need = myNeed + oppCount * cardsPerHand;
    if (need > deck.length) return 0.5;

    var win = 0, tie = 0;
    for (var it = 0; it < iters; it++) {
      Hwatu.shuffle(deck, need);
      var idx = 0;
      var mine = myCards.concat(deck.slice(idx, idx + myNeed));
      idx += myNeed;
      var my = SutdaEval.evaluate(mine);

      var lost = false, tied = false;
      for (var o = 0; o < oppCount; o++) {
        var oc = deck.slice(idx, idx + cardsPerHand);
        idx += cardsPerHand;
        var cmp = SutdaEval.compare(my, SutdaEval.evaluate(oc));
        if (cmp < 0) { lost = true; break; }
        if (cmp === 0) tied = true;
      }
      if (lost) continue;
      if (tied) tie++; else win++;
    }
    return (win + tie * 0.5) / iters;
  }

  function itersFor(streetIdx, skill) {
    var base = streetIdx === 0 ? 500 : 800;
    var s = (typeof skill === 'number') ? skill : 1;
    return Math.max(120, Math.round(base * (0.35 + s * 0.65)));
  }

  function applyMistake(ctx, res, skill, eq) {
    var rate = (1 - skill) * 0.35;
    if (rate <= 0 || Math.random() >= rate) return res;
    if (res.action === 'fold' && ctx.toCall > 0) {
      return { action: 'call', amount: ctx.toCall, eq: eq };
    }
    if ((res.action === 'call' || res.action === 'raise') && eq > 0.6 && ctx.toCall > 0) {
      return { action: 'fold', amount: 0, eq: eq };
    }
    return res;
  }

  function decide(ctx) {
    var skill = (typeof ctx.persona.skill === 'number') ? ctx.persona.skill : 1;
    var res = decideCore(ctx, skill);
    return applyMistake(ctx, res, skill, res.eq);
  }

  function decideCore(ctx, skill) {
    var p = ctx.persona;
    var pot = ctx.pot;
    var toCall = ctx.toCall;
    var canRaise = (ctx.canRaise !== false) && ctx.maxRaiseTo > ctx.streetBet + toCall;
    var pos = (typeof ctx.position === 'number') ? ctx.position : 0.5;
    var raises = ctx.raises || 0;

    var eq = equity(ctx.myCards, ctx.myNeed, ctx.oppCount, ctx.cardsPerHand,
                    itersFor(ctx.streetIdx, skill));

    var adj = eq * Math.pow(0.92, raises * skill);
    var noiseAmp = 0.07 + (1 - skill) * 0.24;
    var noisy = Math.max(0, Math.min(1, adj + (Math.random() - 0.5) * noiseAmp));

    var aggr = Math.min(0.95, p.aggr + pos * 0.15);
    var need = p.tight - pos * 0.05 + Math.max(0, ctx.oppCount - 1) * 0.03;
    /* 섯다는 패가 단순해 허풍이 잘 통한다 */
    var bluffRate = p.bluff * 1.3 * (1 + pos * 0.25) / Math.max(1, ctx.oppCount * 0.7);

    function raiseTo(target) {
      var v = Math.round(target);
      if (v < ctx.minRaiseTo) v = ctx.minRaiseTo;
      if (v > ctx.maxRaiseTo) v = ctx.maxRaiseTo;
      return { action: 'raise', amount: v, eq: eq };
    }
    function betSize(ratio) {
      return ctx.streetBet + toCall + (pot + toCall) * ratio;
    }

    if (toCall <= 0) {
      if (canRaise) {
        if (noisy > 0.88 && Math.random() < 0.25) return { action: 'check', amount: 0, eq: eq };
        if (noisy > 0.72) return raiseTo(betSize(0.7 + Math.random() * 0.4));
        if (noisy > 0.56 && Math.random() < aggr) return raiseTo(betSize(0.5));
        if (noisy > need && Math.random() < aggr * 0.6) return raiseTo(betSize(0.35));
        if (Math.random() < bluffRate) return raiseTo(betSize(0.5));
      }
      return { action: 'check', amount: 0, eq: eq };
    }

    var potOdds = toCall / (pot + toCall);
    var cheap = toCall <= ctx.baseBet;

    if (canRaise && noisy > 0.85 && Math.random() < 0.8) return raiseTo(betSize(0.7 + Math.random() * 0.5));
    if (canRaise && noisy > 0.70 && Math.random() < aggr * 0.75) return raiseTo(betSize(0.5));
    if (noisy > potOdds + 0.04) return { action: 'call', amount: toCall, eq: eq };
    if (cheap && noisy > 0.3) return { action: 'call', amount: toCall, eq: eq };
    if (canRaise && ctx.streetIdx === 1 && noisy < 0.22 && Math.random() < bluffRate * 0.6) {
      return raiseTo(betSize(0.8));
    }
    return { action: 'fold', amount: 0, eq: eq };
  }

  global.SutdaAI = { equity: equity, decide: decide };
})(window);
