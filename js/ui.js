/* 화면 그리기 · 입력 처리 */
(function () {
  'use strict';

  var STORE_KEY = 'singleHoldem.v1';
  var TURN_SECONDS = 20;
  var START_CHIPS = 100000;

  var AI_NAMES = ['강대호', '마돌이', '한칠구'];

  /* 난이도 - 판돈 크기와 상대 실력이 함께 바뀐다 */
  var LEVELS = {
    easy: {
      key: 'easy', label: '초급', sb: 250, bb: 500, chips: 100000, skill: 0.5,
      personas: ['tight', 'loose', 'calm'],
      desc: '판돈이 작고 상대가 실수를 자주 합니다. 규칙을 익히기 좋습니다.'
    },
    normal: {
      key: 'normal', label: '중급', sb: 500, bb: 1000, chips: 100000, skill: 0.8,
      personas: ['tight', 'loose', 'aggro', 'calm'],
      desc: '성향이 제각각인 상대 셋과 겨룹니다. 기본 난이도입니다.'
    },
    hard: {
      key: 'hard', label: '고급', sb: 1000, bb: 2000, chips: 100000, skill: 1,
      personas: ['aggro', 'calm', 'tight'],
      desc: '판돈이 크고 상대가 자리와 주도권을 정확히 활용합니다.'
    }
  };

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
    level: 'normal',
    preAction: null,     // 내 차례가 오면 자동으로 취할 액션
    sliderOpen: false,
    lockUntil: 0,        // 이 시각까지는 입력을 받지 않는다 (연타 방지)
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

  /* 칩 액면가와 색 (큰 단위부터) */
  var CHIP_TIERS = [
    { v: 100000, c: '#22222c' },
    { v: 25000, c: '#5b3a8e' },
    { v: 5000, c: '#2a5fae' },
    { v: 1000, c: '#b8342c' },
    { v: 500, c: '#2f7a4a' },
    { v: 100, c: '#dcd9d1' }
  ];

  /* 금액을 칩 더미 모양으로.
     칩 하나만 덜렁 놓이면 초라하니, 세 개 이상 쌓이는 액면가부터 쪼갠다 */
  function chipStackHtml(amount, maxChips) {
    var startTier = CHIP_TIERS.length - 1;
    for (var i = 0; i < CHIP_TIERS.length; i++) {
      if (amount / CHIP_TIERS[i].v >= 3) { startTier = i; break; }
    }

    var left = amount;
    var chips = [];
    for (var j = startTier; j < CHIP_TIERS.length && chips.length < maxChips; j++) {
      var t = CHIP_TIERS[j];
      var n = Math.floor(left / t.v);
      if (n <= 0) continue;
      var take = Math.min(n, maxChips - chips.length);
      for (var k = 0; k < take; k++) chips.push(t.c);
      left -= t.v * take;
    }
    if (!chips.length && amount > 0) chips.push(CHIP_TIERS[CHIP_TIERS.length - 1].c);
    return chips.map(function (c, idx) {
      return '<i class="chip" style="--c:' + c + ';--i:' + idx + '"></i>';
    }).join('');
  }

  /* 카드 한 장 마크업 - 모서리 인덱스 + 가운데 큰 무늬 */
  function cardHtml(c, extraCls, attrs) {
    var r = Cards.RANK_LABEL[c.r];
    var s = Cards.SUIT_SYMBOL[c.s];
    return '<div class="card ' + (Cards.isRed(c) ? 'red' : 'black') +
      (extraCls ? ' ' + extraCls : '') + '"' + (attrs || '') + '>' +
      '<span class="ci">' + r + '<i>' + s + '</i></span>' +
      '<span class="cpip">' + s + '</span>' +
      '<span class="ci ci2">' + r + '<i>' + s + '</i></span>' +
      '</div>';
  }

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
        hint: state.hint,
        level: state.level,
        sliderOpen: state.sliderOpen
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
      /* 판이 시작된 직후 한 번만 나눠 주는 애니메이션을 붙인다 */
      var dealing = state.dealAnimHand !== Game.data.handNo;
      cardsHtml = '<div class="hole">' +
        p.hole.map(function (c, ci) {
          var cls = 'mini' + (state.highlight[cardKey(c)] ? ' hit' : '') +
                    (dealing ? ' dealing' : '');
          var style = dealing
            ? ' style="animation-delay:' + ((p.id * 2 + ci) * 0.07) + 's"'
            : '';
          return faceUp
            ? cardHtml(c, cls, style)
            : '<div class="card ' + cls + ' back"' + style + '></div>';
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

    /* 좌석마다 색을 달리해 한눈에 구분되게 한다 */
    var HUES = [208, 8, 145, 272];
    var MARKS = ['♠', '♥', '♦', '♣'];

    el.innerHTML =
      '<div class="avatar" style="--h:' + HUES[p.id % HUES.length] + '"' +
        ' data-mark="' + MARKS[p.id % MARKS.length] + '">' +
        (p.isHuman ? '나' : p.name.charAt(0)) + '</div>' +
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
        el.innerHTML = '<span class="stack">' + chipStackHtml(p.streetBet, 4) + '</span>' +
                       '<span class="bamt">' + fmt(p.streetBet) + '</span>';
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
      el.innerHTML =
        '<span class="ci">' + Cards.RANK_LABEL[c.r] + '<i>' + Cards.SUIT_SYMBOL[c.s] + '</i></span>' +
        '<span class="cpip">' + Cards.SUIT_SYMBOL[c.s] + '</span>' +
        '<span class="ci ci2">' + Cards.RANK_LABEL[c.r] + '<i>' + Cards.SUIT_SYMBOL[c.s] + '</i></span>';
    }
    state.boardCount = G.board.length;

    /* 승리에 쓰인 카드 강조 */
    for (var k = 0; k < box.children.length; k++) {
      var ch = box.children[k];
      var on = ch.dataset.key && state.highlight[ch.dataset.key];
      ch.classList.toggle('hit', !!on);
    }

    animatePot(G.pot);
    /* 팟이 비었으면 표시 자체를 숨긴다 */
    $('potBox').style.visibility = G.pot > 0 ? 'visible' : 'hidden';
    /* 팟도 칩 더미로 보여 준다 */
    var potKey = G.pot;
    if (state.potChipKey !== potKey) {
      state.potChipKey = potKey;
      $('potChips').innerHTML = G.pot > 0 ? chipStackHtml(G.pot, 7) : '';
    }
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
    if (G.handNo && me && me.hole.length) state.dealAnimHand = G.handNo;
    updatePreActions();
  }

  /* ---------- 베팅 조작 ---------- */

  /* 프리셋이 가리키는 최종 베팅액. 레이즈가 불가능하면 null */
  function presetTarget(key, L) {
    if (!L || !L.canRaise) return null;
    var G = Game.data;
    var me = Game.human();
    var base = me.streetBet + L.toCall;    // 콜까지 맞춘 지점
    var potAfterCall = G.pot + L.toCall;   // 내가 콜했을 때의 팟
    var target;
    switch (key) {
      case 'min': target = L.minRaiseTo; break;
      case 'half': target = base + potAfterCall * 0.5; break;
      case 'threeq': target = base + potAfterCall * 0.75; break;
      case 'pot': target = base + potAfterCall; break;
      default: return L.maxRaiseTo;        // 올인
    }
    return Math.max(L.minRaiseTo, Math.min(L.maxRaiseTo, Math.round(target)));
  }

  function raiseVerb() {
    return Game.data.currentBet > 0 ? '레이즈' : '벳';
  }

  /* 프리셋 버튼에 실제 금액을 찍고, 슬라이더 범위를 맞춘다 */
  function updateBetPanel(L) {
    Array.prototype.forEach.call(document.querySelectorAll('.preset[data-preset]'), function (b) {
      var target = presetTarget(b.dataset.preset, L);
      var amtEl = b.querySelector('.pamt');
      if (target === null) {
        b.disabled = true;
        amtEl.textContent = '-';
        b.classList.remove('is-allin');
        return;
      }
      b.disabled = false;
      amtEl.textContent = fmt(target);
      /* 프리셋 금액이 남은 칩 전부라면 올인이라는 걸 알려 준다 */
      b.classList.toggle('is-allin', target >= L.maxRaiseTo);
    });

    var slider = $('raiseSlider');
    slider.min = L.minRaiseTo;
    slider.max = L.maxRaiseTo;
    slider.step = Math.max(100, Math.round(Game.data.bigBlind / 2));
    slider.disabled = L.minRaiseTo >= L.maxRaiseTo;
    state.raiseTo = L.minRaiseTo;
    slider.value = state.raiseTo;
    $('raiseAmt').textContent = fmt(state.raiseTo);
    $('btnRaise').textContent = raiseVerb() + ' ' + fmt(state.raiseTo);
  }

  /* 내 차례가 아닐 때 다음 액션을 미리 정해 두는 버튼 */
  function updatePreActions() {
    var G = Game.data;
    var me = Game.human();
    var box = $('preActions');
    var show = G.inHand && me && me.dealt && !me.folded && !me.allIn && !state.myTurn;
    box.style.display = show ? 'flex' : 'none';
    Array.prototype.forEach.call(box.querySelectorAll('.pre'), function (b) {
      b.classList.toggle('on', state.preAction === b.dataset.pre);
    });
  }

  function clearPreAction() {
    state.preAction = null;
    updatePreActions();
  }

  /* ---------- 사람 차례 ---------- */
  function showActionButtons(show) {
    ['btnFold', 'btnCheck', 'btnCall', 'btnRaise'].forEach(function (id) {
      $(id).style.display = show ? 'inline-block' : 'none';
    });
    var canRaise = show && state.legal && state.legal.canRaise;
    $('raisePanel').style.display = canRaise ? 'flex' : 'none';
    $('sliderRow').style.display = canRaise && state.sliderOpen ? 'flex' : 'none';
  }

  function startTurnTimer() {
    stopTurnTimer();
    state.turnLeft = TURN_SECONDS;
    state.lastBeepSec = -1;
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
      if (bar) {
        bar.style.width = (state.turnLeft / TURN_SECONDS * 100) + '%';
        bar.classList.toggle('urgent', state.turnLeft <= 5);
      }
      /* 남은 5초부터 1초마다 알린다 */
      var sec = Math.ceil(state.turnLeft);
      if (sec <= 5 && sec !== state.lastBeepSec) {
        state.lastBeepSec = sec;
        beep(420, 0.06, 0.035);
      }
    }, 200);
  }
  function stopTurnTimer() {
    if (state.turnTimer) { clearInterval(state.turnTimer); state.turnTimer = null; }
  }

  function onHumanTurn(p, legal) {
    state.myTurn = true;
    state.legal = legal;
    state.activeId = p.id;

    /* 미리 정해 둔 액션이 있으면 그대로 실행한다 */
    if (state.preAction) {
      var pa = state.preAction;
      state.preAction = null;
      updatePreActions();
      render();
      setTimeout(function () {
        if (!Game.isWaitingHuman()) return;
        state.lockUntil = 0;   // 예약 실행은 연타 잠금과 무관하다
        if (pa === 'call') doHumanAct(legal.canCheck ? 'check' : 'call', 0);
        else doHumanAct(legal.canCheck ? 'check' : 'fold', 0);
      }, 340);
      return;
    }

    beep(880, 0.09, 0.05);
    /* 버튼이 막 나타난 순간의 오조작을 막는다 */
    state.lockUntil = Date.now() + 260;

    showActionButtons(true);
    /* 체크와 콜은 동시에 뜨면 안 된다 - 표시 순서 주의 */
    $('btnCheck').style.display = legal.canCheck ? 'inline-block' : 'none';
    $('btnCall').style.display = legal.canCheck ? 'none' : 'inline-block';
    $('btnCall').textContent = '콜 ' + fmt(legal.toCall);
    $('btnRaise').style.display = legal.canRaise ? 'inline-block' : 'none';
    $('btnStart').style.display = 'none';
    $('btnRebuy').style.display = 'none';

    updateBetPanel(legal);

    var hintText = legal.toCall > 0
      ? '내 차례 — 콜 하려면 ' + fmt(legal.toCall) + ' 필요'
      : '내 차례 — 체크 또는 벳';
    if (state.hint && legal.toCall > 0) {
      /* 팟 오즈: 이 콜이 팟에서 차지하는 비율. 승률이 이보다 높으면 콜이 이득 */
      var odds = Math.round(legal.toCall / (Game.data.pot + legal.toCall) * 100);
      hintText += ' · 팟 오즈 ' + odds + '%';
    }
    $('actionHint').textContent = hintText;

    render();
    startTurnTimer();
  }

  function doHumanAct(action, amount) {
    if (!Game.isWaitingHuman()) return;
    /* 원터치 베팅이라 연타가 다음 차례로 흘러가지 않도록 잠깐 잠근다 */
    if (Date.now() < state.lockUntil) return;
    state.lockUntil = Date.now() + 350;
    stopTurnTimer();
    state.preAction = null;
    state.myTurn = false;
    state.activeId = -1;
    showActionButtons(false);
    $('actionHint').textContent = '';
    beep(action === 'fold' ? 240 : 520, 0.07, 0.04);
    /* 내가 빠진 판은 굳이 천천히 볼 이유가 없다 */
    if (action === 'fold') Game.setSpeed(0.28);
    Game.humanAct(action, amount);
  }

  /* ---------- 판 진행 ---------- */
  function refillAI() {
    Game.data.players.forEach(function (p) {
      if (!p.isHuman && p.chips < Game.data.bigBlind) {
        p.chips = LEVELS[state.level].chips;
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
    state.preAction = null;
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
    var x = sr.left - tr.left + sr.width / 2;
    /* 좁은 화면에서 테이블 밖으로 밀려나지 않게 가둔다 */
    x = Math.max(60, Math.min(tr.width - 60, x));
    node.style.left = Math.round(x) + 'px';
    node.style.top = Math.round(sr.top - tr.top + (offsetY || 0)) + 'px';
    table.appendChild(node);
    setTimeout(function () { if (node.parentNode) node.parentNode.removeChild(node); }, life);
  }

  /* 각자 앞의 베팅 칩이 팟으로 모이는 연출 */
  function flyBetsToPot() {
    var table = $('table');
    var potBox = $('potChips');
    if (!table || !potBox) return;
    var tr = table.getBoundingClientRect();
    var pr = potBox.getBoundingClientRect();

    Game.data.players.forEach(function (p) {
      var el = $('bet-' + p.id);
      if (!el || el.style.display === 'none') return;
      var r = el.getBoundingClientRect();
      var node = el.cloneNode(true);
      node.className = 'bet-chip flying';
      node.style.display = 'flex';
      node.style.left = Math.round(r.left - tr.left) + 'px';
      node.style.top = Math.round(r.top - tr.top) + 'px';
      node.style.right = 'auto';
      node.style.bottom = 'auto';
      node.style.transform = 'none';
      table.appendChild(node);

      var dx = (pr.left + pr.width / 2) - (r.left + r.width / 2);
      var dy = (pr.top + pr.height / 2) - (r.top + r.height / 2);
      requestAnimationFrame(function () {
        node.style.transform = 'translate(' + Math.round(dx) + 'px,' + Math.round(dy) + 'px) scale(.65)';
        node.style.opacity = '0';
      });
      setTimeout(function () {
        if (node.parentNode) node.parentNode.removeChild(node);
      }, 600);
    });
  }

  /* 팟이 승자에게 넘어가는 연출 */
  function flyPotToWinner(p, amount) {
    var table = $('table');
    var potBox = $('potBox');
    var seat = $('seat-' + p.id);
    if (!table || !potBox || !seat) return;

    var tr = table.getBoundingClientRect();
    var pr = potBox.getBoundingClientRect();
    var sr = seat.getBoundingClientRect();

    var node = document.createElement('div');
    node.className = 'bet-chip flying';
    node.style.display = 'flex';
    node.style.left = Math.round(pr.left - tr.left) + 'px';
    node.style.top = Math.round(pr.top - tr.top) + 'px';
    node.innerHTML = '<span class="stack">' + chipStackHtml(amount, 5) + '</span>';
    table.appendChild(node);

    var dx = (sr.left + sr.width / 2) - (pr.left + pr.width / 2);
    var dy = (sr.top + sr.height / 2) - (pr.top + pr.height / 2);
    requestAnimationFrame(function () {
      node.style.transform = 'translate(' + Math.round(dx) + 'px,' + Math.round(dy) + 'px) scale(.8)';
      node.style.opacity = '0';
    });
    setTimeout(function () {
      if (node.parentNode) node.parentNode.removeChild(node);
    }, 700);
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
        var share = Math.round(r.amount / r.winners.length);
        flyPotToWinner(p, share);
        setTimeout(function () { floatWin(p, share); }, 420);
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
    Game.setSpeed(state.fast ? 0.45 : 1);   // 다이 가속 해제
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
  function buildPlayers(lv) {
    var personas = AI.PERSONAS.filter(function (p) {
      return lv.personas.indexOf(p.key) >= 0;
    });
    /* 성향을 무작위로 섞어 배정 */
    for (var i = personas.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = personas[i]; personas[i] = personas[j]; personas[j] = t;
    }
    var list = [{ name: '나', isHuman: true }];
    AI_NAMES.forEach(function (n, i) {
      var base = personas[i % personas.length];
      /* 난이도의 실력 계수를 얹은 사본을 쓴다 (원본 공유 방지) */
      list.push({
        name: n,
        persona: {
          key: base.key, label: base.label,
          aggr: base.aggr, tight: base.tight, bluff: base.bluff,
          skill: lv.skill
        }
      });
    });
    return list;
  }

  /* 상단 토글 버튼의 라벨과 켜짐 표시 */
  function paintToggles() {
    var a = $('btnAuto'), s = $('btnSpeed'), h = $('btnHint');
    var narrow = window.innerWidth <= 780;   // 좁은 화면에서는 라벨을 줄인다
    a.textContent = narrow
      ? (state.auto ? '자동 켬' : '자동 끔')
      : (state.auto ? '자동 진행 켬' : '자동 진행 끔');
    a.classList.toggle('on', state.auto);
    s.textContent = narrow
      ? (state.fast ? '빠름' : '보통')
      : (state.fast ? '속도 빠름' : '속도 보통');
    s.classList.toggle('on', state.fast);
    h.textContent = state.hint ? '힌트 켬' : '힌트 끔';
    h.classList.toggle('on', state.hint);
    $('btnLevel').textContent = (narrow ? '' : '난이도 ') + LEVELS[state.level].label;
  }

  function setupLevel(lv) {
    Game.setup(buildPlayers(lv), {
      smallBlind: lv.sb, bigBlind: lv.bb, startChips: lv.chips
    });
    Game.setSpeed(state.fast ? 0.45 : 1);
  }

  /* 사용자가 난이도를 바꾼 경우 - 판돈과 상대를 새로 정하고 칩을 초기화한다 */
  function applyLevel(key) {
    if (Game.data.inHand) Game.abort();
    state.level = key;
    var lv = LEVELS[key];
    setupLevel(lv);
    state.boardHand = -1;
    state.boardCount = 0;
    state.potShown = 0;
    state.highlight = {};
    state.eqKey = null;
    stopTurnTimer();
    showActionButtons(false);
    $('btnRebuy').style.display = 'none';
    $('btnStart').style.display = 'inline-block';
    $('btnStart').textContent = '게임 시작';
    $('resultBanner').className = 'result-banner';
    $('actionHint').textContent = lv.label + ' 시작 — 게임 시작을 누르세요';
    addLog('난이도 ' + lv.label + ' — 블라인드 ' + fmt(lv.sb) + '/' + fmt(lv.bb) +
           ', 시작 칩 ' + fmt(lv.chips), 'sys');
    save();
    paintToggles();
    render();
  }

  function renderLevelList() {
    var html = '';
    ['easy', 'normal', 'hard'].forEach(function (k) {
      var lv = LEVELS[k];
      html += '<button class="level-item' + (state.level === k ? ' current' : '') +
        '" data-level="' + k + '">' +
        '<div class="lv-title">' + lv.label +
          (state.level === k ? ' <span class="lv-now">선택됨</span>' : '') + '</div>' +
        '<div class="lv-desc">' + lv.desc + '</div>' +
        '<div class="lv-meta">블라인드 ' + fmt(lv.sb) + ' / ' + fmt(lv.bb) + '</div>' +
        '</button>';
    });
    $('levelList').innerHTML = html;
    Array.prototype.forEach.call($('levelList').querySelectorAll('.level-item'), function (b) {
      b.onclick = function () {
        var k = this.dataset.level;
        if (k !== state.level) applyLevel(k);
        closeModal('levelModal');
        renderLevelList();
      };
    });
  }

  function init() {
    var saved = load();
    if (saved && saved.level && LEVELS[saved.level]) state.level = saved.level;
    setupLevel(LEVELS[state.level]);

    if (saved && typeof saved.chips === 'number') {
      var me = Game.human();
      me.chips = saved.chips > 0 ? saved.chips : LEVELS[state.level].chips;
      Game.data.handNo = saved.handNo || 0;
      if (saved.stats) {
        for (var k in stats) if (saved.stats[k] !== undefined) stats[k] = saved.stats[k];
      }
      state.auto = !!saved.auto;
      state.fast = !!saved.fast;
      if (saved.hint !== undefined) state.hint = !!saved.hint;
      state.sliderOpen = !!saved.sliderOpen;
    }
    $('btnTune').classList.toggle('on', state.sliderOpen);
    Game.setSpeed(state.fast ? 0.45 : 1);
    renderLevelList();

    Game.setHooks({
      onUpdate: render,
      onLog: addLog,
      onHumanTurn: onHumanTurn,
      onShowdown: onShowdown,
      onHandEnd: onHandEnd,
      onTalk: showTalk,
      onCollect: flyBetsToPot,
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

    Array.prototype.forEach.call(document.querySelectorAll('.pre'), function (b) {
      b.onclick = function () {
        state.preAction = (state.preAction === this.dataset.pre) ? null : this.dataset.pre;
        updatePreActions();
      };
    });

    $('btnTune').onclick = function () {
      state.sliderOpen = !state.sliderOpen;
      this.classList.toggle('on', state.sliderOpen);
      $('sliderRow').style.display = state.sliderOpen ? 'flex' : 'none';
      save();
    };

    $('btnRebuy').onclick = function () {
      var refill = LEVELS[state.level].chips;
      Game.human().chips = refill;
      addLog('리바이 — ' + fmt(refill) + ' 칩 충전', 'sys');
      save();
      render();
      $('btnRebuy').style.display = 'none';
      $('btnStart').style.display = 'inline-block';
    };

    /* 슬라이더 위에서 휠을 굴려도 조절된다 */
    $('raiseSlider').onwheel = function (e) {
      if (this.disabled) return;
      e.preventDefault();
      var step = parseInt(this.step, 10) || 100;
      var next = parseInt(this.value, 10) + (e.deltaY < 0 ? step : -step);
      next = Math.max(parseInt(this.min, 10), Math.min(parseInt(this.max, 10), next));
      this.value = next;
      this.oninput();
    };

    $('raiseSlider').oninput = function () {
      state.raiseTo = parseInt(this.value, 10);
      $('raiseAmt').textContent = fmt(state.raiseTo);
      $('btnRaise').textContent = raiseVerb() + ' ' + fmt(state.raiseTo);
    };

    /* 프리셋은 누르는 즉시 베팅한다 (한 번 더 확인하는 단계 없음) */
    Array.prototype.forEach.call(document.querySelectorAll('.preset[data-preset]'), function (b) {
      b.onclick = function () {
        if (this.disabled) return;
        var target = presetTarget(this.dataset.preset, state.legal);
        if (target === null) return;
        doHumanAct('raise', target);
      };
    });

    $('btnSound').onclick = function () {
      state.soundOn = !state.soundOn;
      this.textContent = state.soundOn ? '🔊' : '🔇';
    };

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

    $('btnLevel').onclick = function () { renderLevelList(); openModal('levelModal'); };
    $('btnCloseLevel').onclick = function () { closeModal('levelModal'); };
    $('levelModal').onclick = function (e) { if (e.target === this) closeModal('levelModal'); };

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
        ['statsModal', 'rulesModal', 'levelModal'].forEach(function (id) {
          if ($(id).classList.contains('open')) closeModal(id);
        });
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
      else if (e.key >= '1' && e.key <= '5') {
        /* 숫자키로 프리셋 즉시 베팅 */
        var keys = ['min', 'half', 'threeq', 'pot', 'allin'];
        var target = presetTarget(keys[parseInt(e.key, 10) - 1], state.legal);
        if (target !== null) doHumanAct('raise', target);
      }
    });

    showActionButtons(false);
    $('btnRebuy').style.display = 'none';
    render();
    addLog('게임 준비 완료. 시작 버튼을 누르세요.', 'sys');

    /* 처음 방문이면 규칙부터 보여 준다 */
    if (!saved) openModal('rulesModal');
  }

  window.addEventListener('DOMContentLoaded', init);
})();
