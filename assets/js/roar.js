// Lion roar — home page only. Visual roar on load; full roar (with a procedurally
// synthesized growl) when the lion logo is clicked. No audio asset needed.
(function () {
  if (!document.body.classList.contains("is-home")) return;
  var reduce =
    window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var logo = document.querySelector(".nav-logo");
  var img = logo && logo.querySelector(".logo-img");
  if (!logo || !img) return;

  // ---- Procedural roar (Web Audio): filtered brown noise + a detuned growl ----
  function makeRoar() {
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return function () {};
    var ctx;
    function noiseBuffer(c) {
      var len = Math.floor(c.sampleRate * 2.2);
      var buf = c.createBuffer(1, len, c.sampleRate);
      var d = buf.getChannelData(0);
      var last = 0;
      for (var i = 0; i < len; i++) {
        var w = Math.random() * 2 - 1;
        last = (last + 0.02 * w) / 1.02;
        d[i] = last * 3.2;
      }
      return buf;
    }
    function shaper(c) {
      var n = 22050;
      var curve = new Float32Array(n);
      for (var i = 0; i < n; i++) {
        var x = (i * 2) / n - 1;
        curve[i] = ((3 + 18) * x * 0.25) / (Math.PI + 18 * Math.abs(x));
      }
      var ws = c.createWaveShaper();
      ws.curve = curve;
      ws.oversample = "4x";
      return ws;
    }
    return function play() {
      if (!ctx) ctx = new AC();
      if (ctx.state === "suspended") ctx.resume();
      var c = ctx;
      var t = c.currentTime;
      var dur = 2.0;

      var master = c.createGain();
      master.gain.setValueAtTime(0.0001, t);
      master.gain.exponentialRampToValueAtTime(0.95, t + 0.18);
      master.gain.exponentialRampToValueAtTime(0.55, t + 1.1);
      master.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      master.connect(c.destination);

      var dist = shaper(c);
      dist.connect(master);

      var src = c.createBufferSource();
      src.buffer = noiseBuffer(c);
      var lp = c.createBiquadFilter();
      lp.type = "lowpass";
      lp.Q.value = 7;
      lp.frequency.setValueAtTime(180, t);
      lp.frequency.linearRampToValueAtTime(950, t + 0.35);
      lp.frequency.linearRampToValueAtTime(280, t + dur);
      src.connect(lp);
      lp.connect(dist);

      var osc = c.createOscillator();
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(85, t);
      osc.frequency.exponentialRampToValueAtTime(48, t + 0.45);
      osc.frequency.exponentialRampToValueAtTime(36, t + dur);
      // sub-octave layer for extra depth
      var sub = c.createOscillator();
      sub.type = "sine";
      sub.frequency.setValueAtTime(45, t);
      sub.frequency.exponentialRampToValueAtTime(26, t + dur);
      var subg = c.createGain();
      subg.gain.value = 0.45;
      sub.connect(subg);
      subg.connect(dist);
      var lfo = c.createOscillator();
      lfo.frequency.value = 18;
      var lg = c.createGain();
      lg.gain.value = 7;
      lfo.connect(lg);
      lg.connect(osc.frequency);
      var og = c.createGain();
      og.gain.value = 0.5;
      osc.connect(og);
      og.connect(dist);

      src.start(t);
      osc.start(t);
      sub.start(t);
      lfo.start(t);
      src.stop(t + dur);
      osc.stop(t + dur);
      sub.stop(t + dur);
      lfo.stop(t + dur);
    };
  }
  var playRoar = makeRoar();

  function visual() {
    if (reduce) return;
    img.classList.remove("roaring");
    void img.offsetWidth; // restart animation
    img.classList.add("roaring");
    for (var i = 0; i < 3; i++) {
      setTimeout(function () {
        var r = document.createElement("span");
        r.className = "roar-ring";
        logo.appendChild(r);
        setTimeout(function () {
          r.remove();
        }, 850);
      }, i * 130);
    }
  }

  function roar(sound) {
    visual();
    if (sound) {
      try {
        playRoar();
      } catch (e) {}
    }
  }

  // Visual-only roar shortly after landing (audio needs a user gesture).
  setTimeout(function () {
    roar(false);
  }, 350);

  // Click the lion to roar for real (we're on home, so don't navigate).
  logo.addEventListener("click", function (e) {
    e.preventDefault();
    roar(true);
  });
  logo.style.cursor = "pointer";
  logo.setAttribute("title", "Roar 🦁");
})();
