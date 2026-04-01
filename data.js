(() => {
  "use strict";

  const SB = (window.Shardbound = window.Shardbound || {});

  SB.canvas = document.getElementById("gameCanvas");
  SB.ctx = SB.canvas.getContext("2d");
  SB.ui = {
    missionGrid: document.getElementById("missionGrid"),
    upgradeGrid: document.getElementById("upgradeGrid"),
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
    gravity: 1520,
    maxDt: 1 / 30,
    saveKey: "shardbound-rush-save-v2",
    coarsePointer:
      window.matchMedia("(pointer: coarse)").matches ||
      (typeof navigator !== "undefined" && navigator.maxTouchPoints > 0)
  };

  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const lerp = (a, b, t) => a + (b - a) * t;
  const mod = (value, base) => ((value % base) + base) % base;
  const overlap = (a, b) =>
    a.x < b.x + b.w &&
    a.x + a.w > b.x &&
    a.y < b.y + b.h &&
    a.y + a.h > b.y;

  const distanceSq = (ax, ay, bx, by) => {
    const dx = ax - bx;
    const dy = ay - by;
    return dx * dx + dy * dy;
  };

  function formatTime(seconds) {
    const safe = Math.max(0, Math.floor(seconds));
    const mins = Math.floor(safe / 60);
    const secs = safe % 60;
    return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
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

  function roundRectPath(target, x, y, w, h, r) {
    const radius = Math.min(r, w * 0.5, h * 0.5);
    target.beginPath();
    target.moveTo(x + radius, y);
    target.arcTo(x + w, y, x + w, y + h, radius);
    target.arcTo(x + w, y + h, x, y + h, radius);
    target.arcTo(x, y + h, x, y, radius);
    target.arcTo(x, y, x + w, y, radius);
    target.closePath();
  }

  function drawRoundedPanel(ctx, x, y, w, h, r, fillStyle, strokeStyle) {
    roundRectPath(ctx, x, y, w, h, r);
    ctx.fillStyle = fillStyle;
    ctx.fill();
    if (strokeStyle) {
      ctx.lineWidth = 1.2;
      ctx.strokeStyle = strokeStyle;
      ctx.stroke();
    }
  }

  function drawHeart(ctx, x, y, size, filled) {
    ctx.save();
    ctx.translate(x, y);
    ctx.beginPath();
    ctx.moveTo(0, size * 0.32);
    ctx.bezierCurveTo(0, 0, size * 0.42, 0, size * 0.5, size * 0.24);
    ctx.bezierCurveTo(size * 0.58, 0, size, 0, size, size * 0.32);
    ctx.bezierCurveTo(size, size * 0.56, size * 0.78, size * 0.8, size * 0.5, size);
    ctx.bezierCurveTo(size * 0.22, size * 0.8, 0, size * 0.56, 0, size * 0.32);
    ctx.closePath();
    ctx.fillStyle = filled ? "#ff7d7d" : "rgba(255,255,255,0.18)";
    ctx.fill();
    ctx.strokeStyle = filled ? "#ffe1d7" : "rgba(255,255,255,0.28)";
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();
  }

  function drawStar(ctx, x, y, radius, fillStyle, strokeStyle) {
    ctx.save();
    ctx.translate(x, y);
    ctx.beginPath();
    for (let i = 0; i < 10; i += 1) {
      const angle = -Math.PI / 2 + (i * Math.PI) / 5;
      const r = i % 2 === 0 ? radius : radius * 0.45;
      const px = Math.cos(angle) * r;
      const py = Math.sin(angle) * r;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fillStyle = fillStyle;
    ctx.fill();
    ctx.strokeStyle = strokeStyle;
    ctx.lineWidth = 1.4;
    ctx.stroke();
    ctx.restore();
  }

  function drawShardShape(ctx, x, y, scale, fillA, fillB) {
    ctx.save();
    ctx.translate(x, y);
    const gradient = ctx.createLinearGradient(-scale, -scale, scale, scale);
    gradient.addColorStop(0, fillA);
    gradient.addColorStop(1, fillB);
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.moveTo(0, -scale);
    ctx.lineTo(scale * 0.75, -scale * 0.15);
    ctx.lineTo(scale * 0.42, scale);
    ctx.lineTo(-scale * 0.42, scale);
    ctx.lineTo(-scale * 0.75, -scale * 0.15);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.55)";
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();
  }

  SB.utils = {
    clamp,
    lerp,
    mod,
    overlap,
    distanceSq,
    formatTime,
    hashString,
    mulberry32,
    roundRectPath,
    drawRoundedPanel,
    drawHeart,
    drawStar,
    drawShardShape
  };

  SB.htmlStars = (stars) => {
    let html = '<div class="stars">';
    for (let i = 0; i < 3; i += 1) {
      html += `<span class="star ${i < stars ? "is-on" : ""}">&#9733;</span>`;
    }
    html += "</div>";
    return html;
  };

  SB.data = {
    themes: {
      verdant: {
        name: "Verdant Reach",
        uiAccent: "#79d3a7",
        uiHot: "#f2b36d",
        skyTop: "#99ddff",
        skyMid: "#67b2d9",
        skyBottom: "#1f4e6b",
        sun: "#fff3b5",
        haze: "#d9f6ff",
        farA: "#6b8b6d",
        farB: "#58735a",
        nearA: "#416546",
        nearB: "#2c4831",
        groundTop: "#89d875",
        groundSide: "#4f6f42",
        groundShadow: "#253e2a",
        platformTop: "#ead08f",
        platformSide: "#966640",
        platformEdge: "#fff4c3",
        movingTop: "#9feaff",
        movingSide: "#2e8398",
        hazard: "#dc5346",
        checkpoint: "#70e3ac",
        goal: "#ffe89c",
        weather: "leaf",
        musicRoots: [50, 55, 57, 53]
      },
      ember: {
        name: "Cinder Frontier",
        uiAccent: "#ffb36b",
        uiHot: "#ef7251",
        skyTop: "#ffd59c",
        skyMid: "#df8852",
        skyBottom: "#622833",
        sun: "#fff0bd",
        haze: "#ffd7b4",
        farA: "#8f5d44",
        farB: "#6a4334",
        nearA: "#55342a",
        nearB: "#37241d",
        groundTop: "#d28756",
        groundSide: "#7d432f",
        groundShadow: "#47251b",
        platformTop: "#f0c47d",
        platformSide: "#9d5d36",
        platformEdge: "#ffe1a8",
        movingTop: "#ffc58f",
        movingSide: "#a35d36",
        hazard: "#ff5d4c",
        checkpoint: "#ffd27b",
        goal: "#ffe7a6",
        weather: "ash",
        musicRoots: [43, 48, 46, 41]
      },
      glacier: {
        name: "Glacier Crown",
        uiAccent: "#8dd8ff",
        uiHot: "#d5f0ff",
        skyTop: "#d9f4ff",
        skyMid: "#7fb8e8",
        skyBottom: "#244a75",
        sun: "#ffffff",
        haze: "#d5ebff",
        farA: "#8ea5c0",
        farB: "#6d83a1",
        nearA: "#546f8f",
        nearB: "#40596f",
        groundTop: "#f0fbff",
        groundSide: "#7ea6c9",
        groundShadow: "#35506f",
        platformTop: "#dff5ff",
        platformSide: "#74a0c6",
        platformEdge: "#ffffff",
        movingTop: "#c0f2ff",
        movingSide: "#4a8db0",
        hazard: "#6dd0ff",
        checkpoint: "#9ae8ff",
        goal: "#fff7d3",
        weather: "snow",
        musicRoots: [55, 62, 59, 52]
      },
      storm: {
        name: "Stormglass Citadel",
        uiAccent: "#83d0d9",
        uiHot: "#f4c176",
        skyTop: "#314b6d",
        skyMid: "#24344c",
        skyBottom: "#0d1622",
        sun: "#dbe8ff",
        haze: "#6b7c92",
        farA: "#415164",
        farB: "#2e3c4c",
        nearA: "#25303c",
        nearB: "#1a232c",
        groundTop: "#7f92a8",
        groundSide: "#4a5866",
        groundShadow: "#25303b",
        platformTop: "#b3c3cf",
        platformSide: "#5e6e7b",
        platformEdge: "#eff6ff",
        movingTop: "#c8e8f5",
        movingSide: "#4a7488",
        hazard: "#f1644d",
        checkpoint: "#83d0d9",
        goal: "#ffe6a1",
        weather: "rain",
        musicRoots: [45, 50, 43, 48]
      }
    },
    stages: [
      { id: 1, world: "Verdant Reach", name: "Mosswind Path", theme: "verdant", difficulty: 1, segments: 10, parTime: 44, coinGoal: 18, clearReward: 85, description: "Warm-up route with soft gaps, fast shard lines, and forgiving enemy pacing." },
      { id: 2, world: "Verdant Reach", name: "Canopy Relay", theme: "verdant", difficulty: 1.2, segments: 11, parTime: 48, coinGoal: 20, clearReward: 95, description: "More split paths and cleaner speed lines if you stay above the ground traffic." },
      { id: 3, world: "Verdant Reach", name: "Sunroot Arch", theme: "verdant", difficulty: 1.35, segments: 12, parTime: 52, coinGoal: 22, clearReward: 110, description: "First true routing test with lifts, layered shards, and longer pressure chains." },
      { id: 4, world: "Cinder Frontier", name: "Redrock Line", theme: "ember", difficulty: 1.55, segments: 12, parTime: 56, coinGoal: 24, clearReward: 125, description: "Hot cliffs and sharper jump windows turn the tempo way up." },
      { id: 5, world: "Cinder Frontier", name: "Ashrail Hollow", theme: "ember", difficulty: 1.7, segments: 13, parTime: 60, coinGoal: 25, clearReward: 135, description: "Lower ceilings, repeated spike strips, and a cleaner reward for precision play." },
      { id: 6, world: "Cinder Frontier", name: "Forge Span", theme: "ember", difficulty: 1.9, segments: 14, parTime: 66, coinGoal: 27, clearReward: 150, description: "Moving lifts and stacked hazard pockets make reruns worth the grind." },
      { id: 7, world: "Glacier Crown", name: "Frostline Run", theme: "glacier", difficulty: 2.05, segments: 14, parTime: 68, coinGoal: 28, clearReward: 160, description: "Long sightlines, icy silhouettes, and cleaner air routes for bold players." },
      { id: 8, world: "Glacier Crown", name: "Aurora Span", theme: "glacier", difficulty: 2.2, segments: 15, parTime: 72, coinGoal: 30, clearReward: 175, description: "Wide pits and lift timing reward patience more than panic." },
      { id: 9, world: "Glacier Crown", name: "Lantern Vault", theme: "glacier", difficulty: 2.4, segments: 15, parTime: 74, coinGoal: 32, clearReward: 185, description: "Dense hover patrols and alternate upper routes boost score and payout." },
      { id: 10, world: "Stormglass Citadel", name: "Thunder Walk", theme: "storm", difficulty: 2.55, segments: 16, parTime: 78, coinGoal: 34, clearReward: 195, description: "Rain-swept towers with tighter decision windows and harsher recovery lines." },
      { id: 11, world: "Stormglass Citadel", name: "Tempest Lift", theme: "storm", difficulty: 2.75, segments: 17, parTime: 82, coinGoal: 36, clearReward: 210, description: "Heavy lift chains, fast gaps, and cleaner routing if your upgrades are online." },
      { id: 12, world: "Stormglass Citadel", name: "Crown Vault Apex", theme: "storm", difficulty: 3, segments: 18, parTime: 88, coinGoal: 38, clearReward: 240, description: "Final skyline gauntlet tuned for speed, survival, and replay mastery." }
    ],
    upgrades: [
      { id: "stride", name: "Stride Greaves", max: 4, costs: [160, 250, 360, 500], summary: "More ground speed and sharper acceleration.", detail: (rank) => `Move speed ${290 + rank * 18} and cleaner lane control.` },
      { id: "spring", name: "Pulse Springs", max: 4, costs: [150, 230, 330, 460], summary: "Stronger jumps and better late jump forgiveness.", detail: (rank) => `Jump force ${570 + rank * 24} with longer coyote time.` },
      { id: "reactor", name: "Dash Reactor", max: 4, costs: [170, 260, 370, 520], summary: "Faster dashes with shorter cooldowns.", detail: (rank) => `Cooldown ${Math.max(0.55, 0.98 - rank * 0.09).toFixed(2)}s and stronger burst speed.` },
      { id: "heart", name: "Aegis Plating", max: 3, costs: [180, 290, 440], summary: "More health to survive bad landings and rough reads.", detail: (rank) => `Max health ${4 + rank} and more room to finish tense routes.` },
      { id: "magnet", name: "Shard Magnet", max: 4, costs: [140, 220, 310, 430], summary: "Pull in nearby shards and bank stronger shard payouts.", detail: (rank) => `Pickup radius ${28 + rank * 22} with bigger end-of-run value.` },
      { id: "wing", name: "Glider Rig", max: 3, costs: [210, 320, 470], summary: "Improves air control and softens fast falls.", detail: (rank) => `Fall speed cap ${420 - rank * 50} and extra air jump at rank 2+.` }
    ]
  };

  SB.getSaveRecord = (targetSave, stageId) => {
    if (!targetSave.levels[stageId]) {
      targetSave.levels[stageId] = {
        stars: 0,
        cleared: false,
        bestTime: null,
        bestScore: 0,
        bestShards: 0,
        flawless: false
      };
    }
    return targetSave.levels[stageId];
  };

  SB.recalcSaveTotals = (targetSave) => {
    let totalStars = 0;
    let clearedCount = 0;
    let masteredCount = 0;
    for (const stage of SB.data.stages) {
      const record = SB.getSaveRecord(targetSave, stage.id);
      totalStars += record.stars;
      if (record.cleared) clearedCount += 1;
      if (record.stars === 3) masteredCount += 1;
    }
    targetSave.totalStars = totalStars;
    targetSave.clearedCount = clearedCount;
    targetSave.masteredCount = masteredCount;
  };

  SB.createDefaultSave = () => ({
    bank: 180,
    highestUnlocked: 1,
    selectedStageId: 1,
    upgrades: { stride: 0, spring: 0, reactor: 0, heart: 0, magnet: 0, wing: 0 },
    levels: {},
    settings: { muted: false }
  });

  SB.loadSave = () => {
    const saveData = SB.createDefaultSave();
    try {
      const parsed = JSON.parse(localStorage.getItem(SB.config.saveKey));
      if (parsed && typeof parsed === "object") {
        saveData.bank = Number.isFinite(parsed.bank) ? parsed.bank : saveData.bank;
        saveData.highestUnlocked = Number.isFinite(parsed.highestUnlocked)
          ? clamp(Math.floor(parsed.highestUnlocked), 1, SB.data.stages.length)
          : saveData.highestUnlocked;
        saveData.selectedStageId = Number.isFinite(parsed.selectedStageId)
          ? clamp(Math.floor(parsed.selectedStageId), 1, SB.data.stages.length)
          : saveData.selectedStageId;
        saveData.settings.muted = Boolean(parsed.settings && parsed.settings.muted);
        if (parsed.upgrades && typeof parsed.upgrades === "object") {
          for (const def of SB.data.upgrades) {
            const value = parsed.upgrades[def.id];
            saveData.upgrades[def.id] = Number.isFinite(value) ? clamp(Math.floor(value), 0, def.max) : 0;
          }
        }
        if (parsed.levels && typeof parsed.levels === "object") {
          for (const stage of SB.data.stages) {
            const source = parsed.levels[stage.id];
            if (!source || typeof source !== "object") continue;
            saveData.levels[stage.id] = {
              stars: Number.isFinite(source.stars) ? clamp(Math.floor(source.stars), 0, 3) : 0,
              cleared: Boolean(source.cleared),
              bestTime: Number.isFinite(source.bestTime) ? Math.max(0, source.bestTime) : null,
              bestScore: Number.isFinite(source.bestScore) ? Math.max(0, source.bestScore) : 0,
              bestShards: Number.isFinite(source.bestShards) ? Math.max(0, source.bestShards) : 0,
              flawless: Boolean(source.flawless)
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
