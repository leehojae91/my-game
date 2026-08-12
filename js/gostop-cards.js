/* 맞고용 화투 마흔여덟 장 */
(function (global) {
  'use strict';

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
    10: { name: '단', color: 'g10' },
    11: { name: '오', color: 'g11' },
    12: { name: '비', color: 'g12' }
  };

  /*
    t: 광 · 열 · 띠 · 피
    sub: 홍단 · 청단 · 초단 · 고도리 · 쌍피 · 비광
  */
  var TABLE = [
    { m: 1,  t: '광', sub: null },      { m: 1,  t: '띠', sub: '홍단' }, { m: 1,  t: '피' }, { m: 1,  t: '피' },
    { m: 2,  t: '열', sub: '고도리' },  { m: 2,  t: '띠', sub: '홍단' }, { m: 2,  t: '피' }, { m: 2,  t: '피' },
    { m: 3,  t: '광', sub: null },      { m: 3,  t: '띠', sub: '홍단' }, { m: 3,  t: '피' }, { m: 3,  t: '피' },
    { m: 4,  t: '열', sub: '고도리' },  { m: 4,  t: '띠', sub: '초단' }, { m: 4,  t: '피' }, { m: 4,  t: '피' },
    { m: 5,  t: '열', sub: null },      { m: 5,  t: '띠', sub: '초단' }, { m: 5,  t: '피' }, { m: 5,  t: '피' },
    { m: 6,  t: '열', sub: null },      { m: 6,  t: '띠', sub: '청단' }, { m: 6,  t: '피' }, { m: 6,  t: '피' },
    { m: 7,  t: '열', sub: null },      { m: 7,  t: '띠', sub: '초단' }, { m: 7,  t: '피' }, { m: 7,  t: '피' },
    { m: 8,  t: '광', sub: null },      { m: 8,  t: '열', sub: '고도리' }, { m: 8, t: '피' }, { m: 8, t: '피' },
    { m: 9,  t: '열', sub: null },      { m: 9,  t: '띠', sub: '청단' }, { m: 9,  t: '피' }, { m: 9,  t: '피' },
    { m: 10, t: '열', sub: null },      { m: 10, t: '띠', sub: '청단' }, { m: 10, t: '피' }, { m: 10, t: '피' },
    { m: 11, t: '광', sub: null },      { m: 11, t: '피', sub: '쌍피' }, { m: 11, t: '피' }, { m: 11, t: '피' },
    { m: 12, t: '광', sub: '비광' },    { m: 12, t: '열', sub: null },   { m: 12, t: '띠', sub: null }, { m: 12, t: '피', sub: '쌍피' }
  ];

  function createDeck() {
    return TABLE.map(function (c, i) {
      return { m: c.m, t: c.t, sub: c.sub || null, id: i };
    });
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

  /* 피로 셀 때의 값 (쌍피는 두 장) */
  function piValue(c) {
    if (c.t !== '피') return 0;
    return c.sub === '쌍피' ? 2 : 1;
  }

  function label(c) {
    var s = c.m + MONTH[c.m].name;
    if (c.t === '광') return s + '광';
    if (c.sub === '쌍피') return s + '쌍피';
    if (c.t === '띠') return s + (c.sub || '띠');
    if (c.t === '열') return s + '열끗';
    return s + '피';
  }

  /* 종류별 짧은 표시 */
  function kindMark(c) {
    if (c.t === '광') return '광';
    if (c.t === '열') return c.sub === '고도리' ? '조' : '열';
    if (c.t === '띠') return c.sub === '홍단' ? '홍' : (c.sub === '청단' ? '청' : (c.sub === '초단' ? '초' : '띠'));
    return c.sub === '쌍피' ? '쌍' : '피';
  }

  /* 실제 화투 그림 파일 - TABLE 순서(=카드 id)와 1:1 대응하는 48장 */
  var IMG = [
    '01-g', '01-t', '01-p1', '01-p2',   /* 1월 솔  */
    '02-a', '02-t', '02-p1', '02-p2',   /* 2월 매  */
    '03-g', '03-t', '03-p1', '03-p2',   /* 3월 벚  */
    '04-a', '04-t', '04-p1', '04-p2',   /* 4월 흑  */
    '05-a', '05-t', '05-p1', '05-p2',   /* 5월 난  */
    '06-a', '06-t', '06-p1', '06-p2',   /* 6월 모  */
    '07-a', '07-t', '07-p1', '07-p2',   /* 7월 홍  */
    '08-g', '08-a', '08-p1', '08-p2',   /* 8월 공  */
    '09-a', '09-t', '09-p1', '09-p2',   /* 9월 국  */
    '10-a', '10-t', '10-p1', '10-p2',   /* 10월 단 */
    '11-g', '11-p3', '11-p1', '11-p2',  /* 11월 오 (쌍피=p3) */
    '12-g', '12-a', '12-t', '12-p1'     /* 12월 비 (쌍피=p1) */
  ];

  function imgKey(c) {
    return (typeof c.id === 'number' && IMG[c.id]) ? IMG[c.id] : null;
  }

  function cardHtml(c, extraCls, attrs) {
    var info = MONTH[c.m];
    var tc = typeClass(c);
    var key = imgKey(c);
    var art = key
      ? '<img class="gface" src="assets/hwatu/' + key + '.svg" alt="' + label(c) + '" draggable="false">'
      : HwatuArt.svgFor(c.m, (tc === 'ssang') ? 'pi' : tc, c.sub);
    return '<div class="go ' + info.color + ' t-' + tc +
      (extraCls ? ' ' + extraCls : '') + '"' + (attrs || '') + ' data-id="' + c.id + '">' +
      art +
      '<span class="gm">' + c.m + '</span>' +
      '<span class="gk">' + kindMark(c) + '</span>' +
      '</div>';
  }

  function typeClass(c) {
    if (c.t === '광') return 'gwang';
    if (c.t === '열') return 'yeol';
    if (c.t === '띠') return 'tti';
    return c.sub === '쌍피' ? 'ssang' : 'pi';
  }

  function backHtml(extraCls) {
    return '<div class="go back' + (extraCls ? ' ' + extraCls : '') + '">' +
      HwatuArt.backSvg() + '</div>';
  }

  global.GoCards = {
    MONTH: MONTH,
    createDeck: createDeck,
    shuffle: shuffle,
    piValue: piValue,
    label: label,
    kindMark: kindMark,
    typeClass: typeClass,
    cardHtml: cardHtml,
    backHtml: backHtml
  };
})(window);
