/* 섯다 족보 판정 - 점수가 높을수록 센 패 */
(function (global) {
  'use strict';

  /*
    113 삼팔광땡 · 112 일삼광땡 · 111 일팔광땡
    110 장땡 ~ 101 한땡
     96 알리 · 95 독사 · 94 구삥 · 93 장삥 · 92 장사 · 91 세륙
     89 갑오 ~ 81 한끗 · 80 망통
  */

  var GWANG_PAIRS = {
    '3-8': { score: 113, name: '삼팔광땡' },
    '1-3': { score: 112, name: '일삼광땡' },
    '1-8': { score: 111, name: '일팔광땡' }
  };

  var SPECIAL = {
    '1-2': { score: 96, name: '알리' },
    '1-4': { score: 95, name: '독사' },
    '1-9': { score: 94, name: '구삥' },
    '1-10': { score: 93, name: '장삥' },
    '4-10': { score: 92, name: '장사' },
    '4-6': { score: 91, name: '세륙' }
  };

  var KKUT_NAME = ['망통', '한끗', '두끗', '석끗', '넉끗', '다섯끗', '여섯끗', '일곱끗', '여덟끗', '갑오'];
  var DDAENG_NAME = ['', '한땡', '두땡', '석땡', '넉땡', '다섯땡', '여섯땡', '일곱땡', '여덟땡', '아홉땡', '장땡'];

  function pairKey(a, b) {
    var lo = Math.min(a, b), hi = Math.max(a, b);
    return lo + '-' + hi;
  }

  /**
   * 두 장으로 만든 패
   * @returns {{score:number, name:string, special:string|null, cards:Array}}
   */
  function evaluatePair(c1, c2) {
    var m1 = c1.m, m2 = c2.m;
    var key = pairKey(m1, m2);

    /* 광땡 - 두 장 모두 광이어야 한다 */
    if (Hwatu.isGwang(c1) && Hwatu.isGwang(c2) && GWANG_PAIRS[key]) {
      var g = GWANG_PAIRS[key];
      return { score: g.score, name: g.name, special: null, cards: [c1, c2] };
    }

    /* 땡 */
    if (m1 === m2) {
      return {
        score: 100 + m1, name: DDAENG_NAME[m1],
        special: null, cards: [c1, c2]
      };
    }

    /* 특수 조합 (암행어사 · 땡잡이 · 구사는 따로 표시한다) */
    var special = null;
    if (key === '4-7') special = 'amhaeng';   // 암행어사
    else if (key === '3-7') special = 'jabi'; // 땡잡이
    else if (key === '4-9') special = 'gusa'; // 멍텅구리 구사

    if (SPECIAL[key]) {
      var s = SPECIAL[key];
      return { score: s.score, name: s.name, special: special, cards: [c1, c2] };
    }

    /* 끗 */
    var k = (m1 + m2) % 10;
    return { score: 80 + k, name: KKUT_NAME[k], special: special, cards: [c1, c2] };
  }

  /* 석 장에서 가장 센 두 장을 고른다 */
  function bestOfThree(cards) {
    var best = null;
    var pairs = [[0, 1], [0, 2], [1, 2]];
    pairs.forEach(function (ix) {
      var ev = evaluatePair(cards[ix[0]], cards[ix[1]]);
      ev.usedIndex = ix;
      if (!best || ev.score > best.score) best = ev;
    });
    return best;
  }

  function evaluate(cards) {
    if (cards.length >= 3) return bestOfThree(cards);
    if (cards.length === 2) return evaluatePair(cards[0], cards[1]);
    return { score: -1, name: '-', special: null, cards: cards.slice() };
  }

  function isGwangDdaeng(ev) { return ev.score >= 111; }
  function isDdaeng(ev) { return ev.score >= 101 && ev.score <= 110; }

  /**
   * 특수패까지 따진 승부.
   * 암행어사는 상대의 광땡을, 땡잡이는 상대의 땡을 잡는다.
   * @returns 양수면 a 승, 음수면 b 승, 0이면 비김
   */
  function compare(a, b) {
    /* 암행어사: 일삼광땡과 일팔광땡을 잡는다 (삼팔광땡은 못 잡는다) */
    if (a.special === 'amhaeng' && (b.score === 112 || b.score === 111)) return 1;
    if (b.special === 'amhaeng' && (a.score === 112 || a.score === 111)) return -1;

    /* 땡잡이: 상대의 땡을 잡는다 (장땡은 못 잡는다) */
    if (a.special === 'jabi' && isDdaeng(b) && b.score !== 110) return 1;
    if (b.special === 'jabi' && isDdaeng(a) && a.score !== 110) return -1;

    return a.score - b.score;
  }

  /* 특수패 설명 (화면에 알려 준다) */
  function specialNote(ev) {
    if (ev.special === 'amhaeng') return '암행어사 — 상대의 일삼·일팔광땡을 잡습니다';
    if (ev.special === 'jabi') return '땡잡이 — 상대의 땡을 잡습니다 (장땡 제외)';
    if (ev.special === 'gusa') return '멍텅구리 구사';
    return '';
  }

  global.SutdaEval = {
    evaluate: evaluate,
    evaluatePair: evaluatePair,
    bestOfThree: bestOfThree,
    compare: compare,
    isGwangDdaeng: isGwangDdaeng,
    isDdaeng: isDdaeng,
    specialNote: specialNote
  };
})(window);
