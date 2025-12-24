(function() {
  try {
    // Expose a passive presence flag early
    Object.defineProperty(window, '__CB_SPACE_EXT__', { value: true, configurable: false });

    // Listen for ping messages from same-page web apps
    window.addEventListener('message', (ev) => {
      try {
        const data = ev.data || {};
        if (data && data.__cb_space_ext_ping === true) {
          window.postMessage({ __cb_space_ext_pong: true }, '*');
        }
        if (data && data.__cb_space_ext_control && data.__cb_space_ext_control.type) {
          chrome.runtime?.sendMessage({ __cb_sw_broadcast: true, ...data.__cb_space_ext_control });
        }
      } catch {}
    }, false);
  } catch {}
})();
