/* 세븐 포커 엔진 - 일곱 장을 나눠 받으며 다섯 번 베팅한다 */
(function (global) {
  'use strict';

  /* 카드 위치별 공개 여부: 0·1 숨김, 2~5 공개, 6 숨김 */
  function isOpenIndex(i) { return i >= 2 && i <= 5; }

  var STREET_LABEL = ['세 장', '네 장', '다섯 장', '여섯 장', '일곱 장', '쇼다운'];

  var G = {
    players: [],
    deck: [],
    pot: 0,
    currentBet: 0,
    minRaise: 0,
    button: 0,
    streetIdx: 0,
    handNo: 0,
    ante: 1000,
    baseBet: 2000,
    startChips: 100000,
    speed: 1,
    raisesThisStreet: 0,
    allInShowdown: false,
    inHand: false,
    aborted: false,
    hooks: {},
    lastResult: null
  };

  var pendingHuman = null;

  function log(msg, kind) { if (G.hooks.onLog) G.hooks.onLog(msg, kind || ''); }
  function update() { if (G.hooks.onUpdate) G.hooks.onUpdate(); }
  function wait(ms) { return new Promise(function (res) { setTimeout(res, ms); }); }
  function pace(ms) { return wait(Math.round(ms * (G.speed || 1))); }
  function fmt(n) { return n.toLocaleString('ko-KR'); }

  function talk(p, kind) {
    if (!p.isHuman && G.hooks.onTalk) G.hooks.onTalk(p, kind);
  }

  function setup(names) {
    G.players = names.map(function (n, i) {
      return {
        id: i,
        name: n.name,
        isHuman: !!n.isHuman,
        persona: n.persona || null,
        chips: G.startChips,
        cards: [],
        folded: true,
        allIn: false,
        dealt: false,
        streetBet: 0,
        committed: 0,
        hasActed: false,
        raiseLocked: false,
        lastAction: '',
        showCards: false,
        evalResult: null,
        won: 0,
        stat: { hands: 0, vpip: 0, pfr: 0, postActions: 0, aggro: 0 },
        vpipCounted: false,
        pfrCounted: false
      };
    });
    G.button = 0;
    G.handNo = 0;
  }

  function human() {
    for (var i = 0; i < G.players.length; i++) if (G.players[i].isHuman) return G.players[i];
    return null;
  }
  function nextIdx(i) { return (i + 1) % G.players.length; }
  function nextDealtIdx(i) {
    for (var n = 0; n < G.players.length; n++) {
      i = nextIdx(i);
      if (G.players[i].dealt) return i;
    }
    return i;
  }
  function contenders() {
    return G.players.filter(function (p) { return p.dealt && !p.folded; });
  }

  /* 남에게 보이는 카드만 */
  function openCardsOf(p) {
    var out = [];
    for (var i = 0; i < p.cards.length; i++) if (isOpenIndex(i)) out.push(p.cards[i]);
    return out;
  }

  function commit(p, amount) {
    var amt = Math.max(0, Math.min(amount, p.chips));
    p.chips -= amt;
    p.streetBet += amt;
    p.committed += amt;
    G.pot += amt;
    if (p.chips === 0) p.allIn = true;
    return amt;
  }

  /* ---------- 한 판 준비 ---------- */

  function beginHand() {
    G.handNo++;
    G.deck = Cards.shuffle(Cards.createDeck());
    G.pot = 0;
    G.currentBet = 0;
    G.minRaise = G.baseBet;
    G.streetIdx = 0;
    G.raisesThisStreet = 0;
    G.allInShowdown = false;
    G.lastResult = null;

    G.players.forEach(function (p) {
      p.cards = [];
      p.streetBet = 0;
      p.committed = 0;
      p.hasActed = false;
      p.raiseLocked = false;
      p.allIn = false;
      p.lastAction = '';
      p.showCards = false;
      p.evalResult = null;
      p.won = 0;
      p.vpipCounted = false;
      p.pfrCounted = false;
      p.dealt = p.chips > G.ante;
      p.folded = !p.dealt;
      if (p.dealt) p.stat.hands++;
    });

    G.button = nextDealtIdx(G.button);

    /* 참가비를 모두 낸다 */
    G.players.forEach(function (p) {
      if (!p.dealt) return;
      commit(p, G.ante);
      p.streetBet = 0;   // 참가비는 베팅으로 치지 않는다
    });
    log('참가비 ' + fmt(G.ante) + '씩 — 팟 ' + fmt(G.pot), 'blind');

    /* 석 장씩 (앞의 두 장은 숨김, 세 번째만 공개) */
    for (var round = 0; round < 3; round++) {
      var i = G.button;
      for (var n = 0; n < G.players.length; n++) {
        i = nextDealtIdx(i);
        if (G.players[i].dealt) G.players[i].cards.push(G.deck.pop());
      }
    }
  }

  /* ---------- 액션 ---------- */

  function legalFor(p) {
    var toCall = Math.max(0, Math.min(G.currentBet - p.streetBet, p.chips));
    var maxRaiseTo = p.streetBet + p.chips;
    var minRaiseTo = Math.min(G.currentBet + G.minRaise, maxRaiseTo);
    return {
      toCall: toCall,
      canCheck: toCall === 0,
      canRaise: maxRaiseTo > G.currentBet && !p.raiseLocked,
      minRaiseTo: minRaiseTo,
      maxRaiseTo: maxRaiseTo
    };
  }

  function recordStat(p, action) {
    var voluntary = (action === 'call' || action === 'raise');
    if (G.streetIdx === 0) {
      if (voluntary && !p.vpipCounted) { p.vpipCounted = true; p.stat.vpip++; }
      if (action === 'raise' && !p.pfrCounted) { p.pfrCounted = true; p.stat.pfr++; }
      return;
    }
    p.stat.postActions++;
    if (action === 'raise') p.stat.aggro++;
  }

  function applyAction(p, action, amount) {
    var L = legalFor(p);
    p.hasActed = true;

    var effective = action;
    if (action === 'raise' && !L.canRaise) effective = L.canCheck ? 'check' : 'call';
    if (action === 'check' && !L.canCheck) effective = 'call';
    recordStat(p, effective);

    if (action === 'fold') {
      p.folded = true;
      p.lastAction = '다이';
      log(p.name + ' 다이', 'fold');
      if (Math.random() < 0.25) talk(p, 'fold');
      return;
    }
    if (action === 'check' && L.canCheck) {
      p.lastAction = '체크';
      log(p.name + ' 체크', 'check');
      return;
    }
    if (action === 'call' || (action === 'check' && !L.canCheck)) {
      var paid = commit(p, L.toCall);
      p.lastAction = p.allIn ? '올인 콜' : '콜';
      log(p.name + ' 콜 ' + fmt(paid) + (p.allIn ? ' (올인)' : ''), 'call');
      return;
    }
    if (action === 'raise' && L.canRaise) {
      var target = Math.round(amount);
      if (target > L.maxRaiseTo) target = L.maxRaiseTo;
      if (target < L.minRaiseTo) target = L.minRaiseTo;
      var prevBet = G.currentBet;
      commit(p, target - p.streetBet);

      if (target > prevBet) {
        var raiseSize = target - prevBet;
        var fullRaise = raiseSize >= G.minRaise;
        G.currentBet = target;
        G.raisesThisStreet++;
        if (fullRaise) {
          G.minRaise = raiseSize;
          G.players.forEach(function (o) {
            if (o !== p && o.dealt && !o.folded && !o.allIn) {
              o.hasActed = false;
              o.raiseLocked = false;
            }
          });
        } else {
          G.players.forEach(function (o) {
            if (o !== p && o.dealt && !o.folded && !o.allIn && o.hasActed) o.raiseLocked = true;
          });
        }
      }
      p.lastAction = p.allIn ? '올인' : (prevBet > 0 ? '레이즈' : '벳');
      log(p.name + ' ' + p.lastAction + ' ' + fmt(target), 'raise');
      if (p.allIn) talk(p, 'allin');
      else if (target - prevBet >= G.baseBet * 3 && Math.random() < 0.5) talk(p, 'bigraise');
      return;
    }

    if (action === 'raise' && !L.canCheck) {
      var paid2 = commit(p, L.toCall);
      p.lastAction = p.allIn ? '올인 콜' : '콜';
      log(p.name + ' 콜 ' + fmt(paid2) + (p.allIn ? ' (올인)' : ''), 'call');
      return;
    }
    if (L.canCheck) { p.lastAction = '체크'; log(p.name + ' 체크', 'check'); }
    else { p.folded = true; p.lastAction = '다이'; log(p.name + ' 다이', 'fold'); }
  }

  function returnUncalled() {
    var live = G.players.filter(function (p) { return p.dealt && !p.folded; });
    if (!live.length) return;
    var bets = G.players.filter(function (p) { return p.dealt; })
      .map(function (p) { return p.streetBet; })
      .sort(function (a, b) { return b - a; });
    var top = bets[0] || 0;
    var second = bets.length > 1 ? bets[1] : 0;
    if (top <= second) return;

    for (var i = 0; i < G.players.length; i++) {
      var p = G.players[i];
      if (p.dealt && !p.folded && p.streetBet === top) {
        var back = top - second;
        p.chips += back;
        p.streetBet -= back;
        p.committed -= back;
        G.pot -= back;
        if (p.chips > 0) p.allIn = false;
        log(p.name + ' 초과 베팅 ' + fmt(back) + ' 반환', 'sys');
        break;
      }
    }
  }

  /* ---------- 베팅 라운드 ---------- */

  function roundDone() {
    var live = contenders();
    if (live.length <= 1) return true;
    var actionable = live.filter(function (p) { return !p.allIn && p.chips > 0; });
    if (actionable.length === 0) return true;
    if (actionable.length === 1 && live.length - actionable.length > 0) {
      var solo = actionable[0];
      if (solo.hasActed && solo.streetBet >= G.currentBet) return true;
    }
    for (var i = 0; i < actionable.length; i++) {
      var p = actionable[i];
      if (!p.hasActed || p.streetBet < G.currentBet) return false;
    }
    return true;
  }

  function waitHumanAction(p) {
    return new Promise(function (resolve) {
      pendingHuman = resolve;
      if (G.hooks.onHumanTurn) G.hooks.onHumanTurn(p, legalFor(p));
    });
  }

  /* 액션 순서에서 몇 번째인지 (0에 가까울수록 먼저) */
  function positionScore(p) {
    var live = contenders().filter(function (x) { return !x.allIn; });
    var order = live.map(function (x) { return x.id; });
    var idx = order.indexOf(p.id);
    if (idx < 0 || order.length <= 1) return 1;
    return idx / (order.length - 1);
  }

  function askAI(p) {
    var L = legalFor(p);
    var opps = contenders().filter(function (o) { return o !== p; }).map(function (o) {
      var open = openCardsOf(o);
      return {
        open: open,
        hidden: o.cards.length - open.length,
        need: 7 - o.cards.length
      };
    });
    return SevenAI.decide({
      myCards: p.cards,
      myNeed: 7 - p.cards.length,
      opps: opps,
      pot: G.pot,
      toCall: L.toCall,
      chips: p.chips,
      minRaiseTo: L.minRaiseTo,
      maxRaiseTo: L.maxRaiseTo,
      canRaise: L.canRaise,
      streetIdx: G.streetIdx,
      baseBet: G.baseBet,
      persona: p.persona,
      streetBet: p.streetBet,
      position: positionScore(p),
      raises: G.raisesThisStreet
    });
  }

  function takeAction(p) {
    if (p.isHuman) {
      return waitHumanAction(p).then(function (res) {
        if (G.aborted) return;
        applyAction(p, res.action, res.amount);
        update();
      });
    }
    if (G.hooks.onActorChange) G.hooks.onActorChange(p);
    update();
    return pace(500 + Math.random() * 700).then(function () {
      if (G.aborted) return;
      var d = askAI(p);
      applyAction(p, d.action, d.amount);
      update();
      return pace(220);
    });
  }

  function bettingRound(firstIdx) {
    var idx = firstIdx;
    var guard = 0;

    function step() {
      if (G.aborted) return Promise.resolve();
      if (roundDone() || guard++ > 400) { returnUncalled(); return Promise.resolve(); }
      var p = G.players[idx];
      var needAct = p.dealt && !p.folded && !p.allIn && p.chips > 0 &&
        (!p.hasActed || p.streetBet < G.currentBet);
      if (!needAct) {
        idx = nextIdx(idx);
        return step();
      }
      return takeAction(p).then(function () {
        idx = nextIdx(idx);
        return step();
      });
    }
    return step();
  }

  function startStreet(idx) {
    G.streetIdx = idx;
    G.currentBet = 0;
    G.minRaise = G.baseBet;
    G.raisesThisStreet = 0;
    G.players.forEach(function (p) {
      p.streetBet = 0;
      p.hasActed = false;
      p.raiseLocked = false;
      if (!p.folded && p.dealt) p.lastAction = '';
    });
  }

  /* 공개된 패가 가장 세 보이는 사람이 먼저 말한다 */
  function firstToAct() {
    var live = contenders().filter(function (p) { return !p.allIn && p.chips > 0; });
    if (!live.length) live = contenders();
    if (!live.length) return G.button;

    var best = null;
    live.forEach(function (p) {
      var s = KrEval.openStrength(openCardsOf(p));
      if (!best) { best = { p: p, s: s }; return; }
      if (s.cat > best.s.cat) { best = { p: p, s: s }; return; }
      if (s.cat === best.s.cat) {
        var n = Math.max(s.tb.length, best.s.tb.length);
        for (var i = 0; i < n; i++) {
          var x = s.tb[i] || 0, y = best.s.tb[i] || 0;
          if (x !== y) { if (x > y) best = { p: p, s: s }; return; }
        }
      }
    });
    return best.p.id;
  }

  function dealOne() {
    var i = G.button;
    for (var n = 0; n < G.players.length; n++) {
      i = nextDealtIdx(i);
      var p = G.players[i];
      if (p.dealt && !p.folded) p.cards.push(G.deck.pop());
    }
  }

  /* ---------- 정산 ---------- */

  function buildPots() {
    var contribs = G.players
      .filter(function (p) { return p.committed > 0; })
      .map(function (p) { return p.committed; });
    var levels = contribs.filter(function (v, i, a) { return a.indexOf(v) === i; })
      .sort(function (a, b) { return a - b; });

    function sameEligible(a, b) {
      if (a.length !== b.length) return false;
      for (var i = 0; i < a.length; i++) if (a.indexOf(b[i]) === -1) return false;
      return true;
    }

    var pots = [];
    var prev = 0;
    levels.forEach(function (lv) {
      var amount = 0;
      G.players.forEach(function (p) {
        amount += Math.max(0, Math.min(p.committed, lv) - prev);
      });
      prev = lv;
      if (amount <= 0) return;

      var eligible = G.players.filter(function (p) {
        return p.dealt && !p.folded && p.committed >= lv;
      });
      var last = pots[pots.length - 1];
      if (!eligible.length || (last && sameEligible(last.eligible, eligible))) {
        if (last) { last.amount += amount; return; }
        if (!eligible.length) return;
      }
      pots.push({ amount: amount, eligible: eligible });
    });
    return pots;
  }

  function awardPots() {
    var live = contenders();
    var results = [];

    if (live.length === 1) {
      var w = live[0];
      w.chips += G.pot;
      w.won = G.pot;
      results.push({ winners: [w], amount: G.pot, potIndex: 0, noShowdown: true });
      log(w.name + ' 승리 ' + fmt(G.pot) + ' 획득 (상대 전원 다이)', 'win');
      talk(w, 'win');
      G.pot = 0;
      return results;
    }

    live.forEach(function (p) {
      p.evalResult = KrEval.evaluate(p.cards);
      p.showCards = true;
    });

    var pots = buildPots();
    pots.forEach(function (pot, pi) {
      var best = null;
      pot.eligible.forEach(function (p) {
        if (!best || KrEval.compare(p.evalResult, best) > 0) best = p.evalResult;
      });
      var winners = pot.eligible.filter(function (p) {
        return KrEval.compare(p.evalResult, best) === 0;
      });
      var share = Math.floor(pot.amount / winners.length);
      var remain = pot.amount - share * winners.length;
      winners.forEach(function (p, i) {
        var got = share + (i === 0 ? remain : 0);
        p.chips += got;
        p.won += got;
        if (pi === 0) talk(p, 'win');
      });
      results.push({ winners: winners, amount: pot.amount, potIndex: pi, best: best });
      log(
        (pots.length > 1 ? (pi === 0 ? '메인 팟 ' : '사이드 팟' + pi + ' ') : '') +
        winners.map(function (p) { return p.name; }).join(', ') +
        ' 승리 ' + fmt(pot.amount) + ' — ' + KrEval.label(best),
        'win'
      );
    });
    G.pot = 0;
    return results;
  }

  /* ---------- 한 판 진행 ---------- */

  function playHand() {
    G.inHand = true;
    G.aborted = false;
    beginHand();
    log('─── ' + G.handNo + '번째 판 시작 ───', 'sys');
    startStreet(0);
    update();

    var idx = 0;

    function nextStreet() {
      if (G.aborted) return Promise.resolve();
      if (contenders().length <= 1) return Promise.resolve();
      idx++;
      if (idx > 4) return Promise.resolve();

      if (G.hooks.onCollect) G.hooks.onCollect();
      startStreet(idx);
      dealOne();
      log(STREET_LABEL[idx] + ' 째 카드', 'sys');
      update();

      var actionable = contenders().filter(function (p) { return !p.allIn && p.chips > 0; });
      var runout = actionable.length <= 1 && contenders().length > 1;
      if (runout && !G.allInShowdown) {
        G.allInShowdown = true;
        contenders().forEach(function (p) { p.showCards = true; });
        log('올인 대결 — 카드 공개', 'sys');
        if (G.hooks.onAllIn) G.hooks.onAllIn();
        update();
      }
      if (runout) return pace(1200).then(nextStreet);

      return pace(400)
        .then(function () { return bettingRound(firstToAct()); })
        .then(nextStreet);
    }

    return pace(600)
      .then(function () { return bettingRound(firstToAct()); })
      .then(nextStreet)
      .then(function () {
        if (G.aborted) { G.inHand = false; return; }
        G.streetIdx = 5;
        var results = awardPots();
        G.lastResult = results;
        update();
        if (G.hooks.onShowdown) G.hooks.onShowdown(results);
        G.inHand = false;
        if (G.hooks.onHandEnd) G.hooks.onHandEnd(results);
      });
  }

  global.SevenGame = {
    data: G,
    STREET_LABEL: STREET_LABEL,
    isOpenIndex: isOpenIndex,
    openCardsOf: openCardsOf,
    fmt: fmt,
    setup: function (names, opts) {
      if (opts) {
        if (opts.ante) G.ante = opts.ante;
        if (opts.baseBet) G.baseBet = opts.baseBet;
        if (opts.startChips) G.startChips = opts.startChips;
      }
      setup(names);
    },
    setHooks: function (h) { G.hooks = h || {}; },
    setSpeed: function (v) { G.speed = v; },
    play: playHand,
    legalFor: legalFor,
    human: human,
    humanAct: function (action, amount) {
      if (!pendingHuman) return;
      var r = pendingHuman;
      pendingHuman = null;
      r({ action: action, amount: amount });
    },
    isWaitingHuman: function () { return !!pendingHuman; },
    abort: function () {
      G.aborted = true;
      if (pendingHuman) { var r = pendingHuman; pendingHuman = null; r({ action: 'fold', amount: 0 }); }
      G.inHand = false;
    },
    contenders: contenders
  };
})(window);
