/* Small progressive enhancement: independent of existing video/gallery/admin logic. */
(function () {
  'use strict';
  var tabs = Array.prototype.slice.call(document.querySelectorAll('[data-career]'));
  var panels = Array.prototype.slice.call(document.querySelectorAll('[data-career-panel]'));
  if (!tabs.length || !panels.length) return;
  function activate(id, focus) {
    tabs.forEach(function (tab) {
      var on = tab.getAttribute('data-career') === id;
      tab.classList.toggle('active', on);
      tab.setAttribute('aria-selected', on ? 'true' : 'false');
      tab.tabIndex = on ? 0 : -1;
      if (on && focus) tab.focus();
    });
    panels.forEach(function (panel) {
      panel.hidden = panel.getAttribute('data-career-panel') !== id;
    });
  }
  tabs.forEach(function (tab, index) {
    tab.addEventListener('click', function () { activate(tab.getAttribute('data-career'), false); });
    tab.addEventListener('keydown', function (event) {
      if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft' && event.key !== 'Home' && event.key !== 'End') return;
      event.preventDefault();
      var next = index;
      if (event.key === 'ArrowRight') next = (index + 1) % tabs.length;
      if (event.key === 'ArrowLeft') next = (index - 1 + tabs.length) % tabs.length;
      if (event.key === 'Home') next = 0;
      if (event.key === 'End') next = tabs.length - 1;
      activate(tabs[next].getAttribute('data-career'), true);
    });
  });
})();
