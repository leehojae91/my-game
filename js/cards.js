/* 카드 · 덱 관련 기본 유틸 */
(function (global) {
  'use strict';

  var SUITS = ['s', 'h', 'd', 'c'];
  var SUIT_SYMBOL = { s: '♠', h: '♥', d: '♦', c: '♣' };
  var RED_SUITS = { h: true, d: true };

  var RANK_LABEL = {
    2: '2', 3: '3', 4: '4', 5: '5', 6: '6', 7: '7', 8: '8', 9: '9',
    10: '10', 11: 'J', 12: 'Q', 13: 'K', 14: 'A'
  };

  function createDeck() {
    var deck = [];
    for (var s = 0; s < SUITS.length; s++) {
      for (var r = 2; r <= 14; r++) {
        deck.push({ r: r, s: SUITS[s] });
      }
    }
    return deck;
  }

  /* Fisher-Yates. count를 주면 앞쪽 count장만 섞는다 (몬테카를로 속도용) */
  function shuffle(deck, count) {
    var n = deck.length;
    var limit = (typeof count === 'number') ? Math.min(count, n - 1) : n - 1;
    for (var i = 0; i < limit; i++) {
      var j = i + Math.floor(Math.random() * (n - i));
      var t = deck[i]; deck[i] = deck[j]; deck[j] = t;
    }
    return deck;
  }

  function cardLabel(card) {
    return RANK_LABEL[card.r] + SUIT_SYMBOL[card.s];
  }

  function isRed(card) {
    return !!RED_SUITS[card.s];
  }

  /* 카드 한 장을 DOM 엘리먼트로 */
  function cardEl(card, faceDown) {
    var el = document.createElement('div');
    el.className = 'card' + (faceDown ? ' back' : (isRed(card) ? ' red' : ' black'));
    if (!faceDown) {
      var rank = document.createElement('span');
      rank.className = 'crank';
      rank.textContent = RANK_LABEL[card.r];
      var suit = document.createElement('span');
      suit.className = 'csuit';
      suit.textContent = SUIT_SYMBOL[card.s];
      el.appendChild(rank);
      el.appendChild(suit);
    }
    return el;
  }

  global.Cards = {
    SUITS: SUITS,
    SUIT_SYMBOL: SUIT_SYMBOL,
    RANK_LABEL: RANK_LABEL,
    createDeck: createDeck,
    shuffle: shuffle,
    cardLabel: cardLabel,
    isRed: isRed,
    cardEl: cardEl
  };
})(window);
