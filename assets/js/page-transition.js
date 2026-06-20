// Branded splash on internal navigation. Intercepts same-site link clicks,
// shows the lion/gradient overlay briefly, then navigates.
(function () {
  if (
    window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  ) {
    return; // respect reduced motion — instant navigation
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
    if (!href || href.charAt(0) === "#") return; // empty / in-page anchor
    if (a.target && a.target !== "_self") return; // new tab/window
    if (a.hasAttribute("download")) return;
    if (a.host !== location.host) return; // external
    if (a.protocol !== "http:" && a.protocol !== "https:") return; // mailto/tel
    if (a.pathname === location.pathname && a.search === location.search) return; // same page

    e.preventDefault();
    de.classList.add("is-navigating");
    setTimeout(function () {
      location.href = a.href;
    }, 140);
  });

  // Clear the overlay if the page is restored from the bfcache (back/forward).
  window.addEventListener("pageshow", function () {
    de.classList.remove("is-navigating");
  });
})();
