/* 맞고 화면 */
(function () {
  'use strict';

  var STORE_KEY = 'gostop.v1';

  var LEVELS = {
    easy:   { key: 'easy', label: '초급', unit: 500, chips: 100000, skill: 0.5, persona: 'loose',
              desc: '한 점에 500원. 상대가 자주 헛발질합니다.' },
    normal: { key: 'normal', label: '중급', unit: 1000, chips: 100000, skill: 0.8, persona: 'calm',
              desc: '한 점에 1,000원. 기본 난이도입니다.' },
    hard:   { key: 'hard', label: '고급', unit: 2000, chips: 100000, skill: 1, persona: 'aggro',
              desc: '한 점에 2,000원. 상대가 내 패를 읽고 광을 챙깁니다.' }
  };

  var $ = function (id) { return document.getElementById(id); };
  var fmt = function (n) { return (n || 0).toLocaleString('ko-KR'); };
  var G = function () { return GoGame.data; };

  var state = {
    soundOn: true, fast: false, level: 'normal',
    myTurn: false, lockUntil: 0, chipsAtStart: 0
  };
  var stats = { hands: 0, wins: 0, draws: 0, net: 0, bestScore: 0, gos: 0 };

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
      var me = GoGame.human();
      localStorage.setItem(STORE_KEY, JSON.stringify({
        chips: me ? me.chips : LEVELS[state.level].chips,
        handNo: G().handNo, stats: stats,
        fast: state.fast, level: state.level
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
    while (ul.children.length > 160) ul.removeChild(ul.firstChild);
    ul.scrollTop = ul.scrollHeight;
  }

  /* ---------- 그리기 ---------- */

  /* 획득 카드를 종류별로 묶어 보여 준다 */
  function captureHtml(cards) {
    var groups = [
      { key: '광', label: '광', list: [] },
      { key: '열', label: '열끗', list: [] },
      { key: '띠', label: '띠', list: [] },
      { key: '피', label: '피', list: [] }
    ];
    cards.forEach(function (c) {
      groups.forEach(function (g) { if (g.key === c.t) g.list.push(c); });
    });
    return groups.map(function (g) {
      if (!g.list.length) return '';
      var count = g.key === '피' ? GoScore.piCount(g.list) : g.list.length;
      return '<div class="cap-group">' +
        '<span class="cap-label">' + g.label + ' <b>' + count + '</b></span>' +
        '<div class="cap-cards">' +
          g.list.map(function (c) { return GoCards.cardHtml(c, 'tiny'); }).join('') +
        '</div></div>';
    }).join('');
  }

  function scoreLineHtml(sc) {
    var parts = sc.parts.map(function (p) {
      return '<span class="sp">' + p.name + ' <b>' + p.point + '</b></span>';
    }).join('');
    return '<span class="total ' + (sc.total >= 3 ? 'on' : '') + '">' + sc.total + '점</span>' + parts;
  }

  function render() {
    var g = G();
    var me = GoGame.human();
    var opp = GoGame.other(me);

    $('oppName').textContent = opp.name;
    $('oppAvatar').textContent = opp.name.charAt(0);
    $('oppChips').textContent = fmt(opp.chips);
    $('meChips').textContent = fmt(me.chips);
    $('myChips').textContent = fmt(me.chips);
    $('unitInfo').textContent = fmt(g.unit);
    $('handNo').textContent = g.handNo;

    var oppSc = GoScore.score(opp.captured);
    var meSc = GoScore.score(me.captured);
    $('oppScore').innerHTML = scoreLineHtml(oppSc) +
      (opp.goCount ? '<span class="gocnt">' + opp.goCount + '고</span>' : '');
    $('meScore').innerHTML = scoreLineHtml(meSc) +
      (me.goCount ? '<span class="gocnt">' + me.goCount + '고</span>' : '');

    $('oppCapture').innerHTML = captureHtml(opp.captured);
    $('meCapture').innerHTML = captureHtml(me.captured);

    $('oppHand').innerHTML = opp.hand.map(function () {
      return GoCards.backHtml('mini');
    }).join('');

    $('floor').innerHTML = g.floor.map(function (c) {
      var hot = g.bbeokMonths[c.m] !== undefined ? ' bbeok' : '';
      var match = state.myTurn && me.hand.some(function (h) { return h.m === c.m; }) ? ' matchable' : '';
      return GoCards.cardHtml(c, 'floor-card' + hot + match);
    }).join('');

    $('deckCount').textContent = g.deck.length;
    $('deckPile').innerHTML = g.deck.length ? GoCards.backHtml('') : '';

    $('myHand').innerHTML = me.hand.map(function (c) {
      var canMatch = g.floor.some(function (f) { return f.m === c.m; });
      return GoCards.cardHtml(c, 'hand-card' + (canMatch ? ' can-match' : '') +
        (state.myTurn ? ' playable' : ''));
    }).join('');
    $('handLabel').textContent = state.myTurn ? '내 패 — 낼 카드를 고르세요' : '내 패';

    /* 손패 클릭 연결 */
    if (state.myTurn) {
      Array.prototype.forEach.call($('myHand').querySelectorAll('.hand-card'), function (el) {
        el.onclick = function () {
          if (Date.now() < state.lockUntil) return;
          var id = parseInt(this.dataset.id, 10);
          var card = null;
          me.hand.forEach(function (c) { if (c.id === id) card = c; });
          if (!card) return;
          state.lockUntil = Date.now() + 350;
          state.myTurn = false;
          $('handLabel').textContent = '내 패';
          beep(660, 0.06, 0.04);
          GoGame.humanPlay(card);
        };
      });
    }
  }

  /* 방금 낸 카드와 뒤집은 카드를 잠깐 보여 준다 */
  function showFlip(played, flipped) {
    var slot = $('flipSlot');
    if (!played && !flipped) { slot.innerHTML = ''; return; }
    var html = '';
    if (played) {
      html += '<div class="flip-one"><div class="flip-label">낸 패</div>' +
              GoCards.cardHtml(played, 'flip-card') + '</div>';
    }
    if (flipped) {
      html += '<div class="flip-one"><div class="flip-label">뒤집기</div>' +
              GoCards.cardHtml(flipped, 'flip-card') + '</div>';
    }
    slot.innerHTML = html;
    if (slot._timer) clearTimeout(slot._timer);
    slot._timer = setTimeout(function () { slot.innerHTML = ''; }, 1500);
  }

  function popEvent(name) {
    var pop = $('eventPop');
    pop.textContent = name;
    pop.className = 'event-pop show';
    beep(name === '뻑' ? 260 : 980, 0.16, 0.06);
    setTimeout(function () { pop.className = 'event-pop'; }, 1100);
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

  /* ---------- 진행 ---------- */

  function startHand() {
    var me = GoGame.human();
    if (me.chips < G().unit * 3) {
      $('actionHint').textContent = '돈이 부족합니다. 다시 채우세요.';
      $('btnStart').style.display = 'none';
      $('btnRebuy').style.display = 'inline-block';
      return;
    }
    if (GoGame.other(me).chips < G().unit * 3) {
      GoGame.other(me).chips = LEVELS[state.level].chips;
      addLog(GoGame.other(me).name + ' 돈 보충', 'sys');
    }
    $('btnStart').style.display = 'none';
    $('btnRebuy').style.display = 'none';
    $('resultBanner').className = 'result-banner';
    $('resultBanner').innerHTML = '';
    state.chipsAtStart = me.chips;
    $('actionHint').textContent = '';
    beep(660, 0.06, 0.04);
    GoGame.play();
  }

  function onHumanTurn() {
    state.myTurn = true;
    state.lockUntil = Date.now() + 200;
    $('actionHint').textContent = '낼 카드를 고르세요';
    render();
  }

  function onGoChoice(p, sc) {
    $('goTitle').textContent = sc.total + '점! 고 하시겠습니까?';
    $('goScoreDetail').innerHTML = scoreLineHtml(sc) +
      '<div class="go-note">고를 부르면 점수가 커지지만, 상대가 먼저 나면 크게 잃습니다.</div>';
    $('goModal').classList.add('open');
  }

  function onHandEnd(result) {
    state.myTurn = false;
    var me = GoGame.human();
    stats.hands++;
    stats.net += me.chips - state.chipsAtStart;
    if (result.draw) stats.draws++;
    else if (result.winner === me) {
      stats.wins++;
      if (result.fs.total > stats.bestScore) stats.bestScore = result.fs.total;
    }
    stats.gos = me.stat.gos;

    var banner = $('resultBanner');
    if (result.draw) {
      banner.className = 'result-banner show lose';
      banner.innerHTML = '<div class="rtitle">나가리</div><div class="rline">양쪽 다 손패를 다 썼습니다</div>';
      beep(300, 0.2, 0.05);
    } else {
      var iWon = result.winner === me;
      banner.className = 'result-banner show ' + (iWon ? 'win' : 'lose');
      var flags = result.fs.flags.length ? '<div class="rline">' + result.fs.flags.join(' · ') + '</div>' : '';
      banner.innerHTML =
        '<div class="rtitle">' + (iWon ? '<span class="crown">✦</span> 승리' : '패배') + '</div>' +
        '<div class="rline">' + result.winner.name + ' ' + result.fs.base + '점' +
          (result.fs.mult > 1 ? ' × ' + result.fs.mult : '') +
          ' = <b>' + result.fs.total + '점</b></div>' +
        flags +
        '<div class="rline">' + fmt(result.amount) + ' 이동</div>';
      beep(iWon ? 1046 : 300, 0.25, 0.06);
      if (iWon) {
        setTimeout(function () { beep(1318, 0.25, 0.05); }, 130);
        burstCoins(result.fs.total >= 7 ? 44 : 22);
      }
    }

    save();
    render();
    $('btnStart').style.display = 'inline-block';
    $('btnStart').textContent = '다음 판';
    $('actionHint').textContent = '다음 판을 시작하세요';
    if (me.chips < G().unit * 3) {
      $('btnStart').style.display = 'none';
      $('btnRebuy').style.display = 'inline-block';
      $('actionHint').textContent = '돈이 다 떨어졌습니다.';
    }
  }

  /* ---------- 난이도 · 전적 ---------- */

  function setupLevel(lv) {
    var base = AI.PERSONAS.filter(function (p) { return p.key === lv.persona; })[0] || AI.PERSONAS[0];
    GoGame.setup([
      { name: '나', isHuman: true },
      { name: '박달재', persona: {
        key: base.key, label: base.label, aggr: base.aggr,
        tight: base.tight, bluff: base.bluff, skill: lv.skill
      } }
    ], { unit: lv.unit, startChips: lv.chips });
    GoGame.setSpeed(state.fast ? 0.45 : 1);
  }

  function applyLevel(key) {
    if (G().inHand) GoGame.abort();
    state.level = key;
    var lv = LEVELS[key];
    setupLevel(lv);
    $('btnRebuy').style.display = 'none';
    $('btnStart').style.display = 'inline-block';
    $('btnStart').textContent = '판 시작';
    $('resultBanner').className = 'result-banner';
    $('actionHint').textContent = lv.label + ' 시작 — 판 시작을 누르세요';
    addLog('난이도 ' + lv.label + ' — 한 점 ' + fmt(lv.unit), 'sys');
    save(); paintToggles(); render();
  }

  function renderLevelList() {
    var html = '';
    ['easy', 'normal', 'hard'].forEach(function (k) {
      var lv = LEVELS[k];
      html += '<button class="level-item' + (state.level === k ? ' current' : '') + '" data-level="' + k + '">' +
        '<div class="lv-title">' + lv.label + (state.level === k ? ' <span class="lv-now">선택됨</span>' : '') + '</div>' +
        '<div class="lv-desc">' + lv.desc + '</div></button>';
    });
    $('levelList').innerHTML = html;
    Array.prototype.forEach.call($('levelList').querySelectorAll('.level-item'), function (b) {
      b.onclick = function () {
        var k = this.dataset.level;
        if (k !== state.level) applyLevel(k);
        $('levelModal').classList.remove('open');
        renderLevelList();
      };
    });
  }

  function renderStats() {
    var winRate = stats.hands ? Math.round(stats.wins / stats.hands * 100) : 0;
    var netClass = stats.net > 0 ? 'up' : (stats.net < 0 ? 'down' : '');
    var rows = [
      ['참가한 판', fmt(stats.hands) + '판'],
      ['이긴 판', fmt(stats.wins) + '판 (' + winRate + '%)'],
      ['나가리', fmt(stats.draws) + '판'],
      ['최고 점수', stats.bestScore + '점'],
      ['고 부른 횟수', fmt(stats.gos) + '회'],
      ['누적 손익', (stats.net >= 0 ? '+' : '') + fmt(stats.net), netClass]
    ];
    $('statGrid').innerHTML = rows.map(function (r) {
      return '<div class="stat-k">' + r[0] + '</div><div class="stat-v ' + (r[2] || '') + '">' + r[1] + '</div>';
    }).join('');
  }

  function paintToggles() {
    var s = $('btnSpeed');
    s.textContent = state.fast ? '속도 빠름' : '속도 보통';
    s.classList.toggle('on', state.fast);
    $('btnLevel').textContent = (window.innerWidth <= 780 ? '' : '난이도 ') + LEVELS[state.level].label;
  }

  /* ---------- 초기화 ---------- */
  function init() {
    var saved = load();
    if (saved && saved.level && LEVELS[saved.level]) state.level = saved.level;
    if (saved) state.fast = !!saved.fast;
    setupLevel(LEVELS[state.level]);

    if (saved && typeof saved.chips === 'number') {
      var me = GoGame.human();
      me.chips = saved.chips > 0 ? saved.chips : LEVELS[state.level].chips;
      G().handNo = saved.handNo || 0;
      if (saved.stats) for (var k in stats) if (saved.stats[k] !== undefined) stats[k] = saved.stats[k];
    }
    GoGame.setSpeed(state.fast ? 0.45 : 1);
    renderLevelList();

    GoGame.setHooks({
      onUpdate: render,
      onLog: addLog,
      onHumanTurn: onHumanTurn,
      onGoChoice: onGoChoice,
      onHandEnd: onHandEnd,
      onPlay: function (p, res) { showFlip(res.card, res.flip); },
      onEvent: function (name) {
        if (['쪽', '뻑', '따닥', '싹쓸이', '뻑 먹기', '고'].indexOf(name) >= 0) popEvent(name);
      },
      onActorChange: function () { state.myTurn = false; }
    });

    $('btnStart').onclick = startHand;
    $('btnGo').onclick = function () { GoGame.humanGo(true); };
    $('btnStop').onclick = function () { GoGame.humanGo(false); };
    $('btnGoYes').onclick = function () {
      $('goModal').classList.remove('open');
      GoGame.humanGo(true);
    };
    $('btnGoNo').onclick = function () {
      $('goModal').classList.remove('open');
      GoGame.humanGo(false);
    };

    $('btnRebuy').onclick = function () {
      GoGame.human().chips = LEVELS[state.level].chips;
      addLog('다시 채우기', 'sys');
      save(); render();
      $('btnRebuy').style.display = 'none';
      $('btnStart').style.display = 'inline-block';
    };

    $('btnSpeed').onclick = function () {
      state.fast = !state.fast;
      GoGame.setSpeed(state.fast ? 0.45 : 1);
      paintToggles(); save();
    };
    $('btnSound').onclick = function () {
      state.soundOn = !state.soundOn;
      this.textContent = state.soundOn ? '🔊' : '🔇';
    };
    window.addEventListener('resize', paintToggles);

    $('btnLevel').onclick = function () { renderLevelList(); $('levelModal').classList.add('open'); };
    $('btnCloseLevel').onclick = function () { $('levelModal').classList.remove('open'); };
    $('levelModal').onclick = function (e) { if (e.target === this) this.classList.remove('open'); };

    $('btnStats').onclick = function () { renderStats(); $('statsModal').classList.add('open'); };
    $('btnCloseStats').onclick = function () { $('statsModal').classList.remove('open'); };
    $('statsModal').onclick = function (e) { if (e.target === this) this.classList.remove('open'); };
    $('btnStatsClear').onclick = function () {
      stats.hands = 0; stats.wins = 0; stats.draws = 0;
      stats.net = 0; stats.bestScore = 0; stats.gos = 0;
      save(); renderStats();
    };

    $('btnRules').onclick = function () { $('rulesModal').classList.add('open'); };
    $('btnCloseRules').onclick = function () { $('rulesModal').classList.remove('open'); };
    $('rulesModal').onclick = function (e) { if (e.target === this) this.classList.remove('open'); };

    $('btnReset').onclick = function () {
      if (!confirm('가진 돈과 기록을 모두 초기화합니다. 진행할까요?')) return;
      GoGame.abort();
      try { localStorage.removeItem(STORE_KEY); } catch (e) {}
      location.reload();
    };

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        ['statsModal', 'rulesModal', 'levelModal'].forEach(function (id) {
          $(id).classList.remove('open');
        });
        return;
      }
      if (e.key === 'Enter' && $('btnStart').style.display !== 'none') startHand();
      if ($('goModal').classList.contains('open')) {
        if (e.key === 'g' || e.key === 'G') $('btnGoYes').click();
        if (e.key === 's' || e.key === 'S') $('btnGoNo').click();
      }
    });

    $('btnGo').style.display = 'none';
    $('btnStop').style.display = 'none';
    $('btnRebuy').style.display = 'none';
    paintToggles();
    render();
    addLog('준비 완료. 판 시작을 누르세요.', 'sys');
    if (!saved) $('rulesModal').classList.add('open');
  }

  window.addEventListener('DOMContentLoaded', init);
})();
