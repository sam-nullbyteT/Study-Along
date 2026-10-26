// animations.js - Unified Animation & Canvas Weather Engine for Study Along (Ekagraa)
// Manages:
// 1. Master Animation Toggle (body.anim-off, GSAP pause/play, Lottie pause/play, RAF start/stop)
// 2. Canvas 2D Window Weather Engine (RaindropFX, SakuraFX, SnowFX)
// 3. Lottie Desk Companion Loader (Google Noto animations into #lottie-desk-slot)
// 4. GSAP Volumetric Desk Lamp Breathing & Fairy Lights Organic Twinkle
// 5. Pomodoro Timer State Reactions (studying, break, paused)

class EkagraaAnimationEngine {
  constructor() {
    this.animEnabled = true;
    this.timerState = 'paused';
    this.currentScene = 'cafe';
    this.weatherCanvas = null;
    this.weatherCtx = null;
    this.weatherRaf = null;
    this.lottieAnim = null;
    this.lightTweens = [];
    this.moteElements = [];

    // Weather Particles
    this.raindrops = [];
    this.rainBeads = [];
    this.sakuraPetals = [];
    this.snowFlakes = [];

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => this.init());
    } else {
      this.init();
    }
  }

  init() {
    this.initWeatherCanvas();
    this.initGSAPLighting();
    this.initFairyLightsTwinkle();
    this.initZenSanctuaryFX();
    this.loadDefaultLottie();

    // Check localStorage for saved animation preference
    try {
      const saved = localStorage.getItem('ekagraa_state');
      if (saved) {
        const state = JSON.parse(saved);
        if (state.animEnabled !== undefined) {
          this.setAnimEnabled(!!state.animEnabled);
        }
        if (state.scene) {
          this.setScene(state.scene);
        }
      }
    } catch (e) {}
  }

  /* =========================================================================
     1. MASTER ANIMATION TOGGLE (ON / OFF)
     ========================================================================= */
  setAnimEnabled(enabled) {
    this.animEnabled = !!enabled;

    if (!this.animEnabled) {
      document.body.classList.add('anim-off');

      // Pause GSAP Global Timeline
      if (typeof gsap !== 'undefined' && gsap.globalTimeline) {
        gsap.globalTimeline.pause();
      }

      // Pause Lottie
      if (this.lottieAnim && typeof this.lottieAnim.pause === 'function') {
        this.lottieAnim.pause();
      }

      // Stop Canvas Weather RAF
      if (this.weatherRaf) {
        cancelAnimationFrame(this.weatherRaf);
        this.weatherRaf = null;
      }

      // Clear Weather Canvas
      if (this.weatherCtx && this.weatherCanvas) {
        this.weatherCtx.clearRect(0, 0, this.weatherCanvas.width, this.weatherCanvas.height);
      }
    } else {
      document.body.classList.remove('anim-off');

      // Resume GSAP
      if (typeof gsap !== 'undefined' && gsap.globalTimeline) {
        gsap.globalTimeline.resume();
      }

      // Resume Lottie
      if (this.lottieAnim && typeof this.lottieAnim.play === 'function') {
        this.lottieAnim.play();
      }

      // Restart Weather RAF
      this.startWeatherLoop();
    }

    // Sync Header and Drawer UI buttons if present
    const pillIcon = document.getElementById('anim-pill-icon');
    const pillText = document.getElementById('anim-pill-text');
    if (pillIcon) pillIcon.textContent = this.animEnabled ? '🟢' : '⏸️';
    if (pillText) pillText.textContent = this.animEnabled ? 'Anim: ON' : 'Anim: OFF';

    const toggleBtn = document.getElementById('anim-toggle-btn');
    if (toggleBtn) toggleBtn.classList.toggle('off', !this.animEnabled);
  }

  toggleAnim() {
    this.setAnimEnabled(!this.animEnabled);
    return this.animEnabled;
  }

  /* =========================================================================
     2. CANVAS 2D WINDOW WEATHER ENGINE (RaindropFX, SakuraFX, SnowFX)
     ========================================================================= */
  initWeatherCanvas() {
    this.weatherCanvas = document.getElementById('window-weather-canvas');
    if (!this.weatherCanvas) return;
    this.weatherCtx = this.weatherCanvas.getContext('2d');

    this.resizeWeatherCanvas();
    window.addEventListener('resize', () => this.resizeWeatherCanvas());

    this.initWeatherParticles();
    if (this.animEnabled) this.startWeatherLoop();
  }

  resizeWeatherCanvas() {
    if (!this.weatherCanvas) return;
    const stage = document.getElementById('ghibli-stage');
    if (stage) {
      const rect = stage.getBoundingClientRect();
      this.weatherCanvas.width = 1040;
      this.weatherCanvas.height = 440;
    }
  }

  initWeatherParticles() {
    const W = 1040;
    const H = 440;

    // A. RaindropFX: Fast falling streaks + realistic glass beads
    this.raindrops = [];
    for (let i = 0; i < 45; i++) {
      this.raindrops.push({
        x: Math.random() * W,
        y: Math.random() * H,
        vy: 14 + Math.random() * 8,
        length: 20 + Math.random() * 25,
        alpha: 0.2 + Math.random() * 0.4
      });
    }

    this.rainBeads = [];
    for (let i = 0; i < 18; i++) {
      this.rainBeads.push({
        x: 80 + Math.random() * 880,
        y: 30 + Math.random() * 240,
        r: 1.5 + Math.random() * 2.5,
        vy: 0.15 + Math.random() * 0.4,
        trail: []
      });
    }

    // B. SakuraFX: Drifting Cherry Blossoms (벚꽃)
    this.sakuraPetals = [];
    for (let i = 0; i < 22; i++) {
      this.sakuraPetals.push({
        x: Math.random() * W,
        y: Math.random() * H,
        z: Math.random() * 0.8 + 0.4,
        size: 9 + Math.random() * 5,
        rot: Math.random() * 360,
        rotSpeed: (Math.random() - 0.5) * 2.5,
        vx: 1.2 + Math.random() * 1.5,
        vy: 0.8 + Math.random() * 1.0,
        swing: Math.random() * Math.PI * 2,
        swingSpeed: 0.03 + Math.random() * 0.02
      });
    }

    // C. SnowFX: Soft winter snowfall
    this.snowFlakes = [];
    for (let i = 0; i < 35; i++) {
      this.snowFlakes.push({
        x: Math.random() * W,
        y: Math.random() * H,
        r: 1.5 + Math.random() * 2.5,
        vy: 0.8 + Math.random() * 1.2,
        vx: (Math.random() - 0.5) * 0.6,
        alpha: 0.4 + Math.random() * 0.5
      });
    }
  }

  startWeatherLoop() {
    if (this.weatherRaf) cancelAnimationFrame(this.weatherRaf);

    const render = () => {
      if (!this.animEnabled) return;
      this.renderWeatherFrame();
      this.weatherRaf = requestAnimationFrame(render);
    };

    this.weatherRaf = requestAnimationFrame(render);
  }

  renderWeatherFrame() {
    const ctx = this.weatherCtx;
    if (!ctx || !this.weatherCanvas) return;
    const W = this.weatherCanvas.width;
    const H = this.weatherCanvas.height;

    ctx.clearRect(0, 0, W, H);

    const scene = document.body.dataset.s || this.currentScene;

    // 1. RAIN SCENE (RaindropFX: Refractive streaks and beads)
    if (scene === 'rain') {
      ctx.lineWidth = 1.2;
      ctx.lineCap = 'round';

      // Fast Rain streaks
      this.raindrops.forEach(drop => {
        drop.y += drop.vy;
        drop.x -= drop.vy * 0.12; // slight wind slant
        if (drop.y > 280) {
          drop.y = 20;
          drop.x = Math.random() * W;
        }

        ctx.strokeStyle = `rgba(165, 215, 255, ${drop.alpha})`;
        ctx.beginPath();
        ctx.moveTo(drop.x, drop.y);
        ctx.lineTo(drop.x - 3, drop.y + drop.length);
        ctx.stroke();
      });

      // Glass water beads with trails
      this.rainBeads.forEach(bead => {
        bead.y += bead.vy;
        if (bead.y > 275) {
          bead.y = 25;
          bead.x = 80 + Math.random() * 880;
        }

        // Drop shadow / refraction
        ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
        ctx.beginPath();
        ctx.arc(bead.x, bead.y, bead.r, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = 'rgba(125, 211, 252, 0.25)';
        ctx.beginPath();
        ctx.arc(bead.x + 0.6, bead.y + 0.6, bead.r * 0.7, 0, Math.PI * 2);
        ctx.fill();
      });
    }

    // 2. CHERRY / SPRING / CAFE SCENE (SakuraFX: Falling Cherry Blossom Petals)
    if (scene === 'cherry' || scene === 'cafe') {
      this.sakuraPetals.forEach(p => {
        p.swing += p.swingSpeed;
        p.x += p.vx + Math.sin(p.swing) * 0.8;
        p.y += p.vy;
        p.rot += p.rotSpeed;

        if (p.y > 320 || p.x > W + 20) {
          p.y = 15;
          p.x = Math.random() * (W * 0.8);
        }

        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate((p.rot * Math.PI) / 180);
        ctx.scale(p.z, p.z);

        // Petal Gradient
        const grad = ctx.createRadialGradient(0, 0, 1, 0, 0, p.size);
        grad.addColorStop(0, 'rgba(255, 225, 235, 0.85)');
        grad.addColorStop(0.6, 'rgba(255, 182, 193, 0.75)');
        grad.addColorStop(1, 'rgba(244, 114, 182, 0.6)');

        ctx.fillStyle = grad;
        ctx.beginPath();
        // Delicate Sakura Petal Shape
        ctx.moveTo(0, -p.size * 0.9);
        ctx.bezierCurveTo(p.size * 0.75, -p.size * 0.8, p.size * 0.75, p.size * 0.4, 0, p.size * 0.9);
        ctx.bezierCurveTo(-p.size * 0.75, p.size * 0.4, -p.size * 0.75, -p.size * 0.8, 0, -p.size * 0.9);
        ctx.fill();

        ctx.restore();
      });
    }

    // 3. SNOW SCENE (SnowFX: Soft floating snowflakes)
    if (scene === 'snow') {
      this.snowFlakes.forEach(s => {
        s.y += s.vy;
        s.x += s.vx + Math.sin(s.y * 0.02) * 0.4;
        if (s.y > 300) {
          s.y = 20;
          s.x = Math.random() * W;
        }

        ctx.fillStyle = `rgba(255, 255, 255, ${s.alpha})`;
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fill();
      });
    }
  }

  setScene(sceneId) {
    this.currentScene = sceneId;
  }

  /* =========================================================================
     3. LOTTIE COMPANION LOADER (lottie-web into #lottie-desk-slot)
     ========================================================================= */
  loadDefaultLottie() {
    // Steaming coffee or books companion
    this.loadLottieCompanion('https://fonts.gstatic.com/s/e/notoemoji/latest/2615/lottie.json');
  }

  loadLottieCompanion(url) {
    if (typeof lottie === 'undefined' && typeof bodymovin === 'undefined') {
      setTimeout(() => this.loadLottieCompanion(url), 250);
      return;
    }

    const lib = window.lottie || window.bodymovin;
    const container = document.getElementById('lottie-desk-slot');
    if (!container) return;

    if (this.lottieAnim) {
      try { this.lottieAnim.destroy(); } catch (e) {}
      this.lottieAnim = null;
    }

    container.innerHTML = '';

    try {
      this.lottieAnim = lib.loadAnimation({
        container: container,
        renderer: 'svg',
        loop: true,
        autoplay: this.animEnabled,
        path: url
      });
    } catch (e) {
      console.warn('Lottie load error:', e);
    }
  }

  /* =========================================================================
     4. GSAP VOLUMETRIC DESK LAMP & FAIRY LIGHTS BREATHING
     ========================================================================= */
  initGSAPLighting() {
    if (typeof gsap === 'undefined') {
      setTimeout(() => this.initGSAPLighting(), 150);
      return;
    }

    // A. Warm Architect Lamp Glow Breathing (Smooth sine pulse)
    const lampHalo = document.getElementById('lamp-cone-el');
    if (lampHalo) {
      this.lightTweens.push(
        gsap.to(lampHalo, {
          opacity: 0.42,
          duration: 3.2,
          yoyo: true,
          repeat: -1,
          ease: 'sine.inOut'
        })
      );
    }

    // B. Lamp Bulb Filament Flicker
    const bulb = document.getElementById('lamp-bulb-el');
    if (bulb) {
      this.lightTweens.push(
        gsap.to(bulb, {
          opacity: 0.82,
          scale: 0.96,
          duration: 1.8,
          yoyo: true,
          repeat: -1,
          ease: 'rough({template: none.out, strength: 1, points: 15, taper: none, randomize: true, clamp: false})'
        })
      );
    }
  }

  initFairyLightsTwinkle() {
    if (typeof gsap === 'undefined') {
      setTimeout(() => this.initFairyLightsTwinkle(), 200);
      return;
    }

    // Fairy string lights across studio window (smooth organic opacity twinkle)
    const fairyBulbs = document.querySelectorAll('#fairy-lights circle');
    fairyBulbs.forEach((bulb, i) => {
      const dur = 1.1 + ((i * 5) % 7) * 0.18;
      const delay = (i * 0.22) % 1.5;

      this.lightTweens.push(
        gsap.to(bulb, {
          opacity: 0.24,
          duration: dur,
          yoyo: true,
          repeat: -1,
          delay: delay,
          ease: 'sine.inOut'
        })
      );
    });

    // Night stars / city window lights
    const stars = document.querySelectorAll('.blink-1, .blink-2, .blink-3');
    stars.forEach((star, i) => {
      if (star.closest && star.closest('#fairy-lights')) return;
      const dur = 1.3 + (i % 3) * 0.5;
      const delay = (i * 0.35) % 2.0;

      this.lightTweens.push(
        gsap.to(star, {
          opacity: 0.2,
          duration: dur,
          yoyo: true,
          repeat: -1,
          delay: delay,
          ease: 'sine.inOut'
        })
      );
    });
  }

  initZenSanctuaryFX() {
    if (typeof gsap === 'undefined') return;

    // Concentric Aura Rings in Zen Mode
    const ring1 = document.querySelector('.zen-ring-1');
    const ring2 = document.querySelector('.zen-ring-2');
    if (ring1) {
      this.lightTweens.push(
        gsap.fromTo(ring1,
          { scale: 0.6, opacity: 0.7, transformOrigin: 'center center' },
          { scale: 1.6, opacity: 0, duration: 4.5, repeat: -1, ease: 'power1.out' }
        )
      );
    }
    if (ring2) {
      this.lightTweens.push(
        gsap.fromTo(ring2,
          { scale: 0.6, opacity: 0.6, transformOrigin: 'center center' },
          { scale: 1.6, opacity: 0, duration: 4.5, delay: 2.2, repeat: -1, ease: 'power1.out' }
        )
      );
    }

    // Floating Spirit Orbs
    const spiritOrbs = document.querySelectorAll('.g-orb');
    spiritOrbs.forEach((orb, i) => {
      this.lightTweens.push(
        gsap.to(orb, {
          y: -12,
          duration: 3.2 + i * 0.5,
          yoyo: true,
          repeat: -1,
          ease: 'sine.inOut'
        })
      );
    });
  }

  /* =========================================================================
     5. POMODORO TIMER STATE TRANSITIONS (Focus / Break / Paused)
     ========================================================================= */
  setTimerState(state, remainingSeconds) {
    this.timerState = state;

    const lampCone = document.getElementById('lamp-cone-el');

    if (state === 'studying') {
      document.body.classList.remove('in-break-mode');
      if (typeof gsap !== 'undefined' && lampCone) {
        gsap.to(lampCone, { opacity: 0.62, duration: 1.2, ease: 'power2.out' });
      }
      this.clearLightMotes();
    } else if (state === 'break') {
      document.body.classList.add('in-break-mode');
      if (typeof gsap !== 'undefined' && lampCone) {
        gsap.to(lampCone, { opacity: 0.45, duration: 1.2, ease: 'power2.out' });
      }
      this.spawnGentleLightMotes();
    } else {
      document.body.classList.remove('in-break-mode');
      if (typeof gsap !== 'undefined' && lampCone) {
        gsap.to(lampCone, { opacity: 0.38, duration: 1.2, ease: 'power2.out' });
      }
      this.clearLightMotes();
    }
  }

  spawnGentleLightMotes() {
    this.clearLightMotes();
    const container = document.getElementById('break-particles-layer');
    if (!container) return;

    this.moteElements = [];
    const lightGlints = ['✨', '🌟', '·', '✦', '💫'];

    for (let i = 0; i < 6; i++) {
      const glint = document.createElement('div');
      glint.className = 'break-floating-symbol';
      glint.textContent = lightGlints[i % lightGlints.length];
      glint.style.position = 'absolute';
      glint.style.left = `${390 + Math.random() * 80}px`;
      glint.style.top = `${215 + Math.random() * 35}px`;
      glint.style.fontSize = `${12 + Math.random() * 8}px`;
      glint.style.color = '#fef08a';
      glint.style.opacity = '0';
      glint.style.pointerEvents = 'none';
      container.appendChild(glint);
      this.moteElements.push(glint);

      if (typeof gsap !== 'undefined') {
        gsap.to(glint, {
          y: -55 - Math.random() * 40,
          opacity: 0.85,
          scale: 1.25,
          duration: 2.6 + Math.random() * 1.4,
          repeat: -1,
          delay: i * 0.45,
          ease: 'power1.out',
          onRepeat: () => { glint.style.opacity = '0'; }
        });
      }
    }
  }

  clearLightMotes() {
    if (this.moteElements && this.moteElements.length) {
      this.moteElements.forEach(el => {
        if (typeof gsap !== 'undefined') gsap.killTweensOf(el);
        el.remove();
      });
      this.moteElements = [];
    }
  }

  setSpeed() {}
  setEngine() {}
}

// Global Singleton Export
window.AnimationController = EkagraaAnimationEngine;
window.animEngine = new EkagraaAnimationEngine();
