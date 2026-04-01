(() => {
  "use strict";

  const SB = window.Shardbound;
  const ctx = SB.ctx;
  const { clamp, mod, drawRoundedPanel, drawHeart, drawStar, drawShardShape } = SB.utils;

  SB.scaleX = 1;
  SB.scaleY = 1;

  SB.resizeCanvas = () => {
    const rect = SB.canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, SB.config.coarsePointer ? 1.5 : 2);
    const width = Math.max(320, Math.round(rect.width * dpr));
    const height = Math.max(180, Math.round(rect.height * dpr));
    if (SB.canvas.width !== width || SB.canvas.height !== height) {
      SB.canvas.width = width;
      SB.canvas.height = height;
    }
    SB.scaleX = SB.canvas.width / SB.config.viewWidth;
    SB.scaleY = SB.canvas.height / SB.config.viewHeight;
  };

  function isVisible(x, y, w, h, cameraX, cameraY) {
    return (
      x + w >= cameraX - 120 &&
      x <= cameraX + SB.config.viewWidth + 120 &&
      y + h >= cameraY - 100 &&
      y <= cameraY + SB.config.viewHeight + 120
    );
  }

  function drawBackground(level, cameraX, t) {
    const theme = SB.data.themes[level.themeKey];
    const sky = ctx.createLinearGradient(0, 0, 0, SB.config.viewHeight);
    sky.addColorStop(0, theme.skyTop);
    sky.addColorStop(0.55, theme.skyMid);
    sky.addColorStop(1, theme.skyBottom);
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, SB.config.viewWidth, SB.config.viewHeight);

    const sunX = SB.config.viewWidth - 150 - cameraX * 0.08;
    const sunY = 90;
    const sunGradient = ctx.createRadialGradient(sunX, sunY, 10, sunX, sunY, 84);
    sunGradient.addColorStop(0, theme.sun);
    sunGradient.addColorStop(1, `${theme.sun}00`);
    ctx.fillStyle = sunGradient;
    ctx.beginPath();
    ctx.arc(sunX, sunY, 84, 0, Math.PI * 2);
    ctx.fill();

    for (const cloud of level.clouds) {
      let x = cloud.x - cameraX * cloud.speed;
      x = mod(x + 120, SB.config.viewWidth + 240) - 120;
      const y = cloud.y + Math.sin(t * 0.2 + cloud.speed * 20) * 4;
      ctx.globalAlpha = cloud.alpha;
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.arc(x, y, cloud.size * 0.35, 0, Math.PI * 2);
      ctx.arc(x + cloud.size * 0.25, y - cloud.size * 0.1, cloud.size * 0.28, 0, Math.PI * 2);
      ctx.arc(x + cloud.size * 0.48, y, cloud.size * 0.24, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    ctx.fillStyle = `${theme.haze}38`;
    ctx.fillRect(0, SB.config.viewHeight * 0.55, SB.config.viewWidth, SB.config.viewHeight * 0.45);

    ctx.fillStyle = theme.farA;
    for (let i = -1; i < 8; i += 1) {
      const baseX = i * 280 - mod(cameraX * 0.16, 280) - 140;
      ctx.beginPath();
      ctx.moveTo(baseX, SB.config.viewHeight);
      ctx.lineTo(baseX + 110, SB.config.viewHeight - 180);
      ctx.lineTo(baseX + 240, SB.config.viewHeight);
      ctx.closePath();
      ctx.fill();
    }

    ctx.fillStyle = theme.farB;
    for (const landmark of level.landmarks) {
      const x = landmark.x - cameraX * 0.24;
      if (x + landmark.w < -160 || x > SB.config.viewWidth + 160) continue;
      ctx.fillRect(x, SB.config.viewHeight - landmark.h - 40, landmark.w * 0.24, landmark.h + 40);
      ctx.beginPath();
      ctx.moveTo(x - 10, SB.config.viewHeight - 40);
      ctx.lineTo(x + landmark.w * 0.12, SB.config.viewHeight - landmark.h);
      ctx.lineTo(x + landmark.w * 0.28, SB.config.viewHeight - 40);
      ctx.closePath();
      ctx.fill();
    }

    ctx.fillStyle = theme.nearA;
    for (let i = -1; i < 9; i += 1) {
      const x = i * 220 - mod(cameraX * 0.34, 220) - 110;
      ctx.beginPath();
      ctx.moveTo(x, SB.config.viewHeight);
      ctx.quadraticCurveTo(x + 110, SB.config.viewHeight - 120, x + 220, SB.config.viewHeight);
      ctx.closePath();
      ctx.fill();
    }

    for (const bit of level.atmosphere) {
      const x = mod(bit.x + Math.sin(t * 0.2 + bit.phase) * bit.drift, SB.config.viewWidth);
      const y = mod(bit.y + Math.cos(t * 0.24 + bit.phase) * 18, SB.config.viewHeight);
      ctx.globalAlpha = bit.alpha;
      if (theme.weather === "rain") {
        ctx.strokeStyle = "#d9ecff";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x - 4, y + 10);
        ctx.stroke();
      } else {
        ctx.fillStyle = theme.weather === "ash" ? "#ffd0a3" : theme.weather === "snow" ? "#f4fbff" : "#e9ffcc";
        ctx.beginPath();
        ctx.arc(x, y, bit.size, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }

    if (theme.weather === "storm") {
      const flash = Math.max(0, Math.sin(t * 0.35) - 0.94) * 6;
      if (flash > 0) {
        ctx.fillStyle = `rgba(236,245,255,${flash * 0.12})`;
        ctx.fillRect(0, 0, SB.config.viewWidth, SB.config.viewHeight);
      }
    }
  }

  function drawHazards(level, cameraX, cameraY) {
    const theme = SB.data.themes[level.themeKey];
    for (const hazard of level.hazards) {
      if (!isVisible(hazard.x, hazard.y, hazard.w, hazard.h, cameraX, cameraY)) continue;
      if (hazard.type === "pit") {
        ctx.fillStyle = `${theme.hazard}44`;
        ctx.fillRect(hazard.x, hazard.y + 8, hazard.w, hazard.h - 8);
        ctx.fillStyle = theme.hazard;
        for (let x = hazard.x; x < hazard.x + hazard.w; x += 14) {
          ctx.beginPath();
          ctx.moveTo(x, hazard.y + hazard.h);
          ctx.lineTo(x + 7, hazard.y + 4);
          ctx.lineTo(x + 14, hazard.y + hazard.h);
          ctx.closePath();
          ctx.fill();
        }
      } else {
        ctx.fillStyle = `${theme.hazard}55`;
        ctx.fillRect(hazard.x, hazard.y + 5, hazard.w, hazard.h - 5);
        ctx.fillStyle = theme.hazard;
        for (let x = hazard.x; x < hazard.x + hazard.w; x += 12) {
          ctx.beginPath();
          ctx.moveTo(x, hazard.y + hazard.h);
          ctx.lineTo(x + 6, hazard.y);
          ctx.lineTo(x + 12, hazard.y + hazard.h);
          ctx.closePath();
          ctx.fill();
        }
      }
    }
  }

  function drawPlatforms(level, cameraX, cameraY) {
    const theme = SB.data.themes[level.themeKey];
    for (const platform of level.platforms) {
      if (!isVisible(platform.x, platform.y, platform.w, platform.h, cameraX, cameraY)) continue;
      if (platform.type === "ground") {
        const groundGrad = ctx.createLinearGradient(0, platform.y, 0, platform.y + platform.h);
        groundGrad.addColorStop(0, theme.groundTop);
        groundGrad.addColorStop(0.2, theme.groundSide);
        groundGrad.addColorStop(1, theme.groundShadow);
        ctx.fillStyle = groundGrad;
        ctx.fillRect(platform.x, platform.y, platform.w, platform.h);
        ctx.fillStyle = theme.platformEdge;
        ctx.fillRect(platform.x, platform.y, platform.w, 8);
        ctx.fillStyle = `${theme.groundShadow}99`;
        for (let x = platform.x + 12; x < platform.x + platform.w - 10; x += 22) ctx.fillRect(x, platform.y + 20, 6, platform.h - 22);
        ctx.fillStyle = `${theme.groundTop}88`;
        for (let x = platform.x + 6; x < platform.x + platform.w - 10; x += 18) ctx.fillRect(x, platform.y - 6, 8, 8);
      } else {
        const top = platform.type === "moving" ? theme.movingTop : theme.platformTop;
        const bottom = platform.type === "moving" ? theme.movingSide : theme.platformSide;
        const plate = ctx.createLinearGradient(0, platform.y, 0, platform.y + platform.h);
        plate.addColorStop(0, top);
        plate.addColorStop(1, bottom);
        drawRoundedPanel(ctx, platform.x, platform.y, platform.w, platform.h, 8, plate, "rgba(255,255,255,0.28)");
        ctx.fillStyle = `${theme.platformEdge}66`;
        ctx.fillRect(platform.x + 8, platform.y + 4, platform.w - 16, 3);
      }
    }
  }

  function drawBoosters(level, cameraX, cameraY) {
    for (const booster of level.boosters) {
      if (!isVisible(booster.x, booster.y, booster.w, booster.h, cameraX, cameraY)) continue;
      const gradient = ctx.createLinearGradient(0, booster.y, 0, booster.y + booster.h);
      gradient.addColorStop(0, "#baf7ff");
      gradient.addColorStop(1, "#3ba3be");
      drawRoundedPanel(ctx, booster.x, booster.y, booster.w, booster.h, 7, gradient, "rgba(255,255,255,0.28)");
      ctx.fillStyle = "#effaff";
      ctx.fillRect(booster.x + 6, booster.y + 4, booster.w - 12, 2);
      ctx.fillStyle = "rgba(239,250,255,0.56)";
      ctx.beginPath();
      ctx.moveTo(booster.x + booster.w * 0.5, booster.y - 12);
      ctx.lineTo(booster.x + booster.w * 0.3, booster.y);
      ctx.lineTo(booster.x + booster.w * 0.7, booster.y);
      ctx.closePath();
      ctx.fill();
    }
  }

  function drawCheckpoints(level, checkpointIndex, cameraX, cameraY) {
    const theme = SB.data.themes[level.themeKey];
    for (let i = 1; i < level.checkpoints.length; i += 1) {
      const checkpoint = level.checkpoints[i];
      if (!isVisible(checkpoint.x, checkpoint.y - 84, 36, 90, cameraX, cameraY)) continue;
      const active = i <= checkpointIndex;
      ctx.fillStyle = "#e8f2f7";
      ctx.fillRect(checkpoint.x - 3, checkpoint.y - 82, 6, 84);
      ctx.beginPath();
      ctx.moveTo(checkpoint.x + 3, checkpoint.y - 78);
      ctx.lineTo(checkpoint.x + 42, checkpoint.y - 66);
      ctx.lineTo(checkpoint.x + 3, checkpoint.y - 52);
      ctx.closePath();
      ctx.fillStyle = active ? theme.checkpoint : "rgba(232,242,247,0.4)";
      ctx.fill();
    }
  }

  function drawShards(level, cameraX, cameraY) {
    for (const shard of level.shards) {
      if (shard.collected) continue;
      const y = shard.y + Math.sin(SB.state.previewTime * 5 + shard.phase) * 4;
      if (!isVisible(shard.x - 12, y - 12, 24, 24, cameraX, cameraY)) continue;
      drawShardShape(ctx, shard.x, y, 10, "#fff7b6", "#f3a93e");
    }
  }

  function drawEnemies(level, cameraX, cameraY) {
    for (const enemy of level.enemies) {
      if (!enemy.alive && enemy.deadTimer <= 0) continue;
      if (!isVisible(enemy.x, enemy.y, enemy.w, enemy.h, cameraX, cameraY)) continue;
      const squash = enemy.alive ? 1 : 0.45;
      const height = enemy.h * squash;
      const y = enemy.y + (enemy.h - height);
      const shell = ctx.createLinearGradient(enemy.x, y, enemy.x, y + height);
      if (enemy.kind === "walker") {
        shell.addColorStop(0, "#f0b572");
        shell.addColorStop(1, "#8a4b24");
      } else {
        shell.addColorStop(0, "#d0f6ff");
        shell.addColorStop(1, "#5497b8");
      }
      drawRoundedPanel(ctx, enemy.x, y, enemy.w, height, 11, shell, "rgba(255,255,255,0.24)");
      if (enemy.alive) {
        ctx.fillStyle = "#15212b";
        ctx.beginPath();
        if (enemy.kind === "walker") ctx.arc(enemy.x + (enemy.dir > 0 ? 22 : 12), y + 12, 3, 0, Math.PI * 2);
        else {
          ctx.arc(enemy.x + 12, y + 12, 3, 0, Math.PI * 2);
          ctx.arc(enemy.x + 24, y + 12, 3, 0, Math.PI * 2);
        }
        ctx.fill();
      }
    }
  }

  function drawGoal(level, cameraX, cameraY) {
    if (!level.goal || !isVisible(level.goal.x, level.goal.y - 90, 60, 120, cameraX, cameraY)) return;
    const theme = SB.data.themes[level.themeKey];
    ctx.fillStyle = "#e4edf4";
    ctx.fillRect(level.goal.x + level.goal.w * 0.5 - 3, level.goal.y - 90, 6, 92);
    const glow = ctx.createRadialGradient(level.goal.x + 24, level.goal.y - 24, 4, level.goal.x + 24, level.goal.y - 24, 36);
    glow.addColorStop(0, theme.goal);
    glow.addColorStop(1, `${theme.goal}00`);
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(level.goal.x + 24, level.goal.y - 24, 36, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = theme.goal;
    ctx.beginPath();
    ctx.moveTo(level.goal.x + 24, level.goal.y - 58);
    ctx.lineTo(level.goal.x + 48, level.goal.y - 24);
    ctx.lineTo(level.goal.x + 24, level.goal.y + 6);
    ctx.lineTo(level.goal.x, level.goal.y - 24);
    ctx.closePath();
    ctx.fill();
  }

  function drawPlayer(player) {
    if (player.invuln > 0 && Math.floor(performance.now() / 80) % 2 === 0) return;
    const runFactor = clamp(Math.abs(player.vx || 0) / 380, 0, 1);
    const step = Math.sin(SB.state.previewTime * 14 * (0.4 + runFactor)) * 5 * runFactor;
    const scarfDir = -(player.face || 1);
    ctx.fillStyle = "#ef6c5a";
    ctx.beginPath();
    ctx.moveTo(player.x + player.w * 0.5, player.y + 16);
    ctx.lineTo(player.x + player.w * 0.5 + scarfDir * (16 + runFactor * 10), player.y + 18 + step * 0.3);
    ctx.lineTo(player.x + player.w * 0.5, player.y + 26);
    ctx.closePath();
    ctx.fill();
    const body = ctx.createLinearGradient(player.x, player.y, player.x, player.y + player.h);
    body.addColorStop(0, "#ffe57a");
    body.addColorStop(1, "#e88e2e");
    drawRoundedPanel(ctx, player.x, player.y, player.w, player.h - 2, 10, body, "rgba(255,255,255,0.18)");
    ctx.fillStyle = "#3d2f2a";
    ctx.fillRect(player.x + 6, player.y + player.h - 8 + Math.max(0, step * 0.2), 7, 8 - Math.max(0, step * 0.2));
    ctx.fillRect(player.x + player.w - 13, player.y + player.h - 8 + Math.max(0, -step * 0.2), 7, 8 - Math.max(0, -step * 0.2));
    const eyeY = player.y + 15;
    const leftEyeX = player.x + (player.face > 0 ? 18 : 12);
    const rightEyeX = leftEyeX + 8;
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(leftEyeX, eyeY, 3, 0, Math.PI * 2);
    ctx.arc(rightEyeX, eyeY, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#11212c";
    ctx.beginPath();
    ctx.arc(leftEyeX + (player.face > 0 ? 1 : -1), eyeY, 1.2, 0, Math.PI * 2);
    ctx.arc(rightEyeX + (player.face > 0 ? 1 : -1), eyeY, 1.2, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawParticles(cameraX, cameraY) {
    for (const particle of SB.state.particles) {
      if (!isVisible(particle.x, particle.y, 8, 8, cameraX, cameraY)) continue;
      ctx.globalAlpha = clamp(particle.life / particle.maxLife, 0, 1);
      ctx.fillStyle = particle.color;
      ctx.beginPath();
      ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  }

  function drawFloatingTexts(cameraX, cameraY) {
    ctx.font = "700 16px 'Trebuchet MS', sans-serif";
    ctx.textAlign = "center";
    for (const text of SB.state.floatingTexts) {
      if (!isVisible(text.x - 40, text.y - 24, 80, 40, cameraX, cameraY)) continue;
      ctx.globalAlpha = clamp(text.life / 0.9, 0, 1);
      ctx.fillStyle = text.color;
      ctx.fillText(text.text, text.x, text.y);
      ctx.globalAlpha = 1;
    }
    ctx.textAlign = "left";
  }

  function drawHud() {
    drawRoundedPanel(ctx, 12, 10, SB.config.viewWidth - 24, 78, 16, "rgba(7,18,28,0.52)", "rgba(255,255,255,0.12)");
    for (let i = 0; i < SB.state.player.maxHealth; i += 1) drawHeart(ctx, 28 + i * 30, 30, 20, i < SB.state.player.health);
    ctx.fillStyle = "#eff7fb";
    ctx.font = "700 20px 'Trebuchet MS', sans-serif";
    ctx.fillText(`Score ${SB.state.score}`, 166, 38);
    ctx.font = "600 17px 'Trebuchet MS', sans-serif";
    ctx.fillStyle = "#c6ddeb";
    ctx.fillText(`Shards ${SB.state.shardsCollected}/${SB.state.stage.coinGoal}`, 166, 62);
    const stageProgress = clamp((SB.state.player.x + SB.state.player.w * 0.5) / SB.state.level.width, 0, 1);
    drawRoundedPanel(ctx, 362, 30, 190, 14, 8, "rgba(255,255,255,0.16)");
    drawRoundedPanel(ctx, 362, 30, 190 * stageProgress, 14, 8, SB.currentTheme().uiAccent);
    drawRoundedPanel(ctx, 362, 54, 190, 14, 8, "rgba(255,255,255,0.16)");
    drawRoundedPanel(ctx, 362, 54, 190 * clamp(SB.state.comboTimer / 2.4, 0, 1), 14, 8, SB.currentTheme().uiHot);
    ctx.fillStyle = "#eef8fb";
    ctx.font = "700 14px 'Trebuchet MS', sans-serif";
    ctx.fillText("Route", 318, 41);
    ctx.fillText(`Combo x${SB.state.comboMultiplier.toFixed(1)}`, 278, 65);
    const dashReady = SB.state.player.dashCooldown <= 0 ? 1 : 1 - clamp(SB.state.player.dashCooldown / SB.state.player.dashCooldownBase, 0, 1);
    drawRoundedPanel(ctx, 590, 30, 140, 14, 8, "rgba(255,255,255,0.16)");
    drawRoundedPanel(ctx, 590, 30, 140 * dashReady, 14, 8, "#8fdff5");
    ctx.fillStyle = "#eef8fb";
    ctx.font = "700 14px 'Trebuchet MS', sans-serif";
    ctx.fillText("Dash", 744, 41);
    ctx.textAlign = "right";
    ctx.font = "700 22px 'Trebuchet MS', sans-serif";
    ctx.fillStyle = "#eff7fb";
    ctx.fillText(SB.utils.formatTime(SB.state.elapsed), SB.config.viewWidth - 26, 44);
    ctx.textAlign = "left";
    if (SB.state.toastTimer > 0 && SB.state.toast) {
      ctx.globalAlpha = clamp(SB.state.toastTimer / 1.8, 0, 1);
      drawRoundedPanel(ctx, SB.config.viewWidth * 0.5 - 170, 98, 340, 36, 10, "rgba(10,24,38,0.78)", "rgba(255,255,255,0.22)");
      ctx.fillStyle = "#f2fbff";
      ctx.font = "700 18px 'Trebuchet MS', sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(SB.state.toast, SB.config.viewWidth * 0.5, 121);
      ctx.textAlign = "left";
      ctx.globalAlpha = 1;
    }
  }

  function drawHomeOverlay(stage) {
    drawRoundedPanel(ctx, 24, SB.config.viewHeight - 166, 380, 128, 20, "rgba(8,18,28,0.72)", "rgba(255,255,255,0.12)");
    ctx.fillStyle = SB.currentTheme().uiAccent;
    ctx.font = "700 12px 'Trebuchet MS', sans-serif";
    ctx.fillText("SELECTED MISSION", 46, SB.config.viewHeight - 132);
    ctx.fillStyle = "#f5fbff";
    ctx.font = "800 34px Rockwell, 'Trebuchet MS', serif";
    ctx.fillText(stage.name, 46, SB.config.viewHeight - 94);
    ctx.fillStyle = "#c8dce8";
    ctx.font = "500 15px 'Trebuchet MS', sans-serif";
    ctx.fillText(stage.description, 46, SB.config.viewHeight - 64);
    ctx.fillText(`Par ${SB.utils.formatTime(stage.parTime)}  |  Goal ${stage.coinGoal} shards  |  Reward ${stage.clearReward}`, 46, SB.config.viewHeight - 38);
  }

  function drawCenterOverlay(title, subtitle, lines) {
    drawRoundedPanel(ctx, SB.config.viewWidth * 0.5 - 270, 112, 540, 270, 22, "rgba(8,18,28,0.78)", "rgba(255,255,255,0.12)");
    ctx.textAlign = "center";
    ctx.fillStyle = "#f5fbff";
    ctx.font = "800 48px Rockwell, 'Trebuchet MS', serif";
    ctx.fillText(title, SB.config.viewWidth * 0.5, 182);
    ctx.fillStyle = "#d5e4eb";
    ctx.font = "500 18px 'Trebuchet MS', sans-serif";
    ctx.fillText(subtitle, SB.config.viewWidth * 0.5, 228);
    ctx.font = "600 18px 'Trebuchet MS', sans-serif";
    lines.forEach((line, index) => ctx.fillText(line, SB.config.viewWidth * 0.5, 282 + index * 32));
    ctx.textAlign = "left";
  }

  function drawVictoryOverlay(results) {
    drawCenterOverlay("STAGE CLEARED", results.stageName, [
      `Time ${SB.utils.formatTime(results.time)}   Score ${results.score}`,
      `Shards ${results.shards}   Payout ${results.payout}`,
      results.flawless ? "Flawless bonus secured." : "Replay clean for a flawless bonus."
    ]);
    for (let i = 0; i < 3; i += 1) {
      drawStar(
        ctx,
        SB.config.viewWidth * 0.5 - 48 + i * 48,
        124,
        16,
        i < results.stars ? "#ffd878" : "rgba(255,255,255,0.18)",
        i < results.stars ? "#fff1bf" : "rgba(255,255,255,0.2)"
      );
    }
  }

  function drawGameOverOverlay(results) {
    drawCenterOverlay("RUN LOST", results.stageName, [
      `Time ${SB.utils.formatTime(results.time)}   Score ${results.score}`,
      `Shards collected ${results.shards}`,
      "Upgrade, reroute, and take the skyline back."
    ]);
  }

  function drawPauseOverlay() {
    drawCenterOverlay("PAUSED", SB.state.stage.name, [
      `Time ${SB.utils.formatTime(SB.state.elapsed)}   Score ${SB.state.score}`,
      `Shards ${SB.state.shardsCollected}/${SB.state.stage.coinGoal}`,
      "Resume or restart from the buttons below the canvas."
    ]);
  }

  SB.render = () => {
    const renderLevel = SB.state.mode === "home" ? SB.state.previewLevel : SB.state.level || SB.state.previewLevel;
    const renderStage = SB.state.mode === "home" ? SB.getStageById(SB.state.selectedStageId) : SB.state.stage || SB.getStageById(SB.state.selectedStageId);
    if (!renderLevel || !renderStage) return;

    const cameraX =
      SB.state.mode === "home"
        ? Math.max(0, (SB.state.previewTime * 42) % Math.max(1, renderLevel.width - SB.config.viewWidth))
        : SB.state.camera.x;
    const cameraY = SB.state.mode === "home" ? 0 : SB.state.camera.y;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, SB.canvas.width, SB.canvas.height);
    ctx.setTransform(SB.scaleX, 0, 0, SB.scaleY, 0, 0);

    const shakeX = SB.state.mode !== "home" && SB.state.screenShake > 0 ? (Math.random() - 0.5) * SB.state.screenShake : 0;
    const shakeY = SB.state.mode !== "home" && SB.state.screenShake > 0 ? (Math.random() - 0.5) * SB.state.screenShake : 0;

    ctx.save();
    ctx.translate(shakeX, shakeY);
    drawBackground(renderLevel, cameraX, SB.state.previewTime);
    ctx.save();
    ctx.translate(-Math.floor(cameraX), -Math.floor(cameraY));
    drawHazards(renderLevel, cameraX, cameraY);
    drawPlatforms(renderLevel, cameraX, cameraY);
    drawBoosters(renderLevel, cameraX, cameraY);
    drawCheckpoints(renderLevel, SB.state.player ? SB.state.player.checkpointIndex : 0, cameraX, cameraY);
    drawShards(renderLevel, cameraX, cameraY);
    drawEnemies(renderLevel, cameraX, cameraY);
    drawGoal(renderLevel, cameraX, cameraY);
    if (SB.state.mode === "home") drawPlayer(SB.createPreviewPlayer(renderLevel));
    else if (SB.state.player) drawPlayer(SB.state.player);
    drawParticles(cameraX, cameraY);
    drawFloatingTexts(cameraX, cameraY);
    ctx.restore();

    if (SB.state.mode !== "home" && SB.state.player) drawHud();
    if (SB.state.mode === "home") drawHomeOverlay(renderStage);
    if (SB.state.mode === "paused") drawPauseOverlay();
    if (SB.state.mode === "victory" && SB.state.lastResults) drawVictoryOverlay(SB.state.lastResults);
    if (SB.state.mode === "gameover" && SB.state.lastResults) drawGameOverOverlay(SB.state.lastResults);
    ctx.restore();
  };
})();
