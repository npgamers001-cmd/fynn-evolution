(() => {
  "use strict";

  const SB = window.Shardbound;
  const { clamp, lerp, overlap, distanceSq, hashString, mulberry32 } = SB.utils;
  const { stages, themes, upgrades } = SB.data;

  SB.state = {
    mode: "home",
    selectedStageId: clamp(SB.saveData.selectedStageId || 1, 1, stages.length),
    stage: null,
    level: null,
    previewLevel: null,
    player: null,
    camera: { x: 0, y: 0 },
    elapsed: 0,
    score: 0,
    comboMultiplier: 1,
    comboPeak: 1,
    comboTimer: 0,
    shardsCollected: 0,
    particles: [],
    floatingTexts: [],
    toast: "",
    toastTimer: 0,
    screenShake: 0,
    previewTime: 0,
    uiRefreshTimer: 0,
    lastResults: null
  };

  SB.input = { left: false, right: false, jumpHeld: false };

  SB.getStageById = (stageId) => stages.find((stage) => stage.id === stageId) || stages[0];
  SB.currentStageForUi = () =>
    ["playing", "paused", "victory", "gameover"].includes(SB.state.mode)
      ? SB.state.stage || SB.getStageById(SB.state.selectedStageId)
      : SB.getStageById(SB.state.selectedStageId);
  SB.currentTheme = () => themes[SB.currentStageForUi().theme];
  SB.isStageUnlocked = (stageId) => stageId <= SB.saveData.highestUnlocked;

  SB.applyThemeToUi = (themeKey) => {
    const theme = themes[themeKey];
    if (!theme) return;
    document.documentElement.style.setProperty("--theme-accent", theme.uiAccent);
    document.documentElement.style.setProperty("--theme-hot", theme.uiHot);
    document.documentElement.style.setProperty("--theme-glow", `${theme.uiAccent}33`);
    SB.audio.setTheme(themeKey);
  };

  SB.getPlayerLoadout = () => {
    const stride = SB.saveData.upgrades.stride;
    const spring = SB.saveData.upgrades.spring;
    const reactor = SB.saveData.upgrades.reactor;
    const heart = SB.saveData.upgrades.heart;
    const magnet = SB.saveData.upgrades.magnet;
    const wing = SB.saveData.upgrades.wing;
    return {
      maxSpeed: 290 + stride * 18,
      accel: 2050 + stride * 110,
      jumpForce: 570 + spring * 24,
      coyoteTime: 0.11 + spring * 0.015,
      dashSpeed: 620 + reactor * 38,
      dashCooldown: Math.max(0.55, 0.98 - reactor * 0.09),
      dashDuration: 0.16 + reactor * 0.012,
      maxHealth: 4 + heart,
      magnetRadius: 28 + magnet * 22,
      shardValue: 1 + magnet * 0.2,
      maxAirJumps: 1 + (wing >= 2 ? 1 : 0),
      fallCap: 420 - wing * 50
    };
  };

  function addShard(level, x, y, rand, value = 1) {
    level.shards.push({ x, y, r: 9, value, collected: false, phase: rand() * Math.PI * 2 });
  }

  function addShardLine(level, startX, y, count, spacing, rand) {
    for (let i = 0; i < count; i += 1) addShard(level, startX + i * spacing, y, rand);
  }

  function addShardArc(level, leftX, rightX, baseY, height, count, rand) {
    for (let i = 0; i < count; i += 1) {
      const t = count === 1 ? 0 : i / (count - 1);
      addShard(level, lerp(leftX, rightX, t), baseY - Math.sin(Math.PI * t) * height, rand);
    }
  }

  function addGround(level, x, width) {
    level.platforms.push({ x, y: level.floorY, w: width, h: 118, type: "ground" });
  }

  function addSolid(level, x, y, width, height = 18, type = "solid") {
    level.platforms.push({ x, y, w: width, h: height, type });
  }

  function addMoving(level, x, y, width, options) {
    level.platforms.push({
      x,
      y,
      w: width,
      h: 18,
      type: "moving",
      axis: options.axis,
      range: options.range,
      speed: options.speed,
      t: options.phase,
      baseX: x,
      baseY: y,
      dx: 0,
      dy: 0
    });
  }

  function addPit(level, x, width) {
    level.hazards.push({ x, y: level.floorY + 74, w: width, h: 40, type: "pit" });
  }

  function addSpikeStrip(level, x, width, topY) {
    level.hazards.push({ x, y: topY - 18, w: width, h: 18, type: "spikes" });
  }

  function addWalker(level, x, topY, min, max, speed) {
    level.enemies.push({
      kind: "walker",
      x,
      y: topY - 34,
      w: 34,
      h: 34,
      min,
      max,
      speed,
      dir: Math.random() > 0.5 ? 1 : -1,
      alive: true,
      deadTimer: 0
    });
  }

  function addHover(level, x, y, range, speed, phase) {
    level.enemies.push({ kind: "hover", x, y, baseX: x, baseY: y, w: 36, h: 28, range, speed, phase, alive: true, deadTimer: 0 });
  }

  function addCheckpoint(level, x, topY) {
    level.checkpoints.push({ x, y: topY, trigger: x - 8, spawnX: x + 10, spawnY: topY - 46, active: false });
  }

  function addBooster(level, x, topY, power) {
    level.boosters.push({ x, y: topY - 14, w: 34, h: 14, power });
  }

  const segmentBuilders = {
    groundRun(level, cursor, stage, rand) {
      const gap = 60 + Math.floor(rand() * 22);
      const width = 260 + Math.floor(rand() * 90);
      const startX = cursor + gap;
      addPit(level, cursor, gap);
      addGround(level, startX, width);
      addShardLine(level, startX + 30, level.floorY - 84, 4 + Math.floor(width / 80), 34, rand);
      if (rand() < 0.72) {
        const upperWidth = 110 + Math.floor(rand() * 30);
        const upperX = startX + 60 + rand() * Math.max(30, width - upperWidth - 70);
        const upperY = level.floorY - (72 + Math.floor(rand() * 28));
        addSolid(level, upperX, upperY, upperWidth);
        addShardLine(level, upperX + 10, upperY - 28, 3, 30, rand);
        if (rand() < 0.26 + stage.difficulty * 0.08) addHover(level, upperX + 28, upperY - 60, 24, 1.1 + rand(), rand() * Math.PI * 2);
      }
      if (width > 250 && rand() < 0.45) addWalker(level, startX + 46, level.floorY, startX + 30, startX + width - 54, 58 + stage.difficulty * 12 + rand() * 20);
      if (rand() < 0.16 + stage.difficulty * 0.05) addBooster(level, startX + width * 0.5 - 16, level.floorY, 720 + stage.difficulty * 30);
      return { cursor: startX + width, safeX: startX + 42, safeY: level.floorY };
    },
    gapLeap(level, cursor, stage, rand) {
      const gap = 94 + Math.floor(stage.difficulty * 10) + Math.floor(rand() * 22);
      const landingWidth = 220 + Math.floor(rand() * 80);
      const startX = cursor + gap;
      addPit(level, cursor, gap);
      if (gap > 118 && rand() < 0.7) addSolid(level, cursor + gap * 0.5 - 34, level.floorY - 70, 68);
      addGround(level, startX, landingWidth);
      addShardArc(level, cursor - 10, startX + 18, level.floorY - 34, 88, 7, rand);
      addShardLine(level, startX + 24, level.floorY - 86, 3 + Math.floor(landingWidth / 110), 36, rand);
      if (rand() < 0.42 + stage.difficulty * 0.05) addWalker(level, startX + 30, level.floorY, startX + 20, startX + landingWidth - 50, 60 + stage.difficulty * 12);
      return { cursor: startX + landingWidth, safeX: startX + 40, safeY: level.floorY };
    },
    stairs(level, cursor, stage, rand) {
      const gap = 72 + Math.floor(rand() * 18);
      const startX = cursor + gap;
      addPit(level, cursor, gap + 24);
      const stepWidth = 90;
      const firstY = level.floorY - 58 - Math.floor(rand() * 10);
      addSolid(level, startX, firstY, stepWidth);
      addSolid(level, startX + 110, firstY - 54, stepWidth);
      addSolid(level, startX + 220, firstY - 108, stepWidth);
      addSolid(level, startX + 330, firstY - 54, 110);
      addShardLine(level, startX + 8, firstY - 30, 3, 28, rand);
      addShardLine(level, startX + 118, firstY - 84, 3, 28, rand);
      addShardLine(level, startX + 228, firstY - 138, 3, 28, rand);
      if (rand() < 0.26 + stage.difficulty * 0.06) addHover(level, startX + 240, firstY - 160, 30, 1.1 + rand(), rand() * Math.PI * 2);
      const landingX = startX + 468;
      addGround(level, landingX, 220 + Math.floor(rand() * 50));
      addShardLine(level, landingX + 20, level.floorY - 84, 3, 34, rand);
      return { cursor: landingX + 240, safeX: landingX + 36, safeY: level.floorY };
    },
    moving(level, cursor, stage, rand) {
      const pitWidth = 330 + Math.floor(rand() * 40);
      addPit(level, cursor, pitWidth);
      addMoving(level, cursor + 84, level.floorY - 72, 100, { axis: "y", range: 42 + rand() * 24, speed: 0.9 + rand() * 0.5, phase: rand() * Math.PI * 2 });
      addMoving(level, cursor + 210, level.floorY - 132, 108, { axis: rand() > 0.5 ? "x" : "y", range: 38 + rand() * 28, speed: 0.85 + rand() * 0.55, phase: rand() * Math.PI * 2 });
      addShardArc(level, cursor + 24, cursor + pitWidth - 22, level.floorY - 60, 92, 8, rand);
      const landingX = cursor + pitWidth;
      addGround(level, landingX, 220 + Math.floor(rand() * 50));
      if (rand() < 0.34 + stage.difficulty * 0.06) addWalker(level, landingX + 28, level.floorY, landingX + 16, landingX + 180, 66 + stage.difficulty * 10);
      return { cursor: landingX + 240, safeX: landingX + 32, safeY: level.floorY };
    },
    splitRoute(level, cursor, stage, rand) {
      const gap = 56 + Math.floor(rand() * 16);
      const width = 320 + Math.floor(rand() * 40);
      const startX = cursor + gap;
      addPit(level, cursor, gap);
      addGround(level, startX, width);
      const spikeX = startX + 88;
      const spikeWidth = 120 + Math.floor(rand() * 40);
      addSpikeStrip(level, spikeX, spikeWidth, level.floorY);
      addSolid(level, spikeX + 8, level.floorY - 86, 102);
      addSolid(level, spikeX + spikeWidth - 4, level.floorY - 138, 104);
      addShardLine(level, spikeX + 20, level.floorY - 114, 3, 30, rand);
      addShardLine(level, spikeX + spikeWidth + 8, level.floorY - 166, 3, 30, rand);
      if (rand() < 0.42 + stage.difficulty * 0.04) addWalker(level, startX + width - 90, level.floorY, startX + width - 110, startX + width - 30, 68 + stage.difficulty * 9);
      return { cursor: startX + width, safeX: startX + width - 70, safeY: level.floorY };
    },
    relay(level, cursor, stage, rand) {
      const pitWidth = 360 + Math.floor(rand() * 34);
      addPit(level, cursor, pitWidth);
      const firstX = cursor + 72;
      const firstY = level.floorY - 52;
      for (let i = 0; i < 4; i += 1) {
        const x = firstX + i * 86;
        const y = firstY - (i % 2 === 0 ? 0 : 48);
        if (i === 2 && rand() < 0.45 + stage.difficulty * 0.08) addMoving(level, x, y, 76, { axis: "y", range: 34 + rand() * 18, speed: 1 + rand() * 0.6, phase: rand() * Math.PI * 2 });
        else addSolid(level, x, y, 76);
        addShard(level, x + 38, y - 28, rand);
      }
      addShardArc(level, firstX - 12, cursor + pitWidth - 18, level.floorY - 50, 70, 6, rand);
      const landingX = cursor + pitWidth;
      addGround(level, landingX, 210 + Math.floor(rand() * 50));
      return { cursor: landingX + 230, safeX: landingX + 30, safeY: level.floorY };
    }
  };

  function pickSegmentType(stage, index, rand) {
    if (index === 0) return "groundRun";
    if (index % 5 === 4) return "moving";
    if (index % 6 === 3) return "relay";
    const pools = {
      verdant: ["groundRun", "gapLeap", "stairs", "splitRoute", "groundRun", "relay"],
      ember: ["gapLeap", "splitRoute", "groundRun", "moving", "stairs", "relay"],
      glacier: ["stairs", "moving", "relay", "groundRun", "splitRoute", "gapLeap"],
      storm: ["moving", "relay", "splitRoute", "gapLeap", "stairs", "groundRun"]
    };
    const options = pools[stage.theme];
    return options[Math.floor(rand() * options.length)];
  }

  function buildBackdrop(level, rand) {
    level.clouds = Array.from({ length: SB.config.coarsePointer ? 7 : 11 }, () => ({
      x: rand() * (level.width + 200) - 100,
      y: 30 + rand() * 160,
      size: 48 + rand() * 90,
      speed: 0.06 + rand() * 0.12,
      alpha: 0.12 + rand() * 0.14
    }));
    level.landmarks = Array.from({ length: Math.max(6, Math.floor(level.width / 420)) }, (_, index) => ({
      x: index * 420 + rand() * 120,
      w: 140 + rand() * 120,
      h: 90 + rand() * 120
    }));
    level.atmosphere = Array.from({ length: SB.config.coarsePointer ? 22 : 42 }, () => ({
      x: rand() * SB.config.viewWidth,
      y: rand() * SB.config.viewHeight,
      size: 1 + rand() * 3,
      alpha: 0.1 + rand() * 0.22,
      drift: 10 + rand() * 30,
      phase: rand() * Math.PI * 2
    }));
  }

  SB.createLevel = (stage) => {
    const rand = mulberry32(hashString(`${stage.id}:${stage.name}:${stage.theme}`)());
    const level = {
      stageId: stage.id,
      themeKey: stage.theme,
      floorY: 430,
      deathY: 650,
      width: 0,
      height: 760,
      platforms: [],
      hazards: [],
      enemies: [],
      shards: [],
      boosters: [],
      checkpoints: [{ x: 84, y: 430, trigger: 0, spawnX: 90, spawnY: 384, active: true }],
      spawn: { x: 90, y: 384 },
      goal: null
    };

    addGround(level, 0, 280);
    addShardLine(level, 88, level.floorY - 84, 5, 34, rand);

    let cursor = 280;
    for (let i = 0; i < stage.segments; i += 1) {
      const type = pickSegmentType(stage, i, rand);
      const segment = segmentBuilders[type](level, cursor, stage, rand);
      cursor = segment.cursor;
      if ((i + 1) % 4 === 0 && i < stage.segments - 1) addCheckpoint(level, segment.safeX, segment.safeY);
    }

    const finalGap = 92 + Math.floor(rand() * 22);
    addPit(level, cursor, finalGap);
    cursor += finalGap;
    addGround(level, cursor, 260);
    addShardLine(level, cursor + 36, level.floorY - 90, 5, 34, rand);
    level.goal = { x: cursor + 176, y: level.floorY - 58, w: 48, h: 62 };
    level.width = cursor + 320;
    level.totalShards = level.shards.length;
    buildBackdrop(level, rand);
    return level;
  };

  SB.createPreviewPlayer = (level) => ({
    x: level.spawn.x + 8,
    y: level.spawn.y + Math.sin(SB.state.previewTime * 3.5) * 4,
    w: 34,
    h: 44,
    vx: Math.sin(SB.state.previewTime * 2.5) * 40,
    face: 1,
    invuln: 0
  });

  SB.createPlayer = (level) => {
    const loadout = SB.getPlayerLoadout();
    return {
      x: level.spawn.x,
      y: level.spawn.y,
      w: 34,
      h: 44,
      vx: 0,
      vy: 0,
      face: 1,
      maxSpeed: loadout.maxSpeed,
      accel: loadout.accel,
      friction: 2300,
      jumpForce: loadout.jumpForce,
      coyoteTime: loadout.coyoteTime,
      jumpBuffer: 0,
      coyote: 0,
      onGround: false,
      ground: null,
      airJumpsUsed: 0,
      maxAirJumps: loadout.maxAirJumps,
      dashQueued: 0,
      dashTime: 0,
      dashCooldown: 0,
      dashCooldownBase: loadout.dashCooldown,
      dashDuration: loadout.dashDuration,
      dashSpeed: loadout.dashSpeed,
      invuln: 0,
      magnetRadius: loadout.magnetRadius,
      shardValue: loadout.shardValue,
      maxHealth: loadout.maxHealth,
      health: loadout.maxHealth,
      damageTaken: 0,
      fallCap: loadout.fallCap,
      checkpointIndex: 0
    };
  };

  SB.ensureAudioStarted = () => {
    SB.audio.resume();
    SB.audio.startMusic();
  };

  SB.setToast = (text, duration = 1.8) => {
    SB.state.toast = text;
    SB.state.toastTimer = duration;
  };

  SB.addParticles = (x, y, count, color, speed = 150) => {
    const cap = SB.config.coarsePointer ? 90 : 160;
    const allowed = Math.max(0, cap - SB.state.particles.length);
    const amount = Math.min(count, allowed);
    for (let i = 0; i < amount; i += 1) {
      const angle = Math.random() * Math.PI * 2;
      const magnitude = speed * (0.35 + Math.random() * 0.75);
      SB.state.particles.push({
        x,
        y,
        vx: Math.cos(angle) * magnitude,
        vy: Math.sin(angle) * magnitude - 20,
        life: 0.35 + Math.random() * 0.45,
        maxLife: 0.35 + Math.random() * 0.45,
        size: 2 + Math.random() * 3,
        color
      });
    }
  };

  SB.addText = (x, y, text, color = "#fff3b8") => {
    SB.state.floatingTexts.push({ x, y, text, color, life: 0.9 });
  };

  SB.awardScore = (baseValue, x, y, color = "#fff1a8") => {
    if (SB.state.comboTimer > 0) SB.state.comboMultiplier = clamp(SB.state.comboMultiplier + 0.18, 1, 3.6);
    else SB.state.comboMultiplier = 1;
    SB.state.comboTimer = 2.4;
    SB.state.comboPeak = Math.max(SB.state.comboPeak, SB.state.comboMultiplier);
    const total = Math.round(baseValue * SB.state.comboMultiplier);
    SB.state.score += total;
    SB.addText(x, y, `+${total}`, color);
    return total;
  };

  SB.getCheckpoint = () => SB.state.level.checkpoints[SB.state.player.checkpointIndex];

  SB.respawnPlayer = () => {
    const checkpoint = SB.getCheckpoint();
    SB.state.player.x = checkpoint.spawnX;
    SB.state.player.y = checkpoint.spawnY;
    SB.state.player.vx = 0;
    SB.state.player.vy = 0;
    SB.state.player.onGround = false;
    SB.state.player.ground = null;
    SB.state.player.airJumpsUsed = 0;
    SB.state.player.jumpBuffer = 0;
    SB.state.player.dashQueued = 0;
    SB.state.player.dashTime = 0;
    SB.state.player.invuln = 1.1;
  };

  SB.enterHomeView = () => {
    SB.state.mode = "home";
    SB.input.left = false;
    SB.input.right = false;
    SB.input.jumpHeld = false;
    SB.state.stage = null;
    SB.state.level = null;
    SB.state.player = null;
    SB.state.previewLevel = SB.createLevel(SB.getStageById(SB.state.selectedStageId));
    SB.state.camera.x = 0;
    SB.state.camera.y = 0;
    SB.state.previewTime = 0;
    SB.applyThemeToUi(SB.getStageById(SB.state.selectedStageId).theme);
    if (SB.renderUi) SB.renderUi();
  };

  SB.updateAfterResults = (results) => {
    const record = SB.getSaveRecord(SB.saveData, SB.state.stage.id);
    const oldStars = record.stars;
    record.stars = Math.max(record.stars, results.stars);
    record.cleared = true;
    record.bestTime = record.bestTime === null ? results.time : Math.min(record.bestTime, results.time);
    record.bestScore = Math.max(record.bestScore, results.score);
    record.bestShards = Math.max(record.bestShards, results.shards);
    record.flawless = record.flawless || results.flawless;
    SB.saveData.bank += results.payout;
    SB.saveData.highestUnlocked = Math.max(SB.saveData.highestUnlocked, Math.min(stages.length, SB.state.stage.id + 1));
    if (SB.saveData.highestUnlocked > SB.state.stage.id && SB.state.stage.id < stages.length) {
      SB.saveData.selectedStageId = SB.state.stage.id + 1;
      SB.state.selectedStageId = SB.saveData.selectedStageId;
    }
    SB.recalcSaveTotals(SB.saveData);
    SB.persistSave();
    results.newStars = Math.max(0, results.stars - oldStars);
  };

  SB.completeStage = () => {
    if (SB.state.mode !== "playing") return;
    const stage = SB.state.stage;
    const record = SB.getSaveRecord(SB.saveData, stage.id);
    const shardsGoalComplete = SB.state.shardsCollected >= stage.coinGoal;
    const timeGoalComplete = SB.state.elapsed <= stage.parTime;
    const flawless = SB.state.player.damageTaken === 0;
    const starsEarned = 1 + (shardsGoalComplete ? 1 : 0) + (timeGoalComplete ? 1 : 0);
    const scoreBonus = Math.floor(SB.state.score / 60);
    const payout =
      stage.clearReward +
      Math.round(SB.state.shardsCollected * (6 + SB.saveData.upgrades.magnet)) +
      starsEarned * 40 +
      scoreBonus +
      (flawless ? 50 : 0);

    SB.state.mode = "victory";
    SB.state.lastResults = {
      stageName: stage.name,
      world: stage.world,
      stars: starsEarned,
      time: SB.state.elapsed,
      score: SB.state.score,
      shards: SB.state.shardsCollected,
      shardsGoalComplete,
      timeGoalComplete,
      flawless,
      payout,
      previousBest: record.bestTime
    };

    SB.updateAfterResults(SB.state.lastResults);
    SB.setToast(`Banked ${payout} shards`, 2.4);
    SB.audio.sfx("clear");
    if (SB.renderUi) SB.renderUi();
  };

  SB.startSelectedStage = () => {
    const stage = SB.getStageById(SB.state.selectedStageId);
    if (!SB.isStageUnlocked(stage.id)) return;
    SB.ensureAudioStarted();
    SB.input.left = false;
    SB.input.right = false;
    SB.input.jumpHeld = false;
    SB.applyThemeToUi(stage.theme);
    SB.state.stage = stage;
    SB.state.level = SB.createLevel(stage);
    SB.state.player = SB.createPlayer(SB.state.level);
    SB.state.previewLevel = null;
    SB.state.camera.x = 0;
    SB.state.camera.y = 0;
    SB.state.elapsed = 0;
    SB.state.score = 0;
    SB.state.comboMultiplier = 1;
    SB.state.comboPeak = 1;
    SB.state.comboTimer = 0;
    SB.state.shardsCollected = 0;
    SB.state.particles.length = 0;
    SB.state.floatingTexts.length = 0;
    SB.state.toast = "";
    SB.state.toastTimer = 0;
    SB.state.screenShake = 0;
    SB.state.lastResults = null;
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

  SB.selectNextStage = () => {
    if (["playing", "paused"].includes(SB.state.mode)) return;
    const next = clamp(SB.state.selectedStageId + 1, 1, SB.saveData.highestUnlocked);
    SB.state.selectedStageId = next;
    SB.saveData.selectedStageId = next;
    SB.persistSave();
    SB.enterHomeView();
  };

  SB.selectStage = (stageId) => {
    if (!SB.isStageUnlocked(stageId) || ["playing", "paused"].includes(SB.state.mode)) return;
    SB.state.selectedStageId = stageId;
    SB.saveData.selectedStageId = stageId;
    SB.persistSave();
    SB.enterHomeView();
  };

  SB.buyUpgrade = (upgradeId) => {
    if (["playing", "paused"].includes(SB.state.mode)) return;
    const def = upgrades.find((upgrade) => upgrade.id === upgradeId);
    if (!def) return;
    const currentRank = SB.saveData.upgrades[def.id];
    if (currentRank >= def.max) return;
    const cost = def.costs[currentRank];
    if (SB.saveData.bank < cost) return;
    SB.saveData.bank -= cost;
    SB.saveData.upgrades[def.id] += 1;
    SB.persistSave();
    SB.audio.sfx("upgrade");
    SB.setToast(`${def.name} upgraded`, 2);
    if (SB.renderUi) SB.renderUi();
  };

  SB.loseLife = () => {
    if (!SB.state.player || SB.state.player.invuln > 0 || SB.state.mode !== "playing") return;
    SB.state.player.health -= 1;
    SB.state.player.damageTaken += 1;
    SB.state.player.invuln = 1.1;
    SB.state.comboTimer = 0;
    SB.state.comboMultiplier = 1;
    SB.state.screenShake = Math.max(SB.state.screenShake, 10);
    SB.addParticles(SB.state.player.x + SB.state.player.w * 0.5, SB.state.player.y + SB.state.player.h * 0.4, 18, "#ff9a92", 240);
    SB.audio.sfx("hurt");
    if (SB.state.player.health <= 0) {
      SB.state.mode = "gameover";
      SB.state.lastResults = {
        stageName: SB.state.stage.name,
        shards: SB.state.shardsCollected,
        time: SB.state.elapsed,
        score: SB.state.score
      };
      SB.audio.sfx("fail");
      if (SB.renderUi) SB.renderUi();
      return;
    }
    SB.respawnPlayer();
  };

  function getWorldRect(platform) {
    return { x: platform.x, y: platform.y, w: platform.w, h: platform.h };
  }

  function updateMovingPlatforms(dt) {
    if (!SB.state.level) return;
    for (const platform of SB.state.level.platforms) {
      if (platform.type !== "moving") continue;
      const prevX = platform.x;
      const prevY = platform.y;
      platform.t += dt * platform.speed;
      const offset = Math.sin(platform.t) * platform.range;
      if (platform.axis === "x") {
        platform.x = platform.baseX + offset;
        platform.y = platform.baseY;
      } else {
        platform.x = platform.baseX;
        platform.y = platform.baseY + offset;
      }
      platform.dx = platform.x - prevX;
      platform.dy = platform.y - prevY;
    }
  }

  function updatePlayer(dt) {
    const player = SB.state.player;
    if (!player) return;

    if (player.ground && player.ground.type === "moving" && player.onGround) {
      player.x += player.ground.dx;
      player.y += player.ground.dy;
    }

    if (player.invuln > 0) player.invuln -= dt;
    if (player.jumpBuffer > 0) player.jumpBuffer -= dt;
    if (player.dashQueued > 0) player.dashQueued -= dt;
    if (player.dashCooldown > 0) player.dashCooldown -= dt;
    if (SB.state.comboTimer > 0) {
      SB.state.comboTimer -= dt;
      if (SB.state.comboTimer <= 0) SB.state.comboMultiplier = 1;
    }

    if (player.onGround) {
      player.coyote = player.coyoteTime;
      player.airJumpsUsed = 0;
    } else {
      player.coyote -= dt;
    }

    const moveDir = (SB.input.right ? 1 : 0) - (SB.input.left ? 1 : 0);
    if (moveDir !== 0) player.face = moveDir;

    if (player.dashTime > 0) {
      player.dashTime -= dt;
      player.vy += SB.config.gravity * 0.14 * dt;
    } else {
      if (moveDir !== 0) player.vx += moveDir * player.accel * dt;
      else {
        const drag = player.onGround ? player.friction : player.friction * 0.35;
        if (Math.abs(player.vx) <= drag * dt) player.vx = 0;
        else player.vx -= Math.sign(player.vx) * drag * dt;
      }
      player.vx = clamp(player.vx, -player.maxSpeed, player.maxSpeed);

      if (player.dashQueued > 0 && player.dashCooldown <= 0) {
        player.dashQueued = 0;
        player.dashTime = player.dashDuration;
        player.dashCooldown = player.dashCooldownBase;
        player.vx = player.face * player.dashSpeed;
        player.vy = -55;
        SB.addParticles(player.x + player.w * 0.5, player.y + player.h * 0.6, 12, "#a9ebff", 170);
        SB.audio.sfx("dash");
      }

      const canGroundJump = player.coyote > 0;
      const canAirJump = player.airJumpsUsed < player.maxAirJumps;
      if (player.jumpBuffer > 0 && (canGroundJump || canAirJump)) {
        if (!canGroundJump) {
          player.airJumpsUsed += 1;
          SB.addParticles(player.x + player.w * 0.5, player.y + player.h * 0.45, 10, "#f7f0bc", 180);
        }
        player.jumpBuffer = 0;
        player.coyote = 0;
        player.onGround = false;
        player.ground = null;
        player.vy = -player.jumpForce;
        SB.audio.sfx("jump");
      }

      player.vy += SB.config.gravity * dt;
      if (SB.saveData.upgrades.wing > 0 && SB.input.jumpHeld && player.vy > 0) player.vy = Math.min(player.vy, player.fallCap);
      if (!SB.input.jumpHeld && player.vy < -180) player.vy += 1200 * dt;
    }

    const prevX = player.x;
    const prevY = player.y;
    player.x += player.vx * dt;
    for (const platform of SB.state.level.platforms) {
      if (!overlap(player, getWorldRect(platform))) continue;
      if (prevX + player.w <= platform.x) {
        player.x = platform.x - player.w;
        player.vx = 0;
      } else if (prevX >= platform.x + platform.w) {
        player.x = platform.x + platform.w;
        player.vx = 0;
      }
    }

    player.y += player.vy * dt;
    player.onGround = false;
    player.ground = null;
    for (const platform of SB.state.level.platforms) {
      if (!overlap(player, getWorldRect(platform))) continue;
      const prevBottom = prevY + player.h;
      const prevTop = prevY;
      if (player.vy >= 0 && prevBottom <= platform.y + 12) {
        player.y = platform.y - player.h;
        player.vy = 0;
        player.onGround = true;
        player.ground = platform;
      } else if (player.vy < 0 && prevTop >= platform.y + platform.h - 10) {
        player.y = platform.y + platform.h;
        player.vy = 0;
      } else if (player.x + player.w * 0.5 < platform.x + platform.w * 0.5) {
        player.x = platform.x - player.w;
        player.vx = 0;
      } else {
        player.x = platform.x + platform.w;
        player.vx = 0;
      }
    }

    player.x = clamp(player.x, -60, Math.max(0, SB.state.level.width - player.w + 60));
    if (player.y > SB.state.level.deathY) SB.loseLife();
  }

  function updateEnemies(dt) {
    const player = SB.state.player;
    if (!player) return;
    for (const enemy of SB.state.level.enemies) {
      if (!enemy.alive) {
        enemy.deadTimer -= dt;
        continue;
      }
      if (enemy.kind === "walker") {
        enemy.x += enemy.dir * enemy.speed * dt;
        if (enemy.x <= enemy.min) {
          enemy.x = enemy.min;
          enemy.dir = 1;
        }
        if (enemy.x + enemy.w >= enemy.max) {
          enemy.x = enemy.max - enemy.w;
          enemy.dir = -1;
        }
      } else {
        enemy.phase += dt * enemy.speed;
        enemy.x = enemy.baseX + Math.sin(enemy.phase) * enemy.range;
        enemy.y = enemy.baseY + Math.cos(enemy.phase * 1.7) * 14;
      }
      if (!overlap(player, enemy)) continue;
      const stomped = player.vy > 170 && player.y + player.h - enemy.y < 18;
      if (stomped || player.dashTime > 0) {
        enemy.alive = false;
        enemy.deadTimer = 0.35;
        player.vy = -410;
        SB.addParticles(enemy.x + enemy.w * 0.5, enemy.y + enemy.h * 0.45, 14, "#ffd29b", 220);
        SB.awardScore(120, enemy.x + enemy.w * 0.5, enemy.y - 6, "#ffe4a3");
        SB.audio.sfx("stomp");
      } else {
        SB.loseLife();
      }
    }
  }

  function collectShard(shard, yPosition) {
    shard.collected = true;
    SB.state.shardsCollected += Math.round(shard.value * SB.state.player.shardValue);
    SB.addParticles(shard.x, yPosition, 10, "#ffe08b", 180);
    SB.awardScore(18, shard.x, yPosition - 6, "#ffe7a7");
    SB.audio.sfx("shard");
  }

  function updateShards() {
    const player = SB.state.player;
    if (!player) return;
    const px = player.x + player.w * 0.5;
    const py = player.y + player.h * 0.45;
    const magnetSq = Math.pow(player.magnetRadius + 18, 2);
    for (const shard of SB.state.level.shards) {
      if (shard.collected) continue;
      const bobY = shard.y + Math.sin(SB.state.elapsed * 5 + shard.phase) * 4;
      const hitRect = { x: shard.x - shard.r, y: bobY - shard.r, w: shard.r * 2, h: shard.r * 2 };
      if (overlap(player, hitRect) || distanceSq(px, py, shard.x, bobY) <= magnetSq) collectShard(shard, bobY);
    }
  }

  function updateHazards() {
    for (const hazard of SB.state.level.hazards) {
      if (hazard.type === "pit") continue;
      if (overlap(SB.state.player, hazard)) {
        SB.loseLife();
        break;
      }
    }
  }

  function updateBoosters() {
    for (const booster of SB.state.level.boosters) {
      if (!overlap(SB.state.player, booster)) continue;
      if (SB.state.player.vy >= 0 && SB.state.player.y + SB.state.player.h <= booster.y + booster.h + 14) {
        SB.state.player.vy = -booster.power;
        SB.state.player.onGround = false;
        SB.state.player.ground = null;
        SB.addParticles(booster.x + booster.w * 0.5, booster.y, 12, "#a5ecff", 200);
        SB.awardScore(35, booster.x + booster.w * 0.5, booster.y - 6, "#dff7ff");
        SB.audio.sfx("boost");
      }
    }
  }

  function updateCheckpoints() {
    const nextIndex = SB.state.player.checkpointIndex + 1;
    if (nextIndex >= SB.state.level.checkpoints.length) return;
    const next = SB.state.level.checkpoints[nextIndex];
    if (SB.state.player.x + SB.state.player.w * 0.4 >= next.trigger) {
      next.active = true;
      SB.state.player.checkpointIndex = nextIndex;
      SB.addParticles(next.x + 12, next.y - 12, 12, SB.currentTheme().checkpoint, 170);
      SB.setToast(`Checkpoint ${nextIndex}/${SB.state.level.checkpoints.length - 1}`);
      SB.audio.sfx("checkpoint");
    }
  }

  function updateGoal() {
    if (overlap(SB.state.player, SB.state.level.goal)) SB.completeStage();
  }

  function updateParticles(dt) {
    for (let i = SB.state.particles.length - 1; i >= 0; i -= 1) {
      const particle = SB.state.particles[i];
      particle.life -= dt;
      if (particle.life <= 0) {
        SB.state.particles.splice(i, 1);
        continue;
      }
      particle.vy += 520 * dt;
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
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
      text.y -= 28 * dt;
    }
  }

  SB.updateGame = (dt) => {
    SB.state.previewTime += dt;
    if (SB.state.toastTimer > 0) SB.state.toastTimer -= dt;
    if (SB.state.screenShake > 0) SB.state.screenShake = Math.max(0, SB.state.screenShake - 36 * dt);
    SB.state.uiRefreshTimer -= dt;

    if (SB.state.mode === "playing") {
      SB.state.elapsed += dt;
      updateMovingPlatforms(dt);
      updatePlayer(dt);
      updateEnemies(dt);
      updateShards();
      updateBoosters();
      updateHazards();
      updateCheckpoints();
      updateGoal();
      const targetX = clamp(
        SB.state.player.x + SB.state.player.w * 0.5 - SB.config.viewWidth * 0.42,
        0,
        Math.max(0, SB.state.level.width - SB.config.viewWidth)
      );
      const targetY = clamp(
        SB.state.player.y + SB.state.player.h * 0.4 - SB.config.viewHeight * 0.55,
        0,
        Math.max(0, SB.state.level.height - SB.config.viewHeight)
      );
      SB.state.camera.x = lerp(SB.state.camera.x, targetX, Math.min(1, dt * 6));
      SB.state.camera.y = lerp(SB.state.camera.y, targetY, Math.min(1, dt * 4.8));
    }

    if (SB.state.uiRefreshTimer <= 0 && (SB.state.mode === "playing" || SB.state.mode === "paused")) {
      if (SB.renderUi) SB.renderUi();
      SB.state.uiRefreshTimer = 0.2;
    }

    updateParticles(dt);
    updateFloatingTexts(dt);
  };
})();
