/* Clean re-implementation with accessibility, minimal visible label, and theme events */
(function(){
  var DEFAULT_FONT_KEY = 'inter'; // Crisp System
  var DEFAULT_THEME = 'dark';

  var FONT_KEYS = ['poppins-ssp','poppins-inter','manrope','nunito-inter','inter','ssp'];
  var FONT_LABELS = {
    'poppins-ssp': 'Clean Humanist',
    'poppins-inter': 'Neo Tech',
    'manrope': 'Soft Grotesk',
    'nunito-inter': 'Friendly Pro',
    'inter': 'Crisp System',
    'ssp': 'Classic Humanist'
  };

  function setBodyClass(prefix, value, keys){
    keys.forEach(function(k){ document.body.classList.remove(prefix + k); });
    document.body.classList.add(prefix + value);
  }

  function openMenu(){
    var menu = document.getElementById('style-menu');
    var picker = document.getElementById('style-picker');
    if(!menu || !picker) return;
    menu.classList.add('open');
    picker.setAttribute('aria-expanded', 'true');
    var currentKey = localStorage.getItem('fontKey') || DEFAULT_FONT_KEY;
    var currentItem = menu.querySelector('button[data-font="' + currentKey + '"]');
    if(currentItem) currentItem.focus();
  }

  function closeMenu(){
    var menu = document.getElementById('style-menu');
    var picker = document.getElementById('style-picker');
    if(!menu || !picker) return;
    menu.classList.remove('open');
    picker.setAttribute('aria-expanded', 'false');
  }

  function dispatchThemeChange(theme){
    try {
      document.dispatchEvent(new CustomEvent('themechange', { detail: { theme: theme } }));
    } catch(e) { /* ignore */ }
  }

  function applyState(state){
    var fontKey = state.fontKey || DEFAULT_FONT_KEY;
    var theme = state.theme || DEFAULT_THEME;

    setBodyClass('font-', fontKey, FONT_KEYS);

    var themeBtn = document.getElementById('theme-toggle');
    if(theme === 'light'){
      document.body.classList.add('theme-light');
      if(themeBtn) themeBtn.setAttribute('aria-checked', 'true');
    } else {
      document.body.classList.remove('theme-light');
      if(themeBtn) themeBtn.setAttribute('aria-checked', 'false');
    }
    // Update control labels (keep visual button minimal "Aa").
    var picker = document.getElementById('style-picker');
    var menu = document.getElementById('style-menu');
    if(picker){
      var label = (menu && menu.querySelector('button[data-font="' + fontKey + '"]') && menu.querySelector('button[data-font="' + fontKey + '"]').getAttribute('data-label')) || FONT_LABELS[fontKey] || 'Style';
      picker.setAttribute('aria-label', 'Typography style: ' + label);
      picker.setAttribute('title', 'Typography: ' + label);
    }
    dispatchThemeChange(theme);
  }

  function init(){
    var savedFont = localStorage.getItem('fontKey') || DEFAULT_FONT_KEY;
    if(FONT_KEYS.indexOf(savedFont) === -1) savedFont = DEFAULT_FONT_KEY;
    // Dark is the brand default regardless of OS preference; users can still toggle.
    var savedTheme = localStorage.getItem('theme') || DEFAULT_THEME;
    applyState({ fontKey: savedFont, theme: savedTheme });

    var picker = document.getElementById('style-picker');
    var menu = document.getElementById('style-menu');
    if(picker && menu){
      picker.addEventListener('click', function(e){
        // Prevent global document click handler from immediately closing the menu
        e.stopPropagation();
        // Shortcut: Shift+Click cycles to next font without opening menu
        if(e.shiftKey){
          var current = localStorage.getItem('fontKey') || savedFont;
          var idx = FONT_KEYS.indexOf(current);
          var next = FONT_KEYS[(idx + 1) % FONT_KEYS.length];
          localStorage.setItem('fontKey', next);
          applyState({ fontKey: next, theme: localStorage.getItem('theme') || DEFAULT_THEME });
          return; // Do not toggle menu
        }
        var expanded = picker.getAttribute('aria-expanded') === 'true';
        if(expanded) closeMenu(); else openMenu();
      });
      picker.addEventListener('keydown', function(e){
        if((e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') && picker.getAttribute('aria-expanded') !== 'true'){
          e.preventDefault(); openMenu();
        }
      });
      menu.addEventListener('click', function(e){
        var target = e.target.closest('button[role="menuitem"][data-font]');
        if(!target) return;
        var key = target.getAttribute('data-font');
        if(FONT_KEYS.indexOf(key) === -1) return;
        localStorage.setItem('fontKey', key);
        applyState({ fontKey: key, theme: localStorage.getItem('theme') || DEFAULT_THEME });
        closeMenu();
        picker.focus();
      });
      menu.addEventListener('keydown', function(e){
        var items = Array.prototype.slice.call(menu.querySelectorAll('button[role="menuitem"]'));
        var idx = items.indexOf(document.activeElement);
        if(e.key === 'ArrowDown'){
          e.preventDefault();
          var next = items[(idx + 1 + items.length) % items.length];
          if(next) next.focus();
        } else if(e.key === 'ArrowUp'){
          e.preventDefault();
          var prev = items[(idx - 1 + items.length) % items.length];
          if(prev) prev.focus();
        } else if(e.key === 'Home'){
          e.preventDefault(); if(items[0]) items[0].focus();
        } else if(e.key === 'End'){
          e.preventDefault(); if(items[items.length-1]) items[items.length-1].focus();
        } else if(e.key === 'Escape'){
          e.preventDefault(); closeMenu(); picker.focus();
        } else if(e.key === 'Enter' || e.key === ' '){
          e.preventDefault(); document.activeElement && document.activeElement.click();
        }
      });
      document.addEventListener('click', function(e){
        // Close when clicking outside both the menu and the picker button (including its children)
        if(!menu.contains(e.target) && !picker.contains(e.target)){
          closeMenu();
        }
      });
      document.addEventListener('keydown', function(e){
        if(e.key === 'Escape'){ closeMenu(); picker && picker.focus(); }
      });
    }

    var themeBtn = document.getElementById('theme-toggle');
    if(themeBtn){
      themeBtn.addEventListener('click', function(){
        var current = localStorage.getItem('theme') || DEFAULT_THEME;
        var next = current === 'light' ? 'dark' : 'light';
        localStorage.setItem('theme', next);
        applyState({ fontKey: localStorage.getItem('fontKey') || DEFAULT_FONT_KEY, theme: next });
      });
      themeBtn.addEventListener('keydown', function(e){
        if(e.key === 'Enter' || e.key === ' '){ e.preventDefault(); themeBtn.click(); }
      });
    }
  }

  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
