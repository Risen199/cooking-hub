// sparkles.js
// A dynamic canvas effect for a starry or sparkling background.

document.addEventListener('DOMContentLoaded', () => {
  const canvas = document.getElementById('sparkleCanvas');
  if (!canvas) {
    console.warn("⚠️ #sparkleCanvas not found — skipping sparkles.");
    return;
  }

  const ctx = canvas.getContext('2d');
  
  // Set the canvas size to match the browser window's dimensions.
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;

  // Add a resize listener to make the canvas responsive.
  window.addEventListener('resize', () => {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  });

  const sparkles = [];
  const sparkleCount = 200; // Increased count for a denser effect.

  // Helper function to generate a random number within a range.
  function random(min, max) {
    return Math.random() * (max - min) + min;
  }

  // Define a class for each individual sparkle particle.
  class Sparkle {
    constructor() {
      this.reset();
    }

    // Initialize or reset a sparkle's properties.
    reset() {
      // Set a random starting position on the canvas.
      this.x = random(0, canvas.width);
      this.y = random(0, canvas.height);
      // Set an initial size and an oscillating size for the twinkling effect.
      this.baseSize = random(1.5, 3.5);
      this.size = this.baseSize;
      this.sizeOscillation = random(0.5, 1.5);
      // Set an initial opacity and a fade speed.
      this.opacity = random(0.4, 0.9);
      this.opacitySpeed = random(0.005, 0.02) * (Math.random() < 0.5 ? -1 : 1);
      // Give the sparkle a slight random movement.
      this.speedX = random(-0.2, 0.2);
      this.speedY = random(-0.2, 0.2);
    }

    // Update the sparkle's position and visual state each frame.
    update() {
      // Update position based on speed.
      this.x += this.speedX;
      this.y += this.speedY;

      // Make the sparkle twinkle by oscillating its opacity.
      this.opacity += this.opacitySpeed;
      if (this.opacity > 1 || this.opacity < 0.1) {
        this.opacitySpeed *= -1; // Reverse direction when min/max reached.
      }
      
      // Update the sparkle's size to create a pulsating effect.
      this.size = this.baseSize + Math.sin(Date.now() / 500) * this.sizeOscillation;

      // If the sparkle goes off-screen, reset it to a new position.
      if (this.x < 0 || this.x > canvas.width || this.y < 0 || this.y > canvas.height) {
        this.reset();
      }
    }

    // Draw the sparkle on the canvas.
    draw() {
      ctx.beginPath();
      // Use a gradient for a subtle glow effect.
      const gradient = ctx.createRadialGradient(this.x, this.y, 0, this.x, this.y, this.size);
      gradient.addColorStop(0, `rgba(255, 255, 255, ${this.opacity})`);
      gradient.addColorStop(1, `rgba(255, 255, 255, 0)`);
      ctx.fillStyle = gradient;
      ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Populate the sparkles array.
  for (let i = 0; i < sparkleCount; i++) {
    sparkles.push(new Sparkle());
  }

  // The main animation loop.
  function animate() {
    // Draw a semi-transparent black rectangle over the canvas to create a trailing effect.
    ctx.fillStyle = 'rgba(0, 0, 0, 0.1)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Update and draw each sparkle.
    sparkles.forEach(sparkle => {
      sparkle.update();
      sparkle.draw();
    });
    
    // Request the next animation frame.
    requestAnimationFrame(animate);
  }

  // Start the animation loop.
  animate();
});