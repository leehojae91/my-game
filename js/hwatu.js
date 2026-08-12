/* 화투 - 섯다용 스무 장 (한 달에 두 장씩) */
(function (global) {
  'use strict';

  /* 달마다 부르는 이름과 색 */
  var MONTH = {
    1:  { name: '솔', color: 'g1' },
    2:  { name: '매', color: 'g2' },
    3:  { name: '벚', color: 'g3' },
    4:  { name: '흑', color: 'g4' },
    5:  { name: '난', color: 'g5' },
    6:  { name: '모', color: 'g6' },
    7:  { name: '홍', color: 'g7' },
    8:  { name: '공', color: 'g8' },
    9:  { name: '국', color: 'g9' },
    10: { name: '단', color: 'g10' }
  };

  /* 광이 있는 달 */
  var GWANG_MONTHS = [1, 3, 8];

  var NUM_KO = ['', '한', '두', '석', '넉', '다섯', '여섯', '일곱', '여덟', '아홉', '열'];

  function createDeck() {
    var deck = [];
    for (var m = 1; m <= 10; m++) {
      var hasGwang = GWANG_MONTHS.indexOf(m) >= 0;
      deck.push({ m: m, k: hasGwang ? '광' : '피', i: 0 });
      deck.push({ m: m, k: '피', i: 1 });
    }
    return deck;
  }

  function shuffle(deck, count) {
    var n = deck.length;
    var limit = (typeof count === 'number') ? Math.min(count, n - 1) : n - 1;
    for (var i = 0; i < limit; i++) {
      var j = i + Math.floor(Math.random() * (n - i));
      var t = deck[i]; deck[i] = deck[j]; deck[j] = t;
    }
    return deck;
  }

  function isGwang(c) { return c.k === '광'; }

  function label(c) { return c.m + MONTH[c.m].name + (c.k === '광' ? '광' : ''); }

  function key(c) { return c.m + '-' + c.i; }

  /* 각 달의 두 장(i=0,1)을 실제 화투 그림 파일에 대응시킨다.
     광이 있는 달(1·3·8)은 i0이 광, 나머지는 열끗/띠 그림을 쓴다. */
  var IMG = {
    1:  ['01-g', '01-t'], 2:  ['02-a', '02-t'], 3:  ['03-g', '03-t'],
    4:  ['04-a', '04-t'], 5:  ['05-a', '05-t'], 6:  ['06-a', '06-t'],
    7:  ['07-a', '07-t'], 8:  ['08-g', '08-a'], 9:  ['09-a', '09-t'],
    10: ['10-a', '10-t']
  };

  function imgKey(c) {
    var pair = IMG[c.m] || IMG[1];
    return pair[c.i] || pair[0];
  }

  /* 카드 한 장 마크업 - 실제 화투 이미지 한 장으로 채운다 */
  function cardHtml(c, extraCls, attrs) {
    var info = MONTH[c.m];
    return '<div class="hwa ' + info.color + (c.k === '광' ? ' gwang' : '') +
      (extraCls ? ' ' + extraCls : '') + '"' + (attrs || '') + '>' +
      '<img class="hface" src="assets/hwatu/' + imgKey(c) + '.svg" alt="' +
        label(c) + '" draggable="false">' +
      '<span class="hm">' + c.m + '</span>' +
      '<span class="hk">' + (c.k === '광' ? '광' : info.name) + '</span>' +
      '</div>';
  }

  function backHtml(extraCls, attrs) {
    return '<div class="hwa back' + (extraCls ? ' ' + extraCls : '') + '"' + (attrs || '') + '>' +
      HwatuArt.backSvg() + '</div>';
  }

  global.Hwatu = {
    MONTH: MONTH,
    GWANG_MONTHS: GWANG_MONTHS,
    createDeck: createDeck,
    shuffle: shuffle,
    isGwang: isGwang,
    label: label,
    key: key,
    cardHtml: cardHtml,
    backHtml: backHtml
  };
})(window);
