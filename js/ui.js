/* 화면 그리기 · 입력 처리 */
(function () {
  'use strict';

  var STORE_KEY = 'singleHoldem.v1';
  var TURN_SECONDS = 20;
  var START_CHIPS = 100000;
  var SMALL_BLIND = 500;
  var BIG_BLIND = 1000;

  var AI_NAMES = ['강대호', '마돌이', '한칠구'];

  var $ = function (id) { return document.getElementById(id); };
  var fmt = function (n) { return (n || 0).toLocaleString('ko-KR'); };

  var state = {
    soundOn: true,
    turnTimer: null,
    turnLeft: 0,
    raiseTo: 0,
    legal: null,
    myTurn: false,
    busy: false,
    auto: false,
    fast: false,
    hint: true,
    autoTimer: null,
    autoPaused: false,
    chipsAtStart: 0,
    boardHand: -1,
    boardCount: 0,
    potShown: 0,
    potAnim: null,
    highlight: {}
  };

  function cardKey(c) { return c.r + c.s; }

  /* 누적 전적 */
  var stats = {
    hands: 0,      // 참가한 판
    wins: 0,       // 이긴 판
    showdowns: 0,  // 쇼다운까지 간 판
    bestPot: 0,    // 한 판 최대 획득
    net: 0,        // 누적 손익
    bestHand: null // 최고 족보 {cat, text}
  };

  /* ---------- 소리 ---------- */
  var audioCtx = null;
  function beep(freq, dur, vol) {
    if (!state.soundOn) return;
    try {
      if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      var o = audioCtx.createOscillator(), g = audioCtx.createGain();
      o.type = 'triangle';
      o.frequency.value = freq;
      g.gain.value = vol || 0.05;
      o.connect(g); g.connect(audioCtx.destination);
      o.start();
      g.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + (dur || 0.08));
      o.stop(audioCtx.currentTime + (dur || 0.08));
    } catch (e) { /* 소리 실패는 무시 */ }
  }

  /* ---------- 저장 ---------- */
  function save() {
    try {
      var me = Game.human();
      localStorage.setItem(STORE_KEY, JSON.stringify({
        chips: me ? me.chips : START_CHIPS,
        handNo: Game.data.handNo,
        stats: stats,
        auto: state.auto,
        fast: state.fast,
        hint: state.hint
      }));
    } catch (e) { /* 저장 실패 무시 */ }
  }
  function load() {
    try {
      var raw = localStorage.getItem(STORE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }

  /* ---------- 로그 ---------- */
  function addLog(msg, kind) {
    var ul = $('logList');
    var li = document.createElement('li');
    li.className = 'log-' + (kind || '');
    li.textContent = msg;
    ul.appendChild(li);
    while (ul.children.length > 120) ul.removeChild(ul.firstChild);
    ul.scrollTop = ul.scrollHeight;
  }

  /* 올인 공개 상황의 좌석별 승률 (보드가 바뀔 때만 계산) */
  function runoutEquities() {
    var G = Game.data;
    if (!G.allInShowdown || G.street === 'showdown') return null;
    var live = Game.contenders();
    if (live.length < 2) return null;

    var key = G.handNo + '|' + G.board.length + '|' + live.length;
    if (state.runoutKey === key) return state.runoutMap;

    var eqs = AI.knownEquity(live.map(function (p) { return p.hole; }), G.board);
    var map = {};
    live.forEach(function (p, i) { map[p.id] = eqs[i]; });
    state.runoutKey = key;
    state.runoutMap = map;
    return map;
  }

  /* ---------- 좌석 그리기 ---------- */
  function renderSeat(p) {
    var el = $('seat-' + p.id);
    var G = Game.data;
    var isActive = state.activeId === p.id;

    el.className = 'seat seat-' + p.id +
      (p.isHuman ? ' me' : '') +
      (p.folded && p.dealt ? ' folded' : '') +
      (!p.dealt ? ' out' : '') +
      (isActive ? ' active' : '') +
      (p.won > 0 ? ' winner' : '');

    var cardsHtml = '';
    if (p.dealt && p.hole.length) {
      var faceUp = p.isHuman || p.showCards;
      cardsHtml = '<div class="hole">' +
        p.hole.map(function (c) {
          var hi = state.highlight[cardKey(c)] ? ' hit' : '';
          return faceUp
            ? '<div class="card mini ' + (Cards.isRed(c) ? 'red' : 'black') + hi + '">' +
                '<span class="crank">' + Cards.RANK_LABEL[c.r] + '</span>' +
                '<span class="csuit">' + Cards.SUIT_SYMBOL[c.s] + '</span></div>'
            : '<div class="card mini back"></div>';
        }).join('') +
        '</div>';
    }

    var badge = p.lastAction
      ? '<div class="action-badge ' + badgeClass(p.lastAction) + '">' + p.lastAction + '</div>'
      : '';

    var handInfo = (p.showCards && p.evalResult)
      ? '<div class="seat-hand">' + p.evalResult.name + '</div>' : '';

    /* 올인 대결 중에는 각자의 실제 승률을 보여 준다 */
    var eqMap = runoutEquities();
    if (eqMap && eqMap[p.id] !== undefined && !p.evalResult) {
      handInfo = '<div class="seat-eq">승률 ' + Math.round(eqMap[p.id] * 100) + '%</div>';
    }

    var timerBar = (isActive && p.isHuman)
      ? '<div class="turnbar"><i style="width:' + (state.turnLeft / TURN_SECONDS * 100) + '%"></i></div>'
      : '';

    el.innerHTML =
      '<div class="avatar">' + (p.isHuman ? '나' : p.name.charAt(0)) + '</div>' +
      '<div class="seat-body">' +
        '<div class="seat-name"><span>' + p.name + '</span>' +
          (p.persona ? '<span class="persona">' + p.persona.label + '</span>' : '') + '</div>' +
        '<div class="seat-chips">' + fmt(p.chips) + '</div>' +
        handInfo +
        timerBar +
      '</div>' +
      cardsHtml + badge +
      (p.allIn ? '<div class="allin-tag">ALL IN</div>' : '');
  }

  function badgeClass(a) {
    if (a === '다이') return 'b-fold';
    if (a === '체크') return 'b-check';
    if (a.indexOf('콜') >= 0) return 'b-call';
    if (a.indexOf('블라인드') >= 0) return 'b-blind';
    return 'b-raise';
  }

  function renderBets() {
    Game.data.players.forEach(function (p) {
      var el = $('bet-' + p.id);
      if (p.streetBet > 0 && p.dealt && !p.folded) {
        el.style.display = 'flex';
        el.innerHTML = '<span class="chip-dot"></span>' + fmt(p.streetBet);
      } else {
        el.style.display = 'none';
      }
    });
  }

  /* 팟 금액은 툭 바뀌지 않고 굴러가듯 올라간다 */
  function animatePot(to) {
    if (state.potAnim) cancelAnimationFrame(state.potAnim);
    var from = state.potShown;
    if (from === to) { $('potAmt').textContent = fmt(to); return; }
    var start = null;
    var dur = 420;
    function step(ts) {
      if (start === null) start = ts;
      var t = Math.min(1, (ts - start) / dur);
      var eased = 1 - Math.pow(1 - t, 3);
      var v = Math.round(from + (to - from) * eased);
      $('potAmt').textContent = fmt(v);
      if (t < 1) state.potAnim = requestAnimationFrame(step);
      else { state.potShown = to; state.potAnim = null; }
    }
    state.potAnim = requestAnimationFrame(step);
    state.potShown = to;
  }

  /* 이미 깔린 카드는 그대로 두고 새로 나온 카드만 그린다 (깜빡임 · 재애니메이션 방지) */
  function renderBoard() {
    var G = Game.data;
    var box = $('community');
    var rebuild = state.boardHand !== G.handNo || G.board.length < state.boardCount;

    if (rebuild) {
      box.innerHTML = '';
      for (var i = 0; i < 5; i++) {
        var e = document.createElement('div');
        e.className = 'card board-card empty';
        box.appendChild(e);
      }
      state.boardHand = G.handNo;
      state.boardCount = 0;
    }

    for (var j = state.boardCount; j < G.board.length; j++) {
      var c = G.board[j];
      var el = box.children[j];
      el.className = 'card board-card fresh ' + (Cards.isRed(c) ? 'red' : 'black');
      el.style.animationDelay = ((j - state.boardCount) * 0.11) + 's';
      el.dataset.key = cardKey(c);
      el.innerHTML = '<span class="crank">' + Cards.RANK_LABEL[c.r] + '</span>' +
                     '<span class="csuit">' + Cards.SUIT_SYMBOL[c.s] + '</span>';
    }
    state.boardCount = G.board.length;

    /* 승리에 쓰인 카드 강조 */
    for (var k = 0; k < box.children.length; k++) {
      var ch = box.children[k];
      var on = ch.dataset.key && state.highlight[ch.dataset.key];
      ch.classList.toggle('hit', !!on);
    }

    animatePot(G.pot);
    $('streetLabel').textContent = G.street ? (Game.STREET_LABEL[G.street] || '') : '';
  }

  function renderDealerButton() {
    var G = Game.data;
    var btn = $('dealerBtn');
    if (!G.players.length || !G.handNo) { btn.style.display = 'none'; return; }
    btn.style.display = 'flex';
    btn.className = 'dealer-btn d-' + G.button;
  }

  /* 승률은 계산 비용이 있으므로 패·보드·인원이 바뀔 때만 다시 구한다 */
  function currentEquity(me) {
    var G = Game.data;
    var opp = Math.max(1, Game.contenders().length - 1);
    var key = me.hole.map(Cards.cardLabel).join('') + '|' +
              G.board.map(Cards.cardLabel).join('') + '|' + opp;
    if (state.eqKey === key) return state.eqVal;
    state.eqKey = key;
    state.eqVal = AI.equity(me.hole, G.board, opp, G.board.length >= 4 ? 1200 : 800);
    return state.eqVal;
  }

  function renderMyHand() {
    var me = Game.human();
    var G = Game.data;
    if (!me || !me.dealt || !me.hole.length) {
      $('myRank').textContent = '-';
      $('myNotation').textContent = '';
      $('equityText').textContent = '승률 -';
      $('equityFill').style.width = '0%';
      $('drawInfo').textContent = '';
      return;
    }

    var ev = Evaluator.evaluate(me.hole.concat(G.board));
    $('myRank').textContent = Evaluator.label(ev);
    $('myNotation').textContent = G.board.length === 0 ? Evaluator.holeNotation(me.hole) : '';

    if (!state.hint) {
      $('equityText').textContent = '힌트 꺼짐';
      $('equityFill').style.width = '0%';
      $('drawInfo').textContent = '';
      return;
    }

    if (me.folded) {
      $('equityText').textContent = '다이';
      $('equityFill').style.width = '0%';
      $('drawInfo').textContent = '';
      return;
    }

    var eq = currentEquity(me);
    var pct = Math.round(eq * 100);
    $('equityText').textContent = '승률 ' + pct + '%';
    var fill = $('equityFill');
    fill.style.width = pct + '%';
    fill.className = pct >= 60 ? 'good' : (pct >= 35 ? 'mid' : 'bad');

    var dr = Evaluator.analyzeDraws(me.hole, G.board);
    $('drawInfo').textContent = dr && dr.kinds.length
      ? dr.kinds.join(' · ') + ' — 아웃츠 ' + dr.outs + '장'
      : '';
  }

  function render() {
    var G = Game.data;
    G.players.forEach(renderSeat);
    renderBets();
    renderBoard();
    renderDealerButton();
    renderMyHand();
    var me = Game.human();
    $('myChips').textContent = fmt(me ? me.chips : 0);
    $('blindInfo').textContent = fmt(G.smallBlind) + ' / ' + fmt(G.bigBlind);
    $('handNo').textContent = G.handNo;
  }

  /* ---------- 사람 차례 ---------- */
  function showActionButtons(show) {
    ['btnFold', 'btnCheck', 'btnCall', 'btnRaise'].forEach(function (id) {
      $(id).style.display = show ? 'inline-block' : 'none';
    });
    $('raisePanel').style.display = show && state.legal && state.legal.canRaise ? 'flex' : 'none';
  }

  function startTurnTimer() {
    stopTurnTimer();
    state.turnLeft = TURN_SECONDS;
    state.turnTimer = setInterval(function () {
      state.turnLeft -= 0.2;
      if (state.turnLeft <= 0) {
        stopTurnTimer();
        var L = state.legal;
        doHumanAct(L && L.canCheck ? 'check' : 'fold', 0);
        return;
      }
      /* 좌석 전체를 다시 그리지 않고 막대만 줄인다 */
      var bar = document.querySelector('#seat-0 .turnbar i');
      if (bar) bar.style.width = (state.turnLeft / TURN_SECONDS * 100) + '%';
    }, 200);
  }
  function stopTurnTimer() {
    if (state.turnTimer) { clearInterval(state.turnTimer); state.turnTimer = null; }
  }

  function onHumanTurn(p, legal) {
    state.myTurn = true;
    state.legal = legal;
    state.activeId = p.id;
    beep(880, 0.09, 0.05);

    showActionButtons(true);
    /* 체크와 콜은 동시에 뜨면 안 된다 - 표시 순서 주의 */
    $('btnCheck').style.display = legal.canCheck ? 'inline-block' : 'none';
    $('btnCall').style.display = legal.canCheck ? 'none' : 'inline-block';
    $('btnCall').textContent = '콜 ' + fmt(legal.toCall);
    $('btnRaise').textContent = Game.data.currentBet > 0 ? '레이즈' : '벳';
    $('btnRaise').style.display = legal.canRaise ? 'inline-block' : 'none';
    $('btnStart').style.display = 'none';
    $('btnRebuy').style.display = 'none';

    var slider = $('raiseSlider');
    slider.min = legal.minRaiseTo;
    slider.max = legal.maxRaiseTo;
    slider.step = Math.max(100, Math.round(Game.data.bigBlind / 2));
    state.raiseTo = legal.minRaiseTo;
    slider.value = state.raiseTo;
    $('raiseAmt').textContent = fmt(state.raiseTo);

    $('actionHint').textContent = legal.toCall > 0
      ? '내 차례 — 콜 하려면 ' + fmt(legal.toCall) + ' 필요'
      : '내 차례 — 체크 또는 벳';

    render();
    startTurnTimer();
  }

  function doHumanAct(action, amount) {
    if (!Game.isWaitingHuman()) return;
    stopTurnTimer();
    state.myTurn = false;
    state.activeId = -1;
    showActionButtons(false);
    $('actionHint').textContent = '';
    beep(action === 'fold' ? 240 : 520, 0.07, 0.04);
    Game.humanAct(action, amount);
  }

  /* ---------- 판 진행 ---------- */
  function refillAI() {
    Game.data.players.forEach(function (p) {
      if (!p.isHuman && p.chips < Game.data.bigBlind) {
        p.chips = START_CHIPS;
        addLog(p.name + ' 칩 보충', 'sys');
      }
    });
  }

  function startHand() {
    var me = Game.human();
    if (me.chips < Game.data.bigBlind) {
      $('actionHint').textContent = '칩이 부족합니다. 리바이 하세요.';
      $('btnStart').style.display = 'none';
      $('btnRebuy').style.display = 'inline-block';
      return;
    }
    refillAI();
    $('btnStart').style.display = 'none';
    $('btnRebuy').style.display = 'none';
    $('resultBanner').className = 'result-banner';
    $('resultBanner').innerHTML = '';
    state.highlight = {};
    state.potShown = 0;
    state.busy = true;
    state.chipsAtStart = me.chips;
    if (state.autoTimer) { clearTimeout(state.autoTimer); state.autoTimer = null; }
    beep(660, 0.06, 0.04);
    Game.play();
  }

  /* ---------- 상대 한마디 ---------- */
  var TALK = {
    allin: ['여기서 끝냅시다', '다 걸었습니다', '따라올 수 있겠어요?', '이번 판에 걸겠습니다'],
    bigraise: ['이 정도는 받아야죠', '약해 보이는데요', '슬슬 올려 볼까요', '자신 있으면 따라오세요'],
    fold: ['이번엔 접겠습니다', '패가 영 아니네요', '다음 판을 노리죠'],
    win: ['잘 먹었습니다', '운이 좋았네요', '감사합니다', '오늘 손이 좋군요']
  };
  var TALK_BY_PERSONA = {
    aggro: { bigraise: ['겁먹지 말고 따라와요', '판을 키웁시다'], win: ['이게 실력이죠'] },
    tight: { fold: ['무리할 자리가 아니네요'], win: ['기다린 보람이 있네요'] },
    loose: { bigraise: ['재미있어지네요'], fold: ['이번은 양보하죠'] },
    calm: { allin: ['계산은 끝났습니다'], win: ['예상대로군요'] }
  };

  function showTalk(p, kind) {
    var pool = TALK[kind] || [];
    var special = p.persona && TALK_BY_PERSONA[p.persona.key] && TALK_BY_PERSONA[p.persona.key][kind];
    if (special && Math.random() < 0.5) pool = special;
    if (!pool.length) return;

    var b = document.createElement('div');
    b.className = 'fx bubble';
    b.textContent = pool[Math.floor(Math.random() * pool.length)];
    spawnFx(p.id, b, -30, 2200);
  }

  /* 좌석 재렌더에 지워지지 않도록 연출은 테이블 위에 따로 띄운다 */
  function spawnFx(pid, node, offsetY, life) {
    var table = $('table');
    var seat = $('seat-' + pid);
    if (!table || !seat) return;
    var tr = table.getBoundingClientRect();
    var sr = seat.getBoundingClientRect();
    node.style.left = Math.round(sr.left - tr.left + sr.width / 2) + 'px';
    node.style.top = Math.round(sr.top - tr.top + (offsetY || 0)) + 'px';
    table.appendChild(node);
    setTimeout(function () { if (node.parentNode) node.parentNode.removeChild(node); }, life);
  }

  function floatWin(p, amount) {
    var tag = document.createElement('div');
    tag.className = 'fx float-win';
    tag.textContent = '+' + fmt(amount);
    spawnFx(p.id, tag, -4, 1600);
  }

  function onShowdown(results) {
    var banner = $('resultBanner');

    /* 승리에 쓰인 5장을 표시해 왜 이겼는지 한눈에 보이게 한다 */
    state.highlight = {};
    results.forEach(function (r) {
      if (r.best && r.best.best) {
        r.best.best.forEach(function (c) { state.highlight[cardKey(c)] = true; });
      }
      r.winners.forEach(function (p) {
        floatWin(p, Math.round(r.amount / r.winners.length));
      });
    });
    render();

    /* 승자가 같은 팟은 한 줄로 합쳐 보여 준다 */
    var grouped = [];
    results.forEach(function (r) {
      var who = r.winners.map(function (p) { return p.name; }).join(', ');
      var hand = r.best ? Evaluator.label(r.best) : '';
      var found = null;
      for (var i = 0; i < grouped.length; i++) {
        if (grouped[i].who === who && grouped[i].hand === hand) { found = grouped[i]; break; }
      }
      if (found) found.amount += r.amount;
      else grouped.push({ who: who, hand: hand, amount: r.amount });
    });

    var lines = grouped.map(function (g) {
      return '<div class="rline">' + g.who + ' 승리 <b>' + fmt(g.amount) + '</b>' +
             (g.hand ? ' · ' + g.hand : '') + '</div>';
    }).join('');

    var iWon = results.some(function (r) {
      return r.winners.some(function (p) { return p.isHuman; });
    });
    banner.className = 'result-banner show ' + (iWon ? 'win' : 'lose');
    banner.innerHTML = '<div class="rtitle">' + (iWon ? '승리' : '패배') + '</div>' + lines;
    beep(iWon ? 1046 : 300, 0.25, 0.06);
    if (iWon) setTimeout(function () { beep(1318, 0.25, 0.05); }, 130);
  }

  /* 창을 열면 자동 진행을 멈추고, 닫으면 이어서 진행한다 */
  function openModal(id) {
    if (state.autoTimer) {
      clearTimeout(state.autoTimer);
      state.autoTimer = null;
      state.autoPaused = true;
    }
    $(id).classList.add('open');
  }
  function closeModal(id) {
    $(id).classList.remove('open');
    if (!state.autoPaused) return;
    state.autoPaused = false;
    if (state.auto && !Game.data.inHand && $('btnStart').style.display !== 'none') startHand();
  }

  /* ---------- 전적 ---------- */
  function collectStats(results) {
    var me = Game.human();
    var G = Game.data;

    stats.hands++;
    stats.net += me.chips - state.chipsAtStart;

    var wentToShowdown = G.board.length === 5 && me.showCards;
    if (wentToShowdown) stats.showdowns++;

    var myWin = 0;
    (results || []).forEach(function (r) {
      if (r.winners.some(function (p) { return p.isHuman; })) {
        myWin += Math.round(r.amount / r.winners.length);
      }
    });
    if (myWin > 0) stats.wins++;
    if (myWin > stats.bestPot) stats.bestPot = myWin;

    if (!me.folded && G.board.length === 5) {
      var ev = Evaluator.evaluate(me.hole.concat(G.board));
      if (!stats.bestHand || ev.cat > stats.bestHand.cat) {
        stats.bestHand = { cat: ev.cat, text: Evaluator.label(ev) };
      }
    }
  }

  function renderStats() {
    var winRate = stats.hands ? Math.round(stats.wins / stats.hands * 100) : 0;
    var sdRate = stats.hands ? Math.round(stats.showdowns / stats.hands * 100) : 0;
    var netClass = stats.net > 0 ? 'up' : (stats.net < 0 ? 'down' : '');
    var rows = [
      ['참가한 판', fmt(stats.hands) + '판'],
      ['이긴 판', fmt(stats.wins) + '판 (' + winRate + '%)'],
      ['쇼다운까지 간 판', fmt(stats.showdowns) + '판 (' + sdRate + '%)'],
      ['한 판 최대 획득', fmt(stats.bestPot)],
      ['최고 족보', stats.bestHand ? stats.bestHand.text : '-'],
      ['누적 손익', (stats.net >= 0 ? '+' : '') + fmt(stats.net), netClass]
    ];
    $('statGrid').innerHTML = rows.map(function (r) {
      return '<div class="stat-k">' + r[0] + '</div>' +
             '<div class="stat-v ' + (r[2] || '') + '">' + r[1] + '</div>';
    }).join('');

    renderRivals();
  }

  /* 상대별 성향 수치 - 몇 판 이상 겪어 봐야 의미가 생긴다 */
  function renderRivals() {
    var rows = Game.data.players.filter(function (p) { return !p.isHuman; }).map(function (p) {
      var s = p.stat;
      var pct = function (a, b) { return b >= 5 ? Math.round(a / b * 100) + '%' : '-'; };
      return '<tr>' +
        '<td>' + p.name + '</td>' +
        '<td class="dim">' + (p.persona ? p.persona.label : '-') + '</td>' +
        '<td>' + pct(s.vpip, s.hands) + '</td>' +
        '<td>' + pct(s.pfr, s.hands) + '</td>' +
        '<td>' + pct(s.aggro, s.postActions) + '</td>' +
        '<td class="chips">' + fmt(p.chips) + '</td>' +
        '</tr>';
    }).join('');

    $('rivalTable').innerHTML =
      '<thead><tr><th>상대</th><th>성향</th><th>참여율</th><th>레이즈율</th><th>공격성</th><th>보유 칩</th></tr></thead>' +
      '<tbody>' + rows + '</tbody>';
  }

  function onHandEnd(results) {
    state.busy = false;
    state.activeId = -1;
    collectStats(results);
    save();
    render();
    var me = Game.human();
    if (me.chips < Game.data.bigBlind) {
      $('btnRebuy').style.display = 'inline-block';
      $('actionHint').textContent = '칩이 다 떨어졌습니다. 리바이로 다시 시작하세요.';
      return;
    }
    $('btnStart').style.display = 'inline-block';
    $('btnStart').textContent = '다음 판';
    $('actionHint').textContent = state.auto ? '잠시 후 다음 판이 시작됩니다' : '다음 판을 시작하세요';

    if (state.auto) {
      state.autoTimer = setTimeout(function () {
        if (state.auto && !Game.data.inHand) startHand();
      }, 2600 * (state.fast ? 0.5 : 1));
    }
  }

  /* ---------- 초기화 ---------- */
  function buildPlayers() {
    var personas = AI.PERSONAS.slice();
    /* 성향을 무작위로 섞어 배정 */
    for (var i = personas.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = personas[i]; personas[i] = personas[j]; personas[j] = t;
    }
    var list = [{ name: '나', isHuman: true }];
    AI_NAMES.forEach(function (n, i) {
      list.push({ name: n, persona: personas[i % personas.length] });
    });
    return list;
  }

  function init() {
    Game.setup(buildPlayers(), {
      smallBlind: SMALL_BLIND,
      bigBlind: BIG_BLIND,
      startChips: START_CHIPS
    });

    var saved = load();
    if (saved && typeof saved.chips === 'number') {
      var me = Game.human();
      me.chips = saved.chips > 0 ? saved.chips : START_CHIPS;
      Game.data.handNo = saved.handNo || 0;
      if (saved.stats) {
        for (var k in stats) if (saved.stats[k] !== undefined) stats[k] = saved.stats[k];
      }
      state.auto = !!saved.auto;
      state.fast = !!saved.fast;
      if (saved.hint !== undefined) state.hint = !!saved.hint;
    }
    Game.setSpeed(state.fast ? 0.45 : 1);

    Game.setHooks({
      onUpdate: render,
      onLog: addLog,
      onHumanTurn: onHumanTurn,
      onShowdown: onShowdown,
      onHandEnd: onHandEnd,
      onTalk: showTalk,
      onAllIn: function () {
        var banner = $('resultBanner');
        banner.className = 'result-banner show allin';
        banner.innerHTML = '<div class="rtitle">올인 대결</div>' +
                           '<div class="rline">남은 카드로 승부가 갈립니다</div>';
        beep(520, 0.18, 0.06);
        setTimeout(function () {
          if (banner.classList.contains('allin')) banner.className = 'result-banner';
        }, 1800);
      },
      onActorChange: function (p) { state.activeId = p.id; }
    });

    /* 버튼 연결 */
    $('btnFold').onclick = function () { doHumanAct('fold', 0); };
    $('btnCheck').onclick = function () { doHumanAct('check', 0); };
    $('btnCall').onclick = function () { doHumanAct('call', 0); };
    $('btnRaise').onclick = function () { doHumanAct('raise', state.raiseTo); };
    $('btnStart').onclick = startHand;

    $('btnRebuy').onclick = function () {
      Game.human().chips = START_CHIPS;
      addLog('리바이 — ' + fmt(START_CHIPS) + ' 칩 충전', 'sys');
      save();
      render();
      $('btnRebuy').style.display = 'none';
      $('btnStart').style.display = 'inline-block';
    };

    $('raiseSlider').oninput = function () {
      state.raiseTo = parseInt(this.value, 10);
      $('raiseAmt').textContent = fmt(state.raiseTo);
    };

    document.querySelectorAll('.preset').forEach(function (b) {
      b.onclick = function () {
        var L = state.legal;
        if (!L) return;
        var G = Game.data;
        var me = Game.human();
        var target;
        switch (this.dataset.preset) {
          case 'min': target = L.minRaiseTo; break;
          case 'half': target = me.streetBet + L.toCall + Math.round((G.pot + L.toCall) * 0.5); break;
          case 'pot': target = me.streetBet + L.toCall + (G.pot + L.toCall); break;
          default: target = L.maxRaiseTo;
        }
        target = Math.max(L.minRaiseTo, Math.min(L.maxRaiseTo, Math.round(target)));
        state.raiseTo = target;
        $('raiseSlider').value = target;
        $('raiseAmt').textContent = fmt(target);
      };
    });

    $('btnSound').onclick = function () {
      state.soundOn = !state.soundOn;
      this.textContent = state.soundOn ? '🔊' : '🔇';
    };

    function paintToggles() {
      var a = $('btnAuto'), s = $('btnSpeed');
      var narrow = window.innerWidth <= 780;   // 좁은 화면에서는 라벨을 줄인다
      a.textContent = narrow
        ? (state.auto ? '자동 켬' : '자동 끔')
        : (state.auto ? '자동 진행 켬' : '자동 진행 끔');
      a.classList.toggle('on', state.auto);
      s.textContent = narrow
        ? (state.fast ? '빠름' : '보통')
        : (state.fast ? '속도 빠름' : '속도 보통');
      s.classList.toggle('on', state.fast);
      var h = $('btnHint');
      h.textContent = state.hint ? '힌트 켬' : '힌트 끔';
      h.classList.toggle('on', state.hint);
    }
    window.addEventListener('resize', paintToggles);

    $('btnHint').onclick = function () {
      state.hint = !state.hint;
      paintToggles();
      save();
      render();
    };
    $('btnAuto').onclick = function () {
      state.auto = !state.auto;
      paintToggles();
      save();
      /* 판이 끝나 대기 중이었다면 바로 이어서 시작 */
      if (state.auto && !Game.data.inHand && $('btnStart').style.display !== 'none') startHand();
    };
    $('btnSpeed').onclick = function () {
      state.fast = !state.fast;
      Game.setSpeed(state.fast ? 0.45 : 1);
      paintToggles();
      save();
    };
    paintToggles();

    $('btnStats').onclick = function () { renderStats(); openModal('statsModal'); };
    $('btnCloseStats').onclick = function () { closeModal('statsModal'); };
    $('statsModal').onclick = function (e) { if (e.target === this) closeModal('statsModal'); };
    $('btnStatsClear').onclick = function () {
      stats.hands = 0; stats.wins = 0; stats.showdowns = 0;
      stats.bestPot = 0; stats.net = 0; stats.bestHand = null;
      save();
      renderStats();
    };
    $('btnRules').onclick = function () { openModal('rulesModal'); };
    $('btnCloseRules').onclick = function () { closeModal('rulesModal'); };
    $('rulesModal').onclick = function (e) {
      if (e.target === this) closeModal('rulesModal');
    };

    $('btnReset').onclick = function () {
      if (!confirm('보유 칩과 기록을 모두 초기화합니다. 진행할까요?')) return;
      Game.abort();
      try { localStorage.removeItem(STORE_KEY); } catch (e) {}
      location.reload();
    };

    /* 단축키 */
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        if ($('statsModal').classList.contains('open')) closeModal('statsModal');
        if ($('rulesModal').classList.contains('open')) closeModal('rulesModal');
        return;
      }
      if (!state.myTurn) {
        if (e.key === 'Enter' && $('btnStart').style.display !== 'none') startHand();
        return;
      }
      if (e.key === 'f' || e.key === 'F') doHumanAct('fold', 0);
      else if (e.key === 'c' || e.key === 'C') {
        doHumanAct(state.legal && state.legal.canCheck ? 'check' : 'call', 0);
      } else if (e.key === 'r' || e.key === 'R') doHumanAct('raise', state.raiseTo);
    });

    showActionButtons(false);
    $('btnRebuy').style.display = 'none';
    render();
    addLog('게임 준비 완료. 시작 버튼을 누르세요.', 'sys');
  }

  window.addEventListener('DOMContentLoaded', init);
})();
