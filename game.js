(() => {
  "use strict";

  const SB = window.Shardbound;

  function setDirectionalInput(control, active) {
    if (control === "left") SB.input.left = active;
    if (control === "right") SB.input.right = active;
    if (control === "jump") SB.input.jumpHeld = active;
  }

  const activeTouchControls = new Map();

  function releaseTouchControl(pointerId) {
    const control = activeTouchControls.get(pointerId);
    if (!control) return;
    activeTouchControls.delete(pointerId);
    if (control === "left" || control === "right" || control === "jump") {
      const stillActive = [...activeTouchControls.values()].includes(control);
      setDirectionalInput(control, stillActive);
    }
  }

  function queueJump() {
    SB.ensureAudioStarted();
    if (SB.state.player) SB.state.player.jumpBuffer = 0.16;
  }

  function queueDash() {
    SB.ensureAudioStarted();
    if (SB.state.player) SB.state.player.dashQueued = 0.15;
  }

  function createSummaryHtml() {
    const stage = SB.currentStageForUi();
    const record = SB.getSaveRecord(SB.saveData, stage.id);

    if (SB.state.mode === "playing" || SB.state.mode === "paused") {
      return `
        <div class="summary-top">
          <div>
            <p class="eyebrow">Live Run</p>
            <h2 class="section-title">${SB.state.stage.name}</h2>
            <p class="empty-copy">${SB.state.stage.world}</p>
          </div>
          <span class="mission-index">Stage ${SB.state.stage.id}</span>
        </div>
        <div class="summary-stats">
          <div class="summary-stat"><span class="progress-subtle">Time</span><strong>${SB.utils.formatTime(SB.state.elapsed)}</strong></div>
          <div class="summary-stat"><span class="progress-subtle">Score</span><strong>${SB.state.score}</strong></div>
          <div class="summary-stat"><span class="progress-subtle">Shards</span><strong>${SB.state.shardsCollected}/${SB.state.stage.coinGoal}</strong></div>
          <div class="summary-stat"><span class="progress-subtle">Combo</span><strong>x${SB.state.comboMultiplier.toFixed(1)}</strong></div>
        </div>
        <div class="summary-highlight">
          <span class="progress-subtle">Loadout</span>
          <strong>${SB.state.player.maxHealth} HP, dash ${SB.state.player.dashCooldownBase.toFixed(2)}s, magnet ${SB.state.player.magnetRadius}</strong>
        </div>
      `;
    }

    if (SB.state.mode === "victory" && SB.state.lastResults) {
      return `
        <div class="summary-top">
          <div>
            <p class="eyebrow">Clear Report</p>
            <h2 class="section-title">${SB.state.lastResults.stageName}</h2>
            <p class="empty-copy">${SB.state.lastResults.world}</p>
          </div>
          <span class="mission-index">Victory</span>
        </div>
        ${SB.htmlStars(SB.state.lastResults.stars)}
        <div class="results-list">
          <div>
            <div class="summary-stat"><span class="progress-subtle">Time</span><strong>${SB.utils.formatTime(SB.state.lastResults.time)}</strong></div>
            <div class="summary-stat"><span class="progress-subtle">Score</span><strong>${SB.state.lastResults.score}</strong></div>
          </div>
          <div>
            <div class="summary-stat"><span class="progress-subtle">Shards</span><strong>${SB.state.lastResults.shards}</strong></div>
            <div class="summary-stat"><span class="progress-subtle">Payout</span><strong>${SB.state.lastResults.payout}</strong></div>
          </div>
        </div>
        <div class="summary-highlight">
          <span class="progress-subtle">Run Notes</span>
          <strong>${SB.state.lastResults.flawless ? "Flawless bonus secured." : "Replay for a flawless bonus and faster payout."}</strong>
        </div>
      `;
    }

    if (SB.state.mode === "gameover" && SB.state.lastResults) {
      return `
        <div class="summary-top">
          <div>
            <p class="eyebrow">Run Lost</p>
            <h2 class="section-title">${SB.state.lastResults.stageName}</h2>
            <p class="empty-copy">Back out, upgrade, then hit the route again.</p>
          </div>
          <span class="mission-index">Retry</span>
        </div>
        <div class="summary-stats">
          <div class="summary-stat"><span class="progress-subtle">Time</span><strong>${SB.utils.formatTime(SB.state.lastResults.time)}</strong></div>
          <div class="summary-stat"><span class="progress-subtle">Score</span><strong>${SB.state.lastResults.score}</strong></div>
          <div class="summary-stat"><span class="progress-subtle">Shards</span><strong>${SB.state.lastResults.shards}</strong></div>
          <div class="summary-stat"><span class="progress-subtle">Best Time</span><strong>${record.bestTime === null ? "--:--" : SB.utils.formatTime(record.bestTime)}</strong></div>
        </div>
      `;
    }

    return `
      <div class="summary-top">
        <div>
          <p class="eyebrow">Selected Mission</p>
          <h2 class="section-title">${stage.name}</h2>
          <p class="empty-copy">${stage.world}</p>
        </div>
        <span class="mission-index">Stage ${stage.id}</span>
      </div>
      ${SB.htmlStars(record.stars)}
      <p class="empty-copy">${stage.description}</p>
      <div class="summary-stats">
        <div class="summary-stat"><span class="progress-subtle">Bank</span><strong>${SB.saveData.bank}</strong></div>
        <div class="summary-stat"><span class="progress-subtle">Stars</span><strong>${SB.saveData.totalStars}/36</strong></div>
        <div class="summary-stat"><span class="progress-subtle">Cleared</span><strong>${SB.saveData.clearedCount}/12</strong></div>
        <div class="summary-stat"><span class="progress-subtle">3-Star Runs</span><strong>${SB.saveData.masteredCount}</strong></div>
      </div>
      <div class="summary-highlight">
        <span class="progress-subtle">Best Record</span>
        <strong>${record.bestTime === null ? "No clear yet." : `${SB.utils.formatTime(record.bestTime)} with ${record.bestShards} shards banked.`}</strong>
      </div>
    `;
  }

  function createObjectivesHtml() {
    const stage = SB.currentStageForUi();
    const record = SB.getSaveRecord(SB.saveData, stage.id);
    const liveMode = SB.state.mode === "playing" || SB.state.mode === "paused";
    const currentTime = liveMode ? SB.state.elapsed : record.bestTime;
    const shardsValue = liveMode ? SB.state.shardsCollected : record.bestShards;
    const flawlessNow = liveMode ? SB.state.player.damageTaken === 0 : record.flawless;
    return `
      <div class="panel-header">
        <h2>Targets</h2>
        <p>Each stage hands out 3 stars and extra shards for clean execution.</p>
      </div>
      <div class="objective-list">
        <div class="objective-item is-complete">
          <span class="progress-subtle">Clear The Stage</span>
          <strong>${liveMode ? "In progress" : record.cleared ? "Complete" : "Not cleared yet"}</strong>
        </div>
        <div class="objective-item ${shardsValue >= stage.coinGoal ? "is-complete" : ""}">
          <span class="progress-subtle">Shard Target</span>
          <strong>${liveMode ? `${SB.state.shardsCollected}/${stage.coinGoal}` : `${record.bestShards}/${stage.coinGoal}`}</strong>
        </div>
        <div class="objective-item ${currentTime !== null && currentTime <= stage.parTime ? "is-complete" : ""}">
          <span class="progress-subtle">Par Time</span>
          <strong>${currentTime === null ? `${SB.utils.formatTime(stage.parTime)} target` : `${SB.utils.formatTime(currentTime)} / ${SB.utils.formatTime(stage.parTime)}`}</strong>
        </div>
        <div class="objective-item ${flawlessNow ? "is-complete" : ""}">
          <span class="progress-subtle">Flawless Bonus</span>
          <strong>${flawlessNow ? "Available" : "Broken this run"}</strong>
        </div>
      </div>
    `;
  }

  function createControlHtml() {
    return `
      <div class="panel-header">
        <h2>Controls</h2>
        <p>The game keeps keyboard support and adds proper touch buttons for mobile.</p>
      </div>
      <div class="control-list">
        <div class="control-item"><span class="progress-subtle">Move</span><strong>A / D or Left / Right</strong></div>
        <div class="control-item"><span class="progress-subtle">Jump</span><strong>Space, W, Up, or Jump button</strong></div>
        <div class="control-item"><span class="progress-subtle">Dash</span><strong>Shift, K, or Dash button</strong></div>
        <div class="control-item"><span class="progress-subtle">Pause</span><strong>Escape or Primary Action while live</strong></div>
      </div>
      <p class="control-note">Tap the canvas or press a key once if the browser needs a user gesture before audio starts.</p>
    `;
  }

  function renderMissionGrid() {
    const metaLocked = SB.state.mode === "playing" || SB.state.mode === "paused";
    SB.ui.missionGrid.innerHTML = SB.data.stages.map((stage) => {
      const record = SB.getSaveRecord(SB.saveData, stage.id);
      const locked = !SB.isStageUnlocked(stage.id) || metaLocked;
      return `
        <button class="mission-card ${SB.state.selectedStageId === stage.id ? "is-selected" : ""} ${!SB.isStageUnlocked(stage.id) ? "is-locked" : ""}" data-stage-id="${stage.id}" type="button" ${locked ? "disabled" : ""}>
          <div class="mission-top">
            <div>
              <span class="mission-index">Stage ${stage.id}</span>
              <h3>${stage.name}</h3>
            </div>
            <span class="card-caption">${stage.theme}</span>
          </div>
          <p class="card-caption">${stage.world}</p>
          ${SB.htmlStars(record.stars)}
          <div class="mission-meta">
            <div class="meta-pill"><span class="progress-subtle">Par</span><strong>${SB.utils.formatTime(stage.parTime)}</strong></div>
            <div class="meta-pill"><span class="progress-subtle">Goal</span><strong>${stage.coinGoal} shards</strong></div>
          </div>
        </button>
      `;
    }).join("");
  }

  function renderUpgradeGrid() {
    const metaLocked = SB.state.mode === "playing" || SB.state.mode === "paused";
    SB.ui.upgradeGrid.innerHTML = SB.data.upgrades.map((def) => {
      const level = SB.saveData.upgrades[def.id];
      const maxed = level >= def.max;
      const cost = maxed ? null : def.costs[level];
      const affordable = !maxed && SB.saveData.bank >= cost;
      return `
        <article class="upgrade-card ${affordable ? "is-affordable" : ""}">
          <div class="upgrade-top">
            <div>
              <span class="upgrade-level">Lv ${level}/${def.max}</span>
              <h3>${def.name}</h3>
            </div>
            ${SB.htmlStars(Math.min(3, level))}
          </div>
          <p class="upgrade-copy">${def.summary}</p>
          <p class="card-caption">${def.detail(level)}</p>
          <div class="upgrade-footer">
            <span class="status-chip">${maxed ? "Maxed" : `${cost} shards`}</span>
            <button class="upgrade-buy" type="button" data-upgrade-id="${def.id}" ${maxed || !affordable || metaLocked ? "disabled" : ""}>
              ${maxed ? "Installed" : "Buy"}
            </button>
          </div>
        </article>
      `;
    }).join("");
  }

  function updateActionButtons() {
    if (SB.state.mode === "playing") {
      SB.ui.primaryAction.textContent = "Pause Run";
      SB.ui.secondaryAction.textContent = "Restart Run";
    } else if (SB.state.mode === "paused") {
      SB.ui.primaryAction.textContent = "Resume Run";
      SB.ui.secondaryAction.textContent = "Main Menu";
    } else if (SB.state.mode === "victory") {
      SB.ui.primaryAction.textContent = "Replay Mission";
      SB.ui.secondaryAction.textContent = SB.state.stage.id < SB.data.stages.length ? "Next Mission" : "Main Menu";
    } else if (SB.state.mode === "gameover") {
      SB.ui.primaryAction.textContent = "Retry Mission";
      SB.ui.secondaryAction.textContent = "Main Menu";
    } else {
      SB.ui.primaryAction.textContent = "Launch Mission";
      SB.ui.secondaryAction.textContent = "Next Mission";
    }
    SB.ui.primaryAction.disabled = SB.state.mode === "home" && !SB.isStageUnlocked(SB.state.selectedStageId);
    SB.ui.secondaryAction.disabled = SB.state.mode === "home" && SB.saveData.highestUnlocked <= 1;
    SB.ui.muteButton.textContent = SB.audio.muted ? "Sound Off" : "Sound On";
  }

  function updateTouchControls() {
    const visible = SB.config.coarsePointer && (SB.state.mode === "playing" || SB.state.mode === "paused");
    SB.ui.touchControls.classList.toggle("is-visible", visible);
    SB.ui.touchControls.setAttribute("aria-hidden", visible ? "false" : "true");
  }

  SB.renderUi = () => {
    document.body.dataset.mode = SB.state.mode;
    renderMissionGrid();
    renderUpgradeGrid();
    SB.ui.summaryPanel.innerHTML = createSummaryHtml();
    SB.ui.objectivePanel.innerHTML = createObjectivesHtml();
    SB.ui.controlPanel.innerHTML = createControlHtml();
    updateActionButtons();
    updateTouchControls();
  };

  function handlePrimaryAction() {
    if (SB.state.mode === "playing") return SB.togglePause();
    if (SB.state.mode === "paused") return SB.togglePause();
    if (SB.state.mode === "victory" || SB.state.mode === "gameover") return SB.startSelectedStage();
    return SB.startSelectedStage();
  }

  function handleSecondaryAction() {
    if (SB.state.mode === "playing") return SB.startSelectedStage();
    if (SB.state.mode === "paused") return SB.enterHomeView();
    if (SB.state.mode === "victory") {
      if (SB.state.stage.id < SB.data.stages.length && SB.saveData.highestUnlocked > SB.state.stage.id) {
        SB.state.selectedStageId = SB.state.stage.id + 1;
        SB.saveData.selectedStageId = SB.state.selectedStageId;
        SB.persistSave();
      }
      return SB.enterHomeView();
    }
    if (SB.state.mode === "gameover") return SB.enterHomeView();
    return SB.selectNextStage();
  }

  SB.ui.missionGrid.addEventListener("click", (event) => {
    const target = event.target.closest("[data-stage-id]");
    if (!target) return;
    SB.selectStage(Number(target.dataset.stageId));
  });

  SB.ui.upgradeGrid.addEventListener("click", (event) => {
    const target = event.target.closest("[data-upgrade-id]");
    if (!target) return;
    SB.buyUpgrade(target.dataset.upgradeId);
  });

  SB.ui.primaryAction.addEventListener("click", () => {
    SB.ensureAudioStarted();
    handlePrimaryAction();
  });

  SB.ui.secondaryAction.addEventListener("click", () => {
    SB.ensureAudioStarted();
    handleSecondaryAction();
  });

  SB.ui.muteButton.addEventListener("click", () => {
    SB.ensureAudioStarted();
    const muted = SB.audio.toggleMuted();
    SB.saveData.settings.muted = muted;
    SB.persistSave();
    SB.renderUi();
  });

  SB.canvas.addEventListener("pointerdown", () => {
    SB.ensureAudioStarted();
    if (SB.state.mode === "home") SB.startSelectedStage();
    else if (SB.state.mode === "paused") SB.togglePause();
  });

  SB.canvas.addEventListener("contextmenu", (event) => event.preventDefault());

  SB.ui.touchControls.querySelectorAll("[data-touch]").forEach((button) => {
    button.addEventListener("pointerdown", (event) => {
      const control = button.dataset.touch;
      activeTouchControls.set(event.pointerId, control);
      button.setPointerCapture(event.pointerId);
      SB.ensureAudioStarted();
      if (control === "left" || control === "right") setDirectionalInput(control, true);
      if (control === "jump") {
        SB.input.jumpHeld = true;
        queueJump();
      }
      if (control === "dash") queueDash();
      event.preventDefault();
    });

    const release = (event) => {
      releaseTouchControl(event.pointerId);
      event.preventDefault();
    };

    button.addEventListener("pointerup", release);
    button.addEventListener("pointercancel", release);
    button.addEventListener("lostpointercapture", release);
  });

  window.addEventListener("keydown", (event) => {
    if (["ArrowLeft", "ArrowRight", "ArrowUp", "Space", "KeyA", "KeyD", "KeyW", "ShiftLeft", "ShiftRight", "KeyK"].includes(event.code)) event.preventDefault();
    if (event.code === "ArrowLeft" || event.code === "KeyA") {
      SB.input.left = true;
      SB.ensureAudioStarted();
    }
    if (event.code === "ArrowRight" || event.code === "KeyD") {
      SB.input.right = true;
      SB.ensureAudioStarted();
    }
    if (event.code === "Space" || event.code === "ArrowUp" || event.code === "KeyW") {
      SB.input.jumpHeld = true;
      queueJump();
    }
    if (event.code === "ShiftLeft" || event.code === "ShiftRight" || event.code === "KeyK") queueDash();
    if (event.code === "Escape") {
      if (SB.state.mode === "playing" || SB.state.mode === "paused") SB.togglePause();
      else if (SB.state.mode === "victory" || SB.state.mode === "gameover") SB.enterHomeView();
    }
    if (event.code === "Enter") handlePrimaryAction();
    if (event.code === "KeyR" && ["playing", "paused", "victory", "gameover"].includes(SB.state.mode)) SB.startSelectedStage();
    if (event.code === "KeyM") {
      const muted = SB.audio.toggleMuted();
      SB.saveData.settings.muted = muted;
      SB.persistSave();
      SB.renderUi();
    }
  });

  window.addEventListener("keyup", (event) => {
    if (event.code === "ArrowLeft" || event.code === "KeyA") SB.input.left = false;
    if (event.code === "ArrowRight" || event.code === "KeyD") SB.input.right = false;
    if (event.code === "Space" || event.code === "ArrowUp" || event.code === "KeyW") SB.input.jumpHeld = false;
  });

  document.addEventListener("visibilitychange", () => {
    if (document.hidden && SB.state.mode === "playing") SB.togglePause();
  });

  window.addEventListener("resize", () => {
    SB.resizeCanvas();
    SB.renderUi();
  });

  let lastTime = performance.now();
  function frame(now) {
    const dt = Math.min(SB.config.maxDt, (now - lastTime) / 1000);
    lastTime = now;
    SB.updateGame(dt);
    SB.render();
    requestAnimationFrame(frame);
  }

  SB.applyThemeToUi(SB.getStageById(SB.state.selectedStageId).theme);
  SB.enterHomeView();
  SB.resizeCanvas();
  requestAnimationFrame(frame);
})();
