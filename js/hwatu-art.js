/* 화투 그림 - 달마다 다른 식물과 광·열끗·띠 요소를 직접 그린다 */
(function (global) {
  'use strict';

  /* 달별 바탕색 */
  var BG = {
    1:  ['#f7f0dc', '#e3ddbc'],
    2:  ['#f9eef0', '#e8d7dc'],
    3:  ['#fbeef2', '#ecd8e0'],
    4:  ['#eeeef4', '#d9d9e4'],
    5:  ['#f2eef8', '#ded8ea'],
    6:  ['#f9edf1', '#e9d6de'],
    7:  ['#f7eee6', '#e6d5c6'],
    8:  ['#eef1f6', '#d8dee8'],
    9:  ['#faf3e0', '#eadfba'],
    10: ['#fbefe2', '#ecd9c2'],
    11: ['#f4eff7', '#ddd6e6'],
    12: ['#eceff4', '#d5dae2']
  };

  /* 달마다의 식물·풍경 */
  var PLANT = {
    /* 소나무 */
    1: '<path d="M30 88 L30 56" stroke="#6b4a24" stroke-width="5"/>' +
       '<path d="M30 4 L14 30 L46 30 Z" fill="#1f6b3a"/>' +
       '<path d="M30 18 L9 48 L51 48 Z" fill="#28814c"/>' +
       '<path d="M30 32 L12 60 L48 60 Z" fill="#1c6238"/>',
    /* 매화 */
    2: '<path d="M8 88 Q24 58 48 12" stroke="#6b4a24" stroke-width="4" fill="none"/>' +
       '<path d="M26 60 Q38 50 50 44" stroke="#6b4a24" stroke-width="3" fill="none"/>' +
       '<path d="M20 72 Q12 62 6 58" stroke="#6b4a24" stroke-width="2.4" fill="none"/>' +
       '<g fill="#e07aa6">' +
       '<circle cx="47" cy="12" r="6"/><circle cx="34" cy="30" r="5.5"/>' +
       '<circle cx="50" cy="44" r="5"/><circle cx="18" cy="52" r="5"/>' +
       '<circle cx="7" cy="57" r="4"/><circle cx="26" cy="44" r="4"/></g>' +
       '<g fill="#fff"><circle cx="47" cy="12" r="1.8"/><circle cx="34" cy="30" r="1.6"/>' +
       '<circle cx="50" cy="44" r="1.5"/><circle cx="18" cy="52" r="1.5"/></g>',
    /* 벚꽃 */
    3: '<path d="M12 88 Q22 60 28 34" stroke="#6b4a24" stroke-width="4" fill="none"/>' +
       '<path d="M26 52 Q38 46 48 40" stroke="#6b4a24" stroke-width="2.6" fill="none"/>' +
       '<g fill="#f0a3c0">' +
       '<circle cx="18" cy="26" r="7"/><circle cx="36" cy="18" r="7.5"/>' +
       '<circle cx="49" cy="34" r="6.5"/><circle cx="24" cy="46" r="6"/>' +
       '<circle cx="40" cy="40" r="5.5"/><circle cx="10" cy="46" r="5"/></g>' +
       '<g fill="#fff8fb"><circle cx="18" cy="26" r="2.2"/><circle cx="36" cy="18" r="2.4"/>' +
       '<circle cx="49" cy="34" r="2"/><circle cx="24" cy="46" r="2"/></g>',
    /* 등나무 (흑싸리) */
    4: '<path d="M30 2 Q32 30 28 60" stroke="#3a3a48" stroke-width="3.4" fill="none"/>' +
       '<g fill="#2f2f3d">' +
       '<ellipse cx="18" cy="16" rx="5.5" ry="9" transform="rotate(-28 18 16)"/>' +
       '<ellipse cx="43" cy="18" rx="5.5" ry="9" transform="rotate(28 43 18)"/>' +
       '<ellipse cx="16" cy="34" rx="5.5" ry="9" transform="rotate(-22 16 34)"/>' +
       '<ellipse cx="44" cy="36" rx="5.5" ry="9" transform="rotate(22 44 36)"/>' +
       '<ellipse cx="30" cy="8" rx="5" ry="8"/></g>' +
       '<g fill="#8a6fbf">' +
       '<ellipse cx="26" cy="62" rx="4.4" ry="5"/><ellipse cx="33" cy="70" rx="4" ry="4.6"/>' +
       '<ellipse cx="28" cy="78" rx="3.4" ry="4"/></g>',
    /* 창포 (난초) */
    5: '<g stroke="#2f7a4a" stroke-width="3.4" fill="none" stroke-linecap="round">' +
       '<path d="M22 80 Q18 52 24 20"/><path d="M32 80 Q32 50 34 22"/>' +
       '<path d="M42 80 Q46 54 40 26"/></g>' +
       '<g fill="#8a4bb0"><ellipse cx="32" cy="40" rx="6" ry="4.5"/>' +
       '<ellipse cx="24" cy="48" rx="4.5" ry="3.5"/></g>',
    /* 모란 */
    6: '<g fill="#1f6b3a"><ellipse cx="18" cy="66" rx="9" ry="5"/>' +
       '<ellipse cx="42" cy="70" rx="9" ry="5"/></g>' +
       '<g fill="#c22a52"><circle cx="30" cy="38" r="13"/></g>' +
       '<g fill="#e0567e"><circle cx="30" cy="34" r="8"/></g>' +
       '<circle cx="30" cy="34" r="3.4" fill="#f7d76b"/>',
    /* 홍싸리 */
    7: '<path d="M30 80 Q28 54 30 26" stroke="#7a3a1a" stroke-width="3" fill="none"/>' +
       '<g fill="#b8442a">' +
       '<ellipse cx="20" cy="34" rx="6" ry="4" transform="rotate(-25 20 34)"/>' +
       '<ellipse cx="40" cy="32" rx="6" ry="4" transform="rotate(25 40 32)"/>' +
       '<ellipse cx="18" cy="50" rx="6" ry="4" transform="rotate(-20 18 50)"/>' +
       '<ellipse cx="42" cy="48" rx="6" ry="4" transform="rotate(20 42 48)"/>' +
       '<ellipse cx="30" cy="24" rx="5.5" ry="4"/></g>',
    /* 억새 (공산) */
    8: '<path d="M-2 90 Q30 50 62 90 Z" fill="#8d99ab"/>' +
       '<path d="M-2 90 Q30 60 62 90 Z" fill="#79879b"/>' +
       '<g stroke="#5f6c80" stroke-width="2.2" fill="none" stroke-linecap="round">' +
       '<path d="M10 88 Q6 70 12 56"/><path d="M20 88 Q17 68 22 52"/>' +
       '<path d="M40 88 Q43 68 38 52"/><path d="M50 88 Q54 70 48 56"/></g>' +
       '<g fill="#b9c4d2"><ellipse cx="12" cy="54" rx="2.6" ry="5"/>' +
       '<ellipse cx="22" cy="50" rx="2.6" ry="5"/>' +
       '<ellipse cx="38" cy="50" rx="2.6" ry="5"/>' +
       '<ellipse cx="48" cy="54" rx="2.6" ry="5"/></g>',
    /* 국화 */
    9: '<path d="M30 80 Q28 60 30 46" stroke="#2f7a4a" stroke-width="3" fill="none"/>' +
       '<ellipse cx="20" cy="62" rx="7" ry="4" fill="#2f7a4a" transform="rotate(-20 20 62)"/>' +
       '<g fill="#e0b02a"><circle cx="30" cy="34" r="13"/></g>' +
       '<g fill="#f3d05e"><circle cx="30" cy="34" r="8.5"/></g>' +
       '<circle cx="30" cy="34" r="3.2" fill="#8a5a12"/>',
    /* 단풍 */
    10: '<path d="M30 80 Q30 58 30 44" stroke="#7a4a24" stroke-width="3" fill="none"/>' +
        '<g fill="#d2622a">' +
        '<path d="M30 14 L38 30 L46 26 L40 40 L30 46 L20 40 L14 26 L22 30 Z"/></g>' +
        '<g fill="#e8843f">' +
        '<path d="M18 52 L23 60 L28 56 L25 64 L18 68 L12 62 L10 54 L14 57 Z"/></g>',
    /* 오동 */
    11: '<path d="M30 88 Q30 60 30 40" stroke="#6b4a24" stroke-width="4" fill="none"/>' +
        '<g fill="#5a4a86">' +
        '<path d="M30 40 Q10 34 8 18 Q22 12 30 26 Z"/>' +
        '<path d="M30 40 Q50 34 52 18 Q38 12 30 26 Z"/>' +
        '<path d="M30 30 Q22 12 30 2 Q40 12 30 30 Z"/></g>' +
        '<g fill="#7a68a8" opacity=".75">' +
        '<path d="M30 38 Q16 33 14 22 Q24 18 30 28 Z"/></g>' +
        '<g stroke="#3f3562" stroke-width="1" fill="none">' +
        '<path d="M30 38 L14 22 M30 38 L46 22 M30 28 L30 8"/></g>',
    /* 비 (버드나무) */
    12: '<path d="M10 2 Q16 44 10 88" stroke="#6b6b4a" stroke-width="4" fill="none"/>' +
        '<g stroke="#7a8a5a" stroke-width="2.2" fill="none" stroke-linecap="round">' +
        '<path d="M12 12 Q26 26 20 48"/><path d="M12 22 Q32 38 26 64"/>' +
        '<path d="M12 34 Q28 50 24 78"/></g>' +
        '<g stroke="#93a7c4" stroke-width="1.8" stroke-linecap="round" opacity=".9">' +
        '<path d="M40 6 L33 24"/><path d="M50 10 L43 28"/><path d="M56 24 L49 42"/>' +
        '<path d="M44 34 L37 52"/><path d="M54 46 L47 64"/></g>'
  };

  /* 광 카드에만 들어가는 것 */
  var GWANG_ART = {
    /* 학 */
    1: '<g><ellipse cx="27" cy="62" rx="16" ry="9" fill="#fdfdfa" stroke="#c9c4b4" stroke-width="1.2"/>' +
       '<path d="M14 66 Q6 68 2 74" fill="none" stroke="#2a2a22" stroke-width="3"/>' +
       '<path d="M37 56 Q46 42 48 28" stroke="#fdfdfa" stroke-width="5" fill="none"/>' +
       '<circle cx="48" cy="26" r="5" fill="#fdfdfa" stroke="#c9c4b4"/>' +
       '<circle cx="48.5" cy="22.5" r="2.6" fill="#d43a2a"/>' +
       '<path d="M52 27 L58 29" stroke="#c9a02a" stroke-width="2.4"/>' +
       '<circle cx="50" cy="26" r="1" fill="#1a1a1a"/>' +
       '<path d="M22 70 L20 80 M32 70 L34 80" stroke="#3a3a2a" stroke-width="2"/>' +
       '<path d="M17 78 L24 80 M29 80 L37 78" stroke="#3a3a2a" stroke-width="1.8"/></g>',
    /* 만막 (장막) */
    3: '<g><rect x="8" y="52" width="44" height="9" rx="2" fill="#c8202f"/>' +
       '<rect x="8" y="61" width="44" height="4" rx="1" fill="#8a1520"/>' +
       '<path d="M14 65 L14 74 M22 65 L22 71 M30 65 L30 76 M38 65 L38 71 M46 65 L46 74"' +
       ' stroke="#c8202f" stroke-width="2.6"/></g>',
    /* 보름달 */
    8: '<circle cx="30" cy="28" r="13" fill="#f6efc8" stroke="#d8c98a" stroke-width="1.5"/>',
    /* 봉황 */
    11: '<g><ellipse cx="31" cy="58" rx="14" ry="10" fill="#c8202f"/>' +
        '<path d="M40 50 Q50 40 52 28" stroke="#c8202f" stroke-width="5" fill="none"/>' +
        '<circle cx="52" cy="26" r="5" fill="#c8202f"/>' +
        '<circle cx="53.4" cy="24" r="1.4" fill="#f7d76b"/>' +
        '<path d="M56 27 L60 29" stroke="#f0a83a" stroke-width="2.4"/>' +
        '<path d="M50 20 Q54 12 50 6" stroke="#f0a83a" stroke-width="2.6" fill="none"/>' +
        '<path d="M22 62 Q8 66 2 80" stroke="#e0783a" stroke-width="4" fill="none"/>' +
        '<path d="M24 66 Q12 74 8 88" stroke="#f0a83a" stroke-width="3" fill="none"/>' +
        '<path d="M28 68 Q20 78 20 88" stroke="#c8202f" stroke-width="2.6" fill="none"/></g>',
    /* 우산 쓴 사람 */
    12: '<g><path d="M22 36 Q40 14 58 36 Z" fill="#2a2a35"/>' +
        '<path d="M22 36 Q30 32 40 36 Q50 32 58 36" fill="none" stroke="#50505f" stroke-width="1.4"/>' +
        '<path d="M40 36 L40 54" stroke="#6b5a34" stroke-width="2.4"/>' +
        '<circle cx="40" cy="58" r="6.5" fill="#f0e6cc" stroke="#8a7a5a" stroke-width="1.2"/>' +
        '<path d="M34 64 Q40 60 46 64 L48 82 L32 82 Z" fill="#3a4a6a"/>' +
        '<path d="M35 82 L34 90 M45 82 L46 90" stroke="#2a2a35" stroke-width="3"/></g>'
  };

  /* 열끗 카드의 동물·사물 */
  var YEOL_ART = {
    /* 휘파람새 */
    2: '<g><ellipse cx="34" cy="60" rx="8" ry="6" fill="#5a7a3a"/>' +
       '<circle cx="42" cy="55" r="4" fill="#6b8a48"/>' +
       '<circle cx="43.6" cy="54" r="1.1" fill="#1a1a1a"/>' +
       '<path d="M46 56 L50 57" stroke="#c9a02a" stroke-width="1.6"/>' +
       '<path d="M26 62 L18 68" stroke="#4a6a2a" stroke-width="3"/></g>',
    /* 두견새 */
    4: '<g><ellipse cx="34" cy="26" rx="8" ry="6" fill="#3a4a6a"/>' +
       '<circle cx="42" cy="22" r="4" fill="#4a5a7a"/>' +
       '<circle cx="43.6" cy="21" r="1.1" fill="#1a1a1a"/>' +
       '<path d="M46 23 L50 24" stroke="#c9a02a" stroke-width="1.6"/>' +
       '<path d="M27 28 L19 33" stroke="#2f3a55" stroke-width="3"/></g>',
    /* 다리 */
    5: '<g><rect x="8" y="58" width="44" height="5" rx="1.5" fill="#8a5a2a"/>' +
       '<path d="M14 63 L14 76 M30 63 L30 76 M46 63 L46 76" stroke="#7a4a24" stroke-width="3"/>' +
       '<rect x="8" y="54" width="44" height="3" rx="1" fill="#a87a44"/></g>',
    /* 나비 */
    6: '<g fill="#3a4a86"><ellipse cx="22" cy="62" rx="8" ry="6" transform="rotate(-20 22 62)"/>' +
       '<ellipse cx="38" cy="62" rx="8" ry="6" transform="rotate(20 38 62)"/></g>' +
       '<ellipse cx="30" cy="63" rx="2.2" ry="7" fill="#1f2a4a"/>' +
       '<path d="M29 56 L25 50 M31 56 L35 50" stroke="#1f2a4a" stroke-width="1.4"/>',
    /* 멧돼지 */
    7: '<g><ellipse cx="30" cy="64" rx="14" ry="9" fill="#4a3a2a"/>' +
       '<circle cx="43" cy="60" r="6" fill="#5a4a34"/>' +
       '<circle cx="45" cy="59" r="1.2" fill="#1a1a1a"/>' +
       '<path d="M48 62 L52 60" stroke="#e8ddc4" stroke-width="2"/>' +
       '<path d="M20 72 L19 78 M28 73 L27 78 M36 72 L37 78" stroke="#3a2a1a" stroke-width="2.4"/></g>',
    /* 기러기 */
    8: '<g fill="#2f3a4a">' +
       '<path d="M30 34 Q20 22 6 26 Q20 30 24 40 Q16 46 20 54 Q30 44 34 54 Q38 46 34 40 Q40 30 54 26 Q40 22 30 34 Z"/>' +
       '<circle cx="31" cy="30" r="3.4"/>' +
       '<path d="M34 29 L40 30" stroke="#c9a02a" stroke-width="1.8"/></g>' +
       '<g fill="#48566a" opacity=".8">' +
       '<path d="M14 62 Q10 58 4 59 Q10 61 11 65 Q14 62 17 65 Q18 62 15 60 Z"/></g>',
    /* 술잔 */
    9: '<g><path d="M22 56 L38 56 L34 66 L26 66 Z" fill="#c8202f"/>' +
       '<rect x="28" y="66" width="4" height="7" fill="#8a1520"/>' +
       '<ellipse cx="30" cy="74" rx="8" ry="2.6" fill="#8a1520"/>' +
       '<ellipse cx="30" cy="56" rx="8" ry="2.4" fill="#e0567e"/></g>',
    /* 사슴 */
    10: '<g><ellipse cx="28" cy="64" rx="12" ry="8" fill="#a8703a"/>' +
        '<circle cx="40" cy="56" r="5.5" fill="#b88450"/>' +
        '<circle cx="42" cy="55" r="1.2" fill="#1a1a1a"/>' +
        '<path d="M38 50 L35 42 M42 50 L45 42" stroke="#6b4a24" stroke-width="2.2"/>' +
        '<path d="M35 42 L32 38 M45 42 L48 38" stroke="#6b4a24" stroke-width="1.8"/>' +
        '<path d="M20 72 L19 78 M28 72 L27 78 M34 71 L35 78" stroke="#7a5230" stroke-width="2.2"/></g>',
    /* 제비 */
    12: '<g fill="#2a3245">' +
        '<path d="M30 46 Q22 40 14 44 Q22 48 24 52 Q20 56 22 60 Q28 54 30 58 Q32 54 38 60 Q40 56 36 52 Q38 48 46 44 Q38 40 30 46 Z"/></g>'
  };

  /* 띠 색 */
  var TTI_COLOR = {
    '홍단': { band: '#c8202f', edge: '#8a1520', text: '#fff2d0' },
    '청단': { band: '#2a5aa8', edge: '#173a70', text: '#e6f0ff' },
    '초단': { band: '#c8202f', edge: '#8a1520', text: null },
    null:   { band: '#b8442a', edge: '#7a2a18', text: null }
  };

  /* 띠는 그림 위를 가로지르되 식물이 보이도록 얇게 얹는다 */
  function ttiArt(sub) {
    var c = TTI_COLOR[sub] || TTI_COLOR[null];
    var band =
      '<g transform="rotate(-6 30 48)">' +
      '<rect x="2" y="42" width="56" height="11" rx="2.5" fill="' + c.band + '"/>' +
      '<rect x="2" y="42" width="56" height="11" rx="2.5" fill="none" stroke="' + c.edge + '" stroke-width="1.3"/>' +
      '<rect x="2" y="42" width="56" height="3" fill="rgba(255,255,255,.22)"/>';
    if (c.text) {
      band += '<g fill="' + c.text + '">' +
        '<rect x="14" y="45.5" width="3.6" height="4.4" rx="1"/>' +
        '<rect x="22" y="45.5" width="3.6" height="4.4" rx="1"/>' +
        '<rect x="30" y="45.5" width="3.6" height="4.4" rx="1"/>' +
        '<rect x="38" y="45.5" width="3.6" height="4.4" rx="1"/></g>';
    }
    return band + '</g>';
  }

  /* 쌍피 표시 */
  function ssangArt() {
    return '<g opacity=".9">' +
      '<rect x="34" y="56" width="16" height="20" rx="2" fill="#f6efdc" stroke="#8a1520" stroke-width="1.6"/>' +
      '<rect x="28" y="52" width="16" height="20" rx="2" fill="#fbf6e6" stroke="#c8202f" stroke-width="1.6"/>' +
      '</g>';
  }

  /**
   * @param m 달 (1~12)
   * @param kind 'gwang' | 'yeol' | 'tti' | 'pi'
   * @param sub  '홍단' | '청단' | '초단' | '쌍피' | null
   */
  function svgFor(m, kind, sub) {
    var bg = BG[m] || BG[1];
    var id = 'hb' + m;
    var body = PLANT[m] || '';

    if (kind === 'gwang' && GWANG_ART[m]) body += GWANG_ART[m];
    else if (kind === 'yeol' && YEOL_ART[m]) body += YEOL_ART[m];
    else if (kind === 'tti') body += ttiArt(sub);
    else if (kind === 'pi' && sub === '쌍피') body += ssangArt();

    /* 같은 그림이 여러 장 쓰이므로 id를 쓰는 그라디언트·무늬는 피한다 */
    return '<svg class="hart" viewBox="0 0 60 90" preserveAspectRatio="xMidYMid slice" aria-hidden="true">' +
      '<rect width="60" height="90" fill="' + bg[0] + '"/>' +
      '<rect y="42" width="60" height="48" fill="' + bg[1] + '" opacity=".6"/>' +
      body +
      '</svg>';
  }

  /* 카드 뒷면 무늬 */
  function backSvg() {
    var mesh = '';
    for (var y = -12; y < 96; y += 12) {
      mesh += '<path d="M-6 ' + (y + 6) + ' L6 ' + y + ' L18 ' + (y + 6) + ' L30 ' + y +
              ' L42 ' + (y + 6) + ' L54 ' + y + ' L66 ' + (y + 6) + '" fill="none" ' +
              'stroke="rgba(255,220,180,.20)" stroke-width="1.2"/>';
    }
    return '<svg class="hart" viewBox="0 0 60 90" preserveAspectRatio="none" aria-hidden="true">' +
      '<rect width="60" height="90" fill="#7e1420"/>' + mesh +
      '<circle cx="30" cy="45" r="13" fill="none" stroke="rgba(255,220,180,.5)" stroke-width="2"/>' +
      '<circle cx="30" cy="45" r="5" fill="rgba(255,220,180,.45)"/>' +
      '</svg>';
  }

  global.HwatuArt = { svgFor: svgFor, backSvg: backSvg };
})(window);
