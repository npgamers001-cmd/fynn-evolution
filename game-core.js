(() => {
  "use strict";

  const SB = window.Shardbound;
  const { clamp, lerp, mod, formatTime, hashString, mulberry32, rectOverlapXZ, laneX } = SB.utils;
  const { courses, themes } = SB.data;

  SB.state = {
    mode: "home",
    selectedCourseId: clamp(SB.saveData.selectedCourseId || 1, 1, courses.length),
    course: null,
    level: null,
    previewLevel: null,
    player: null,
    camera: { x: 0, y: 210, z: -280 },
    elapsed: 0,
    respawns: 0,
    orbsCollected: 0,
    particles: [],
    floatingTexts: [],
    toast: "",
    toastTimer: 0,
    screenShake: 0,
    previewTime: 0,
    uiRefreshTimer: 0,
    lastResults: null,
    windAudioTimer: 0
  };

  SB.input = { left: false, right: false, forward: false, back: false, jumpHeld: false };

  function createPlatform(level, options) {
    const platform = {
      id: level.platforms.length,
      kind: "platform",
      x: options.x,
      y: options.y,
      z: options.z,
      w: options.w ?? 120,
      d: options.d ?? 76,
      h: options.h ?? 30,
      baseX: options.x,
      baseY: options.y,
      baseZ: options.z,
      dx: 0,
      dy: 0,
      dz: 0,
      moving: options.moving || null,
      phantom: options.phantom || null
    };
    level.platforms.push(platform);
    return platform;
  }

  function addOrb(level, x, y, z, value = 1) {
    level.orbs.push({
      x,
      y,
      z,
      w: 20,
      d: 20,
      value,
      phase: Math.random() * Math.PI * 2,
      collected: false
    });
  }

  function addOrbLine(level, platform, count, height = 46) {
    for (let i = 0; i < count; i += 1) {
      const t = count === 1 ? 0.5 : i / (count - 1);
      addOrb(level, platform.x, platform.y + height, platform.z - platform.d * 0.32 + t * platform.d * 0.64);
    }
  }

  function addOrbArc(level, start, end, count, apex = 90) {
    for (let i = 0; i < count; i += 1) {
      const t = count === 1 ? 0.5 : i / (count - 1);
      addOrb(
        level,
        lerp(start.x, end.x, t),
        lerp(start.y, end.y, t) + Math.sin(Math.PI * t) * apex,
        lerp(start.z, end.z, t)
      );
    }
  }

  function addCheckpoint(level, platform) {
    const checkpoint = {
      id: level.checkpoints.length,
      x: platform.x,
      y: platform.y,
      z: platform.z,
      w: Math.min(platform.w - 18, 88),
      d: Math.min(platform.d - 18, 64),
      spawnX: platform.x,
      spawnY: platform.y,
      spawnZ: platform.z - platform.d * 0.18,
      active: level.checkpoints.length === 0
    };
    level.checkpoints.push(checkpoint);
    return checkpoint;
  }

  function addPad(level, platform, options = {}) {
    level.pads.push({
      x: platform.x + (options.offsetX || 0),
      y: platform.y + 2,
      z: platform.z + (options.offsetZ || 0),
      w: options.w ?? Math.min(56, platform.w * 0.55),
      d: options.d ?? Math.min(34, platform.d * 0.45),
      power: options.power ?? 660,
      color: options.color || level.theme.uiHot
    });
  }

  function addSweeper(level, platform, options = {}) {
    level.sweepers.push({
      x: platform.x,
      y: platform.y + (options.yOffset ?? 16),
      z: platform.z,
      w: options.w ?? Math.max(52, platform.w * 0.62),
      d: options.d ?? 16,
      h: options.h ?? 18,
      baseX: platform.x,
      range: options.range ?? Math.max(28, platform.w * 0.28),
      speed: options.speed ?? 1.55,
      phase: options.phase ?? 0
    });
  }

  function addWindZone(level, options) {
    level.windZones.push({
      x: options.x,
      y: options.y,
      z: options.z,
      w: options.w,
      d: options.d,
      forceX: options.forceX ?? 0,
      forceZ: options.forceZ ?? 0
    });
  }

  function addGravityZone(level, options) {
    level.gravityZones.push({
      x: options.x,
      y: options.y,
      z: options.z,
      w: options.w,
      d: options.d,
      scale: options.scale ?? 0.45
    });
  }

  function buildBackdrop(level, rand) {
    level.horizonBits = Array.from({ length: 18 }, (_, index) => ({
      x: -680 + index * 84 + rand() * 26,
      h: 50 + rand() * 130,
      w: 36 + rand() * 60,
      depth: rand() * 0.55 + 0.18
    }));
    level.skyLights = Array.from({ length: SB.config.coarsePointer ? 20 : 34 }, () => ({
      x: rand() * 1200 - 600,
      y: 140 + rand() * 230,
      z: rand() * Math.max(600, level.length),
      size: 8 + rand() * 26,
      alpha: 0.08 + rand() * 0.14
    }));
  }

  function createPathBuilder(level) {
    const startPlatform = createPlatform(level, { x: 0, y: 0, z: 62, w: 180, d: 124, h: 36 });
    addOrbLine(level, startPlatform, 3, 42);
    const startCheckpoint = addCheckpoint(level, startPlatform);
    startCheckpoint.active = true;
    level.spawn = { x: 0, y: startPlatform.y, z: startPlatform.z - 20 };
    return {
      lane: 0,
      height: 0,
      endZ: startPlatform.z + startPlatform.d * 0.5,
      lastPlatform: startPlatform
    };
  }

  function stepPlatform(level, path, options = {}) {
    const depth = options.d ?? 78;
    const platform = createPlatform(level, {
      x: options.x ?? laneX(options.lane ?? path.lane),
      y: path.height + (options.rise ?? 0),
      z: path.endZ + (options.gap ?? 72) + depth * 0.5,
      w: options.w ?? 118,
      d: depth,
      h: options.h ?? 30,
      moving: options.moving || null,
      phantom: options.phantom || null
    });
    path.endZ = platform.z + platform.d * 0.5;
    path.lane = options.lane ?? path.lane;
    path.height = platform.y;
    path.lastPlatform = platform;

    if (options.orbs) addOrbLine(level, platform, options.orbs, options.orbHeight ?? 46);
    if (options.checkpoint) addCheckpoint(level, platform);
    if (options.pad) addPad(level, platform, options.pad);
    if (options.sweeper) addSweeper(level, platform, options.sweeper);
    if (options.wind) {
      addWindZone(level, {
        x: platform.x,
        y: platform.y - 8,
        z: platform.z,
        w: platform.w + 46,
        d: platform.d + 48,
        forceX: options.wind.forceX,
        forceZ: options.wind.forceZ
      });
    }
    if (options.gravity) {
      addGravityZone(level, {
        x: platform.x,
        y: platform.y - 12,
        z: platform.z,
        w: platform.w + 34,
        d: platform.d + 34,
        scale: options.gravity.scale
      });
    }
    return platform;
  }

  function buildLavaCourse(level, path, rand) {
    stepPlatform(level, path, { gap: 60, w: 142, d: 84, orbs: 3 });
    stepPlatform(level, path, { lane: 1, gap: 72, w: 108, d: 72, orbs: 2 });
    const movingA = stepPlatform(level, path, {
      lane: 1,
      gap: 68,
      w: 96,
      d: 66,
      orbs: 1,
      moving: { axis: "x", range: 44, speed: 1.45, phase: rand() * Math.PI * 2 }
    });
    addOrbArc(level, movingA, { x: 0, y: movingA.y + 12, z: movingA.z + 92 }, 4, 44);
    stepPlatform(level, path, { lane: 0, gap: 88, w: 116, d: 80, orbs: 2, checkpoint: true });
    stepPlatform(level, path, {
      lane: -1,
      gap: 86,
      w: 92,
      d: 62,
      moving: { axis: "x", range: 54, speed: 1.6, phase: rand() * Math.PI * 2 },
      orbs: 1
    });
    const sweeper = stepPlatform(level, path, { lane: 0, gap: 80, w: 160, d: 118, orbs: 3 });
    addSweeper(level, sweeper, { range: 46, speed: 1.8, phase: rand() * Math.PI * 2, yOffset: 14 });
    const boostBase = stepPlatform(level, path, { lane: 1, gap: 82, w: 124, d: 92, orbs: 2 });
    addPad(level, boostBase, { power: 700 });
    stepPlatform(level, path, { lane: 1, gap: 126, rise: 110, w: 130, d: 94, orbs: 3, checkpoint: true });
    stepPlatform(level, path, { lane: 0, gap: 84, w: 104, d: 72, orbs: 2 });
    stepPlatform(level, path, {
      lane: -1,
      gap: 86,
      w: 102,
      d: 74,
      orbs: 2,
      moving: { axis: "y", range: 22, speed: 1.1, phase: rand() * Math.PI * 2 }
    });
    stepPlatform(level, path, { lane: 0, gap: 102, rise: -48, w: 176, d: 132, orbs: 3 });
    level.risingHazard = { y: -170, speed: 5.5 };
    level.killY = -230;
  }

  function buildChronoCourse(level, path, rand) {
    stepPlatform(level, path, { gap: 64, w: 140, d: 84, orbs: 3 });
    stepPlatform(level, path, { lane: -1, gap: 76, rise: 38, w: 104, d: 74, orbs: 2 });
    stepPlatform(level, path, { lane: 1, gap: 84, rise: 24, w: 98, d: 72, orbs: 2 });
    stepPlatform(level, path, {
      lane: 0,
      gap: 80,
      rise: -24,
      w: 110,
      d: 70,
      orbs: 2,
      moving: { axis: "x", range: 52, speed: 1.55, phase: rand() * Math.PI * 2 }
    });
    stepPlatform(level, path, { lane: 0, gap: 88, w: 168, d: 110, orbs: 3, checkpoint: true });
    stepPlatform(level, path, { lane: -1, gap: 74, rise: 52, w: 90, d: 60, orbs: 1 });
    stepPlatform(level, path, { lane: 0, gap: 64, rise: 28, w: 88, d: 60, orbs: 1 });
    const chronoStart = path.lastPlatform;
    const chronoBridge = stepPlatform(level, path, {
      lane: 1,
      gap: 68,
      rise: 12,
      w: 92,
      d: 62,
      orbs: 1,
      moving: { axis: "z", range: 18, speed: 1.8, phase: rand() * Math.PI * 2 }
    });
    addOrbArc(level, chronoStart, chronoBridge, 4, 52);
    stepPlatform(level, path, { lane: 0, gap: 88, rise: -40, w: 138, d: 90, orbs: 3 });
    const gate = stepPlatform(level, path, { lane: 0, gap: 78, w: 174, d: 120, orbs: 2, checkpoint: true });
    addWindZone(level, { x: gate.x, y: gate.y - 8, z: gate.z, w: gate.w + 30, d: gate.d + 40, forceX: 48, forceZ: 30 });
    stepPlatform(level, path, { lane: -1, gap: 86, rise: 42, w: 104, d: 72, orbs: 2 });
    stepPlatform(level, path, { lane: 0, gap: 84, rise: -22, w: 176, d: 128, orbs: 3 });
    level.killY = -220;
  }

  function buildIllusionCourse(level, path, rand) {
    stepPlatform(level, path, { gap: 66, w: 138, d: 84, orbs: 3 });
    stepPlatform(level, path, {
      lane: 0,
      gap: 78,
      w: 92,
      d: 64,
      orbs: 1,
      phantom: { period: 2.4, visible: 0.54, fade: 0.22, phase: rand() * 2.4 }
    });
    stepPlatform(level, path, {
      lane: 1,
      gap: 72,
      w: 90,
      d: 60,
      orbs: 1,
      phantom: { period: 2.6, visible: 0.52, fade: 0.24, phase: rand() * 2.6 }
    });
    stepPlatform(level, path, {
      lane: -1,
      gap: 74,
      w: 90,
      d: 60,
      orbs: 1,
      phantom: { period: 2.2, visible: 0.5, fade: 0.26, phase: rand() * 2.2 }
    });
    stepPlatform(level, path, { lane: 0, gap: 92, w: 164, d: 110, orbs: 3, checkpoint: true });
    stepPlatform(level, path, {
      lane: -1,
      gap: 74,
      rise: 54,
      w: 88,
      d: 62,
      orbs: 1,
      phantom: { period: 2.5, visible: 0.5, fade: 0.2, phase: rand() * 2.5 }
    });
    stepPlatform(level, path, {
      lane: 1,
      gap: 78,
      rise: 34,
      w: 88,
      d: 62,
      orbs: 1,
      phantom: { period: 2.8, visible: 0.48, fade: 0.22, phase: rand() * 2.8 }
    });
    const mirrorHall = stepPlatform(level, path, { lane: 0, gap: 86, rise: -34, w: 176, d: 120, orbs: 3 });
    addSweeper(level, mirrorHall, { range: 52, speed: 1.4, phase: rand() * Math.PI * 2, yOffset: 13 });
    stepPlatform(level, path, {
      lane: 0,
      gap: 88,
      rise: 68,
      w: 110,
      d: 68,
      orbs: 2,
      moving: { axis: "y", range: 26, speed: 1.25, phase: rand() * Math.PI * 2 }
    });
    stepPlatform(level, path, { lane: 0, gap: 96, rise: -20, w: 156, d: 100, orbs: 2, checkpoint: true });
    stepPlatform(level, path, {
      lane: 1,
      gap: 86,
      w: 98,
      d: 68,
      orbs: 2,
      phantom: { period: 2.3, visible: 0.54, fade: 0.24, phase: rand() * 2.3 }
    });
    stepPlatform(level, path, { lane: 0, gap: 92, w: 170, d: 126, orbs: 3 });
    level.killY = -220;
  }

  function buildStormCourse(level, path, rand) {
    stepPlatform(level, path, { gap: 64, w: 132, d: 84, orbs: 3, wind: { forceX: 85, forceZ: 0 } });
    stepPlatform(level, path, { lane: 1, gap: 78, w: 78, d: 136, orbs: 2 });
    stepPlatform(level, path, { lane: 1, gap: 72, w: 80, d: 138, orbs: 2, wind: { forceX: -100, forceZ: 0 } });
    const debris = stepPlatform(level, path, {
      lane: 0,
      gap: 94,
      w: 88,
      d: 62,
      orbs: 1,
      moving: { axis: "x", range: 58, speed: 1.8, phase: rand() * Math.PI * 2 }
    });
    addOrbArc(level, { x: laneX(1), y: debris.y + 18, z: debris.z - 104 }, debris, 4, 64);
    stepPlatform(level, path, { lane: 0, gap: 92, w: 166, d: 110, orbs: 3, checkpoint: true });
    const gustDeck = stepPlatform(level, path, { lane: -1, gap: 84, w: 148, d: 102, orbs: 2 });
    addSweeper(level, gustDeck, { range: 40, speed: 2.1, phase: rand() * Math.PI * 2, yOffset: 12 });
    addWindZone(level, { x: gustDeck.x, y: gustDeck.y - 12, z: gustDeck.z, w: gustDeck.w + 50, d: gustDeck.d + 60, forceX: 135, forceZ: 20 });
    stepPlatform(level, path, { lane: 0, gap: 88, w: 82, d: 150, orbs: 2 });
    stepPlatform(level, path, { lane: 0, gap: 74, w: 82, d: 140, orbs: 2, wind: { forceX: -135, forceZ: 0 } });
    stepPlatform(level, path, { lane: 1, gap: 98, w: 104, d: 76, orbs: 1, moving: { axis: "y", range: 20, speed: 1.3, phase: rand() * Math.PI * 2 } });
    stepPlatform(level, path, { lane: 0, gap: 100, w: 174, d: 126, orbs: 3, checkpoint: true });
    stepPlatform(level, path, { lane: -1, gap: 88, w: 98, d: 72, orbs: 2 });
    stepPlatform(level, path, { lane: 0, gap: 94, w: 176, d: 128, orbs: 3 });
    level.killY = -230;
  }

  function buildAlienCourse(level, path, rand) {
    stepPlatform(level, path, { gap: 60, w: 140, d: 88, orbs: 3 });
    const launch = stepPlatform(level, path, { lane: 0, gap: 76, w: 120, d: 88, orbs: 2 });
    addPad(level, launch, { power: 760, d: 30, w: 50, color: level.theme.checkpoint });
    addGravityZone(level, {
      x: launch.x,
      y: launch.y - 16,
      z: launch.z + 120,
      w: 220,
      d: 200,
      scale: 0.34
    });
    stepPlatform(level, path, { lane: 1, gap: 138, rise: 92, w: 112, d: 82, orbs: 3, gravity: { scale: 0.36 } });
    stepPlatform(level, path, {
      lane: 0,
      gap: 88,
      w: 94,
      d: 66,
      orbs: 1,
      moving: { axis: "y", range: 28, speed: 1.45, phase: rand() * Math.PI * 2 }
    });
    stepPlatform(level, path, {
      lane: -1,
      gap: 82,
      w: 94,
      d: 66,
      orbs: 1,
      moving: { axis: "x", range: 50, speed: 1.7, phase: rand() * Math.PI * 2 }
    });
    stepPlatform(level, path, { lane: 0, gap: 96, rise: -44, w: 170, d: 116, orbs: 3, checkpoint: true });
    stepPlatform(level, path, { lane: 1, gap: 94, w: 102, d: 70, orbs: 2, gravity: { scale: 0.4 } });
    stepPlatform(level, path, { lane: -1, gap: 92, w: 102, d: 70, orbs: 2, gravity: { scale: 0.4 } });
    const hoverDeck = stepPlatform(level, path, { lane: 0, gap: 92, w: 150, d: 100, orbs: 3 });
    addPad(level, hoverDeck, { power: 720, offsetZ: 10, color: level.theme.uiAccent });
    stepPlatform(level, path, { lane: 0, gap: 144, rise: 84, w: 126, d: 90, orbs: 3 });
    stepPlatform(level, path, {
      lane: 1,
      gap: 84,
      w: 96,
      d: 68,
      orbs: 1,
      moving: { axis: "x", range: 60, speed: 1.85, phase: rand() * Math.PI * 2 }
    });
    stepPlatform(level, path, {
      lane: 0,
      gap: 88,
      w: 96,
      d: 68,
      orbs: 1,
      moving: { axis: "y", range: 26, speed: 1.4, phase: rand() * Math.PI * 2 }
    });
    stepPlatform(level, path, { lane: 0, gap: 102, rise: -36, w: 178, d: 128, orbs: 3, checkpoint: true });
    level.killY = -240;
  }

  function finalizeCourse(level, path) {
    const finalPlatform = stepPlatform(level, path, { gap: 88, w: 188, d: 140, orbs: 2 });
    level.goal = {
      x: finalPlatform.x,
      y: finalPlatform.y + 2,
      z: finalPlatform.z + 18,
      w: 72,
      d: 34,
      h: 92
    };
    level.length = finalPlatform.z + finalPlatform.d * 0.5 + 150;
  }

  SB.isCourseUnlocked = (courseId) => courseId <= SB.saveData.highestUnlocked;
  SB.currentCourseForUi = () =>
    ["playing", "paused", "victory"].includes(SB.state.mode)
      ? SB.state.course || SB.getCourseById(SB.state.selectedCourseId)
      : SB.getCourseById(SB.state.selectedCourseId);
  SB.currentTheme = () => {
    const key =
      SB.state.mode === "home"
        ? (SB.state.previewLevel ? SB.state.previewLevel.themeKey : SB.getCourseById(SB.state.selectedCourseId).theme)
        : SB.state.level
          ? SB.state.level.themeKey
          : SB.getCourseById(SB.state.selectedCourseId).theme;
    return themes[key] || themes.lava;
  };

  SB.applyThemeToUi = (themeKey) => {
    const theme = themes[themeKey];
    if (!theme) return;
    document.documentElement.style.setProperty("--theme-accent", theme.uiAccent);
    document.documentElement.style.setProperty("--theme-hot", theme.uiHot);
    document.documentElement.style.setProperty("--theme-deep", theme.uiDeep);
    document.documentElement.style.setProperty("--theme-glow", SB.utils.rgba(theme.uiAccent, 0.22));
    SB.audio.setTheme(themeKey);
  };

  SB.platformVisibility = (platform, time) => {
    if (!platform.phantom) return 1;
    const cycle = mod(time + platform.phantom.phase, platform.phantom.period) / platform.phantom.period;
    if (cycle <= platform.phantom.visible) return 1;
    return clamp(1 - (cycle - platform.phantom.visible) / (platform.phantom.fade || 0.2), 0, 1);
  };

  SB.isPlatformSolid = (platform, time) => SB.platformVisibility(platform, time) > 0.28;

  SB.createLevel = (course) => {
    const rand = mulberry32(hashString(`skyline-obby:${course.id}:${course.name}`)());
    const theme = themes[course.theme];
    const level = {
      courseId: course.id,
      themeKey: course.theme,
      courseName: course.name,
      theme,
      platforms: [],
      pads: [],
      orbs: [],
      checkpoints: [],
      sweepers: [],
      windZones: [],
      gravityZones: [],
      horizonBits: [],
      skyLights: [],
      spawn: { x: 0, y: 0, z: 0 },
      goal: null,
      length: 1400,
      killY: -220,
      risingHazard: null
    };

    const path = createPathBuilder(level);
    if (course.id === 1) buildLavaCourse(level, path, rand);
    if (course.id === 2) buildChronoCourse(level, path, rand);
    if (course.id === 3) buildIllusionCourse(level, path, rand);
    if (course.id === 4) buildStormCourse(level, path, rand);
    if (course.id === 5) buildAlienCourse(level, path, rand);
    finalizeCourse(level, path);
    buildBackdrop(level, rand);
    return level;
  };

  SB.createPlayer = (level) => ({
    x: level.spawn.x,
    y: level.spawn.y,
    z: level.spawn.z,
    w: 28,
    d: 28,
    height: 58,
    vx: 0,
    vy: 0,
    vz: 0,
    maxSpeed: 215,
    accel: 980,
    airAccel: 430,
    friction: 8,
    jumpForce: 470,
    coyoteTime: 0.12,
    coyote: 0,
    jumpBuffer: 0,
    onGround: false,
    ground: null,
    boostLock: 0,
    checkpointIndex: 0,
    gravityScale: 1
  });

  SB.ensureAudioStarted = () => {
    SB.audio.resume();
    SB.audio.startMusic();
  };

  SB.setToast = (text, duration = 1.8) => {
    SB.state.toast = text;
    SB.state.toastTimer = duration;
  };

  SB.addParticles = (x, y, z, count, color, speed = 150) => {
    const cap = SB.config.coarsePointer ? 90 : 150;
    const allowed = Math.max(0, cap - SB.state.particles.length);
    const amount = Math.min(count, allowed);
    for (let i = 0; i < amount; i += 1) {
      const angle = Math.random() * Math.PI * 2;
      const magnitude = speed * (0.35 + Math.random() * 0.75);
      SB.state.particles.push({
        x,
        y,
        z,
        vx: Math.cos(angle) * magnitude * 0.45,
        vy: magnitude * (0.18 + Math.random() * 0.28),
        vz: Math.sin(angle) * magnitude * 0.55,
        life: 0.36 + Math.random() * 0.44,
        maxLife: 0.36 + Math.random() * 0.44,
        size: 2 + Math.random() * 3,
        color
      });
    }
  };

  SB.addText = (x, y, z, text, color = "#fff4c8") => {
    SB.state.floatingTexts.push({ x, y, z, text, color, life: 1 });
  };

  SB.getCheckpoint = () => SB.state.level.checkpoints[SB.state.player.checkpointIndex] || SB.state.level.checkpoints[0];

  SB.enterHomeView = () => {
    SB.state.mode = "home";
    SB.input.left = false;
    SB.input.right = false;
    SB.input.forward = false;
    SB.input.back = false;
    SB.input.jumpHeld = false;
    SB.state.course = null;
    SB.state.level = null;
    SB.state.player = null;
    SB.state.previewLevel = SB.createLevel(SB.getCourseById(SB.state.selectedCourseId));
    SB.state.camera.x = 0;
    SB.state.camera.y = 210;
    SB.state.camera.z = -280;
    SB.state.previewTime = 0;
    SB.state.elapsed = 0;
    SB.state.respawns = 0;
    SB.state.orbsCollected = 0;
    SB.state.particles.length = 0;
    SB.state.floatingTexts.length = 0;
    SB.state.toast = "";
    SB.state.toastTimer = 0;
    SB.state.screenShake = 0;
    SB.state.lastResults = null;
    SB.state.windAudioTimer = 0;
    SB.applyThemeToUi(SB.state.previewLevel.themeKey);
    if (SB.renderUi) SB.renderUi();
  };

  SB.respawnPlayer = () => {
    if (!SB.state.level || !SB.state.player) return;
    const checkpoint = SB.getCheckpoint();
    SB.state.player.x = checkpoint.spawnX;
    SB.state.player.y = checkpoint.spawnY;
    SB.state.player.z = checkpoint.spawnZ;
    SB.state.player.vx = 0;
    SB.state.player.vy = 0;
    SB.state.player.vz = 0;
    SB.state.player.onGround = false;
    SB.state.player.ground = null;
    SB.state.player.coyote = 0;
    SB.state.player.jumpBuffer = 0;
    SB.state.player.boostLock = 0.18;
    SB.state.respawns += 1;
    SB.state.elapsed += 3;
    SB.state.screenShake = Math.max(SB.state.screenShake, 9);
    SB.addParticles(checkpoint.spawnX, checkpoint.spawnY + 20, checkpoint.spawnZ, 16, SB.currentTheme().checkpoint, 190);
    SB.setToast("Respawned (+3.00s)", 1.6);
    SB.audio.sfx("respawn");
  };

  SB.updateAfterResults = (results) => {
    const record = SB.getSaveRecord(SB.saveData, SB.state.course.id);
    record.stars = Math.max(record.stars, results.stars);
    record.cleared = true;
    record.bestTime = record.bestTime === null ? results.time : Math.min(record.bestTime, results.time);
    record.bestOrbs = Math.max(record.bestOrbs, results.orbs);
    record.bestRespawns = record.bestRespawns === null ? results.respawns : Math.min(record.bestRespawns, results.respawns);
    SB.saveData.highestUnlocked = Math.max(SB.saveData.highestUnlocked, Math.min(courses.length, SB.state.course.id + 1));
    if (SB.state.course.id < courses.length && SB.saveData.highestUnlocked > SB.state.course.id) {
      SB.saveData.selectedCourseId = SB.state.course.id + 1;
      SB.state.selectedCourseId = SB.saveData.selectedCourseId;
    }
    SB.recalcSaveTotals(SB.saveData);
    SB.persistSave();
  };

  SB.completeCourse = () => {
    if (SB.state.mode !== "playing") return;
    const course = SB.state.course;
    const orbGoalComplete = SB.state.orbsCollected >= course.orbGoal;
    const timeGoalComplete = SB.state.elapsed <= course.parTime;
    const stars = 1 + (orbGoalComplete ? 1 : 0) + (timeGoalComplete ? 1 : 0);

    SB.state.mode = "victory";
    SB.state.lastResults = {
      courseName: course.name,
      stars,
      time: SB.state.elapsed,
      orbs: SB.state.orbsCollected,
      respawns: SB.state.respawns,
      orbGoalComplete,
      timeGoalComplete,
      parTime: course.parTime
    };
    SB.updateAfterResults(SB.state.lastResults);
    SB.setToast(`Course cleared in ${formatTime(SB.state.elapsed)}`, 2.3);
    SB.audio.sfx("finish");
    if (SB.renderUi) SB.renderUi();
  };

  SB.startSelectedCourse = () => {
    const course = SB.getCourseById(SB.state.selectedCourseId);
    if (!SB.isCourseUnlocked(course.id)) return;
    SB.ensureAudioStarted();
    SB.applyThemeToUi(course.theme);
    SB.input.left = false;
    SB.input.right = false;
    SB.input.forward = false;
    SB.input.back = false;
    SB.input.jumpHeld = false;
    SB.state.course = course;
    SB.state.level = SB.createLevel(course);
    SB.state.previewLevel = null;
    SB.state.player = SB.createPlayer(SB.state.level);
    SB.state.elapsed = 0;
    SB.state.respawns = 0;
    SB.state.orbsCollected = 0;
    SB.state.camera.x = 0;
    SB.state.camera.y = 210;
    SB.state.camera.z = -280;
    SB.state.particles.length = 0;
    SB.state.floatingTexts.length = 0;
    SB.state.toast = "";
    SB.state.toastTimer = 0;
    SB.state.screenShake = 0;
    SB.state.uiRefreshTimer = 0;
    SB.state.lastResults = null;
    SB.state.windAudioTimer = 0;
    SB.state.mode = "playing";
    SB.audio.sfx("button");
    if (SB.renderUi) SB.renderUi();
  };

  SB.togglePause = () => {
    if (SB.state.mode === "playing") {
      SB.state.mode = "paused";
      SB.audio.sfx("pause");
    } else if (SB.state.mode === "paused") {
      SB.state.mode = "playing";
      SB.audio.sfx("pause");
    }
    if (SB.renderUi) SB.renderUi();
  };

  SB.selectNextCourse = () => {
    if (["playing", "paused"].includes(SB.state.mode)) return;
    const next = clamp(SB.state.selectedCourseId + 1, 1, SB.saveData.highestUnlocked);
    SB.state.selectedCourseId = next;
    SB.saveData.selectedCourseId = next;
    SB.persistSave();
    SB.enterHomeView();
  };

  SB.selectCourse = (courseId) => {
    if (!SB.isCourseUnlocked(courseId) || ["playing", "paused"].includes(SB.state.mode)) return;
    SB.state.selectedCourseId = courseId;
    SB.saveData.selectedCourseId = courseId;
    SB.persistSave();
    SB.enterHomeView();
  };

  function updateMovingPlatforms(dt) {
    if (!SB.state.level) return;
    for (const platform of SB.state.level.platforms) {
      const prevX = platform.x;
      const prevY = platform.y;
      const prevZ = platform.z;
      if (platform.moving) {
        const t = SB.state.elapsed * platform.moving.speed + platform.moving.phase;
        const offset = Math.sin(t) * platform.moving.range;
        platform.x = platform.baseX + (platform.moving.axis === "x" ? offset : 0);
        platform.y = platform.baseY + (platform.moving.axis === "y" ? offset : 0);
        platform.z = platform.baseZ + (platform.moving.axis === "z" ? offset : 0);
      } else {
        platform.x = platform.baseX;
        platform.y = platform.baseY;
        platform.z = platform.baseZ;
      }
      platform.dx = platform.x - prevX;
      platform.dy = platform.y - prevY;
      platform.dz = platform.z - prevZ;
    }
    for (const sweeper of SB.state.level.sweepers) {
      sweeper.x = sweeper.baseX + Math.sin(SB.state.elapsed * sweeper.speed + sweeper.phase) * sweeper.range;
    }
    if (SB.state.level.risingHazard) SB.state.level.risingHazard.y += SB.state.level.risingHazard.speed * dt;
  }

  function playerBox(player) {
    return { x: player.x, z: player.z, w: player.w, d: player.d };
  }

  function platformBox(platform) {
    return { x: platform.x, z: platform.z, w: platform.w, d: platform.d };
  }

  function updatePlayer(dt) {
    const player = SB.state.player;
    if (!player) return;

    if (player.ground && player.onGround) {
      player.x += player.ground.dx;
      player.y += player.ground.dy;
      player.z += player.ground.dz;
    }

    if (player.boostLock > 0) player.boostLock -= dt;
    if (player.jumpBuffer > 0) player.jumpBuffer -= dt;

    const moveX = (SB.input.right ? 1 : 0) - (SB.input.left ? 1 : 0);
    const moveZ = (SB.input.forward ? 1 : 0) - (SB.input.back ? 1 : 0);
    const moveLength = Math.hypot(moveX, moveZ) || 1;
    const dirX = moveX / moveLength;
    const dirZ = moveZ / moveLength;
    const accel = player.onGround ? player.accel : player.airAccel;

    if (moveX || moveZ) {
      player.vx += dirX * accel * dt;
      player.vz += dirZ * accel * dt;
    } else if (player.onGround) {
      const drag = Math.exp(-player.friction * dt);
      player.vx *= drag;
      player.vz *= drag;
    } else {
      player.vx *= 1 - dt * 0.35;
      player.vz *= 1 - dt * 0.35;
    }

    const horizontalSpeed = Math.hypot(player.vx, player.vz);
    if (horizontalSpeed > player.maxSpeed) {
      const scale = player.maxSpeed / horizontalSpeed;
      player.vx *= scale;
      player.vz *= scale;
    }

    player.gravityScale = 1;
    for (const zone of SB.state.level.gravityZones) {
      if (
        player.x > zone.x - zone.w * 0.5 &&
        player.x < zone.x + zone.w * 0.5 &&
        player.z > zone.z - zone.d * 0.5 &&
        player.z < zone.z + zone.d * 0.5 &&
        player.y > zone.y
      ) {
        player.gravityScale = Math.min(player.gravityScale, zone.scale);
      }
    }

    if (player.onGround) player.coyote = player.coyoteTime;
    else player.coyote -= dt;

    if (player.jumpBuffer > 0 && player.coyote > 0) {
      player.jumpBuffer = 0;
      player.coyote = 0;
      player.onGround = false;
      player.ground = null;
      player.vy = player.jumpForce;
      SB.addParticles(player.x, player.y + 10, player.z, 10, SB.currentTheme().checkpoint, 170);
      SB.audio.sfx("jump");
    }

    player.vy -= SB.config.gravity * player.gravityScale * dt;
    if (!SB.input.jumpHeld && player.vy > 180) player.vy -= 580 * dt;

    const prevY = player.y;
    const prevTop = prevY + player.height;
    player.x += player.vx * dt;
    player.z += player.vz * dt;
    player.y += player.vy * dt;

    let landedOn = null;
    let landingTop = -Infinity;

    for (const platform of SB.state.level.platforms) {
      if (!SB.isPlatformSolid(platform, SB.state.elapsed)) continue;
      if (!rectOverlapXZ(playerBox(player), platformBox(platform))) continue;

      const platformTop = platform.y;
      const platformBottom = platform.y - platform.h;
      if (player.vy <= 0 && prevY >= platformTop && player.y <= platformTop && platformTop > landingTop) {
        landingTop = platformTop;
        landedOn = platform;
      } else if (player.vy > 0 && prevTop <= platformBottom && player.y + player.height >= platformBottom) {
        player.y = platformBottom - player.height;
        player.vy = 0;
      }
    }

    player.onGround = false;
    player.ground = null;
    if (landedOn) {
      player.y = landingTop;
      player.vy = 0;
      player.onGround = true;
      player.ground = landedOn;
    }

    player.x = clamp(player.x, -260, 260);

    if (player.y < SB.state.level.killY) {
      SB.respawnPlayer();
      return;
    }
    if (SB.state.level.risingHazard && player.y < SB.state.level.risingHazard.y + 10) {
      SB.respawnPlayer();
      return;
    }
  }

  function updatePads() {
    const player = SB.state.player;
    if (!player || player.boostLock > 0) return;
    for (const pad of SB.state.level.pads) {
      const overlapX = Math.abs(player.x - pad.x) <= (player.w + pad.w) * 0.5;
      const overlapZ = Math.abs(player.z - pad.z) <= (player.d + pad.d) * 0.5;
      if (!overlapX || !overlapZ) continue;
      if (Math.abs(player.y - pad.y) > 10 || player.vy > 80) continue;
      player.vy = pad.power;
      player.onGround = false;
      player.ground = null;
      player.boostLock = 0.22;
      SB.addParticles(pad.x, pad.y + 4, pad.z, 14, pad.color, 210);
      SB.setToast("Boost pad", 1.1);
      SB.audio.sfx("boost");
      break;
    }
  }

  function updateOrbs() {
    const player = SB.state.player;
    if (!player) return;
    for (const orb of SB.state.level.orbs) {
      if (orb.collected) continue;
      const orbY = orb.y + Math.sin(SB.state.elapsed * 5 + orb.phase) * 4;
      const dx = player.x - orb.x;
      const dy = player.y + player.height * 0.5 - orbY;
      const dz = player.z - orb.z;
      if (dx * dx + dy * dy + dz * dz > 1650) continue;
      orb.collected = true;
      SB.state.orbsCollected += orb.value;
      SB.addParticles(orb.x, orbY, orb.z, 10, SB.currentTheme().orb, 180);
      SB.addText(orb.x, orbY + 10, orb.z, `+${orb.value}`, SB.currentTheme().orb);
      SB.audio.sfx("orb");
    }
  }

  function updateCheckpoints() {
    const player = SB.state.player;
    if (!player) return;
    const nextIndex = player.checkpointIndex + 1;
    if (nextIndex >= SB.state.level.checkpoints.length) return;
    const next = SB.state.level.checkpoints[nextIndex];
    const overlap =
      Math.abs(player.x - next.x) <= (player.w + next.w) * 0.5 &&
      Math.abs(player.z - next.z) <= (player.d + next.d) * 0.5 &&
      Math.abs(player.y - next.y) < 26;
    if (!overlap) return;
    next.active = true;
    player.checkpointIndex = nextIndex;
    SB.addParticles(next.x, next.y + 20, next.z, 14, SB.currentTheme().checkpoint, 180);
    SB.setToast(`Checkpoint ${nextIndex}/${SB.state.level.checkpoints.length - 1}`, 1.5);
    SB.audio.sfx("checkpoint");
  }

  function updateSweepers() {
    const player = SB.state.player;
    if (!player) return;
    for (const sweeper of SB.state.level.sweepers) {
      const overlapX = Math.abs(player.x - sweeper.x) <= (player.w + sweeper.w) * 0.5;
      const overlapZ = Math.abs(player.z - sweeper.z) <= (player.d + sweeper.d) * 0.5;
      const overlapY = player.y < sweeper.y + sweeper.h && player.y + player.height > sweeper.y;
      if (overlapX && overlapZ && overlapY) {
        SB.respawnPlayer();
        break;
      }
    }
  }

  function updateWindZones(dt) {
    const player = SB.state.player;
    if (!player) return;
    let touchingWind = false;
    for (const zone of SB.state.level.windZones) {
      const inside =
        player.x > zone.x - zone.w * 0.5 &&
        player.x < zone.x + zone.w * 0.5 &&
        player.z > zone.z - zone.d * 0.5 &&
        player.z < zone.z + zone.d * 0.5 &&
        player.y > zone.y;
      if (!inside) continue;
      touchingWind = true;
      player.vx += zone.forceX * dt;
      player.vz += zone.forceZ * dt;
    }
    if (touchingWind) {
      SB.state.windAudioTimer -= dt;
      if (SB.state.windAudioTimer <= 0) {
        SB.audio.sfx("wind");
        SB.state.windAudioTimer = 0.6;
      }
    } else {
      SB.state.windAudioTimer = 0;
    }
  }

  function updateGoal() {
    const player = SB.state.player;
    if (!player || !SB.state.level.goal) return;
    const goal = SB.state.level.goal;
    const overlap =
      Math.abs(player.x - goal.x) <= (player.w + goal.w) * 0.5 &&
      Math.abs(player.z - goal.z) <= (player.d + goal.d) * 0.5 &&
      player.y > goal.y - 12;
    if (overlap) SB.completeCourse();
  }

  function updateParticles(dt) {
    for (let i = SB.state.particles.length - 1; i >= 0; i -= 1) {
      const particle = SB.state.particles[i];
      particle.life -= dt;
      if (particle.life <= 0) {
        SB.state.particles.splice(i, 1);
        continue;
      }
      particle.vy -= 620 * dt;
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      particle.z += particle.vz * dt;
    }
  }

  function updateFloatingTexts(dt) {
    for (let i = SB.state.floatingTexts.length - 1; i >= 0; i -= 1) {
      const text = SB.state.floatingTexts[i];
      text.life -= dt;
      if (text.life <= 0) {
        SB.state.floatingTexts.splice(i, 1);
        continue;
      }
      text.y += 24 * dt;
    }
  }

  function updateCamera(dt) {
    if (SB.state.mode === "home" && SB.state.previewLevel) {
      const previewZ = 140 + Math.sin(SB.state.previewTime * 0.35) * 40;
      SB.state.camera.x = lerp(SB.state.camera.x, Math.sin(SB.state.previewTime * 0.4) * 20, Math.min(1, dt * 2));
      SB.state.camera.y = lerp(SB.state.camera.y, 205 + Math.sin(SB.state.previewTime * 0.5) * 8, Math.min(1, dt * 2));
      SB.state.camera.z = lerp(SB.state.camera.z, -280 + previewZ * 0.06, Math.min(1, dt * 2));
      return;
    }
    if (!SB.state.player) return;
    const targetX = clamp(SB.state.player.x * 0.78, -80, 80);
    const targetY = 220 + SB.state.player.y * 0.24;
    const targetZ = SB.state.player.z - 290;
    SB.state.camera.x = lerp(SB.state.camera.x, targetX, Math.min(1, dt * 4));
    SB.state.camera.y = lerp(SB.state.camera.y, targetY, Math.min(1, dt * 3.5));
    SB.state.camera.z = lerp(SB.state.camera.z, targetZ, Math.min(1, dt * 4.6));
  }

  SB.updateGame = (dt) => {
    SB.state.previewTime += dt;
    if (SB.state.toastTimer > 0) SB.state.toastTimer -= dt;
    if (SB.state.screenShake > 0) SB.state.screenShake = Math.max(0, SB.state.screenShake - 30 * dt);
    SB.state.uiRefreshTimer -= dt;

    if (SB.state.mode === "playing") {
      SB.state.elapsed += dt;
      updateMovingPlatforms(dt);
      updatePlayer(dt);
      updatePads();
      updateWindZones(dt);
      updateOrbs();
      updateCheckpoints();
      updateSweepers();
      updateGoal();
    }

    updateCamera(dt);
    updateParticles(dt);
    updateFloatingTexts(dt);

    if (SB.state.uiRefreshTimer <= 0 && ["playing", "paused"].includes(SB.state.mode)) {
      if (SB.renderUi) SB.renderUi();
      SB.state.uiRefreshTimer = 0.15;
    }
  };
})();
