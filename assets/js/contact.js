(function () {
  var form = document.getElementById("contact-form");
  if (!form) return;
  var status = document.getElementById("contact-status");
  var endpoint = form.dataset.endpoint;

  form.addEventListener("submit", async function (e) {
    e.preventDefault();
    status.textContent = "";
    status.className = "form-status";

    var payload = Object.fromEntries(new FormData(form).entries());
    var btn = form.querySelector('button[type="submit"]');
    btn.disabled = true;

    try {
      var r = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (r.ok) {
        form.reset();
        status.textContent = form.dataset.success || "Message sent.";
        status.classList.add("ok");
        if (window.turnstile) window.turnstile.reset();
      } else {
        status.textContent = form.dataset.error || "Something went wrong.";
        status.classList.add("err");
      }
    } catch (_) {
      status.textContent = form.dataset.error || "Something went wrong.";
      status.classList.add("err");
    } finally {
      btn.disabled = false;
    }
  });
})();
