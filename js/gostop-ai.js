/* 맞고 상대 두뇌 */
(function (global) {
  'use strict';

  /* 이 카드를 내면 얻을 것으로 보이는 이득 */
  function gainValue(card, G, p) {
    var matched = G.floor.filter(function (c) { return c.m === card.m; });
    var value = 0;

    if (matched.length === 0) {
      /* 못 먹는다 - 넘겨줄 위험만 남는다 */
      value = -GoGame.cardValue(card) * 0.12;
    } else if (matched.length >= 3) {
      /* 뻑이 쌓인 달 - 한 번에 넉 장 */
      value = matched.reduce(function (a, c) { return a + GoGame.cardValue(c); }, 0) + 40;
    } else {
      var best = matched.slice().sort(function (a, b) {
        return GoGame.cardValue(b) - GoGame.cardValue(a);
      })[0];
      value = GoGame.cardValue(best) + GoGame.cardValue(card) * 0.35;
    }

    /* 내가 모으는 쪽을 더 챙긴다 */
    var mine = GoScore.score(p.captured);
    if (card.t === '광') value += 30;
    if (card.sub === '고도리' && mine.yeol >= 1) value += 18;
    if (card.sub && card.t === '띠') value += 12;
    if (card.sub === '쌍피') value += 10;

    /* 상대가 거의 다 모은 것은 넘기지 않는다 */
    var opp = GoScore.score(GoGame.other(p).captured);
    if (card.t === '광' && opp.gwang >= 2) value += 25;
    if (card.t === '띠' && opp.tti >= 4) value += 12;
    if (card.t === '열' && opp.yeol >= 4) value += 12;

    return value;
  }

  function chooseCard(p, G) {
    if (!p.hand.length) return null;
    var skill = (p.persona && typeof p.persona.skill === 'number') ? p.persona.skill : 1;

    var scored = p.hand.map(function (c) {
      var v = gainValue(c, G, p);
      /* 실력이 낮을수록 판단이 흔들린다 */
      v += (Math.random() - 0.5) * (1 - skill) * 90;
      return { card: c, v: v };
    });
    scored.sort(function (a, b) { return b.v - a.v; });
    return scored[0].card;
  }

  /* 고를 부를지 결정 */
  function chooseGo(p, G, sc) {
    var skill = (p.persona && typeof p.persona.skill === 'number') ? p.persona.skill : 1;
    var aggr = (p.persona && p.persona.aggr) || 0.5;
    var opp = GoScore.score(GoGame.other(p).captured);

    /* 남은 패가 적으면 위험하다 */
    var left = p.hand.length;
    if (left <= 1) return false;

    /* 상대가 이미 세 점에 가까우면 멈춘다 */
    var oppClose = opp.total >= 2;

    var wantGo = 0.15 + aggr * 0.5 + (left / 10) * 0.35;
    if (oppClose) wantGo -= 0.4;
    if (sc.total >= 7) wantGo -= 0.25;      // 이미 크게 났으면 굳이
    if (p.goCount >= 3) wantGo -= 0.3;

    /* 실력이 낮으면 무모하게 고를 부른다 */
    wantGo += (1 - skill) * 0.25;

    return Math.random() < Math.max(0, Math.min(0.95, wantGo));
  }

  global.GoAI = {
    chooseCard: chooseCard,
    chooseGo: chooseGo,
    gainValue: gainValue
  };
})(window);
