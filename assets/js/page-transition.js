// Branded splash on internal navigation: show the lion/gradient overlay, then
// navigate on the next painted frame (no artificial delay — the overlay covers
// only the real load time).
(function () {
  if (
    window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  ) {
    return;
  }
  var de = document.documentElement;

  document.addEventListener("click", function (e) {
    if (
      e.defaultPrevented ||
      e.button !== 0 ||
      e.metaKey ||
      e.ctrlKey ||
      e.shiftKey ||
      e.altKey
    )
      return;

    var a = e.target.closest && e.target.closest("a");
    if (!a) return;

    var href = a.getAttribute("href");
    if (!href || href.charAt(0) === "#") return;
    if (a.target && a.target !== "_self") return;
    if (a.hasAttribute("download")) return;
    if (a.host !== location.host) return;
    if (a.protocol !== "http:" && a.protocol !== "https:") return;
    if (a.pathname === location.pathname && a.search === location.search) return;

    e.preventDefault();
    de.classList.add("is-navigating");
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        location.href = a.href;
      });
    });
  });

  // Clear overlay when restored from the bfcache (back/forward).
  window.addEventListener("pageshow", function () {
    de.classList.remove("is-navigating");
  });
})();
