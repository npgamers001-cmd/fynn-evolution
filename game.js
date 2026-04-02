(() => {
  "use strict";

  const SB = window.Shardbound;

  function setDirectionalInput(control, active) {
    if (control === "left") SB.input.left = active;
    if (control === "right") SB.input.right = active;
    if (control === "forward") SB.input.forward = active;
    if (control === "back") SB.input.back = active;
    if (control === "jump") SB.input.jumpHeld = active;
  }

  const activeTouchControls = new Map();

  function releaseTouchControl(pointerId) {
    const control = activeTouchControls.get(pointerId);
    if (!control) return;
    activeTouchControls.delete(pointerId);
    if (["left", "right", "forward", "back", "jump"].includes(control)) {
      const stillActive = [...activeTouchControls.values()].includes(control);
      setDirectionalInput(control, stillActive);
    }
  }

  function queueJump() {
    SB.ensureAudioStarted();
    if (SB.state.player) SB.state.player.jumpBuffer = 0.18;
  }

  function createSummaryHtml() {
    const course = SB.currentCourseForUi();
    const record = SB.getSaveRecord(SB.saveData, course.id);

    if (SB.state.mode === "playing" || SB.state.mode === "paused") {
      return `
        <div class="summary-top">
          <div>
            <p class="eyebrow">Live Run</p>
            <h2 class="section-title">${course.name}</h2>
            <p class="empty-copy">${SB.currentTheme().name}</p>
          </div>
          <span class="course-index">Run</span>
        </div>
        <div class="summary-stats">
          <div class="summary-stat"><span class="progress-subtle">Time</span><strong>${SB.utils.formatTime(SB.state.elapsed)}</strong></div>
          <div class="summary-stat"><span class="progress-subtle">Orbs</span><strong>${SB.state.orbsCollected}/${course.orbGoal}</strong></div>
          <div class="summary-stat"><span class="progress-subtle">Respawns</span><strong>${SB.state.respawns}</strong></div>
          <div class="summary-stat"><span class="progress-subtle">Par</span><strong>${SB.utils.formatTime(course.parTime)}</strong></div>
        </div>
        <div class="summary-highlight">
          <span class="progress-subtle">Live Goal</span>
          <strong>Reach the finish gate with the orb route cleaned up and the timer under par.</strong>
        </div>
      `;
    }

    if (SB.state.mode === "victory" && SB.state.lastResults) {
      return `
        <div class="summary-top">
          <div>
            <p class="eyebrow">Clear Report</p>
            <h2 class="section-title">${SB.state.lastResults.courseName}</h2>
            <p class="empty-copy">${SB.currentTheme().name}</p>
          </div>
          <span class="course-index">Clear</span>
        </div>
        ${SB.htmlStars(SB.state.lastResults.stars)}
        <div class="summary-stats">
          <div class="summary-stat"><span class="progress-subtle">Time</span><strong>${SB.utils.formatTime(SB.state.lastResults.time)}</strong></div>
          <div class="summary-stat"><span class="progress-subtle">Orbs</span><strong>${SB.state.lastResults.orbs}</strong></div>
          <div class="summary-stat"><span class="progress-subtle">Respawns</span><strong>${SB.state.lastResults.respawns}</strong></div>
          <div class="summary-stat"><span class="progress-subtle">Par</span><strong>${SB.utils.formatTime(SB.state.lastResults.parTime)}</strong></div>
        </div>
      `;
    }

    return `
      <div class="summary-top">
        <div>
          <p class="eyebrow">Selected Course</p>
          <h2 class="section-title">${course.name}</h2>
          <p class="empty-copy">${SB.currentTheme().name}</p>
        </div>
        <span class="course-index">Course ${course.id}</span>
      </div>
      ${SB.htmlStars(record.stars)}
      <p class="empty-copy">${course.description}</p>
      <div class="summary-stats">
        <div class="summary-stat"><span class="progress-subtle">Best Time</span><strong>${record.bestTime === null ? "--:--.--" : SB.utils.formatTime(record.bestTime)}</strong></div>
        <div class="summary-stat"><span class="progress-subtle">Best Orbs</span><strong>${record.bestOrbs}</strong></div>
        <div class="summary-stat"><span class="progress-subtle">Cleared</span><strong>${record.cleared ? "Yes" : "Not yet"}</strong></div>
        <div class="summary-stat"><span class="progress-subtle">Stars</span><strong>${SB.saveData.totalStars}/15</strong></div>
      </div>
      <div class="summary-highlight">
        <span class="progress-subtle">Campaign Status</span>
        <strong>${SB.saveData.clearedCount}/5 courses cleared. Replay for faster records and cleaner 3-star finishes.</strong>
      </div>
    `;
  }

  function createObjectivesHtml() {
    const course = SB.currentCourseForUi();
    const record = SB.getSaveRecord(SB.saveData, course.id);
    const live = SB.state.mode === "playing" || SB.state.mode === "paused";
    const timeValue = live ? SB.state.elapsed : record.bestTime;
    const orbValue = live ? SB.state.orbsCollected : record.bestOrbs;
    const respawnValue = live ? SB.state.respawns : record.bestRespawns;

    return `
      <div class="panel-header">
        <h2>Objectives</h2>
        <p>Three stars come from finishing the course, hitting the orb route, and beating par.</p>
      </div>
      <div class="objective-list">
        <div class="objective-item ${live || record.cleared ? "is-complete" : ""}">
          <span class="progress-subtle">Reach The Finish</span>
          <strong>${live ? "In progress" : record.cleared ? "Completed" : "Pending"}</strong>
        </div>
        <div class="objective-item ${orbValue >= course.orbGoal ? "is-complete" : ""}">
          <span class="progress-subtle">Orb Route</span>
          <strong>${orbValue}/${course.orbGoal}</strong>
        </div>
        <div class="objective-item ${timeValue !== null && timeValue <= course.parTime ? "is-complete" : ""}">
          <span class="progress-subtle">Par Time</span>
          <strong>${timeValue === null ? `${SB.utils.formatTime(course.parTime)} target` : `${SB.utils.formatTime(timeValue)} / ${SB.utils.formatTime(course.parTime)}`}</strong>
        </div>
        <div class="objective-item ${respawnValue !== null && respawnValue <= 2 ? "is-complete" : ""}">
          <span class="progress-subtle">Clean Route</span>
          <strong>${respawnValue === null ? "2 respawns or fewer" : `${respawnValue} respawns`}</strong>
        </div>
      </div>
    `;
  }

  function createControlHtml() {
    return `
      <div class="panel-header">
        <h2>Controls</h2>
        <p>Designed to stay readable on desktop and touch screens without overloading the input scheme.</p>
      </div>
      <div class="control-list">
        <div class="control-item"><span class="progress-subtle">Move</span><strong>WASD or Arrow keys</strong></div>
        <div class="control-item"><span class="progress-subtle">Jump</span><strong>Space or Jump button</strong></div>
        <div class="control-item"><span class="progress-subtle">Restart</span><strong>R or Restart button</strong></div>
        <div class="control-item"><span class="progress-subtle">Pause</span><strong>Escape or Primary Action</strong></div>
      </div>
      <p class="control-note">Tap the canvas or a control once if the browser waits for a user gesture before audio starts.</p>
    `;
  }

  function createIntelHtml() {
    const course = SB.currentCourseForUi();
    return `
      <div class="panel-header">
        <h2>Build Notes</h2>
        <p>This Obby stays lightweight by generating both visuals and SFX in code instead of loading heavy external assets.</p>
      </div>
      <div class="intel-list">
        <div class="intel-item"><span>Adaptive View</span><strong>${SB.config.coarsePointer ? "Low-FX touch mode active" : "Higher detail desktop mode active"}</strong></div>
        <div class="intel-item"><span>Theme Hooks</span><strong>${course.highlights.join(", ")}</strong></div>
        <div class="intel-item"><span>Optimization</span><strong>Culled geometry, capped DPR, and generated synth audio keep the frame budget clean.</strong></div>
      </div>
    `;
  }

  function renderCourseGrid() {
    const disabled = SB.state.mode === "playing" || SB.state.mode === "paused";
    SB.ui.courseGrid.innerHTML = SB.data.courses.map((course) => {
      const record = SB.getSaveRecord(SB.saveData, course.id);
      const locked = !SB.isCourseUnlocked(course.id);
      return `
        <button class="course-card ${SB.state.selectedCourseId === course.id ? "is-selected" : ""} ${locked ? "is-locked" : ""}" data-course-id="${course.id}" type="button" ${locked || disabled ? "disabled" : ""}>
          <div class="course-top">
            <div>
              <span class="course-index">Course ${course.id}</span>
              <h3>${course.name}</h3>
            </div>
            <span class="card-caption">${SB.data.themes[course.theme].name}</span>
          </div>
          <p class="card-caption">${course.highlights.join(" / ")}</p>
          ${SB.htmlStars(record.stars)}
          <div class="course-meta">
            <div class="meta-pill"><span class="progress-subtle">Par</span><strong>${SB.utils.formatTime(course.parTime)}</strong></div>
            <div class="meta-pill"><span class="progress-subtle">Orbs</span><strong>${course.orbGoal}</strong></div>
          </div>
        </button>
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
      SB.ui.primaryAction.textContent = "Replay Course";
      SB.ui.secondaryAction.textContent = SB.state.course.id < SB.data.courses.length ? "Next Course" : "Main Menu";
    } else {
      SB.ui.primaryAction.textContent = "Start Course";
      SB.ui.secondaryAction.textContent = "Next Course";
    }
    SB.ui.primaryAction.disabled = SB.state.mode === "home" && !SB.isCourseUnlocked(SB.state.selectedCourseId);
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
    renderCourseGrid();
    SB.ui.summaryPanel.innerHTML = createSummaryHtml();
    SB.ui.objectivePanel.innerHTML = createObjectivesHtml();
    SB.ui.controlPanel.innerHTML = createControlHtml();
    SB.ui.intelPanel.innerHTML = createIntelHtml();
    updateActionButtons();
    updateTouchControls();
  };

  function handlePrimaryAction() {
    if (SB.state.mode === "playing") return SB.togglePause();
    if (SB.state.mode === "paused") return SB.togglePause();
    return SB.startSelectedCourse();
  }

  function handleSecondaryAction() {
    if (SB.state.mode === "playing") return SB.startSelectedCourse();
    if (SB.state.mode === "paused") return SB.enterHomeView();
    if (SB.state.mode === "victory") {
      if (SB.state.course.id < SB.data.courses.length && SB.saveData.highestUnlocked > SB.state.course.id) {
        SB.state.selectedCourseId = SB.state.course.id + 1;
        SB.saveData.selectedCourseId = SB.state.selectedCourseId;
        SB.persistSave();
      }
      return SB.enterHomeView();
    }
    return SB.selectNextCourse();
  }

  SB.ui.courseGrid.addEventListener("click", (event) => {
    const target = event.target.closest("[data-course-id]");
    if (!target) return;
    SB.selectCourse(Number(target.dataset.courseId));
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
    if (SB.state.mode === "home") SB.startSelectedCourse();
    else if (SB.state.mode === "paused") SB.togglePause();
  });

  SB.canvas.addEventListener("contextmenu", (event) => event.preventDefault());

  SB.ui.touchControls.querySelectorAll("[data-touch]").forEach((button) => {
    button.addEventListener("pointerdown", (event) => {
      const control = button.dataset.touch;
      activeTouchControls.set(event.pointerId, control);
      button.setPointerCapture(event.pointerId);
      SB.ensureAudioStarted();
      if (control === "jump") {
        SB.input.jumpHeld = true;
        queueJump();
      } else {
        setDirectionalInput(control, true);
      }
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
    if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Space", "KeyA", "KeyD", "KeyW", "KeyS"].includes(event.code)) event.preventDefault();
    if (event.code === "ArrowLeft" || event.code === "KeyA") SB.input.left = true;
    if (event.code === "ArrowRight" || event.code === "KeyD") SB.input.right = true;
    if (event.code === "ArrowUp" || event.code === "KeyW") SB.input.forward = true;
    if (event.code === "ArrowDown" || event.code === "KeyS") SB.input.back = true;
    if (event.code === "Space") {
      SB.input.jumpHeld = true;
      queueJump();
    }
    if (event.code === "Escape") {
      if (SB.state.mode === "playing" || SB.state.mode === "paused") SB.togglePause();
      else if (SB.state.mode === "victory") SB.enterHomeView();
    }
    if (event.code === "Enter") handlePrimaryAction();
    if (event.code === "KeyR" && ["playing", "paused", "victory"].includes(SB.state.mode)) SB.startSelectedCourse();
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
    if (event.code === "ArrowUp" || event.code === "KeyW") SB.input.forward = false;
    if (event.code === "ArrowDown" || event.code === "KeyS") SB.input.back = false;
    if (event.code === "Space") SB.input.jumpHeld = false;
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

  SB.applyThemeToUi(SB.getCourseById(SB.state.selectedCourseId).theme);
  SB.enterHomeView();
  SB.resizeCanvas();
  requestAnimationFrame(frame);
})();
