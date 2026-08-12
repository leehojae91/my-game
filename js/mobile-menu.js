/* 모바일에서 상단 옵션 버튼들을 ☰ 메뉴 안으로 접는다.
   게임별 JS/핸들러는 건드리지 않고, .topbtns의 표시 방식만 토글한다. */
(function () {
  'use strict';
  function init() {
    var bar = document.querySelector('.topbar');
    if (!bar) return;
    var btns = bar.querySelector('.topbtns');
    if (!btns || bar.querySelector('.menu-toggle')) return;

    var toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'menu-toggle';
    toggle.setAttribute('aria-label', '메뉴 열기');
    toggle.setAttribute('aria-expanded', 'false');
    toggle.innerHTML = '<span></span><span></span><span></span>';
    bar.appendChild(toggle);

    function close() {
      btns.classList.remove('open');
      toggle.classList.remove('active');
      toggle.setAttribute('aria-expanded', 'false');
    }
    function open() {
      btns.classList.add('open');
      toggle.classList.add('active');
      toggle.setAttribute('aria-expanded', 'true');
    }

    toggle.addEventListener('click', function (e) {
      e.stopPropagation();
      if (btns.classList.contains('open')) close(); else open();
    });
    /* 옵션 하나를 누르면 메뉴를 닫는다 */
    btns.addEventListener('click', function (e) {
      if (e.target.closest('.ghost')) close();
    });
    /* 바깥을 누르면 닫는다 */
    document.addEventListener('click', function (e) {
      if (!bar.contains(e.target)) close();
    });
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
