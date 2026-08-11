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
    busy: false
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
        handNo: Game.data.handNo
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
          return faceUp
            ? '<div class="card mini ' + (Cards.isRed(c) ? 'red' : 'black') + '">' +
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

    var timerBar = (isActive && p.isHuman)
      ? '<div class="turnbar"><i style="width:' + (state.turnLeft / TURN_SECONDS * 100) + '%"></i></div>'
      : '';

    el.innerHTML =
      '<div class="avatar">' + (p.isHuman ? '나' : p.name.charAt(0)) + '</div>' +
      '<div class="seat-body">' +
        '<div class="seat-name">' + p.name +
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

  function renderBoard() {
    var G = Game.data;
    var box = $('community');
    box.innerHTML = '';
    for (var i = 0; i < 5; i++) {
      if (G.board[i]) {
        var c = G.board[i];
        var d = document.createElement('div');
        d.className = 'card board-card ' + (Cards.isRed(c) ? 'red' : 'black');
        d.innerHTML = '<span class="crank">' + Cards.RANK_LABEL[c.r] + '</span>' +
                      '<span class="csuit">' + Cards.SUIT_SYMBOL[c.s] + '</span>';
        box.appendChild(d);
      } else {
        var e = document.createElement('div');
        e.className = 'card board-card empty';
        box.appendChild(e);
      }
    }
    $('potAmt').textContent = fmt(G.pot);
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
    state.eqVal = AI.equity(me.hole, G.board, opp, G.board.length >= 4 ? 500 : 320);
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
      renderSeat(Game.human());
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

    $('btnCheck').style.display = legal.canCheck ? 'inline-block' : 'none';
    $('btnCall').style.display = legal.canCheck ? 'none' : 'inline-block';
    $('btnCall').textContent = '콜 ' + fmt(legal.toCall);
    $('btnRaise').textContent = Game.data.currentBet > 0 ? '레이즈' : '벳';
    $('btnStart').style.display = 'none';
    $('btnRebuy').style.display = 'none';
    showActionButtons(true);

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
    state.busy = true;
    beep(660, 0.06, 0.04);
    Game.play();
  }

  function onShowdown(results) {
    var G = Game.data;
    var banner = $('resultBanner');
    var me = Game.human();
    var lines = results.map(function (r) {
      var who = r.winners.map(function (p) { return p.name; }).join(', ');
      var hand = r.best ? ' · ' + Evaluator.label(r.best) : '';
      return '<div class="rline">' + who + ' 승리 ' + fmt(r.amount) + hand + '</div>';
    }).join('');

    var iWon = results.some(function (r) {
      return r.winners.some(function (p) { return p.isHuman; });
    });
    banner.className = 'result-banner show ' + (iWon ? 'win' : 'lose');
    banner.innerHTML = '<div class="rtitle">' + (iWon ? '승리' : '패배') + '</div>' + lines;
    beep(iWon ? 1046 : 300, 0.25, 0.06);
    if (iWon) setTimeout(function () { beep(1318, 0.25, 0.05); }, 130);
  }

  function onHandEnd() {
    state.busy = false;
    state.activeId = -1;
    save();
    render();
    var me = Game.human();
    if (me.chips < Game.data.bigBlind) {
      $('btnRebuy').style.display = 'inline-block';
      $('actionHint').textContent = '칩이 다 떨어졌습니다. 리바이로 다시 시작하세요.';
    } else {
      $('btnStart').style.display = 'inline-block';
      $('btnStart').textContent = '다음 판';
      $('actionHint').textContent = '다음 판을 시작하세요';
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
    }

    Game.setHooks({
      onUpdate: render,
      onLog: addLog,
      onHumanTurn: onHumanTurn,
      onShowdown: onShowdown,
      onHandEnd: onHandEnd,
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
    $('btnRules').onclick = function () { $('rulesModal').classList.add('open'); };
    $('btnCloseRules').onclick = function () { $('rulesModal').classList.remove('open'); };
    $('rulesModal').onclick = function (e) {
      if (e.target === this) this.classList.remove('open');
    };

    $('btnReset').onclick = function () {
      if (!confirm('보유 칩과 기록을 모두 초기화합니다. 진행할까요?')) return;
      Game.abort();
      try { localStorage.removeItem(STORE_KEY); } catch (e) {}
      location.reload();
    };

    /* 단축키 */
    document.addEventListener('keydown', function (e) {
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
