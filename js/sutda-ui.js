/* 섯다 화면 */
(function () {
  'use strict';

  var params = new URLSearchParams(location.search);
  var CARDS = params.get('cards') === '3' ? 3 : 2;
  var STORE_KEY = 'sutda' + CARDS + '.v1';
  var TURN_SECONDS = 20;
  var AI_NAMES = ['왕서방', '박달재', '최고집'];

  var LEVELS = {
    easy: {
      key: 'easy', label: '초급', ante: 500, base: 1000, chips: 100000, skill: 0.5,
      personas: ['tight', 'loose', 'calm'],
      desc: '판돈이 적고 상대가 자주 흔들립니다. 족보를 익히기 좋습니다.'
    },
    normal: {
      key: 'normal', label: '중급', ante: 1000, base: 2000, chips: 100000, skill: 0.8,
      personas: ['tight', 'loose', 'aggro', 'calm'],
      desc: '성향이 제각각인 상대 셋과 겨룹니다. 기본 난이도입니다.'
    },
    hard: {
      key: 'hard', label: '고급', ante: 2000, base: 4000, chips: 100000, skill: 1,
      personas: ['aggro', 'calm', 'tight'],
      desc: '판돈이 크고 상대가 좀처럼 속지 않습니다.'
    }
  };

  var $ = function (id) { return document.getElementById(id); };
  var fmt = function (n) { return (n || 0).toLocaleString('ko-KR'); };
  var G = function () { return SutdaGame.data; };

  var state = {
    soundOn: true, turnTimer: null, turnLeft: 0, lastBeepSec: -1,
    raiseTo: 0, legal: null, myTurn: false,
    auto: false, fast: false, hint: true, level: 'normal',
    preAction: null, sliderOpen: false, lockUntil: 0,
    autoTimer: null, autoPaused: false, chipsAtStart: 0,
    potShown: 0, potAnim: null, potChipKey: -1,
    highlight: {}, dealAnimHand: -1, activeId: -1,
    eqKey: null, eqVal: 0
  };

  var stats = { hands: 0, wins: 0, showdowns: 0, bestPot: 0, net: 0, bestHand: null };

  /* ---------- 소리 ---------- */
  var audioCtx = null;
  function beep(freq, dur, vol) {
    if (!state.soundOn) return;
    try {
      if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      var o = audioCtx.createOscillator(), g = audioCtx.createGain();
      o.type = 'triangle'; o.frequency.value = freq; g.gain.value = vol || 0.05;
      o.connect(g); g.connect(audioCtx.destination); o.start();
      g.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + (dur || 0.08));
      o.stop(audioCtx.currentTime + (dur || 0.08));
    } catch (e) { /* 무시 */ }
  }

  function save() {
    try {
      var me = SutdaGame.human();
      localStorage.setItem(STORE_KEY, JSON.stringify({
        chips: me ? me.chips : LEVELS[state.level].chips,
        handNo: G().handNo, stats: stats,
        auto: state.auto, fast: state.fast, hint: state.hint,
        level: state.level, sliderOpen: state.sliderOpen
      }));
    } catch (e) { /* 무시 */ }
  }
  function load() {
    try {
      var raw = localStorage.getItem(STORE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }

  function addLog(msg, kind) {
    var ul = $('logList');
    var li = document.createElement('li');
    li.className = 'log-' + (kind || '');
    li.textContent = msg;
    ul.appendChild(li);
    while (ul.children.length > 140) ul.removeChild(ul.firstChild);
    ul.scrollTop = ul.scrollHeight;
  }

  /* ---------- 칩 ---------- */
  var CHIP_TIERS = [
    { v: 100000, c: '#22222c' }, { v: 25000, c: '#5b3a8e' }, { v: 5000, c: '#2a5fae' },
    { v: 1000, c: '#b8342c' }, { v: 500, c: '#2f7a4a' }, { v: 100, c: '#dcd9d1' }
  ];
  function chipStackHtml(amount, maxChips) {
    var startTier = CHIP_TIERS.length - 1;
    for (var i = 0; i < CHIP_TIERS.length; i++) {
      if (amount / CHIP_TIERS[i].v >= 3) { startTier = i; break; }
    }
    var left = amount, chips = [];
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

  /* ---------- 좌석 ---------- */
  var HUES = [8, 145, 208, 272];
  var MARKS = ['갑', '을', '병', '정'];

  function renderSeat(p) {
    var el = $('seat-' + p.id);
    var isActive = state.activeId === p.id;

    el.className = 'seat seat-' + p.id +
      (p.isHuman ? ' me' : '') +
      (p.folded && p.dealt ? ' folded' : '') +
      (!p.dealt ? ' out' : '') +
      (isActive ? ' active' : '') +
      (p.won > 0 ? ' winner' : '');

    var dealing = state.dealAnimHand !== G().handNo;
    var usedIdx = (p.showCards && p.evalResult && p.evalResult.usedIndex) || null;

    var cardsHtml = p.cards.map(function (c, i) {
      var open = p.isHuman || p.showCards;
      var cls = (dealing ? 'dealing ' : '') +
        (usedIdx && usedIdx.indexOf(i) >= 0 ? 'used' : '') +
        (state.highlight[Hwatu.key(c)] ? ' hit' : '');
      var style = dealing ? ' style="animation-delay:' + ((p.id * 3 + i) * 0.06) + 's"' : '';
      return open ? Hwatu.cardHtml(c, 'mini ' + cls, style)
                  : Hwatu.backHtml('mini ' + cls, style);
    }).join('');

    var badge = p.lastAction
      ? '<div class="action-badge ' + badgeClass(p.lastAction) + '">' + p.lastAction + '</div>' : '';
    var handInfo = (p.showCards && p.evalResult)
      ? '<div class="seat-hand">' + p.evalResult.name + '</div>' : '';
    var timerBar = (isActive && p.isHuman)
      ? '<div class="turnbar"><i style="width:' + (state.turnLeft / TURN_SECONDS * 100) + '%"></i></div>' : '';

    el.innerHTML =
      '<div class="seat-top">' +
        '<div class="avatar" style="--h:' + HUES[p.id % 4] + '" data-mark="' + MARKS[p.id % 4] + '">' +
          (p.isHuman ? '나' : p.name.charAt(0)) + '</div>' +
        '<div class="seat-body">' +
          '<div class="seat-name"><span>' + p.name + '</span>' +
            (p.persona ? '<span class="persona">' + p.persona.label + '</span>' : '') + '</div>' +
          '<div class="seat-chips">' + fmt(p.chips) + '</div>' +
          handInfo + timerBar +
        '</div>' +
      '</div>' +
      '<div class="handrow">' + cardsHtml + '</div>' +
      badge + (p.allIn ? '<div class="allin-tag">올인</div>' : '');
  }

  function badgeClass(a) {
    if (a === '다이') return 'b-fold';
    if (a === '체크') return 'b-check';
    if (a === '선 베팅') return 'b-blind';
    if (a.indexOf('콜') >= 0) return 'b-call';
    return 'b-raise';
  }

  function renderBets() {
    var showdown = G().streetIdx === 2;
    G().players.forEach(function (p) {
      var el = $('bet-' + p.id);
      if (!showdown && p.streetBet > 0 && p.dealt && !p.folded) {
        el.style.display = 'flex';
        el.innerHTML = '<span class="stack">' + chipStackHtml(p.streetBet, 4) + '</span>' +
                       '<span class="bamt">' + fmt(p.streetBet) + '</span>';
      } else {
        el.style.display = 'none';
      }
    });
  }

  function animatePot(to) {
    if (state.potAnim) cancelAnimationFrame(state.potAnim);
    var from = state.potShown;
    if (from === to) { $('potAmt').textContent = fmt(to); return; }
    var start = null;
    function step(ts) {
      if (start === null) start = ts;
      var t = Math.min(1, (ts - start) / 420);
      var eased = 1 - Math.pow(1 - t, 3);
      $('potAmt').textContent = fmt(Math.round(from + (to - from) * eased));
      if (t < 1) state.potAnim = requestAnimationFrame(step);
      else { state.potShown = to; state.potAnim = null; }
    }
    state.potAnim = requestAnimationFrame(step);
    state.potShown = to;
  }

  var STREET_LABEL = ['첫 베팅', '마지막 장', '승부'];

  function renderCenter() {
    var g = G();
    animatePot(g.pot);
    $('potBox').style.visibility = g.pot > 0 ? 'visible' : 'hidden';
    if (state.potChipKey !== g.pot) {
      state.potChipKey = g.pot;
      $('potChips').innerHTML = g.pot > 0 ? chipStackHtml(g.pot, 7) : '';
    }
    $('streetLabel').textContent = g.handNo ? (STREET_LABEL[g.streetIdx] || '') : '';
  }

  function renderDealerButton() {
    var btn = $('dealerBtn');
    if (!G().handNo) { btn.style.display = 'none'; return; }
    btn.style.display = 'flex';
    btn.className = 'dealer-btn d-' + G().button;
  }

  function renderMyHand() {
    var me = SutdaGame.human();
    var box = $('myHand');
    if (!me || !me.cards.length) {
      box.innerHTML = '';
      $('myRank').textContent = '-';
      $('specialNote').textContent = '';
      $('equityText').textContent = '승률 -';
      $('equityFill').style.width = '0%';
      return;
    }

    var ev = SutdaEval.evaluate(me.cards);
    var used = ev.usedIndex || null;
    box.innerHTML = me.cards.map(function (c, i) {
      var cls = (used && used.indexOf(i) >= 0) ? 'used' : (used ? 'unused' : '');
      return Hwatu.cardHtml(c, cls);
    }).join('');

    $('myRank').textContent = me.cards.length >= CARDS ? ev.name : '패 받는 중';
    $('specialNote').textContent = me.cards.length >= CARDS ? SutdaEval.specialNote(ev) : '';

    if (!state.hint) {
      $('equityText').textContent = '힌트 꺼짐';
      $('equityFill').style.width = '0%';
      return;
    }
    if (me.folded) {
      $('equityText').textContent = '다이';
      $('equityFill').style.width = '0%';
      return;
    }

    var eq = currentEquity(me);
    var pct = Math.round(eq * 100);
    $('equityText').textContent = '승률 ' + pct + '%';
    var fill = $('equityFill');
    fill.style.width = pct + '%';
    fill.className = pct >= 60 ? 'good' : (pct >= 35 ? 'mid' : 'bad');
  }

  function currentEquity(me) {
    var opp = Math.max(1, SutdaGame.contenders().length - 1);
    var key = me.cards.map(Hwatu.key).join('') + '|' + opp;
    if (state.eqKey === key) return state.eqVal;
    state.eqKey = key;
    state.eqVal = SutdaAI.equity(me.cards, CARDS - me.cards.length, opp, CARDS, 1200);
    return state.eqVal;
  }

  function render() {
    var g = G();
    g.players.forEach(renderSeat);
    renderBets();
    renderCenter();
    renderDealerButton();
    renderMyHand();
    var me = SutdaGame.human();
    $('myChips').textContent = fmt(me ? me.chips : 0);
    $('blindInfo').textContent = fmt(g.ante);
    $('handNo').textContent = g.handNo;
    if (g.handNo && me && me.cards.length) state.dealAnimHand = g.handNo;
    updatePreActions();
  }

  /* ---------- 베팅 ---------- */
  function presetTarget(key, L) {
    if (!L || !L.canRaise) return null;
    var g = G();
    var me = SutdaGame.human();
    var base = me.streetBet + L.toCall;
    var potAfterCall = g.pot + L.toCall;
    var target;
    switch (key) {
      case 'min': target = L.minRaiseTo; break;
      case 'quarter': target = base + potAfterCall * 0.25; break;
      case 'half': target = base + potAfterCall * 0.5; break;
      case 'pot': target = base + potAfterCall; break;
      default: return L.maxRaiseTo;
    }
    return Math.max(L.minRaiseTo, Math.min(L.maxRaiseTo, Math.round(target)));
  }

  function raiseVerb() { return G().currentBet > 0 ? '레이즈' : '베팅'; }

  function updateBetPanel(L) {
    Array.prototype.forEach.call(document.querySelectorAll('.preset[data-preset]'), function (b) {
      var target = presetTarget(b.dataset.preset, L);
      var amtEl = b.querySelector('.pamt');
      if (target === null) {
        b.disabled = true; amtEl.textContent = '-'; b.classList.remove('is-allin'); return;
      }
      b.disabled = false;
      amtEl.textContent = fmt(target);
      b.classList.toggle('is-allin', target >= L.maxRaiseTo);
    });
    var slider = $('raiseSlider');
    slider.min = L.minRaiseTo; slider.max = L.maxRaiseTo;
    slider.step = Math.max(100, Math.round(G().baseBet / 2));
    slider.disabled = L.minRaiseTo >= L.maxRaiseTo;
    state.raiseTo = L.minRaiseTo;
    slider.value = state.raiseTo;
    $('raiseAmt').textContent = fmt(state.raiseTo);
    $('btnRaise').textContent = raiseVerb() + ' ' + fmt(state.raiseTo);
  }

  function updatePreActions() {
    var g = G(), me = SutdaGame.human();
    var box = $('preActions');
    var show = g.inHand && me && me.dealt && !me.folded && !me.allIn && !state.myTurn;
    box.style.display = show ? 'flex' : 'none';
    Array.prototype.forEach.call(box.querySelectorAll('.pre'), function (b) {
      b.classList.toggle('on', state.preAction === b.dataset.pre);
    });
  }

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
      var bar = document.querySelector('#seat-0 .turnbar i');
      if (bar) {
        bar.style.width = (state.turnLeft / TURN_SECONDS * 100) + '%';
        bar.classList.toggle('urgent', state.turnLeft <= 5);
      }
      var sec = Math.ceil(state.turnLeft);
      if (sec <= 5 && sec !== state.lastBeepSec) { state.lastBeepSec = sec; beep(420, 0.06, 0.035); }
    }, 200);
  }
  function stopTurnTimer() {
    if (state.turnTimer) { clearInterval(state.turnTimer); state.turnTimer = null; }
  }

  function onHumanTurn(p, legal) {
    state.myTurn = true;
    state.legal = legal;
    state.activeId = p.id;

    if (state.preAction) {
      var pa = state.preAction;
      state.preAction = null;
      updatePreActions();
      render();
      setTimeout(function () {
        if (!SutdaGame.isWaitingHuman()) return;
        state.lockUntil = 0;
        if (pa === 'call') doHumanAct(legal.canCheck ? 'check' : 'call', 0);
        else doHumanAct(legal.canCheck ? 'check' : 'fold', 0);
      }, 340);
      return;
    }

    beep(880, 0.09, 0.05);
    state.lockUntil = Date.now() + 260;

    showActionButtons(true);
    $('btnCheck').style.display = legal.canCheck ? 'inline-block' : 'none';
    $('btnCall').style.display = legal.canCheck ? 'none' : 'inline-block';
    $('btnCall').textContent = '콜 ' + fmt(legal.toCall);
    $('btnRaise').style.display = legal.canRaise ? 'inline-block' : 'none';
    $('btnStart').style.display = 'none';
    $('btnRebuy').style.display = 'none';

    updateBetPanel(legal);

    var hintText = legal.toCall > 0
      ? '내 차례 — 콜 하려면 ' + fmt(legal.toCall) + ' 필요'
      : '내 차례 — 체크 또는 베팅';
    if (state.hint && legal.toCall > 0) {
      hintText += ' · 팟 오즈 ' + Math.round(legal.toCall / (G().pot + legal.toCall) * 100) + '%';
    }
    $('actionHint').textContent = hintText;

    render();
    startTurnTimer();
  }

  function doHumanAct(action, amount) {
    if (!SutdaGame.isWaitingHuman()) return;
    if (Date.now() < state.lockUntil) return;
    state.lockUntil = Date.now() + 350;
    stopTurnTimer();
    state.preAction = null;
    state.myTurn = false;
    state.activeId = -1;
    showActionButtons(false);
    $('actionHint').textContent = '';
    beep(action === 'fold' ? 240 : 520, 0.07, 0.04);
    if (action === 'fold') SutdaGame.setSpeed(0.28);
    SutdaGame.humanAct(action, amount);
  }

  /* ---------- 연출 ---------- */
  var TALK = {
    allin: ['다 걸었소', '여기서 끝냅시다', '자신 있으면 따라오시오'],
    bigraise: ['이 정도는 받아야지', '슬슬 올려 볼까', '패가 좋아 보이는군'],
    fold: ['이번엔 접겠소', '패가 영 아니구먼', '다음 판을 노리지'],
    win: ['잘 먹었소', '운이 좋았소이다', '오늘 손이 좋구먼']
  };
  function showTalk(p, kind) {
    var pool = TALK[kind] || [];
    if (!pool.length) return;
    var b = document.createElement('div');
    b.className = 'fx bubble';
    b.textContent = pool[Math.floor(Math.random() * pool.length)];
    spawnFx(p.id, b, -30, 2200);
  }
  function spawnFx(pid, node, offsetY, life) {
    var table = $('table'), seat = $('seat-' + pid);
    if (!table || !seat) return;
    var tr = table.getBoundingClientRect(), sr = seat.getBoundingClientRect();
    var x = sr.left - tr.left + sr.width / 2;
    x = Math.max(60, Math.min(tr.width - 60, x));
    node.style.left = Math.round(x) + 'px';
    node.style.top = Math.round(sr.top - tr.top + (offsetY || 0)) + 'px';
    table.appendChild(node);
    setTimeout(function () { if (node.parentNode) node.parentNode.removeChild(node); }, life);
  }
  function burstCoins(count) {
    for (var i = 0; i < count; i++) {
      var el = document.createElement('div');
      el.className = 'coin';
      el.style.left = (Math.random() * 100) + '%';
      el.style.animationDelay = (Math.random() * 0.55).toFixed(2) + 's';
      el.style.animationDuration = (1.3 + Math.random() * 1.3).toFixed(2) + 's';
      el.style.setProperty('--sz', (11 + Math.random() * 12).toFixed(0) + 'px');
      document.body.appendChild(el);
      (function (n) { setTimeout(function () { if (n.parentNode) n.parentNode.removeChild(n); }, 2800); })(el);
    }
  }
  function flashScreen(color) {
    var el = document.createElement('div');
    el.className = 'screen-flash';
    el.style.setProperty('--fc', color || 'rgba(217,43,58,.4)');
    document.body.appendChild(el);
    setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 700);
  }
  function flyBetsToPot() {
    var table = $('table'), potBox = $('potChips');
    if (!table || !potBox) return;
    var tr = table.getBoundingClientRect(), pr = potBox.getBoundingClientRect();
    G().players.forEach(function (p) {
      var el = $('bet-' + p.id);
      if (!el || el.style.display === 'none') return;
      var r = el.getBoundingClientRect();
      var node = el.cloneNode(true);
      node.className = 'bet-chip flying';
      node.style.display = 'flex';
      node.style.left = Math.round(r.left - tr.left) + 'px';
      node.style.top = Math.round(r.top - tr.top) + 'px';
      node.style.right = 'auto'; node.style.bottom = 'auto'; node.style.transform = 'none';
      table.appendChild(node);
      var dx = (pr.left + pr.width / 2) - (r.left + r.width / 2);
      var dy = (pr.top + pr.height / 2) - (r.top + r.height / 2);
      requestAnimationFrame(function () {
        node.style.transform = 'translate(' + Math.round(dx) + 'px,' + Math.round(dy) + 'px) scale(.65)';
        node.style.opacity = '0';
      });
      setTimeout(function () { if (node.parentNode) node.parentNode.removeChild(node); }, 600);
    });
  }
  function flyPotToWinner(p, amount) {
    var table = $('table'), potBox = $('potBox'), seat = $('seat-' + p.id);
    if (!table || !potBox || !seat) return;
    var tr = table.getBoundingClientRect();
    var pr = potBox.getBoundingClientRect(), sr = seat.getBoundingClientRect();
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
    setTimeout(function () { if (node.parentNode) node.parentNode.removeChild(node); }, 700);
  }
  function floatWin(p, amount) {
    var tag = document.createElement('div');
    tag.className = 'fx float-win';
    tag.textContent = '+' + fmt(amount);
    spawnFx(p.id, tag, -4, 1600);
  }

  function openModal(id) {
    if (state.autoTimer) { clearTimeout(state.autoTimer); state.autoTimer = null; state.autoPaused = true; }
    $(id).classList.add('open');
  }
  function closeModal(id) {
    $(id).classList.remove('open');
    if (!state.autoPaused) return;
    state.autoPaused = false;
    if (state.auto && !G().inHand && $('btnStart').style.display !== 'none') startHand();
  }

  /* ---------- 전적 ---------- */
  function collectStats(results) {
    var me = SutdaGame.human();
    stats.hands++;
    stats.net += me.chips - state.chipsAtStart;
    if (me.showCards) stats.showdowns++;

    var myWin = 0;
    (results || []).forEach(function (r) {
      if (r.winners.some(function (p) { return p.isHuman; })) {
        myWin += Math.round(r.amount / r.winners.length);
      }
    });
    if (myWin > 0) stats.wins++;
    if (myWin > stats.bestPot) stats.bestPot = myWin;

    if (!me.folded && me.cards.length >= CARDS) {
      var ev = SutdaEval.evaluate(me.cards);
      if (!stats.bestHand || ev.score > stats.bestHand.score) {
        stats.bestHand = { score: ev.score, text: ev.name };
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
      ['패를 깐 판', fmt(stats.showdowns) + '판 (' + sdRate + '%)'],
      ['한 판 최대 획득', fmt(stats.bestPot)],
      ['최고 족보', stats.bestHand ? stats.bestHand.text : '-'],
      ['누적 손익', (stats.net >= 0 ? '+' : '') + fmt(stats.net), netClass]
    ];
    $('statGrid').innerHTML = rows.map(function (r) {
      return '<div class="stat-k">' + r[0] + '</div><div class="stat-v ' + (r[2] || '') + '">' + r[1] + '</div>';
    }).join('');

    var rrows = G().players.filter(function (p) { return !p.isHuman; }).map(function (p) {
      var s = p.stat;
      var pct = function (a, b) { return b >= 5 ? Math.round(a / b * 100) + '%' : '-'; };
      return '<tr><td>' + p.name + '</td><td class="dim">' + (p.persona ? p.persona.label : '-') + '</td>' +
        '<td>' + pct(s.vpip, s.hands) + '</td><td>' + pct(s.pfr, s.hands) + '</td>' +
        '<td>' + pct(s.aggro, s.postActions) + '</td><td class="chips">' + fmt(p.chips) + '</td></tr>';
    }).join('');
    $('rivalTable').innerHTML =
      '<thead><tr><th>상대</th><th>성향</th><th>참여율</th><th>베팅율</th><th>공격성</th><th>가진 돈</th></tr></thead>' +
      '<tbody>' + rrows + '</tbody>';
  }

  /* ---------- 판 진행 ---------- */
  function refillAI() {
    G().players.forEach(function (p) {
      if (!p.isHuman && p.chips < G().ante * 3) {
        p.chips = LEVELS[state.level].chips;
        addLog(p.name + ' 돈 보충', 'sys');
      }
    });
  }

  function startHand() {
    var me = SutdaGame.human();
    if (me.chips < G().ante * 2) {
      $('actionHint').textContent = '돈이 부족합니다. 다시 채우세요.';
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
    state.potChipKey = -1;
    state.eqKey = null;
    state.chipsAtStart = me.chips;
    state.preAction = null;
    if (state.autoTimer) { clearTimeout(state.autoTimer); state.autoTimer = null; }
    beep(660, 0.06, 0.04);
    SutdaGame.play();
  }

  function onShowdown(results) {
    var banner = $('resultBanner');
    state.highlight = {};
    results.forEach(function (r) {
      if (r.best && r.best.cards) {
        r.best.cards.forEach(function (c) { state.highlight[Hwatu.key(c)] = true; });
      }
      r.winners.forEach(function (p) {
        var share = Math.round(r.amount / r.winners.length);
        flyPotToWinner(p, share);
        setTimeout(function () { floatWin(p, share); }, 420);
      });
    });
    render();

    var grouped = [];
    results.forEach(function (r) {
      var who = r.winners.map(function (p) { return p.name; }).join(', ');
      var hand = r.best ? r.best.name : '';
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
    var myGain = 0;
    results.forEach(function (r) {
      if (r.winners.some(function (x) { return x.isHuman; })) {
        myGain += Math.round(r.amount / r.winners.length);
      }
    });

    banner.className = 'result-banner show ' + (iWon ? 'win' : 'lose');
    banner.innerHTML = '<div class="rtitle">' + (iWon ? '<span class="crown">✦</span> 승리' : '패배') + '</div>' + lines;
    beep(iWon ? 1046 : 300, 0.25, 0.06);
    if (iWon) {
      setTimeout(function () { beep(1318, 0.25, 0.05); }, 130);
      setTimeout(function () { beep(1568, 0.3, 0.05); }, 260);
      burstCoins(myGain >= LEVELS[state.level].chips * 0.4 ? 46 : 24);
      flashScreen('rgba(255,190,90,.35)');
    }
  }

  function onHandEnd(results) {
    state.activeId = -1;
    SutdaGame.setSpeed(state.fast ? 0.45 : 1);
    collectStats(results);
    save();
    render();
    var me = SutdaGame.human();
    if (me.chips < G().ante * 2) {
      $('btnRebuy').style.display = 'inline-block';
      $('actionHint').textContent = '돈이 다 떨어졌습니다. 다시 채우고 이어서 하세요.';
      return;
    }
    $('btnStart').style.display = 'inline-block';
    $('btnStart').textContent = '다음 판';
    $('actionHint').textContent = state.auto ? '잠시 후 다음 판이 시작됩니다' : '다음 판을 시작하세요';
    if (state.auto) {
      state.autoTimer = setTimeout(function () {
        if (state.auto && !G().inHand) startHand();
      }, 2600 * (state.fast ? 0.5 : 1));
    }
  }

  /* ---------- 난이도 ---------- */
  function buildPlayers(lv) {
    var personas = AI.PERSONAS.filter(function (p) { return lv.personas.indexOf(p.key) >= 0; });
    for (var i = personas.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = personas[i]; personas[i] = personas[j]; personas[j] = t;
    }
    var list = [{ name: '나', isHuman: true }];
    AI_NAMES.forEach(function (n, i) {
      var base = personas[i % personas.length];
      list.push({
        name: n,
        persona: {
          key: base.key, label: base.label, aggr: base.aggr,
          tight: base.tight, bluff: base.bluff, skill: lv.skill
        }
      });
    });
    return list;
  }

  function setupLevel(lv) {
    SutdaGame.setup(buildPlayers(lv), {
      ante: lv.ante, baseBet: lv.base, startChips: lv.chips, cardsPerHand: CARDS
    });
    SutdaGame.setSpeed(state.fast ? 0.45 : 1);
  }

  function paintToggles() {
    var a = $('btnAuto'), s = $('btnSpeed'), h = $('btnHint');
    var narrow = window.innerWidth <= 780;
    a.textContent = narrow ? (state.auto ? '자동 켬' : '자동 끔') : (state.auto ? '자동 진행 켬' : '자동 진행 끔');
    a.classList.toggle('on', state.auto);
    s.textContent = narrow ? (state.fast ? '빠름' : '보통') : (state.fast ? '속도 빠름' : '속도 보통');
    s.classList.toggle('on', state.fast);
    h.textContent = state.hint ? '힌트 켬' : '힌트 끔';
    h.classList.toggle('on', state.hint);
    $('btnLevel').textContent = (narrow ? '' : '난이도 ') + LEVELS[state.level].label;
  }

  function applyLevel(key) {
    if (G().inHand) SutdaGame.abort();
    state.level = key;
    var lv = LEVELS[key];
    setupLevel(lv);
    state.potShown = 0; state.potChipKey = -1; state.highlight = {}; state.eqKey = null;
    stopTurnTimer();
    showActionButtons(false);
    $('btnRebuy').style.display = 'none';
    $('btnStart').style.display = 'inline-block';
    $('btnStart').textContent = '판 시작';
    $('resultBanner').className = 'result-banner';
    $('actionHint').textContent = lv.label + ' 시작 — 판 시작을 누르세요';
    addLog('난이도 ' + lv.label + ' — 판돈 ' + fmt(lv.ante) + ', 시작 돈 ' + fmt(lv.chips), 'sys');
    save(); paintToggles(); render();
  }

  function renderLevelList() {
    var html = '';
    ['easy', 'normal', 'hard'].forEach(function (k) {
      var lv = LEVELS[k];
      html += '<button class="level-item' + (state.level === k ? ' current' : '') + '" data-level="' + k + '">' +
        '<div class="lv-title">' + lv.label + (state.level === k ? ' <span class="lv-now">선택됨</span>' : '') + '</div>' +
        '<div class="lv-desc">' + lv.desc + '</div>' +
        '<div class="lv-meta">판돈 ' + fmt(lv.ante) + ' · 기본 베팅 ' + fmt(lv.base) + '</div>' +
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

  /* ---------- 초기화 ---------- */
  function init() {
    var title = CARDS === 3 ? '세 장 섯다' : '두 장 섯다';
    document.title = title + ' - 혼자 즐기기';
    $('titleText').textContent = title;
    $('feltLogo').textContent = CARDS === 3 ? '세 장' : '섯 다';
    $('rulesTitle').textContent = title + ' 규칙';
    $('rulesFlow').innerHTML = CARDS === 3
      ? '<li><b>진행</b> — 판돈을 내고 두 장을 받습니다. 첫 베팅이 끝나면 한 장을 더 받아 모두 석 장이 됩니다.</li>' +
        '<li><b>승부</b> — 석 장 가운데 가장 센 두 장이 자동으로 뽑혀 겨룹니다.</li>' +
        '<li><b>베팅</b> — 첫 장을 받은 뒤와 마지막 장을 받은 뒤, 두 번 베팅합니다.</li>'
      : '<li><b>진행</b> — 판돈을 내고 한 장을 받습니다. 첫 베팅이 끝나면 한 장을 더 받아 두 장이 됩니다.</li>' +
        '<li><b>승부</b> — 두 장으로 만든 족보로 겨룹니다.</li>' +
        '<li><b>베팅</b> — 첫 장을 받은 뒤와 마지막 장을 받은 뒤, 두 번 베팅합니다.</li>';

    var saved = load();
    if (saved && saved.level && LEVELS[saved.level]) state.level = saved.level;
    setupLevel(LEVELS[state.level]);

    if (saved && typeof saved.chips === 'number') {
      var me = SutdaGame.human();
      me.chips = saved.chips > 0 ? saved.chips : LEVELS[state.level].chips;
      G().handNo = saved.handNo || 0;
      if (saved.stats) for (var k in stats) if (saved.stats[k] !== undefined) stats[k] = saved.stats[k];
      state.auto = !!saved.auto;
      state.fast = !!saved.fast;
      if (saved.hint !== undefined) state.hint = !!saved.hint;
      state.sliderOpen = !!saved.sliderOpen;
    }
    SutdaGame.setSpeed(state.fast ? 0.45 : 1);
    $('btnTune').classList.toggle('on', state.sliderOpen);
    renderLevelList();

    SutdaGame.setHooks({
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
        banner.innerHTML = '<div class="rtitle">패 공개</div><div class="rline">더 걸 사람이 없습니다</div>';
        beep(520, 0.18, 0.06);
        flashScreen('rgba(217,43,58,.45)');
        setTimeout(function () {
          if (banner.classList.contains('allin')) banner.className = 'result-banner';
        }, 1800);
      },
      onActorChange: function (p) { state.activeId = p.id; }
    });

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
      SutdaGame.human().chips = refill;
      addLog('다시 채우기 — ' + fmt(refill), 'sys');
      save(); render();
      $('btnRebuy').style.display = 'none';
      $('btnStart').style.display = 'inline-block';
    };

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

    Array.prototype.forEach.call(document.querySelectorAll('.preset[data-preset]'), function (b) {
      b.onclick = function () {
        if (this.disabled) return;
        var target = presetTarget(this.dataset.preset, state.legal);
        if (target === null) return;
        doHumanAct('raise', target);
      };
    });

    $('btnAuto').onclick = function () {
      state.auto = !state.auto;
      paintToggles(); save();
      if (state.auto && !G().inHand && $('btnStart').style.display !== 'none') startHand();
    };
    $('btnSpeed').onclick = function () {
      state.fast = !state.fast;
      SutdaGame.setSpeed(state.fast ? 0.45 : 1);
      paintToggles(); save();
    };
    $('btnHint').onclick = function () {
      state.hint = !state.hint;
      paintToggles(); save(); render();
    };
    $('btnSound').onclick = function () {
      state.soundOn = !state.soundOn;
      this.textContent = state.soundOn ? '🔊' : '🔇';
    };
    window.addEventListener('resize', paintToggles);
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
      save(); renderStats();
    };

    $('btnRules').onclick = function () { openModal('rulesModal'); };
    $('btnCloseRules').onclick = function () { closeModal('rulesModal'); };
    $('rulesModal').onclick = function (e) { if (e.target === this) closeModal('rulesModal'); };

    $('btnReset').onclick = function () {
      if (!confirm('가진 돈과 기록을 모두 초기화합니다. 진행할까요?')) return;
      SutdaGame.abort();
      try { localStorage.removeItem(STORE_KEY); } catch (e) {}
      location.reload();
    };

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
        var keys = ['min', 'quarter', 'half', 'pot', 'allin'];
        var target = presetTarget(keys[parseInt(e.key, 10) - 1], state.legal);
        if (target !== null) doHumanAct('raise', target);
      }
    });

    showActionButtons(false);
    $('btnRebuy').style.display = 'none';
    render();
    addLog('준비 완료. 판 시작을 누르세요.', 'sys');
    if (!saved) openModal('rulesModal');
  }

  window.addEventListener('DOMContentLoaded', init);
})();
