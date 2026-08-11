/* 세븐 포커 상대 두뇌 - 오픈된 카드를 빼고 남은 패로 승률을 가늠한다 */
(function (global) {
  'use strict';

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
   * 내 패와 상대의 오픈 카드를 알고 있을 때의 승률.
   * @param myCards 내가 가진 카드 전부
   * @param myNeed 앞으로 더 받을 장수
   * @param opps [{open:[...], hidden:숨은 장수, need:더 받을 장수}]
   */
  function equity(myCards, myNeed, opps, iters) {
    if (!opps.length) return 1;

    var dead = myCards.slice();
    opps.forEach(function (o) { dead = dead.concat(o.open); });
    var deck = remainingDeck(dead);

    var need = myNeed;
    opps.forEach(function (o) { need += o.hidden + o.need; });
    if (need > deck.length) return 0.5;

    var win = 0, tie = 0;
    for (var it = 0; it < iters; it++) {
      Cards.shuffle(deck, need);
      var idx = 0;
      var mine = myCards.concat(deck.slice(idx, idx + myNeed));
      idx += myNeed;

      var my = KrEval.evaluate(mine);
      var lost = false, tied = false;

      for (var o = 0; o < opps.length; o++) {
        var take = opps[o].hidden + opps[o].need;
        var oppCards = opps[o].open.concat(deck.slice(idx, idx + take));
        idx += take;
        var cmp = KrEval.compare(my, KrEval.evaluate(oppCards));
        if (cmp < 0) { lost = true; break; }
        if (cmp === 0) tied = true;
      }
      if (lost) continue;
      if (tied) tie++; else win++;
    }
    return (win + tie * 0.5) / iters;
  }

  /* 스트리트가 뒤로 갈수록 표본을 늘린다 */
  function itersFor(streetIdx, skill) {
    var base = [320, 380, 460, 560, 700][streetIdx] || 400;
    var s = (typeof skill === 'number') ? skill : 1;
    return Math.max(80, Math.round(base * (0.35 + s * 0.65)));
  }

  /* 실력이 낮은 상대는 확률적으로 손해 보는 선택을 한다 */
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

    var eq = equity(ctx.myCards, ctx.myNeed, ctx.opps, itersFor(ctx.streetIdx, skill));

    /* 상대가 올렸다면 무작위보다 강할 확률이 높다 */
    var adj = eq * Math.pow(0.93, raises * skill);
    var noiseAmp = 0.06 + (1 - skill) * 0.22;
    var noisy = Math.max(0, Math.min(1, adj + (Math.random() - 0.5) * noiseAmp));

    var aggr = Math.min(0.95, p.aggr + pos * 0.15);
    var need = p.tight - pos * 0.05 + Math.max(0, ctx.opps.length - 1) * 0.03;
    var bluffRate = p.bluff * (1 + pos * 0.2) / Math.max(1, ctx.opps.length * 0.8);

    function raiseTo(target) {
      var v = Math.round(target);
      if (v < ctx.minRaiseTo) v = ctx.minRaiseTo;
      if (v > ctx.maxRaiseTo) v = ctx.maxRaiseTo;
      return { action: 'raise', amount: v, eq: eq };
    }
    function betSize(ratio) {
      return ctx.streetBet + toCall + (pot + toCall) * ratio;
    }

    /* 첫 세 장 단계에서는 될성부른 패만 남긴다 */
    if (ctx.streetIdx === 0) {
      var line = need + 0.04;
      if (toCall <= 0) {
        if (canRaise && noisy > line + 0.10 && Math.random() < 0.6 + aggr * 0.3) {
          return raiseTo(ctx.streetBet + toCall + ctx.baseBet * (1.5 + Math.random()));
        }
        return { action: 'check', amount: 0, eq: eq };
      }
      if (canRaise && noisy > line + 0.18 && Math.random() < aggr) return raiseTo(betSize(0.7));
      if (noisy > toCall / (pot + toCall) + 0.02) return { action: 'call', amount: toCall, eq: eq };
      return { action: 'fold', amount: 0, eq: eq };
    }

    if (toCall <= 0) {
      if (canRaise) {
        if (noisy > 0.90 && Math.random() < 0.25) return { action: 'check', amount: 0, eq: eq };
        if (noisy > 0.74) return raiseTo(betSize(0.6 + Math.random() * 0.3));
        if (noisy > 0.58 && Math.random() < aggr) return raiseTo(betSize(0.5));
        if (noisy > need && Math.random() < aggr * 0.6) return raiseTo(betSize(0.35));
        if (Math.random() < bluffRate) return raiseTo(betSize(0.45));
      }
      return { action: 'check', amount: 0, eq: eq };
    }

    var potOdds = toCall / (pot + toCall);
    var cheap = toCall <= ctx.baseBet * 1.2;

    if (canRaise && noisy > 0.86 && Math.random() < 0.75) return raiseTo(betSize(0.6 + Math.random() * 0.4));
    if (canRaise && noisy > 0.72 && Math.random() < aggr * 0.7) return raiseTo(betSize(0.45));
    if (noisy > potOdds + 0.05) return { action: 'call', amount: toCall, eq: eq };
    if (cheap && noisy > 0.3) return { action: 'call', amount: toCall, eq: eq };
    if (canRaise && ctx.streetIdx === 4 && noisy < 0.2 && Math.random() < bluffRate * 0.5) {
      return raiseTo(betSize(0.7));
    }
    return { action: 'fold', amount: 0, eq: eq };
  }

  global.SevenAI = {
    equity: equity,
    decide: decide
  };
})(window);
