/* 맞고 엔진 - 일대일 고스톱 */
(function (global) {
  'use strict';

  var G = {
    players: [],
    floor: [],
    deck: [],
    turn: 0,
    handNo: 0,
    unit: 1000,        // 한 점당 금액
    startChips: 100000,
    speed: 1,
    inHand: false,
    aborted: false,
    hooks: {},
    lastResult: null,
    bbeokMonths: {}    // 뻑이 난 달
  };

  var pendingPlay = null;   // 사람이 낼 카드를 기다린다
  var pendingGo = null;     // 고 또는 스톱을 기다린다

  function log(msg, kind) { if (G.hooks.onLog) G.hooks.onLog(msg, kind || ''); }
  function update() { if (G.hooks.onUpdate) G.hooks.onUpdate(); }
  function wait(ms) { return new Promise(function (res) { setTimeout(res, ms); }); }
  function pace(ms) { return wait(Math.round(ms * (G.speed || 1))); }
  function fmt(n) { return n.toLocaleString('ko-KR'); }
  function event(name, p) { if (G.hooks.onEvent) G.hooks.onEvent(name, p); }

  function setup(names) {
    G.players = names.map(function (n, i) {
      return {
        id: i,
        name: n.name,
        isHuman: !!n.isHuman,
        persona: n.persona || null,
        chips: G.startChips,
        hand: [],
        captured: [],
        goCount: 0,
        lastScore: 0,
        stat: { hands: 0, wins: 0, gos: 0 }
      };
    });
    G.handNo = 0;
  }

  function human() {
    for (var i = 0; i < G.players.length; i++) if (G.players[i].isHuman) return G.players[i];
    return null;
  }
  function other(p) { return G.players[(p.id + 1) % 2]; }

  /* 값이 높은 카드부터 (여러 장 중 하나를 고를 때) */
  function cardValue(c) {
    if (c.t === '광') return 100 + c.m;
    if (c.sub === '쌍피') return 60;
    if (c.t === '열') return c.sub === '고도리' ? 55 : 40;
    if (c.t === '띠') return c.sub ? 35 : 25;
    return 10;
  }
  function chooseBest(cards) {
    return cards.slice().sort(function (a, b) { return cardValue(b) - cardValue(a); })[0];
  }

  function removeFromFloor(cards) {
    cards.forEach(function (c) {
      var idx = G.floor.indexOf(c);
      if (idx >= 0) G.floor.splice(idx, 1);
    });
  }

  /* 상대에게서 피 한 장을 가져온다 */
  function stealPi(p) {
    var opp = other(p);
    var pis = opp.captured.filter(function (c) { return c.t === '피'; });
    if (!pis.length) return false;
    /* 값이 낮은 피부터 뺏는다 (쌍피는 마지막) */
    pis.sort(function (a, b) { return GoCards.piValue(a) - GoCards.piValue(b); });
    var taken = pis[0];
    opp.captured.splice(opp.captured.indexOf(taken), 1);
    p.captured.push(taken);
    log(p.name + '이(가) ' + opp.name + '의 피 한 장을 가져왔습니다', 'steal');
    return true;
  }

  /* ---------- 판 준비 ---------- */

  function beginHand() {
    G.handNo++;
    G.deck = GoCards.shuffle(GoCards.createDeck());
    G.floor = [];
    G.bbeokMonths = {};
    G.players.forEach(function (p) {
      p.hand = [];
      p.captured = [];
      p.goCount = 0;
      p.lastScore = 0;
      p.stat.hands++;
    });

    for (var i = 0; i < 10; i++) {
      G.players[0].hand.push(G.deck.pop());
      G.players[1].hand.push(G.deck.pop());
    }
    for (var j = 0; j < 8; j++) G.floor.push(G.deck.pop());

    /* 손패는 달 순서로 정리해 두면 보기 쉽다 */
    G.players.forEach(function (p) {
      p.hand.sort(function (a, b) { return a.m - b.m || cardValue(b) - cardValue(a); });
    });

    G.turn = (G.handNo - 1) % 2;
  }

  /* ---------- 한 수 두기 ---------- */

  function playCard(p, card) {
    var idx = p.hand.indexOf(card);
    if (idx >= 0) p.hand.splice(idx, 1);

    var M = card.m;
    var matched = G.floor.filter(function (c) { return c.m === M; });
    var gained = [];
    var events = [];
    var gotFromHand = false;

    var flip = G.deck.length ? G.deck.pop() : null;
    var N = flip ? flip.m : -1;

    if (flip && N === M) {
      /* 낸 카드와 뒤집은 카드가 같은 달 */
      if (matched.length === 0) {
        gained.push(card, flip);
        events.push('쪽');
      } else if (matched.length === 1) {
        /* 뻑 - 아무도 못 먹고 바닥에 쌓인다 */
        G.floor.push(card, flip);
        G.bbeokMonths[M] = p.id;
        events.push('뻑');
      } else {
        /* 같은 달 넉 장을 한 번에 - 따닥 */
        removeFromFloor(matched);
        gained.push(card, flip);
        matched.forEach(function (c) { gained.push(c); });
        events.push('따닥');
      }
    } else {
      /* 낸 카드 처리 */
      if (matched.length === 0) {
        G.floor.push(card);
      } else if (matched.length === 1) {
        removeFromFloor(matched);
        gained.push(card, matched[0]);
        gotFromHand = true;
      } else if (matched.length === 2) {
        var pick = chooseBest(matched);
        removeFromFloor([pick]);
        gained.push(card, pick);
        gotFromHand = true;
      } else {
        /* 뻑이 났던 달을 먹는다 */
        removeFromFloor(matched);
        gained.push(card);
        matched.forEach(function (c) { gained.push(c); });
        gotFromHand = true;
        if (G.bbeokMonths[M] !== undefined) {
          events.push('뻑 먹기');
          delete G.bbeokMonths[M];
        }
      }

      /* 뒤집은 카드 처리 */
      if (flip) {
        var fm = G.floor.filter(function (c) { return c.m === N; });
        if (fm.length === 0) {
          G.floor.push(flip);
        } else if (fm.length >= 3) {
          removeFromFloor(fm);
          gained.push(flip);
          fm.forEach(function (c) { gained.push(c); });
          if (G.bbeokMonths[N] !== undefined) { events.push('뻑 먹기'); delete G.bbeokMonths[N]; }
        } else {
          var fpick = fm.length === 1 ? fm[0] : chooseBest(fm);
          removeFromFloor([fpick]);
          gained.push(flip, fpick);
        }
      }
    }

    if (gained.length) p.captured = p.captured.concat(gained);

    /* 바닥을 싹 쓸었다 */
    if (G.floor.length === 0 && gained.length) events.push('싹쓸이');

    /* 쪽 · 따닥 · 싹쓸이면 상대 피 한 장 */
    var stealEvents = ['쪽', '따닥', '싹쓸이', '뻑 먹기'];
    var stole = false;
    events.forEach(function (e) {
      if (stealEvents.indexOf(e) >= 0 && !stole) { stole = stealPi(p); }
    });

    log(p.name + ' 냄: ' + GoCards.label(card) +
        (flip ? ' · 뒤집기: ' + GoCards.label(flip) : '') +
        (gained.length ? ' → ' + gained.length + '장 획득' : ''), 'play');

    if (events.length) {
      log(p.name + ' — ' + events.join(' · '), 'event');
      events.forEach(function (e) { event(e, p); });
    }

    return { card: card, flip: flip, gained: gained, events: events };
  }

  /* ---------- 사람 · 상대 입력 ---------- */

  function waitHumanPlay(p) {
    return new Promise(function (resolve) {
      pendingPlay = resolve;
      if (G.hooks.onHumanTurn) G.hooks.onHumanTurn(p);
    });
  }
  function waitHumanGo(p, sc) {
    return new Promise(function (resolve) {
      pendingGo = resolve;
      if (G.hooks.onGoChoice) G.hooks.onGoChoice(p, sc);
    });
  }

  function scoreOf(p) { return GoScore.score(p.captured); }

  /* ---------- 진행 ---------- */

  function playHand() {
    G.inHand = true;
    G.aborted = false;
    beginHand();
    log('─── ' + G.handNo + '번째 판 시작 ───', 'sys');
    update();

    var finished = null;   // {winner, goBak}

    function turnLoop() {
      if (G.aborted) return Promise.resolve();
      if (finished) return Promise.resolve();

      var p = G.players[G.turn];
      if (!p.hand.length) {
        /* 양쪽 손패가 모두 떨어지면 무승부 */
        if (!G.players[0].hand.length && !G.players[1].hand.length) return Promise.resolve();
        G.turn = (G.turn + 1) % 2;
        return turnLoop();
      }

      var choose;
      if (p.isHuman) {
        choose = waitHumanPlay(p);
      } else {
        if (G.hooks.onActorChange) G.hooks.onActorChange(p);
        update();
        choose = pace(600 + Math.random() * 500).then(function () {
          return GoAI.chooseCard(p, G);
        });
      }

      return choose.then(function (card) {
        if (G.aborted || !card) return;
        var res = playCard(p, card);
        /* 뒤집은 카드를 화면에 보여 줄 수 있도록 알린다 */
        if (G.hooks.onPlay) G.hooks.onPlay(p, res);
        update();
        return pace(900).then(function () {
          var sc = scoreOf(p);
          p.lastScore = sc.total;
          /* 세 점을 넘겼고 지난번 고보다 점수가 올랐으면 물어본다 */
          if (sc.total < 3 || sc.total <= (p.lastGoScore || 0)) return;

          /* 낼 카드가 없으면 더 갈 수 없으니 그대로 끝낸다 */
          if (p.hand.length === 0) {
            finished = { winner: p, goBak: false };
            log(p.name + ' — 손패를 다 써 승부 (' + sc.total + '점)', 'stop');
            event('스톱', p);
            return;
          }

          var ask = p.isHuman ? waitHumanGo(p, sc)
                              : pace(500).then(function () { return GoAI.chooseGo(p, G, sc); });
          return ask.then(function (go) {
            if (G.aborted) return;
            if (go) {
              p.goCount++;
              p.lastGoScore = sc.total;
              p.stat.gos++;
              log(p.name + ' — ' + p.goCount + '고! (' + sc.total + '점)', 'go');
              event('고', p);
            } else {
              finished = { winner: p, goBak: false };
              log(p.name + ' — 스톱! (' + sc.total + '점)', 'stop');
              event('스톱', p);
            }
          });
        });
      }).then(function () {
        if (G.aborted || finished) return;
        G.turn = (G.turn + 1) % 2;
        return pace(250).then(turnLoop);
      });
    }

    return pace(500).then(turnLoop).then(function () {
      if (G.aborted) { G.inHand = false; return; }

      var result;
      if (finished) {
        var w = finished.winner;
        var l = other(w);
        var fs = GoScore.finalScore(w.captured, l.captured, w.goCount, {});
        var amount = fs.total * G.unit;
        amount = Math.min(amount, l.chips);
        w.chips += amount;
        l.chips -= amount;
        w.stat.wins++;
        result = { winner: w, loser: l, fs: fs, amount: amount, draw: false };
        log(w.name + ' 승리 — ' + fs.base + '점 × ' + fs.mult + ' = ' + fs.total + '점, ' +
            fmt(amount) + (fs.flags.length ? ' (' + fs.flags.join(' · ') + ')' : ''), 'win');
      } else {
        result = { draw: true };
        log('나가리 — 무승부', 'sys');
      }

      G.lastResult = result;
      G.inHand = false;
      update();
      if (G.hooks.onHandEnd) G.hooks.onHandEnd(result);
    });
  }

  global.GoGame = {
    data: G,
    fmt: fmt,
    cardValue: cardValue,
    scoreOf: scoreOf,
    setup: function (names, opts) {
      if (opts) {
        if (opts.unit) G.unit = opts.unit;
        if (opts.startChips) G.startChips = opts.startChips;
      }
      setup(names);
    },
    setHooks: function (h) { G.hooks = h || {}; },
    setSpeed: function (v) { G.speed = v; },
    play: playHand,
    human: human,
    other: other,
    humanPlay: function (card) {
      if (!pendingPlay) return;
      var r = pendingPlay; pendingPlay = null; r(card);
    },
    humanGo: function (isGo) {
      if (!pendingGo) return;
      var r = pendingGo; pendingGo = null; r(isGo);
    },
    isWaitingPlay: function () { return !!pendingPlay; },
    isWaitingGo: function () { return !!pendingGo; },
    abort: function () {
      G.aborted = true;
      if (pendingPlay) { var a = pendingPlay; pendingPlay = null; a(null); }
      if (pendingGo) { var b = pendingGo; pendingGo = null; b(false); }
      G.inHand = false;
    }
  };
})(window);
