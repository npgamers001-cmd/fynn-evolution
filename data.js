(() => {
  "use strict";

  const SB = (window.Shardbound = window.Shardbound || {});

  SB.canvas = document.getElementById("gameCanvas");
  SB.ctx = SB.canvas.getContext("2d");
  SB.ui = {
    courseGrid: document.getElementById("courseGrid"),
    intelPanel: document.getElementById("intelPanel"),
    summaryPanel: document.getElementById("summaryPanel"),
    objectivePanel: document.getElementById("objectivePanel"),
    controlPanel: document.getElementById("controlPanel"),
    primaryAction: document.getElementById("primaryAction"),
    secondaryAction: document.getElementById("secondaryAction"),
    muteButton: document.getElementById("muteButton"),
    touchControls: document.getElementById("touchControls")
  };

  SB.config = {
    viewWidth: 960,
    viewHeight: 540,
    gravity: 1020,
    maxDt: 1 / 30,
    saveKey: "skyline-obby-run-save-v1",
    coarsePointer:
      window.matchMedia("(pointer: coarse)").matches ||
      (typeof navigator !== "undefined" && navigator.maxTouchPoints > 0)
  };

  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const lerp = (a, b, t) => a + (b - a) * t;
  const mod = (value, base) => ((value % base) + base) % base;

  function formatTime(seconds) {
    const safe = Math.max(0, seconds);
    const mins = Math.floor(safe / 60);
    const secs = Math.floor(safe % 60);
    const hundredths = Math.floor((safe - Math.floor(safe)) * 100);
    return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}.${String(hundredths).padStart(2, "0")}`;
  }

  function hashString(value) {
    let hash = 1779033703 ^ value.length;
    for (let i = 0; i < value.length; i += 1) {
      hash = Math.imul(hash ^ value.charCodeAt(i), 3432918353);
      hash = (hash << 13) | (hash >>> 19);
    }
    return () => {
      hash = Math.imul(hash ^ (hash >>> 16), 2246822507);
      hash = Math.imul(hash ^ (hash >>> 13), 3266489909);
      hash ^= hash >>> 16;
      return hash >>> 0;
    };
  }

  function mulberry32(seed) {
    let value = seed >>> 0;
    return () => {
      value += 0x6d2b79f5;
      let t = value;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function overlap1d(aMin, aMax, bMin, bMax) {
    return aMin < bMax && aMax > bMin;
  }

  function rectOverlapXZ(a, b) {
    return overlap1d(a.x - a.w * 0.5, a.x + a.w * 0.5, b.x - b.w * 0.5, b.x + b.w * 0.5) &&
      overlap1d(a.z - a.d * 0.5, a.z + a.d * 0.5, b.z - b.d * 0.5, b.z + b.d * 0.5);
  }

  function hexToRgb(hex) {
    const clean = hex.replace("#", "");
    const value = clean.length === 3
      ? clean.split("").map((char) => char + char).join("")
      : clean;
    const int = Number.parseInt(value, 16);
    return {
      r: (int >> 16) & 255,
      g: (int >> 8) & 255,
      b: int & 255
    };
  }

  function rgba(hex, alpha) {
    if (typeof hex === "string" && hex.startsWith("rgba(")) {
      const parts = hex.slice(5, -1).split(",").map((part) => Number.parseFloat(part.trim()));
      return `rgba(${parts[0]}, ${parts[1]}, ${parts[2]}, ${alpha})`;
    }
    if (typeof hex === "string" && hex.startsWith("rgb(")) {
      const parts = hex.slice(4, -1).split(",").map((part) => Number.parseFloat(part.trim()));
      return `rgba(${parts[0]}, ${parts[1]}, ${parts[2]}, ${alpha})`;
    }
    const color = hexToRgb(hex);
    return `rgba(${color.r}, ${color.g}, ${color.b}, ${alpha})`;
  }

  function shade(hex, amount) {
    const color = hexToRgb(hex);
    const mix = amount < 0 ? 0 : 255;
    const ratio = Math.abs(amount);
    const blend = (channel) => Math.round(channel + (mix - channel) * ratio);
    return `rgb(${blend(color.r)}, ${blend(color.g)}, ${blend(color.b)})`;
  }

  const laneX = (lane) => lane * 110;

  SB.utils = {
    clamp,
    lerp,
    mod,
    formatTime,
    hashString,
    mulberry32,
    overlap1d,
    rectOverlapXZ,
    rgba,
    shade,
    laneX
  };

  SB.htmlStars = (stars) => {
    let html = '<div class="stars">';
    for (let i = 0; i < 3; i += 1) html += `<span class="star ${i < stars ? "is-on" : ""}">&#9733;</span>`;
    html += "</div>";
    return html;
  };

  SB.data = {
    themes: {
      lava: {
        name: "Molten Verge",
        uiAccent: "#74f0bf",
        uiHot: "#ff9d5d",
        uiDeep: "#176652",
        skyTop: "#180f23",
        skyMid: "#6d2334",
        skyBottom: "#ff6b37",
        haze: "#ffd39c",
        sun: "#ffe7b0",
        platformTop: "#ffd29b",
        platformFront: "#c76b4f",
        platformSide: "#7f3430",
        rail: "#fff3c7",
        hazard: "#ff5844",
        checkpoint: "#ffe08b",
        orb: "#fff2b2",
        wind: "#ffc99c",
        gravity: "#f6b86f",
        goal: "#fff7d2",
        bgNear: "#40192d",
        bgFar: "#281120",
        particle: "#ffb172",
        musicRoots: [45, 48, 52, 55]
      },
      chrono: {
        name: "Paradox Lanes",
        uiAccent: "#8ee5ff",
        uiHot: "#ffd18a",
        uiDeep: "#2b5d83",
        skyTop: "#0b1a2d",
        skyMid: "#364f82",
        skyBottom: "#f1a66e",
        haze: "#d1e9ff",
        sun: "#fff3d2",
        platformTop: "#f3f2ff",
        platformFront: "#6a88c4",
        platformSide: "#324868",
        rail: "#ffffff",
        hazard: "#f8b74f",
        checkpoint: "#9de9ff",
        orb: "#dff7ff",
        wind: "#b8e7ff",
        gravity: "#ffe4ab",
        goal: "#ffffff",
        bgNear: "#273d60",
        bgFar: "#17253e",
        particle: "#b8ecff",
        musicRoots: [50, 55, 57, 62]
      },
      illusion: {
        name: "Mirage Heights",
        uiAccent: "#d4a7ff",
        uiHot: "#ffca7a",
        uiDeep: "#68438f",
        skyTop: "#170b25",
        skyMid: "#4d2c77",
        skyBottom: "#1a4568",
        haze: "#dfd3ff",
        sun: "#fff1ff",
        platformTop: "#eadbff",
        platformFront: "#8a67bc",
        platformSide: "#432761",
        rail: "#fff8ff",
        hazard: "#ff7fcf",
        checkpoint: "#f0c4ff",
        orb: "#fff2ff",
        wind: "#f8c1ff",
        gravity: "#d9b0ff",
        goal: "#fff3ff",
        bgNear: "#311847",
        bgFar: "#1d1131",
        particle: "#efc5ff",
        musicRoots: [52, 57, 60, 64]
      },
      storm: {
        name: "Cyclone Span",
        uiAccent: "#82f4df",
        uiHot: "#f4c873",
        uiDeep: "#1f6c70",
        skyTop: "#081425",
        skyMid: "#1f3550",
        skyBottom: "#5e7b9c",
        haze: "#d0deee",
        sun: "#edf7ff",
        platformTop: "#dce8f2",
        platformFront: "#7192b0",
        platformSide: "#2c465d",
        rail: "#ffffff",
        hazard: "#7fe8ff",
        checkpoint: "#94fff1",
        orb: "#f4fbff",
        wind: "#c7f4ff",
        gravity: "#d8f4ef",
        goal: "#fffce8",
        bgNear: "#20384d",
        bgFar: "#122334",
        particle: "#a8e6ff",
        musicRoots: [43, 47, 50, 55]
      },
      alien: {
        name: "Nova Drift",
        uiAccent: "#91ffa2",
        uiHot: "#98f1ff",
        uiDeep: "#275b50",
        skyTop: "#070d1f",
        skyMid: "#172455",
        skyBottom: "#18a0a5",
        haze: "#afffff",
        sun: "#d0ffe3",
        platformTop: "#d3fff0",
        platformFront: "#48a9a5",
        platformSide: "#174556",
        rail: "#f2fffb",
        hazard: "#79ffe3",
        checkpoint: "#b4ffac",
        orb: "#effff7",
        wind: "#9de7ff",
        gravity: "#9dffcb",
        goal: "#f1fff5",
        bgNear: "#143451",
        bgFar: "#0b1f34",
        particle: "#adfff0",
        musicRoots: [40, 45, 52, 57]
      }
    },
    courses: [
      {
        id: 1,
        name: "Lava Escape Obby",
        theme: "lava",
        parTime: 52,
        orbGoal: 12,
        difficulty: 1,
        description: "Vault across volcanic beams, moving bridges, and rising molten gaps before the floor catches up.",
        highlights: ["Rising lava", "Moving bridges", "Fast checkpoints"]
      },
      {
        id: 2,
        name: "Time Travel Obby",
        theme: "chrono",
        parTime: 60,
        orbGoal: 14,
        difficulty: 1.2,
        description: "Swap through clockwork lanes, drifting time gates, and split-era platforms that reward clean rhythm.",
        highlights: ["Clock gates", "Shifting lanes", "Long jumps"]
      },
      {
        id: 3,
        name: "Tower of Illusions",
        theme: "illusion",
        parTime: 68,
        orbGoal: 15,
        difficulty: 1.45,
        description: "Climb ghost platforms, mirrored beams, and reveal windows that only stay solid while the pulse is live.",
        highlights: ["Blink platforms", "Mirror paths", "Precision hops"]
      },
      {
        id: 4,
        name: "Tornado Survival Obby",
        theme: "storm",
        parTime: 76,
        orbGoal: 17,
        difficulty: 1.7,
        description: "Fight crosswinds, dodge sweeping gust arms, and thread narrow sky bridges inside a storm wall.",
        highlights: ["Wind push", "Sweeper hazards", "Narrow beams"]
      },
      {
        id: 5,
        name: "Alien Invasion Obby",
        theme: "alien",
        parTime: 84,
        orbGoal: 18,
        difficulty: 2,
        description: "Escape an anti-gravity station packed with hover pads, floating lanes, and long zero-g recovery jumps.",
        highlights: ["Low gravity", "Hover pads", "Final gauntlet"]
      }
    ]
  };

  SB.getCourseById = (courseId) => SB.data.courses.find((course) => course.id === courseId) || SB.data.courses[0];

  SB.getSaveRecord = (targetSave, courseId) => {
    if (!targetSave.courses[courseId]) {
      targetSave.courses[courseId] = {
        stars: 0,
        cleared: false,
        bestTime: null,
        bestOrbs: 0,
        bestRespawns: null
      };
    }
    return targetSave.courses[courseId];
  };

  SB.recalcSaveTotals = (targetSave) => {
    let totalStars = 0;
    let clearedCount = 0;
    for (const course of SB.data.courses) {
      const record = SB.getSaveRecord(targetSave, course.id);
      totalStars += record.stars;
      if (record.cleared) clearedCount += 1;
    }
    targetSave.totalStars = totalStars;
    targetSave.clearedCount = clearedCount;
  };

  SB.createDefaultSave = () => ({
    highestUnlocked: 1,
    selectedCourseId: 1,
    courses: {},
    settings: { muted: false }
  });

  SB.loadSave = () => {
    const saveData = SB.createDefaultSave();
    try {
      const parsed = JSON.parse(localStorage.getItem(SB.config.saveKey));
      if (parsed && typeof parsed === "object") {
        saveData.highestUnlocked = Number.isFinite(parsed.highestUnlocked)
          ? clamp(Math.floor(parsed.highestUnlocked), 1, SB.data.courses.length)
          : saveData.highestUnlocked;
        saveData.selectedCourseId = Number.isFinite(parsed.selectedCourseId)
          ? clamp(Math.floor(parsed.selectedCourseId), 1, SB.data.courses.length)
          : saveData.selectedCourseId;
        saveData.settings.muted = Boolean(parsed.settings && parsed.settings.muted);
        if (parsed.courses && typeof parsed.courses === "object") {
          for (const course of SB.data.courses) {
            const source = parsed.courses[course.id];
            if (!source || typeof source !== "object") continue;
            saveData.courses[course.id] = {
              stars: Number.isFinite(source.stars) ? clamp(Math.floor(source.stars), 0, 3) : 0,
              cleared: Boolean(source.cleared),
              bestTime: Number.isFinite(source.bestTime) ? Math.max(0, source.bestTime) : null,
              bestOrbs: Number.isFinite(source.bestOrbs) ? Math.max(0, source.bestOrbs) : 0,
              bestRespawns: Number.isFinite(source.bestRespawns) ? Math.max(0, source.bestRespawns) : null
            };
          }
        }
      }
    } catch {
      SB.recalcSaveTotals(saveData);
      return saveData;
    }
    SB.recalcSaveTotals(saveData);
    return saveData;
  };

  SB.saveData = SB.loadSave();

  SB.persistSave = () => {
    SB.recalcSaveTotals(SB.saveData);
    try {
      localStorage.setItem(SB.config.saveKey, JSON.stringify(SB.saveData));
    } catch {
      return;
    }
  };
})();
