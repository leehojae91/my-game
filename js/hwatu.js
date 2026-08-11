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

  /* 카드 한 장 마크업 - 그림은 SVG로 그린다 */
  function cardHtml(c, extraCls, attrs) {
    var info = MONTH[c.m];
    var kind = c.k === '광' ? 'gwang' : 'pi';
    return '<div class="hwa ' + info.color + (c.k === '광' ? ' gwang' : '') +
      (extraCls ? ' ' + extraCls : '') + '"' + (attrs || '') + '>' +
      HwatuArt.svgFor(c.m, kind, null) +
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
