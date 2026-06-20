// Animated particle background
(function() {
  const canvas = document.getElementById('particles-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  
  let particles = [];
  let animationFrameId;
  let colors = computeColors();
  let vis = computeVisibility();

  function hexToRgb(hex){
    const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex.trim());
    if(!m) return {r:0,g:217,b:255};
    return { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) };
  }

  function computeColors(){
    const style = getComputedStyle(document.documentElement);
    const accent = style.getPropertyValue('--accent') || '#00d9ff';
    const {r,g,b} = hexToRgb(accent);
    return {
      dot: (opacity) => `rgba(${r}, ${g}, ${b}, ${opacity})`,
      link: (opacity) => `rgba(${r}, ${g}, ${b}, ${opacity})`
    };
  }
  function computeVisibility(){
    const isLight = document.body.classList.contains('theme-light');
    return {
      dotMul: isLight ? 1.4 : 1.0,
      linkMul: isLight ? 1.4 : 1.0,
      sizeMul: isLight ? 1.1 : 1.0,
      divisor: isLight ? 10500 : 15000,
      max: isLight ? 500 : 400
    };
  }
  
  function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }
  
  resizeCanvas();
  window.addEventListener('resize', () => {
    resizeCanvas();
    initParticles();
  });
  
  class Particle {
    constructor() {
      this.x = Math.random() * canvas.width;
      this.y = Math.random() * canvas.height;
      this.vx = (Math.random() - 0.5) * 0.5;
      this.vy = (Math.random() - 0.5) * 0.5;
      this.radius = Math.random() * 2 + 1;
      this.opacity = Math.random() * 0.5 + 0.2;
    }
    
    update() {
      this.x += this.vx;
      this.y += this.vy;
      if (this.x < 0) this.x = canvas.width;
      if (this.x > canvas.width) this.x = 0;
      if (this.y < 0) this.y = canvas.height;
      if (this.y > canvas.height) this.y = 0;
    }
    
    draw() {
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.radius * (vis.sizeMul || 1), 0, Math.PI * 2);
      ctx.fillStyle = colors.dot(Math.min(1, this.opacity * vis.dotMul));
      ctx.fill();
    }
  }
  
  function initParticles() {
    particles = [];
    const area = canvas.width * canvas.height;
    let particleCount = Math.floor(area / vis.divisor);
    if(typeof vis.max === 'number') particleCount = Math.min(particleCount, vis.max);
    for (let i = 0; i < particleCount; i++) {
      particles.push(new Particle());
    }
  }
  
  function animate() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    particles.forEach(p => { p.update(); p.draw(); });
    for (let i = 0; i < particles.length; i++) {
      for (let j = i + 1; j < particles.length; j++) {
        const p1 = particles[i];
        const p2 = particles[j];
        const dx = p1.x - p2.x;
        const dy = p1.y - p2.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        if (distance < 150) {
          ctx.beginPath();
          ctx.moveTo(p1.x, p1.y);
          ctx.lineTo(p2.x, p2.y);
          ctx.strokeStyle = colors.link(Math.min(0.9, 0.16 * (1 - distance / 150) * vis.linkMul));
          ctx.lineWidth = 1;
          ctx.stroke();
        }
      }
    }
    animationFrameId = requestAnimationFrame(animate);
  }
  
  initParticles();
  animate();

  // Recompute colors on theme changes
  document.addEventListener('themechange', function(){
    colors = computeColors();
    vis = computeVisibility();
    initParticles();
  });
})();
