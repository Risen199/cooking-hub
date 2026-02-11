// js/sparkles.js
// Enhanced sparkle effect with colors, trailing stars, and better visibility

document.addEventListener('DOMContentLoaded', () => {
  const canvas = document.getElementById('sparkleCanvas');
  if (!canvas) {
    console.warn("⚠️ #sparkleCanvas not found — skipping sparkles.");
    return;
  }

  const ctx = canvas.getContext('2d');
  let width = window.innerWidth;
  let height = window.innerHeight;
  
  // Set canvas size
  canvas.width = width;
  canvas.height = height;
  canvas.style.position = 'fixed';
  canvas.style.top = '0';
  canvas.style.left = '0';
  canvas.style.zIndex = '0';
  canvas.style.pointerEvents = 'none';

  // Color palette (orange/white theme for Blouberg Eats)
  const COLORS = [
    '255, 255, 255', // White
    '255, 255, 200', // Warm white
    '255, 220, 120', // Light orange
    '255, 180, 50',  // Orange
    '255, 127, 0'    // Brand orange (#ff7f00)
  ];

  // Resize handler
  window.addEventListener('resize', () => {
    width = canvas.width = window.innerWidth;
    height = canvas.height = window.innerHeight;
  });

  const sparkles = [];
  const SPARKLE_COUNT = 250; // Increased for better coverage
  
  // Helper functions
  function random(min, max) {
    return Math.random() * (max - min) + min;
  }
  
  function randomInt(min, max) {
    return Math.floor(random(min, max));
  }
  
  function randomColor() {
    return COLORS[randomInt(0, COLORS.length)];
  }

  // Sparkle Particle Class
  class Sparkle {
    constructor() {
      this.color = randomColor();
      this.reset();
      // Random starting offset for animation
      this.phase = random(0, Math.PI * 2);
    }
    
    reset() {
      this.x = random(0, width);
      this.y = random(0, height);
      this.baseSize = random(2, 4.5); // Larger base size
      this.size = this.baseSize;
      this.sizeOscillation = random(0.8, 2);
      this.opacity = random(0.7, 1); // Higher minimum opacity
      this.opacitySpeed = random(0.008, 0.025);
      this.speedX = random(-0.15, 0.15);
      this.speedY = random(-0.15, 0.15);
      this.twinkleSpeed = random(0.002, 0.005);
      this.hasTrail = Math.random() > 0.7; // 30% have trails
      this.trailLength = randomInt(3, 8);
      this.trail = [];
    }
    
    update() {
      // Store previous position for trail
      if (this.hasTrail && Math.random() > 0.7) {
        this.trail.push({ x: this.x, y: this.y, opacity: this.opacity * 0.5 });
        if (this.trail.length > this.trailLength) {
          this.trail.shift();
        }
      }
      
      // Update position
      this.x += this.speedX;
      this.y += this.speedY;
      
      // Twinkle effect with smoother sine wave
      const time = Date.now() * this.twinkleSpeed + this.phase;
      this.opacity = 0.6 + 0.4 * Math.sin(time); // Never goes too low
      this.size = this.baseSize + Math.sin(time * 1.5) * this.sizeOscillation;
      
      // Wrap around screen edges
      if (this.x < -20) this.x = width + 20;
      if (this.x > width + 20) this.x = -20;
      if (this.y < -20) this.y = height + 20;
      if (this.y > height + 20) this.y = -20;
    }
    
    draw() {
      // Draw trail first (behind sparkle)
      if (this.hasTrail && this.trail.length > 0) {
        for (let i = 0; i < this.trail.length; i++) {
          const point = this.trail[i];
          const trailOpacity = point.opacity * (i / this.trail.length);
          
          ctx.beginPath();
          const gradient = ctx.createRadialGradient(
            point.x, point.y, 0,
            point.x, point.y, this.size * 0.6
          );
          gradient.addColorStop(0, `rgba(${this.color}, ${trailOpacity * 0.3})`);
          gradient.addColorStop(1, `rgba(${this.color}, 0)`);
          ctx.fillStyle = gradient;
          ctx.arc(point.x, point.y, this.size * 0.6, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      
      // Draw main sparkle with glow
      ctx.beginPath();
      
      // Inner glow (bright center)
      const innerGradient = ctx.createRadialGradient(
        this.x, this.y, 0,
        this.x, this.y, this.size
      );
      innerGradient.addColorStop(0, `rgba(${this.color}, ${this.opacity})`);
      innerGradient.addColorStop(0.7, `rgba(${this.color}, ${this.opacity * 0.4})`);
      innerGradient.addColorStop(1, `rgba(${this.color}, 0)`);
      
      ctx.fillStyle = innerGradient;
      ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
      ctx.fill();
      
      // Outer glow (softer halo)
      ctx.beginPath();
      const outerGradient = ctx.createRadialGradient(
        this.x, this.y, this.size * 0.5,
        this.x, this.y, this.size * 2.5
      );
      outerGradient.addColorStop(0, `rgba(${this.color}, ${this.opacity * 0.2})`);
      outerGradient.addColorStop(1, `rgba(${this.color}, 0)`);
      
      ctx.fillStyle = outerGradient;
      ctx.arc(this.x, this.y, this.size * 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Create sparkles
  for (let i = 0; i < SPARKLE_COUNT; i++) {
    sparkles.push(new Sparkle());
  }

  // Mouse interaction - sparkles flow away from cursor
  let mouseX = -1000;
  let mouseY = -1000;
  const MOUSE_RADIUS = 150;
  
  window.addEventListener('mousemove', (e) => {
    mouseX = e.clientX;
    mouseY = e.clientY;
  });
  
  window.addEventListener('mouseleave', () => {
    mouseX = -1000;
    mouseY = -1000;
  });

  // Animation loop
  let lastTime = 0;
  const FPS = 60;
  const frameInterval = 1000 / FPS;
  
  function animate(timestamp) {
    requestAnimationFrame(animate);
    
    // Control frame rate
    const delta = timestamp - lastTime;
    if (delta < frameInterval) return;
    lastTime = timestamp - (delta % frameInterval);
    
    // Clear with subtle fade effect (darker for better contrast)
    ctx.fillStyle = 'rgba(0, 0, 0, 0.08)';
    ctx.fillRect(0, 0, width, height);
    
    // Update and draw each sparkle
    sparkles.forEach(sparkle => {
      // Mouse repulsion effect
      const dx = sparkle.x - mouseX;
      const dy = sparkle.y - mouseY;
      const distance = Math.sqrt(dx * dx + dy * dy);
      
      if (distance < MOUSE_RADIUS) {
        const force = (MOUSE_RADIUS - distance) / MOUSE_RADIUS;
        const angle = Math.atan2(dy, dx);
        sparkle.speedX += Math.cos(angle) * force * 0.5;
        sparkle.speedY += Math.sin(angle) * force * 0.5;
        
        // Limit speed
        const speed = Math.sqrt(sparkle.speedX * sparkle.speedX + sparkle.speedY * sparkle.speedY);
        if (speed > 2) {
          sparkle.speedX = (sparkle.speedX / speed) * 2;
          sparkle.speedY = (sparkle.speedY / speed) * 2;
        }
      }
      
      sparkle.update();
      sparkle.draw();
    });
  }

  // Start animation
  animate(0);
  
  // Bonus: Add occasional "burst" of sparkles
  setInterval(() => {
    if (Math.random() > 0.8) { // 20% chance every interval
      const burstCount = randomInt(5, 15);
      for (let i = 0; i < burstCount; i++) {
        const sparkle = new Sparkle();
        sparkle.x = random(0, width);
        sparkle.y = random(0, height);
        sparkle.baseSize = random(3, 6); // Larger for burst
        sparkle.opacity = 1;
        sparkle.hasTrail = true;
        sparkle.trailLength = randomInt(5, 12);
        sparkles.push(sparkle);
      }
      
      // Remove oldest sparkles if too many
      if (sparkles.length > SPARKLE_COUNT * 1.5) {
        sparkles.splice(0, sparkles.length - SPARKLE_COUNT);
      }
    }
  }, 3000); // Check every 3 seconds
});