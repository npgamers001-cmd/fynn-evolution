(() => {
  "use strict";

  const SB = window.Shardbound;
  const ctx = SB.ctx;
  const { clamp, lerp, rgba, shade, formatTime } = SB.utils;

  SB.scaleX = 1;
  SB.scaleY = 1;

  SB.resizeCanvas = () => {
    const rect = SB.canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, SB.config.coarsePointer ? 1.35 : 2);
    const width = Math.max(320, Math.round(rect.width * dpr));
    const height = Math.max(180, Math.round(rect.height * dpr));
    if (SB.canvas.width !== width || SB.canvas.height !== height) {
      SB.canvas.width = width;
      SB.canvas.height = height;
    }
    SB.scaleX = SB.canvas.width / SB.config.viewWidth;
    SB.scaleY = SB.canvas.height / SB.config.viewHeight;
  };

  function panel(x, y, w, h, fill, stroke = "rgba(255,255,255,0.12)") {
    ctx.beginPath();
    ctx.moveTo(x + 16, y);
    ctx.lineTo(x + w - 16, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + 16);
    ctx.lineTo(x + w, y + h - 16);
    ctx.quadraticCurveTo(x + w, y + h, x + w - 16, y + h);
    ctx.lineTo(x + 16, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - 16);
    ctx.lineTo(x, y + 16);
    ctx.quadraticCurveTo(x, y, x + 16, y);
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 1.2;
    ctx.stroke();
  }

  function projectPoint(x, y, z, camera) {
    const dz = z - camera.z;
    if (dz <= 18) return null;
    const scale = 640 / dz;
    return {
      x: SB.config.viewWidth * 0.5 + (x - camera.x) * scale,
      y: SB.config.viewHeight * 0.62 + (camera.y - y) * scale,
      scale,
      depth: dz
    };
  }

  function drawQuad(points, fillStyle, alpha = 1, strokeStyle = null) {
    if (points.some((point) => !point)) return;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i += 1) ctx.lineTo(points[i].x, points[i].y);
    ctx.closePath();
    ctx.fillStyle = fillStyle;
    ctx.fill();
    if (strokeStyle) {
      ctx.strokeStyle = strokeStyle;
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    ctx.restore();
  }

  function wrapText(text, x, y, maxWidth, lineHeight, maxLines = 3) {
    const words = text.split(" ");
    let line = "";
    let lineIndex = 0;
    for (const word of words) {
      const test = line ? `${line} ${word}` : word;
      if (ctx.measureText(test).width > maxWidth && line) {
        ctx.fillText(line, x, y + lineIndex * lineHeight);
        line = word;
        lineIndex += 1;
        if (lineIndex >= maxLines - 1) break;
      } else {
        line = test;
      }
    }
    ctx.fillText(line, x, y + lineIndex * lineHeight);
    return y + lineIndex * lineHeight;
  }

  function drawBox(box, colors, camera, alpha = 1) {
    const halfW = box.w * 0.5;
    const halfD = box.d * 0.5;
    const top = box.y;
    const bottom = box.y - box.h;
    const nearZ = box.z - halfD;
    const farZ = box.z + halfD;

    const ntl = projectPoint(box.x - halfW, top, nearZ, camera);
    const ntr = projectPoint(box.x + halfW, top, nearZ, camera);
    const ftr = projectPoint(box.x + halfW, top, farZ, camera);
    const ftl = projectPoint(box.x - halfW, top, farZ, camera);
    const nbl = projectPoint(box.x - halfW, bottom, nearZ, camera);
    const nbr = projectPoint(box.x + halfW, bottom, nearZ, camera);
    const fbr = projectPoint(box.x + halfW, bottom, farZ, camera);
    const fbl = projectPoint(box.x - halfW, bottom, farZ, camera);

    drawQuad([nbl, nbr, ntr, ntl], colors.front, alpha, rgba(colors.top, 0.22));
    if (box.x >= camera.x) drawQuad([fbl, nbl, ntl, ftl], colors.side, alpha, rgba(colors.top, 0.18));
    else drawQuad([nbr, fbr, ftr, ntr], colors.side, alpha, rgba(colors.top, 0.18));
    drawQuad([ntl, ntr, ftr, ftl], colors.top, alpha, rgba(colors.top, 0.32));
  }

  function drawBackground(level, camera) {
    const theme = level.theme;
    const sky = ctx.createLinearGradient(0, 0, 0, SB.config.viewHeight);
    sky.addColorStop(0, theme.skyTop);
    sky.addColorStop(0.55, theme.skyMid);
    sky.addColorStop(1, theme.skyBottom);
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, SB.config.viewWidth, SB.config.viewHeight);

    const sunX = SB.config.viewWidth - 120 + camera.x * 0.08;
    const sunGradient = ctx.createRadialGradient(sunX, 96, 16, sunX, 96, 86);
    sunGradient.addColorStop(0, theme.sun);
    sunGradient.addColorStop(1, rgba(theme.sun, 0));
    ctx.fillStyle = sunGradient;
    ctx.beginPath();
    ctx.arc(sunX, 96, 86, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = rgba(theme.haze, 0.2);
    ctx.fillRect(0, SB.config.viewHeight * 0.58, SB.config.viewWidth, SB.config.viewHeight * 0.42);

    for (const light of level.skyLights) {
      const point = projectPoint(light.x * 0.34, light.y, light.z + camera.z * 0.3, {
        x: camera.x * 0.2,
        y: camera.y * 0.58,
        z: camera.z * 0.2
      });
      if (!point) continue;
      ctx.globalAlpha = light.alpha;
      ctx.fillStyle = theme.haze;
      ctx.beginPath();
      ctx.arc(point.x, point.y, Math.max(1, light.size * point.scale), 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    for (const bit of level.horizonBits) {
      const width = bit.w * (0.7 + bit.depth);
      const x = SB.config.viewWidth * 0.5 + bit.x - camera.x * bit.depth * 0.24;
      const y = SB.config.viewHeight * 0.7 - bit.h * bit.depth;
      ctx.fillStyle = bit.depth > 0.5 ? theme.bgNear : theme.bgFar;
      ctx.fillRect(x, y, width, bit.h * (0.9 + bit.depth * 0.2));
    }
  }

  function drawZoneRect(zone, camera, color, alpha) {
    const top = zone.y + 2;
    const halfW = zone.w * 0.5;
    const halfD = zone.d * 0.5;
    drawQuad(
      [
        projectPoint(zone.x - halfW, top, zone.z - halfD, camera),
        projectPoint(zone.x + halfW, top, zone.z - halfD, camera),
        projectPoint(zone.x + halfW, top, zone.z + halfD, camera),
        projectPoint(zone.x - halfW, top, zone.z + halfD, camera)
      ],
      color,
      alpha,
      rgba(color, 0.28)
    );
  }

  function visibleDepth(z, camera) {
    return z - camera.z > 10 && z - camera.z < 2200;
  }

  function drawOrbs(level, camera) {
    for (const orb of level.orbs) {
      if (orb.collected || !visibleDepth(orb.z, camera)) continue;
      const point = projectPoint(orb.x, orb.y + Math.sin(SB.state.previewTime * 5 + orb.phase) * 4, orb.z, camera);
      if (!point) continue;
      const size = clamp(14 * point.scale, 3, 18);
      ctx.save();
      ctx.translate(point.x, point.y);
      ctx.fillStyle = level.theme.orb;
      ctx.strokeStyle = rgba(level.theme.goal, 0.48);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, -size);
      ctx.lineTo(size * 0.75, 0);
      ctx.lineTo(0, size);
      ctx.lineTo(-size * 0.75, 0);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }
  }

  function drawPads(level, camera) {
    for (const pad of level.pads) {
      if (!visibleDepth(pad.z, camera)) continue;
      const top = pad.y + 2;
      const halfW = pad.w * 0.5;
      const halfD = pad.d * 0.5;
      drawQuad(
        [
          projectPoint(pad.x - halfW, top, pad.z - halfD, camera),
          projectPoint(pad.x + halfW, top, pad.z - halfD, camera),
          projectPoint(pad.x + halfW, top, pad.z + halfD, camera),
          projectPoint(pad.x - halfW, top, pad.z + halfD, camera)
        ],
        rgba(pad.color, 0.92),
        0.9,
        rgba("#ffffff", 0.28)
      );
    }
  }

  function drawSweepers(level, camera) {
    for (const sweeper of level.sweepers) {
      if (!visibleDepth(sweeper.z, camera)) continue;
      drawBox(
        sweeper,
        {
          top: level.theme.hazard,
          front: shade(level.theme.hazard, -0.15),
          side: shade(level.theme.hazard, -0.42)
        },
        camera,
        0.94
      );
    }
  }

  function drawGoal(level, camera) {
    if (!level.goal || !visibleDepth(level.goal.z, camera)) return;
    const goal = level.goal;
    drawBox(
      { x: goal.x - 24, y: goal.y + goal.h, z: goal.z, w: 8, d: 8, h: goal.h },
      { top: "#e8f3ff", front: "#afbfcb", side: "#6e7c8a" },
      camera
    );
    drawBox(
      { x: goal.x + 24, y: goal.y + goal.h, z: goal.z, w: 8, d: 8, h: goal.h },
      { top: "#e8f3ff", front: "#afbfcb", side: "#6e7c8a" },
      camera
    );
    const bannerTopLeft = projectPoint(goal.x - 24, goal.y + goal.h - 10, goal.z - 2, camera);
    const bannerTopRight = projectPoint(goal.x + 24, goal.y + goal.h - 10, goal.z - 2, camera);
    const bannerBottomRight = projectPoint(goal.x + 24, goal.y + goal.h - 44, goal.z + 6, camera);
    const bannerBottomLeft = projectPoint(goal.x - 24, goal.y + goal.h - 44, goal.z + 6, camera);
    drawQuad([bannerTopLeft, bannerTopRight, bannerBottomRight, bannerBottomLeft], level.theme.goal, 0.95, rgba("#ffffff", 0.3));
  }

  function drawPlayer(player, camera, theme) {
    drawBox(
      { x: player.x, y: player.y + 40, z: player.z, w: 26, d: 22, h: 32 },
      { top: "#ffe992", front: "#f1a642", side: "#9b5620" },
      camera
    );
    drawBox(
      { x: player.x, y: player.y + 58, z: player.z, w: 18, d: 18, h: 16 },
      { top: "#fff6d1", front: "#efc97a", side: "#a88044" },
      camera
    );
    drawBox(
      { x: player.x, y: player.y + 18, z: player.z - 8, w: 20, d: 8, h: 10 },
      { top: theme.uiAccent, front: shade(theme.uiAccent, -0.18), side: shade(theme.uiAccent, -0.36) },
      camera,
      0.95
    );
  }

  function drawPreviewDrone(level, camera) {
    const bob = Math.sin(SB.state.previewTime * 2) * 6;
    drawBox(
      { x: 0, y: 50 + bob, z: 100, w: 20, d: 20, h: 16 },
      { top: level.theme.uiAccent, front: shade(level.theme.uiAccent, -0.14), side: shade(level.theme.uiAccent, -0.4) },
      camera,
      0.92
    );
  }

  function drawParticles(camera) {
    for (const particle of SB.state.particles) {
      const point = projectPoint(particle.x, particle.y, particle.z, camera);
      if (!point) continue;
      ctx.globalAlpha = clamp(particle.life / particle.maxLife, 0, 1);
      ctx.fillStyle = particle.color;
      ctx.beginPath();
      ctx.arc(point.x, point.y, Math.max(1.5, particle.size * point.scale), 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  }

  function drawFloatingTexts(camera) {
    ctx.font = "700 15px 'Trebuchet MS', sans-serif";
    ctx.textAlign = "center";
    for (const text of SB.state.floatingTexts) {
      const point = projectPoint(text.x, text.y, text.z, camera);
      if (!point) continue;
      ctx.globalAlpha = clamp(text.life, 0, 1);
      ctx.fillStyle = text.color;
      ctx.fillText(text.text, point.x, point.y);
      ctx.globalAlpha = 1;
    }
    ctx.textAlign = "left";
  }

  function drawWorld(level, camera) {
    drawBackground(level, camera);

    for (const zone of level.gravityZones) drawZoneRect(zone, camera, rgba(level.theme.gravity, 0.58), 0.24);
    for (const zone of level.windZones) drawZoneRect(zone, camera, rgba(level.theme.wind, 0.5), 0.18);

    const platforms = level.platforms
      .filter((platform) => visibleDepth(platform.z, camera))
      .sort((a, b) => b.z - a.z);

    for (const platform of platforms) {
      const alpha = platform.phantom ? SB.platformVisibility(platform, SB.state.previewTime) : 1;
      drawBox(
        platform,
        {
          top: platform.moving ? shade(level.theme.platformTop, 0.08) : level.theme.platformTop,
          front: platform.moving ? shade(level.theme.platformFront, 0.08) : level.theme.platformFront,
          side: platform.moving ? shade(level.theme.platformSide, 0.08) : level.theme.platformSide
        },
        camera,
        alpha
      );
    }

    drawSweepers(level, camera);
    drawPads(level, camera);
    drawOrbs(level, camera);
    drawGoal(level, camera);

    if (SB.state.mode === "home") drawPreviewDrone(level, camera);
    else if (SB.state.player) drawPlayer(SB.state.player, camera, level.theme);

    drawParticles(camera);
    drawFloatingTexts(camera);

    if (level.risingHazard) {
      const top = projectPoint(-360, level.risingHazard.y, camera.z + 120, camera);
      const bottom = projectPoint(360, level.risingHazard.y, camera.z + 900, camera);
      if (top && bottom) {
        ctx.fillStyle = rgba(level.theme.hazard, 0.3);
        ctx.fillRect(0, Math.min(top.y, SB.config.viewHeight - 40), SB.config.viewWidth, SB.config.viewHeight);
      }
    }
  }

  function drawHud(level) {
    panel(14, 12, SB.config.viewWidth - 28, 78, "rgba(7,18,28,0.54)");
    ctx.fillStyle = "#f0f8fc";
    ctx.font = "700 18px 'Trebuchet MS', sans-serif";
    ctx.fillText(`Time ${formatTime(SB.state.elapsed)}`, 28, 40);
    ctx.fillStyle = "#c5d8e5";
    ctx.font = "600 15px 'Trebuchet MS', sans-serif";
    ctx.fillText(`Orbs ${SB.state.orbsCollected}/${SB.state.course.orbGoal}`, 28, 63);
    ctx.fillText(`Respawns ${SB.state.respawns}`, 220, 63);

    const progress = clamp(SB.state.player ? SB.state.player.z / level.length : 0, 0, 1);
    panel(350, 28, 220, 18, "rgba(255,255,255,0.12)", "rgba(255,255,255,0.08)");
    if (progress > 0.01) {
      ctx.fillStyle = level.theme.uiAccent;
      ctx.fillRect(350, 28, 220 * progress, 18);
    }
    ctx.fillStyle = "#eff8fc";
    ctx.fillText("Route", 590, 40);
    ctx.fillText(level.courseName, 350, 66);

    if (SB.state.toastTimer > 0 && SB.state.toast) {
      ctx.globalAlpha = clamp(SB.state.toastTimer / 1.8, 0, 1);
      panel(SB.config.viewWidth * 0.5 - 170, 100, 340, 36, "rgba(8,18,28,0.8)");
      ctx.textAlign = "center";
      ctx.fillStyle = "#f5fbff";
      ctx.font = "700 17px 'Trebuchet MS', sans-serif";
      ctx.fillText(SB.state.toast, SB.config.viewWidth * 0.5, 123);
      ctx.textAlign = "left";
      ctx.globalAlpha = 1;
    }
  }

  function drawHomeOverlay(course) {
    panel(24, SB.config.viewHeight - 166, 404, 128, "rgba(8,18,28,0.74)");
    ctx.fillStyle = SB.currentTheme().uiAccent;
    ctx.font = "700 12px 'Trebuchet MS', sans-serif";
    ctx.fillText("SELECTED COURSE", 46, SB.config.viewHeight - 132);
    ctx.fillStyle = "#f5fbff";
    ctx.font = "800 34px Rockwell, 'Trebuchet MS', serif";
    ctx.fillText(course.name, 46, SB.config.viewHeight - 96);
    ctx.fillStyle = "#c8dce8";
    ctx.font = "500 15px 'Trebuchet MS', sans-serif";
    wrapText(course.description, 46, SB.config.viewHeight - 66, 350, 18, 2);
    ctx.fillText(`Par ${formatTime(course.parTime)}  |  Orb goal ${course.orbGoal}`, 46, SB.config.viewHeight - 34);
  }

  function drawCenterOverlay(title, lines) {
    panel(SB.config.viewWidth * 0.5 - 260, 116, 520, 250, "rgba(8,18,28,0.8)");
    ctx.textAlign = "center";
    ctx.fillStyle = "#f5fbff";
    ctx.font = "800 44px Rockwell, 'Trebuchet MS', serif";
    ctx.fillText(title, SB.config.viewWidth * 0.5, 180);
    ctx.fillStyle = "#d5e4eb";
    ctx.font = "600 18px 'Trebuchet MS', sans-serif";
    lines.forEach((line, index) => ctx.fillText(line, SB.config.viewWidth * 0.5, 236 + index * 34));
    ctx.textAlign = "left";
  }

  SB.render = () => {
    const level = SB.state.mode === "home" ? SB.state.previewLevel : SB.state.level || SB.state.previewLevel;
    const course = SB.state.mode === "home" ? SB.getCourseById(SB.state.selectedCourseId) : SB.state.course || SB.getCourseById(SB.state.selectedCourseId);
    if (!level || !course) return;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, SB.canvas.width, SB.canvas.height);
    ctx.setTransform(SB.scaleX, 0, 0, SB.scaleY, 0, 0);

    const camera = {
      x: SB.state.camera.x + (SB.state.screenShake > 0 ? (Math.random() - 0.5) * SB.state.screenShake : 0),
      y: SB.state.camera.y + (SB.state.screenShake > 0 ? (Math.random() - 0.5) * SB.state.screenShake * 0.5 : 0),
      z: SB.state.camera.z
    };

    drawWorld(level, camera);
    if (SB.state.mode !== "home") drawHud(level);
    if (SB.state.mode === "home") drawHomeOverlay(course);
    if (SB.state.mode === "paused") drawCenterOverlay("PAUSED", [
      `Time ${formatTime(SB.state.elapsed)}`,
      `Orbs ${SB.state.orbsCollected}/${course.orbGoal}`,
      "Resume from the action row or press Escape."
    ]);
    if (SB.state.mode === "victory" && SB.state.lastResults) drawCenterOverlay("COURSE CLEARED", [
      `${SB.state.lastResults.courseName}`,
      `Time ${formatTime(SB.state.lastResults.time)}   Orbs ${SB.state.lastResults.orbs}`,
      `Respawns ${SB.state.lastResults.respawns}   Stars ${SB.state.lastResults.stars}/3`
    ]);
  };
})();
