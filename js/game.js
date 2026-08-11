/* 텍사스 홀덤 게임 엔진 - 좌석 관리, 베팅 라운드, 사이드 팟, 쇼다운 */
(function (global) {
  'use strict';

  var STREETS = ['preflop', 'flop', 'turn', 'river'];
  var STREET_LABEL = {
    preflop: '프리플랍', flop: '플랍', turn: '턴', river: '리버', showdown: '쇼다운'
  };

  var G = {
    players: [],
    deck: [],
    board: [],
    pot: 0,
    currentBet: 0,
    minRaise: 0,
    button: 0,
    street: null,
    handNo: 0,
    smallBlind: 500,
    bigBlind: 1000,
    startChips: 100000,
    inHand: false,
    aborted: false,
    hooks: {},
    lastResult: null
  };

  var pendingHuman = null;

  function log(msg, kind) {
    if (G.hooks.onLog) G.hooks.onLog(msg, kind || '');
  }
  function update() {
    if (G.hooks.onUpdate) G.hooks.onUpdate();
  }
  function wait(ms) {
    return new Promise(function (res) { setTimeout(res, ms); });
  }

  function setup(names) {
    G.players = names.map(function (n, i) {
      return {
        id: i,
        name: n.name,
        isHuman: !!n.isHuman,
        persona: n.persona || null,
        chips: G.startChips,
        hole: [],
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
        won: 0
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

  /* ---------- 칩 이동 ---------- */

  function commit(p, amount) {
    var amt = Math.max(0, Math.min(amount, p.chips));
    p.chips -= amt;
    p.streetBet += amt;
    p.committed += amt;
    G.pot += amt;
    if (p.chips === 0) p.allIn = true;
    return amt;
  }

  /* ---------- 한 판 시작 ---------- */

  function beginHand() {
    G.handNo++;
    G.deck = Cards.shuffle(Cards.createDeck());
    G.board = [];
    G.pot = 0;
    G.currentBet = 0;
    G.minRaise = G.bigBlind;
    G.street = 'preflop';
    G.lastResult = null;

    G.players.forEach(function (p) {
      p.hole = [];
      p.streetBet = 0;
      p.committed = 0;
      p.hasActed = false;
      p.raiseLocked = false;
      p.allIn = false;
      p.lastAction = '';
      p.showCards = false;
      p.evalResult = null;
      p.won = 0;
      p.dealt = p.chips > 0;
      p.folded = !p.dealt;
    });

    /* 딜러 버튼을 칩 있는 다음 좌석으로 */
    G.button = nextDealtIdx(G.button);

    /* 카드 2장씩 */
    for (var round = 0; round < 2; round++) {
      var i = G.button;
      for (var n = 0; n < G.players.length; n++) {
        i = nextDealtIdx(i);
        if (G.players[i].dealt) G.players[i].hole.push(G.deck.pop());
      }
    }
  }

  function postBlinds() {
    var dealtCount = G.players.filter(function (p) { return p.dealt; }).length;
    var sbIdx, bbIdx;
    if (dealtCount === 2) {
      sbIdx = G.button;                 // 헤즈업은 버튼이 스몰블라인드
      bbIdx = nextDealtIdx(G.button);
    } else {
      sbIdx = nextDealtIdx(G.button);
      bbIdx = nextDealtIdx(sbIdx);
    }
    var sb = G.players[sbIdx], bb = G.players[bbIdx];
    commit(sb, G.smallBlind);
    sb.lastAction = '스몰블라인드';
    commit(bb, G.bigBlind);
    bb.lastAction = '빅블라인드';
    G.currentBet = Math.max(sb.streetBet, bb.streetBet);
    G.minRaise = G.bigBlind;
    log(sb.name + ' 스몰블라인드 ' + fmt(G.smallBlind) + ' / ' + bb.name + ' 빅블라인드 ' + fmt(G.bigBlind), 'blind');
    return { sbIdx: sbIdx, bbIdx: bbIdx };
  }

  function fmt(n) { return n.toLocaleString('ko-KR'); }

  /* ---------- 액션 규칙 ---------- */

  function legalFor(p) {
    var toCall = Math.max(0, Math.min(G.currentBet - p.streetBet, p.chips));
    var maxRaiseTo = p.streetBet + p.chips;
    var minRaiseTo = Math.min(G.currentBet + G.minRaise, maxRaiseTo);
    return {
      toCall: toCall,
      canCheck: toCall === 0,
      /* 언더 올인으로 액션이 재개되지 않은 사람은 다시 올릴 수 없다 */
      canRaise: maxRaiseTo > G.currentBet && !p.raiseLocked,
      minRaiseTo: minRaiseTo,
      maxRaiseTo: maxRaiseTo
    };
  }

  function applyAction(p, action, amount) {
    var L = legalFor(p);
    p.hasActed = true;

    if (action === 'fold') {
      p.folded = true;
      p.lastAction = '다이';
      log(p.name + ' 다이', 'fold');
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
        if (fullRaise) {
          G.minRaise = raiseSize;
          /* 정상 레이즈 - 나머지는 다시 액션 기회를 얻는다 */
          G.players.forEach(function (o) {
            if (o !== p && o.dealt && !o.folded && !o.allIn) {
              o.hasActed = false;
              o.raiseLocked = false;
            }
          });
        } else {
          /* 최소 레이즈에 못 미치는 올인 - 이미 액션한 사람은 콜·다이만 가능 */
          G.players.forEach(function (o) {
            if (o !== p && o.dealt && !o.folded && !o.allIn && o.hasActed) o.raiseLocked = true;
          });
        }
      }
      p.lastAction = p.allIn ? '올인' : (prevBet > 0 ? '레이즈' : '벳');
      log(p.name + ' ' + p.lastAction + ' ' + fmt(target), 'raise');
      return;
    }

    /* 레이즈가 막힌 상황이면 콜로 처리 */
    if (action === 'raise' && !L.canCheck) {
      var paid2 = commit(p, L.toCall);
      p.lastAction = p.allIn ? '올인 콜' : '콜';
      log(p.name + ' 콜 ' + fmt(paid2) + (p.allIn ? ' (올인)' : ''), 'call');
      return;
    }
    if (L.canCheck) { p.lastAction = '체크'; log(p.name + ' 체크', 'check'); }
    else { p.folded = true; p.lastAction = '다이'; log(p.name + ' 다이', 'fold'); }
  }

  /* 아무도 받지 않은 초과 베팅은 되돌려 준다 */
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
      /* 나머지가 전부 올인이면 콜만 맞추면 끝 */
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

  function askAI(p) {
    var L = legalFor(p);
    return AI.decide({
      hole: p.hole,
      board: G.board,
      oppCount: Math.max(1, contenders().length - 1),
      pot: G.pot,
      toCall: L.toCall,
      chips: p.chips,
      minRaiseTo: L.minRaiseTo,
      maxRaiseTo: L.maxRaiseTo,
      canRaise: L.canRaise,
      street: G.street,
      bigBlind: G.bigBlind,
      persona: p.persona,
      streetBet: p.streetBet
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
    return wait(500 + Math.random() * 700).then(function () {
      if (G.aborted) return;
      var d = askAI(p);
      applyAction(p, d.action, d.amount);
      update();
      return wait(220);
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

  function startStreet(street) {
    G.street = street;
    G.currentBet = 0;
    G.minRaise = G.bigBlind;
    G.players.forEach(function (p) {
      p.streetBet = 0;
      p.hasActed = false;
      p.raiseLocked = false;
      if (!p.folded && p.dealt) p.lastAction = '';
    });
  }

  function dealBoard(n) {
    G.deck.pop(); // 번 카드
    for (var i = 0; i < n; i++) G.board.push(G.deck.pop());
  }

  /* ---------- 팟 정산 ---------- */

  function buildPots() {
    var contribs = G.players
      .filter(function (p) { return p.committed > 0; })
      .map(function (p) { return p.committed; });
    var levels = contribs.filter(function (v, i, a) { return a.indexOf(v) === i; })
      .sort(function (a, b) { return a - b; });

    var pots = [];
    var prev = 0;
    levels.forEach(function (lv) {
      var amount = 0;
      G.players.forEach(function (p) {
        amount += Math.max(0, Math.min(p.committed, lv) - prev);
      });
      var eligible = G.players.filter(function (p) {
        return p.dealt && !p.folded && p.committed >= lv;
      });
      if (amount > 0 && eligible.length > 0) pots.push({ amount: amount, eligible: eligible });
      else if (amount > 0 && pots.length) pots[pots.length - 1].amount += amount;
      prev = lv;
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
      G.pot = 0;
      return results;
    }

    /* 쇼다운: 참가자 패 평가 */
    live.forEach(function (p) {
      p.evalResult = Evaluator.evaluate(p.hole.concat(G.board));
      p.showCards = true;
    });

    var pots = buildPots();
    pots.forEach(function (pot, pi) {
      var best = null;
      pot.eligible.forEach(function (p) {
        if (!best || Evaluator.compare(p.evalResult, best) > 0) best = p.evalResult;
      });
      var winners = pot.eligible.filter(function (p) {
        return Evaluator.compare(p.evalResult, best) === 0;
      });
      var share = Math.floor(pot.amount / winners.length);
      var remain = pot.amount - share * winners.length;
      winners.forEach(function (p, i) {
        var got = share + (i === 0 ? remain : 0);
        p.chips += got;
        p.won += got;
      });
      results.push({ winners: winners, amount: pot.amount, potIndex: pi, best: best });
      log(
        (pots.length > 1 ? (pi === 0 ? '메인 팟 ' : '사이드 팟' + pi + ' ') : '') +
        winners.map(function (p) { return p.name; }).join(', ') +
        ' 승리 ' + fmt(pot.amount) + ' — ' + Evaluator.label(best),
        'win'
      );
    });
    G.pot = 0;
    return results;
  }

  /* ---------- 한 판 전체 진행 ---------- */

  function firstToActPreflop(blinds) {
    return nextDealtIdx(blinds.bbIdx);
  }
  function firstToActPostflop() {
    var i = G.button;
    for (var n = 0; n < G.players.length; n++) {
      i = nextDealtIdx(i);
      var p = G.players[i];
      if (!p.folded && !p.allIn) return i;
    }
    return nextDealtIdx(G.button);
  }

  function playHand() {
    G.inHand = true;
    G.aborted = false;
    beginHand();
    log('─── ' + G.handNo + '번째 판 시작 ───', 'sys');
    var blinds = postBlinds();
    update();

    var streetIdx = 0;

    function nextStreet() {
      if (G.aborted) return Promise.resolve();
      if (contenders().length <= 1) return Promise.resolve();
      streetIdx++;
      if (streetIdx >= STREETS.length) return Promise.resolve();

      var st = STREETS[streetIdx];
      startStreet(st);
      dealBoard(st === 'flop' ? 3 : 1);
      log(STREET_LABEL[st] + ' — ' + G.board.map(Cards.cardLabel).join(' '), 'sys');
      update();

      /* 액션 가능한 사람이 1명 이하면 카드만 계속 깐다 */
      var actionable = contenders().filter(function (p) { return !p.allIn && p.chips > 0; });
      if (actionable.length <= 1 && contenders().length > 1) {
        var needCall = actionable.length === 1 && actionable[0].streetBet < G.currentBet;
        if (!needCall) return wait(700).then(nextStreet);
      }

      return wait(400)
        .then(function () { return bettingRound(firstToActPostflop()); })
        .then(nextStreet);
    }

    return wait(600)
      .then(function () { return bettingRound(firstToActPreflop(blinds)); })
      .then(nextStreet)
      .then(function () {
        if (G.aborted) { G.inHand = false; return; }
        G.street = 'showdown';
        var results = awardPots();
        G.lastResult = results;
        update();
        if (G.hooks.onShowdown) G.hooks.onShowdown(results);
        G.inHand = false;
        if (G.hooks.onHandEnd) G.hooks.onHandEnd(results);
      });
  }

  /* ---------- 외부 API ---------- */

  global.Game = {
    data: G,
    STREET_LABEL: STREET_LABEL,
    fmt: fmt,
    setup: function (names, opts) {
      if (opts) {
        if (opts.smallBlind) G.smallBlind = opts.smallBlind;
        if (opts.bigBlind) G.bigBlind = opts.bigBlind;
        if (opts.startChips) G.startChips = opts.startChips;
      }
      setup(names);
    },
    setHooks: function (h) { G.hooks = h || {}; },
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
