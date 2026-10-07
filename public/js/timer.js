/**
 * Gestione Orologio Visivo con Conto alla Rovescia (Time Timer)
 * Ispirato al timer analogico da cucina con disco rosso che scompare con il conto alla rovescia.
 */
const TaskTimer = {
  activeTimers: {}, // itemId -> { intervalId, startTime, targetMinutes, accumulatedSeconds, isPaused, chimePlayed }
  currentModalItemId: null,

  formatDuration(seconds) {
    const s = Math.floor(Math.abs(seconds) % 60);
    const m = Math.floor((Math.abs(seconds) / 60) % 60);
    const h = Math.floor(Math.abs(seconds) / 3600);

    const pad = (n) => (n < 10 ? "0" + n : n);
    if (h > 0) {
      return `${pad(h)}:${pad(m)}:${pad(s)}`;
    }
    return `${pad(m)}:${pad(s)}`;
  },

  formatMinutesHuman(minutes) {
    const m = parseInt(minutes || 0);
    if (m <= 0) return "0m";
    const h = Math.floor(m / 60);
    const remM = m % 60;
    if (h > 0) {
      return remM > 0 ? `${h}h ${remM}m` : `${h}h`;
    }
    return `${remM}m`;
  },

  isTimerRunning(itemId) {
    return !!this.activeTimers[itemId] && !this.activeTimers[itemId].isPaused;
  },

  getTimerState(itemId) {
    return this.activeTimers[itemId] || null;
  },

  /**
   * Genera l'SVG dell'orologio visivo analogico con disco rosso.
   * In modalità conto alla rovescia, il disco rosso rappresenta i minuti RIMANENTI sul quadrante (0-60).
   * Con lo scorrere del tempo verso lo 0, il disco rosso si ritrae in senso orario fino a scomparire!
   */
  generateClockSVG(remainingMinutes = 0, size = 180, options = {}) {
    const {
      idPrefix = "clock_" + Math.random().toString(36).substr(2, 5),
      targetMinutes = null,
      isOvertime = false,
      showCase = true
    } = options;

    const m = Math.max(0, parseFloat(remainingMinutes) || 0);
    // Angolo in gradi: 6 gradi per ogni minuto (60 minuti = 360 gradi)
    const angleDeg = Math.min(360, (m % 60) * 6);
    const isFullCircle = m >= 60;

    const cx = 100;
    const cy = 100;
    const rRed = 55;
    const rTicksOuter = 63;
    const rTicksMajorInner = 56;
    const rTicksMinorInner = 59;
    const rNumbers = 76;
    const rKnob = 21;

    // Tacche dei minuti (60 tacche)
    let ticksHtml = "";
    for (let i = 0; i < 60; i++) {
      const isMajor = i % 5 === 0;
      const tAngle = (i * 6 - 90) * (Math.PI / 180);
      const rIn = isMajor ? rTicksMajorInner : rTicksMinorInner;
      const x1 = (cx + rIn * Math.cos(tAngle)).toFixed(2);
      const y1 = (cy + rIn * Math.sin(tAngle)).toFixed(2);
      const x2 = (cx + rTicksOuter * Math.cos(tAngle)).toFixed(2);
      const y2 = (cy + rTicksOuter * Math.sin(tAngle)).toFixed(2);
      const strokeW = isMajor ? "1.6" : "0.9";
      const strokeC = isMajor ? "#0f172a" : "#94a3b8";
      ticksHtml += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${strokeC}" stroke-width="${strokeW}" stroke-linecap="round" />`;
    }

    // Numeri del quadrante: 0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55
    const numbersList = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55];
    let numbersHtml = "";
    numbersList.forEach((num) => {
      const nAngle = (num * 6 - 90) * (Math.PI / 180);
      const nx = (cx + rNumbers * Math.cos(nAngle)).toFixed(2);
      const ny = (cy + rNumbers * Math.sin(nAngle)).toFixed(2);
      numbersHtml += `<text x="${nx}" y="${ny}" fill="#0f172a" font-family="'Plus Jakarta Sans', system-ui, sans-serif" font-size="12" font-weight="800" text-anchor="middle" dominant-baseline="central">${num}</text>`;
    });

    // Disco Rosso (Tempo Rimanente nel Conto alla Rovescia)
    let redSectorHtml = "";
    const sectorColor = isOvertime ? "#f59e0b" : "#dc2626"; // Arancione se tempo extra scaduto

    if (isFullCircle) {
      redSectorHtml = `<circle cx="${cx}" cy="${cy}" r="${rRed}" fill="${sectorColor}" />`;
    } else if (angleDeg > 0.4) {
      const rad = (angleDeg - 90) * (Math.PI / 180);
      const endX = (cx + rRed * Math.cos(rad)).toFixed(2);
      const endY = (cy + rRed * Math.sin(rad)).toFixed(2);
      const startX = cx;
      const startY = cy - rRed;
      const largeArc = angleDeg > 180 ? 1 : 0;

      redSectorHtml = `
        <path d="M ${cx},${cy} L ${startX},${startY} A ${rRed},${rRed} 0 ${largeArc} 1 ${endX},${endY} Z" 
              fill="${sectorColor}" />
        <line x1="${cx}" y1="${cy}" x2="${endX}" y2="${endY}" stroke="#b91c1c" stroke-width="1.6" />
      `;
    }

    // Segnaposto della stima iniziale (linea tratteggiata verde sul target impostato)
    let targetMarkerHtml = "";
    if (targetMinutes && targetMinutes > 0 && targetMinutes <= 60 && !isOvertime) {
      const estAngle = (targetMinutes * 6 - 90) * (Math.PI / 180);
      const ex1 = (cx + (rTicksOuter + 1) * Math.cos(estAngle)).toFixed(2);
      const ey1 = (cy + (rTicksOuter + 1) * Math.sin(estAngle)).toFixed(2);
      const ex2 = (cx + (rRed - 3) * Math.cos(estAngle)).toFixed(2);
      const ey2 = (cy + (rRed - 3) * Math.sin(estAngle)).toFixed(2);
      targetMarkerHtml = `
        <line x1="${ex1}" y1="${ey1}" x2="${ex2}" y2="${ey2}" stroke="#10b981" stroke-width="2.5" stroke-dasharray="2,2" title="Tempo iniziale: ${targetMinutes}m" />
      `;
    }

    // Cassa azzurra 3D e quadrante bianco
    const caseHtml = showCase ? `
      <rect x="5" y="5" width="190" height="190" rx="38" fill="url(#${idPrefix}_bodyGrad)" />
      <rect x="189" y="70" width="8" height="60" rx="4" fill="#6ba7d6" opacity="0.9" />
      <rect x="16" y="16" width="168" height="168" rx="28" fill="#ffffff" filter="url(#${idPrefix}_faceShadow)" />
      <circle cx="${cx}" cy="${cy}" r="64" fill="none" stroke="#f1f5f9" stroke-width="1" />
    ` : `
      <circle cx="${cx}" cy="${cy}" r="92" fill="#ffffff" stroke="#e2e8f0" stroke-width="2" />
    `;

    return `
      <svg class="visual-pomodoro-clock-svg" viewBox="0 0 200 200" width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="${idPrefix}_bodyGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#99c9ef" />
            <stop offset="100%" stop-color="#6ea9d9" />
          </linearGradient>
          <filter id="${idPrefix}_faceShadow" x="-10%" y="-10%" width="120%" height="120%">
            <feDropShadow dx="0" dy="2" stdDeviation="3" flood-opacity="0.12" />
          </filter>
          <radialGradient id="${idPrefix}_knobGrad" cx="35%" cy="35%" r="65%">
            <stop offset="0%" stop-color="#ffffff" />
            <stop offset="80%" stop-color="#e2e8f0" />
            <stop offset="100%" stop-color="#cbd5e1" />
          </radialGradient>
          <filter id="${idPrefix}_knobShadow" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="3" stdDeviation="3" flood-opacity="0.22" />
          </filter>
        </defs>

        ${caseHtml}

        <!-- Tacca zero superiore -->
        <rect x="98.5" y="24" width="3" height="14" rx="1.5" fill="#94a3b8" />

        <!-- Tacche dei 60 minuti -->
        ${ticksHtml}

        <!-- Numeri 0-55 -->
        ${numbersHtml}

        <!-- Disco Rosso (Minuti Rimanenti nel Conto alla Rovescia) -->
        <g id="${idPrefix}_redSectorGroup">
          ${redSectorHtml}
        </g>

        <!-- Traguardo Iniziale Stima -->
        ${targetMarkerHtml}

        <!-- Manopola Bianca Centrale 3D -->
        <circle cx="${cx}" cy="${cy}" r="${rKnob}" fill="url(#${idPrefix}_knobGrad)" filter="url(#${idPrefix}_knobShadow)" />
        <circle cx="${cx}" cy="${cy}" r="${rKnob - 3}" fill="#f8fafc" />
        <circle cx="${cx}" cy="${cy}" r="4" fill="#cbd5e1" />
      </svg>
    `;
  },

  /**
   * Campanello sonoro al termine del conto alla rovescia (00:00).
   * Suona per 5 secondi pieni con una sequenza armoniosa di rintocchi.
   * @param {number} durationSeconds - Durata del suono in secondi (default: 5)
   */
  playChime(durationSeconds = 5) {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      if (ctx.state === "suspended") {
        ctx.resume();
      }
      
      const playTone = (freq, delay, dur, gainVal = 0.35) => {
        const startTime = ctx.currentTime + delay;
        const endTime = startTime + dur;

        // Tono fondamentale sinusoidale
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(freq, startTime);

        // Armonica superiore brillante da campana
        const overtoneOsc = ctx.createOscillator();
        const overtoneGain = ctx.createGain();
        overtoneOsc.type = "triangle";
        overtoneOsc.frequency.setValueAtTime(freq * 2, startTime);

        gain.gain.setValueAtTime(0.001, startTime);
        gain.gain.linearRampToValueAtTime(gainVal, startTime + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, endTime);

        overtoneGain.gain.setValueAtTime(0.001, startTime);
        overtoneGain.gain.linearRampToValueAtTime(gainVal * 0.25, startTime + 0.015);
        overtoneGain.gain.exponentialRampToValueAtTime(0.0001, startTime + Math.min(0.35, dur * 0.5));

        osc.connect(gain);
        gain.connect(ctx.destination);
        overtoneOsc.connect(overtoneGain);
        overtoneGain.connect(ctx.destination);

        osc.start(startTime);
        osc.stop(endTime);
        overtoneOsc.start(startTime);
        overtoneOsc.stop(endTime);
      };

      if (durationSeconds >= 5) {
        // Sequenza allarme di 5.0 secondi: 4 rintocchi melodici
        // Rintocco 1 (0.0s - 1.1s): Ding-Dong
        playTone(880, 0.00, 0.55, 0.35);    // La5
        playTone(659.25, 0.28, 0.80, 0.32); // Mi5

        // Rintocco 2 (1.25s - 2.35s): Ding-Dong
        playTone(880, 1.25, 0.55, 0.35);    // La5
        playTone(659.25, 1.53, 0.80, 0.32); // Mi5

        // Rintocco 3 (2.50s - 3.60s): Ding-Dong
        playTone(880, 2.50, 0.55, 0.35);    // La5
        playTone(659.25, 2.78, 0.80, 0.32); // Mi5

        // Rintocco 4 Finale (3.75s - 5.00s): Risoluzione verso l'alto prolungata fino a 5 secondi
        playTone(783.99, 3.75, 0.45, 0.32);  // Sol5
        playTone(1046.50, 4.05, 0.95, 0.38); // Do6 (decade a silenzio esattamente a 5.0s)

        setTimeout(() => {
          try { ctx.close(); } catch (e) {}
        }, 5200);
      } else {
        // Rintocco breve (es. stop manuale del compito)
        playTone(880, 0.00, 0.60, 0.35);
        playTone(659.25, 0.30, 0.90, 0.32);

        setTimeout(() => {
          try { ctx.close(); } catch (e) {}
        }, 1500);
      }
    } catch (e) {
      console.warn("Audio non disponibile:", e);
    }
  },

  /**
   * Avvia il timer in modalità Conto alla Rovescia.
   */
  async start(itemId, targetMinutes = 25, existingIsoStart = null, onTickCallback = null) {
    targetMinutes = Math.max(1, parseInt(targetMinutes) || 25);

    if (this.activeTimers[itemId] && !this.activeTimers[itemId].isPaused) {
      return;
    }

    let startTimestamp = Date.now();
    let accumulatedSeconds = 0;

    if (this.activeTimers[itemId] && this.activeTimers[itemId].isPaused) {
      // Ripresa da pausa
      accumulatedSeconds = this.activeTimers[itemId].accumulatedSeconds || 0;
      targetMinutes = this.activeTimers[itemId].targetMinutes || targetMinutes;
      startTimestamp = Date.now() - (accumulatedSeconds * 1000);
      this.activeTimers[itemId].isPaused = false;
    } else if (existingIsoStart) {
      startTimestamp = new Date(existingIsoStart).getTime();
    } else {
      try {
        const res = await API.startItemTimer(itemId);
        if (res.ok && res.item && res.item.timer_started_at) {
          startTimestamp = new Date(res.item.timer_started_at).getTime();
        }
      } catch (err) {
        console.error("Errore salvataggio avvio timer:", err);
      }
    }

    const timerObj = {
      itemId,
      startTime: startTimestamp,
      targetMinutes,
      accumulatedSeconds,
      isPaused: false,
      chimePlayed: false,
      onTick: onTickCallback,
      intervalId: null
    };

    const tick = () => {
      const elapsedSec = Math.max(0, Math.floor((Date.now() - timerObj.startTime) / 1000));
      timerObj.accumulatedSeconds = elapsedSec;
      
      const targetSec = timerObj.targetMinutes * 60;
      const remainingSec = Math.max(0, targetSec - elapsedSec);
      const remainingMin = remainingSec / 60.0;
      const isOvertime = elapsedSec > targetSec;
      const overtimeSec = isOvertime ? elapsedSec - targetSec : 0;

      // Se il conto alla rovescia tocca lo zero, suona il campanello per 5 secondi pieni
      if (remainingSec === 0 && !timerObj.chimePlayed) {
        this.playChime(5);
        timerObj.chimePlayed = true;
        if (typeof window.App?.showToast === "function") {
          window.App.showToast("⏰ Tempo scaduto! Ottimo lavoro, controlla se hai finito!", "🔔");
        }
      }

      const formattedCountdown = this.formatDuration(isOvertime ? overtimeSec : remainingSec);

      if (typeof timerObj.onTick === "function") {
        timerObj.onTick(formattedCountdown, remainingSec, remainingMin, elapsedSec, isOvertime);
      }

      if (this.currentModalItemId === itemId) {
        this.updateModalCountdown(formattedCountdown, remainingMin, timerObj.targetMinutes, elapsedSec, isOvertime, overtimeSec);
      }
    };

    tick();
    timerObj.intervalId = setInterval(tick, 1000);
    this.activeTimers[itemId] = timerObj;
  },

  pause(itemId) {
    const timerObj = this.activeTimers[itemId];
    if (timerObj && !timerObj.isPaused) {
      clearInterval(timerObj.intervalId);
      timerObj.isPaused = true;
      timerObj.accumulatedSeconds = Math.max(0, Math.floor((Date.now() - timerObj.startTime) / 1000));
    }
  },

  /**
   * Modifica il tempo target del conto alla rovescia (es. +5 min o -5 min).
   */
  setTargetMinutes(itemId, newMinutes) {
    const mins = Math.max(1, Math.min(60, parseInt(newMinutes) || 25));
    const timerObj = this.activeTimers[itemId];
    if (timerObj) {
      timerObj.targetMinutes = mins;
      timerObj.chimePlayed = false;
      const elapsedSec = timerObj.accumulatedSeconds || 0;
      const targetSec = mins * 60;
      const remainingSec = Math.max(0, targetSec - elapsedSec);
      const remainingMin = remainingSec / 60.0;
      const isOvertime = elapsedSec > targetSec;
      const overtimeSec = isOvertime ? elapsedSec - targetSec : 0;
      const formatted = this.formatDuration(isOvertime ? overtimeSec : remainingSec);

      if (this.currentModalItemId === itemId) {
        this.updateModalCountdown(formatted, remainingMin, mins, elapsedSec, isOvertime, overtimeSec);
      }
    }
    return mins;
  },

  /**
   * Ferma il timer e salva i minuti EFFETTIVAMENTE impiegati nel database.
   */
  async stop(itemId) {
    const timerObj = this.activeTimers[itemId];
    let elapsedMinutes = 0;

    if (timerObj) {
      clearInterval(timerObj.intervalId);
      const elapsedSec = timerObj.accumulatedSeconds || Math.max(0, Math.floor((Date.now() - timerObj.startTime) / 1000));
      // Calcola i minuti reali impiegati
      elapsedMinutes = elapsedSec >= 30 ? Math.max(1, Math.round(elapsedSec / 60)) : 0;
      delete this.activeTimers[itemId];
    }

    this.playChime(1.5);

    try {
      const res = await API.stopItemTimer(itemId, elapsedMinutes);
      return res.item;
    } catch (err) {
      console.error("Errore stop timer:", err);
      throw err;
    }
  },

  cancelAll() {
    for (const itemId in this.activeTimers) {
      clearInterval(this.activeTimers[itemId].intervalId);
    }
    this.activeTimers = {};
  },

  // ==================== MODALE CONTO ALLA ROVESCIA ====================

  openModal(item, categoryInfo = {}) {
    this.currentModalItemId = item.id;
    let modal = document.getElementById("visualTimerModal");
    if (!modal) {
      return;
    }

    this.ensureModalListeners(modal);

    const timerState = this.activeTimers[item.id];
    const isRunning = timerState && !timerState.isPaused;
    
    // Target iniziale: stima del compito o 25 minuti
    const targetMin = timerState ? timerState.targetMinutes : (item.estimated_minutes > 0 ? item.estimated_minutes : 25);
    const elapsedSec = timerState ? timerState.accumulatedSeconds : 0;
    const targetSec = targetMin * 60;
    const remainingSec = Math.max(0, targetSec - elapsedSec);
    const remainingMin = remainingSec / 60.0;
    const isOvertime = elapsedSec > targetSec;
    const overtimeSec = isOvertime ? elapsedSec - targetSec : 0;
    const formatted = this.formatDuration(isOvertime ? overtimeSec : remainingSec);

    // Titolo e sottotitolo
    document.getElementById("vtmTaskTitle").textContent = item.title;
    document.getElementById("vtmEventSub").textContent = `${categoryInfo.name || 'Compito'} • Conto alla rovescia impostato`;

    // Aggiorna orologio e display
    this.updateModalCountdown(formatted, remainingMin, targetMin, elapsedSec, isOvertime, overtimeSec);

    // Controlli bottoni
    const btnPlay = document.getElementById("vtmBtnPlay");
    const btnPause = document.getElementById("vtmBtnPause");

    if (isRunning) {
      btnPlay.classList.add("hidden");
      btnPause.classList.remove("hidden");
    } else {
      btnPlay.classList.remove("hidden");
      btnPause.classList.add("hidden");
    }

    modal.classList.remove("hidden");
  },

  ensureModalListeners(modal) {
    if (modal.dataset.listenersAttached) return;
    modal.dataset.listenersAttached = "true";

    modal.querySelector("#vtmCloseBtn")?.addEventListener("click", () => this.closeModal());

    // Avvia / Riprendi
    modal.querySelector("#vtmBtnPlay")?.addEventListener("click", async () => {
      if (!this.currentModalItemId) return;
      const itemId = this.currentModalItemId;
      const playBtn = modal.querySelector("#vtmBtnPlay");
      const pauseBtn = modal.querySelector("#vtmBtnPause");

      playBtn.classList.add("hidden");
      pauseBtn.classList.remove("hidden");

      const timerState = this.activeTimers[itemId];
      const targetMin = timerState ? timerState.targetMinutes : 25;

      await this.start(itemId, targetMin, null, null);
      if (typeof window.App?.reloadCurrentEventDetail === "function") {
        window.App.reloadCurrentEventDetail();
      }
      if (typeof window.Calendar?.renderDailySchedule === "function") {
        window.Calendar.renderDailySchedule();
      }
    });

    // Pausa
    modal.querySelector("#vtmBtnPause")?.addEventListener("click", () => {
      if (!this.currentModalItemId) return;
      const itemId = this.currentModalItemId;
      this.pause(itemId);

      modal.querySelector("#vtmBtnPlay").classList.remove("hidden");
      modal.querySelector("#vtmBtnPause").classList.add("hidden");

      if (typeof window.App?.reloadCurrentEventDetail === "function") {
        window.App.reloadCurrentEventDetail();
      }
      if (typeof window.Calendar?.renderDailySchedule === "function") {
        window.Calendar.renderDailySchedule();
      }
    });

    // Salva e Ferma
    modal.querySelector("#vtmBtnStop")?.addEventListener("click", async () => {
      if (!this.currentModalItemId) return;
      const itemId = this.currentModalItemId;
      const updated = await this.stop(itemId);
      this.closeModal();

      if (typeof window.App?.showToast === "function") {
        window.App.showToast(`Tempo registrato: ${updated.actual_minutes} minuti! Bravissimo! 🎉`, "⏱️");
      }
      if (typeof window.App?.reloadCurrentEventDetail === "function") {
        await window.App.reloadCurrentEventDetail();
      }
      if (typeof window.Calendar?.renderDailySchedule === "function") {
        await window.Calendar.renderDailySchedule();
      }
    });

    // Pulsanti di regolazione rapida del conto alla rovescia (+5m, -5m, preset)
    modal.querySelectorAll(".btn-adjust-target").forEach(btn => {
      btn.addEventListener("click", () => {
        if (!this.currentModalItemId) return;
        const add = parseInt(btn.dataset.add || 0);
        const timerState = this.activeTimers[this.currentModalItemId];
        const currentTarget = timerState ? timerState.targetMinutes : 25;
        this.setTargetMinutes(this.currentModalItemId, currentTarget + add);
      });
    });

    modal.querySelectorAll(".btn-preset-min").forEach(btn => {
      btn.addEventListener("click", () => {
        if (!this.currentModalItemId) return;
        const mins = parseInt(btn.dataset.min || 25);
        this.setTargetMinutes(this.currentModalItemId, mins);
      });
    });
  },

  updateModalCountdown(formattedTime, remainingMin, targetMin, elapsedSec, isOvertime, overtimeSec) {
    const clockContainer = document.getElementById("vtmClockHolder");
    const digitalDisplay = document.getElementById("vtmDigitalDisplay");
    const comparisonBadge = document.getElementById("vtmComparisonBadge");

    if (clockContainer) {
      clockContainer.innerHTML = this.generateClockSVG(remainingMin, 260, {
        idPrefix: "modal_countdown",
        targetMinutes: targetMin,
        isOvertime: isOvertime,
        showCase: true
      });
    }

    if (digitalDisplay) {
      if (isOvertime) {
        digitalDisplay.innerHTML = `<span style="color:var(--danger);">+${formattedTime}</span> <span style="font-size:15px; color:var(--danger); font-weight:700;">(Tempo Extra)</span>`;
      } else {
        digitalDisplay.innerHTML = `<strong>${formattedTime}</strong> <span style="font-size:15px; color:var(--text-muted); font-weight:600;">rimanenti</span>`;
      }
    }

    if (comparisonBadge) {
      const elapsedMin = Math.floor(elapsedSec / 60);
      if (isOvertime) {
        comparisonBadge.className = "time-badge act-over";
        comparisonBadge.innerHTML = `⚠️ Tempo previsto di ${targetMin}m superato di ${Math.floor(overtimeSec / 60)}m`;
      } else {
        comparisonBadge.className = "time-badge act-good";
        comparisonBadge.innerHTML = `⏳ Conto alla rovescia da ${targetMin}m (${elapsedMin}m già trascorsi)`;
      }
    }
  },

  closeModal() {
    this.currentModalItemId = null;
    const modal = document.getElementById("visualTimerModal");
    if (modal) modal.classList.add("hidden");
  }
};

window.TaskTimer = TaskTimer;
