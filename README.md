# 🫧 Ekagraa · Study Along Workspace

> An aesthetic, immersive, and interactive Study Along & Pomodoro focus workspace engineered for peak productivity and flow state.

---

## ✨ Features

- ⏳ **Smart Focus & Pomodoro Engine**: Customizable Pomodoro, Short Break, and Long Break intervals with smooth progress tracking and real-time audio/visual notifications.
- 🧘 **Dynamic Ambient Environments**: Switch seamlessly across immersive ambient atmospheres (Cozy Café, Rain & Thunder, Forest Zen, Midnight Library, Ocean Waves).
- 🎨 **Glassmorphism & Rich Animations**: Modern, fluid UI powered by GSAP, Canvas Confetti celebrations, and Lottie animations.
- 🌐 **Multilingual Localization (i18n)**: Comprehensive multi-language support with automatic RTL/LTR detection.
- 📝 **Productivity Suite**:
  - Focus task checklist with progress tracker.
  - Daily focus metrics and streak tracking.
  - Ambient audio soundscapes and volume controls.
  - Fullscreen Zen mode for distraction-free sessions.

---

## 🚀 Getting Started

### Option 1: Direct Browser
Simply open `ekagraa/index.html` in any modern web browser.

### Option 2: Local HTTP Server (Recommended)
You can run a lightweight static server using `serve`, `http-server`, or Python:

```bash
# Using npx serve
npx serve ekagraa -l 3000

# Or with Python
python -m http.server 3000 --directory ekagraa
```

Then navigate to: `http://localhost:3000`

---

## 📂 Project Structure

```text
Study along/
├── ekagraa/
│   ├── index.html         # Main application markup & structure
│   ├── styles.css         # Glassmorphism aesthetic design & themes
│   ├── app.js             # Core Pomodoro logic, soundscapes & state
│   ├── animations.js      # GSAP & dynamic interaction animations
│   ├── i18n.js            # Internationalization & translations
│   └── favicon*           # App icons and graphics
├── .gitignore
└── README.md
```

---

## 🛠️ Built With

- **HTML5 & CSS3** (Vanilla CSS with CSS Custom Properties & Glassmorphism)
- **JavaScript (ES6+)**
- **GSAP (GreenSock)** for high-performance transitions and reactive animations
- **Canvas Confetti** for milestone celebrations
- **Web Audio API** for binaural ambient sound mixing
