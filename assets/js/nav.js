// Mobile nav: hamburger toggles the collapsible menu.
(function () {
  var btn = document.getElementById("nav-toggle");
  var menu = document.getElementById("nav-links");
  if (!btn || !menu) return;

  function close() {
    menu.classList.remove("open");
    btn.setAttribute("aria-expanded", "false");
  }

  btn.addEventListener("click", function () {
    var open = menu.classList.toggle("open");
    btn.setAttribute("aria-expanded", open ? "true" : "false");
  });

  // Close after following a nav link.
  menu.addEventListener("click", function (e) {
    if (e.target.closest("a")) close();
  });

  // Close when resizing up to desktop.
  window.addEventListener("resize", function () {
    if (window.innerWidth > 768) close();
  });

  // Close on Escape.
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") close();
  });
})();
