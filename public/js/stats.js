/**
 * Modulo Statistiche & Dashboard di Controllo Genitore
 */
const StatsDashboard = {
  currentStats: null,
  selectedDayOfWeek: null,
  currentTargetDateStr: null,

  init() {
    if (this._initialized) return;
    this._initialized = true;

    const periodSelect = document.getElementById("statsPeriodSelect");
    periodSelect?.addEventListener("change", () => this.loadStats());

    const refreshBtn = document.getElementById("btnRefreshStats");
    refreshBtn?.addEventListener("click", () => this.refresh());

    if (this.selectedDayOfWeek === null || this.selectedDayOfWeek > 7 || this.selectedDayOfWeek < 1) {
      const dow = new Date().getDay();
      this.selectedDayOfWeek = (dow === 0) ? 7 : dow;
    }
  },

  getTargetDateForSelectedDow() {
    const today = new Date();
    const todayDow = today.getDay() === 0 ? 7 : today.getDay();
    const monday = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 12, 0, 0);
    monday.setDate(today.getDate() - (todayDow - 1));

    const targetDate = new Date(monday);
    targetDate.setDate(monday.getDate() + (this.selectedDayOfWeek - 1));
    return targetDate;
  },

  selectDay(dow) {
    if (dow < 1 || dow > 7) dow = 1;
    this.selectedDayOfWeek = dow;

    // Aggiornamento immediato visivo tab (feedback istantaneo al click)
    const bar = document.getElementById("parentDayTabsBar");
    if (bar) {
      bar.querySelectorAll(".parent-day-tab-btn").forEach(btn => {
        const bDow = parseInt(btn.getAttribute("data-dow") || "0");
        btn.classList.toggle("active", bDow === dow);
      });
    }

    // Indicatore veloce di caricamento
    const container = document.getElementById("parentTodaySubjectsList");
    if (container) {
      container.innerHTML = `
        <div style="grid-column: 1 / -1; padding: 28px 16px; text-align: center; color: var(--text-muted);">
          <span style="font-size: 24px; display: block; margin-bottom: 6px;">⏳</span>
          <p style="font-weight: 600; font-size: 13px; margin: 0;">Caricamento orario e compiti...</p>
        </div>
      `;
    }

    this.loadSelectedDay();
  },

  async loadSelectedDay() {
    if (this.selectedDayOfWeek === null || this.selectedDayOfWeek > 7 || this.selectedDayOfWeek < 1) {
      const dow = new Date().getDay();
      this.selectedDayOfWeek = (dow === 0) ? 7 : dow;
    }

    const targetDate = this.getTargetDateForSelectedDow();
    const targetDateStr = Calendar.formatDateIso(targetDate);
    this.currentTargetDateStr = targetDateStr;

    // Renderizza o aggiorna i tab
    this.renderDayTabs();

    try {
      const schedRes = await API.getDailySchedule(targetDateStr);
      if (schedRes && schedRes.ok && schedRes.schedule) {
        this.renderParentTodayMonitor(schedRes.schedule, targetDateStr, targetDate);
      } else {
        this.renderParentTodayMonitor({ day_name: "Giorno", subjects: [], totals: {} }, targetDateStr, targetDate);
      }
    } catch (err) {
      console.error("Errore caricamento monitor genitore:", err);
      const container = document.getElementById("parentTodaySubjectsList");
      if (container) {
        container.innerHTML = `
          <div style="grid-column: 1 / -1; padding: 24px; text-align: center; color: var(--danger);">
            <p style="font-weight:700;">Errore nel caricamento del giorno: ${err.message}</p>
            <button type="button" class="btn-primary" style="margin-top:8px;" onclick="StatsDashboard.loadSelectedDay()">Riprova</button>
          </div>
        `;
      }
    }
  },

  async loadStats() {
    const periodVal = document.getElementById("statsPeriodSelect")?.value || "7";
    let startDate = null;
    let endDate = null;

    if (periodVal !== "all") {
      const days = parseInt(periodVal) || 7;
      const today = new Date();

      // Calcola fine periodo: estendi almeno fino alla fine della settimana scolastica corrente (Domenica)
      // così da includere SEMPRE tutti i compiti registrati o svolti per Giovedì, Venerdì e il resto della settimana!
      const curDow = today.getDay() === 0 ? 7 : today.getDay();
      const endOfWeek = new Date(today);
      endOfWeek.setDate(today.getDate() + (7 - curDow));

      if (days >= 30) {
        const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);
        const maxEnd = endOfWeek > endOfMonth ? endOfWeek : endOfMonth;
        endDate = Calendar.formatDateIso(maxEnd);
      } else {
        endDate = Calendar.formatDateIso(endOfWeek);
      }

      const startDateObj = new Date(today);
      startDateObj.setDate(startDateObj.getDate() - days);
      startDate = Calendar.formatDateIso(startDateObj);
    }

    try {
      const statsRes = await API.getStats(startDate, endDate);
      if (statsRes && statsRes.ok && statsRes.stats) {
        this.currentStats = statsRes.stats;
        this.render();
      }
    } catch (err) {
      console.error("Errore caricamento statistiche KPI:", err);
    }
  },

  async refresh() {
    await Promise.allSettled([
      this.loadStats(),
      this.loadSelectedDay()
    ]);
  },

  renderDayTabs() {
    const bar = document.getElementById("parentDayTabsBar");
    if (!bar) return;
    bar.innerHTML = "";

    const days = [
      { dow: 1, name: "Lunedì" },
      { dow: 2, name: "Martedì" },
      { dow: 3, name: "Mercoledì" },
      { dow: 4, name: "Giovedì" },
      { dow: 5, name: "Venerdì" },
      { dow: 6, name: "Sabato" },
      { dow: 7, name: "Domenica" }
    ];

    days.forEach(d => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.setAttribute("data-dow", String(d.dow));
      btn.className = `parent-day-tab-btn ${this.selectedDayOfWeek === d.dow ? 'active' : ''}`;
      btn.textContent = d.name;
      btn.addEventListener("click", () => {
        this.selectDay(d.dow);
      });
      bar.appendChild(btn);
    });
  },

  renderParentTodayMonitor(sched, dateStr, dateObj) {
    this.renderDayTabs();

    const totals = sched.totals || {};
    const totTasks = totals.total_tasks || 0;
    const doneTasks = totals.completed_tasks || 0;
    const actMin = totals.total_actual_minutes || 0;
    const estMin = totals.total_estimated_minutes || 0;
    const pct = totals.progress_percent || 0;

    const countEl = document.getElementById("parentTodayTasksCount");
    const actEl = document.getElementById("parentTodayActualTime");
    const estEl = document.getElementById("parentTodayEstTime");
    const pctEl = document.getElementById("parentTodayProgressPercent");
    const barEl = document.getElementById("parentTodayProgressBar");

    if (countEl) countEl.textContent = `${doneTasks}/${totTasks}`;
    if (actEl) actEl.textContent = TaskTimer.formatMinutesHuman(actMin);
    if (estEl) estEl.textContent = TaskTimer.formatMinutesHuman(estMin);
    if (pctEl) pctEl.textContent = `${pct}%`;
    if (barEl) barEl.style.width = `${pct}%`;

    const container = document.getElementById("parentTodaySubjectsList");
    if (!container) return;
    container.innerHTML = "";

    const subjects = (sched.subjects || []).map(s => ({ ...s, is_timetable: true }));
    if (subjects.length === 0) {
      container.innerHTML = `
        <div style="grid-column: 1 / -1; padding: 36px 20px; text-align: center; background: #f8fafc; border-radius: 14px; border: 2px dashed #cbd5e1;">
          <span style="font-size: 36px; display: block; margin-bottom: 8px;">🎒</span>
          <p style="font-weight: 800; font-size: 15px; color: var(--text-main); margin-bottom: 6px;">Nessuna materia o evento in orario per ${sched.day_name || 'questo giorno'}</p>
          <p style="font-size: 13px; color: var(--text-muted); margin-bottom: 16px;">Configura le materie o gli eventi di ${sched.day_name || 'questo giorno'} per organizzare le attività e assegnare compiti.</p>
          <button type="button" class="btn-primary" onclick="window.openSubjectModal(${this.selectedDayOfWeek})" style="display: inline-flex; align-items: center; gap: 8px; margin: 0 auto;">
            <span>➕ Aggiungi Materia o Evento per ${sched.day_name || 'questo giorno'}</span>
          </button>
        </div>
      `;
      return;
    }

    subjects.forEach(sub => {
      const card = document.createElement("div");
      card.className = "parent-subject-card";
      card.style.borderLeft = `4px solid ${sub.category_color || '#3b82f6'}`;

      // Header
      const header = document.createElement("div");
      header.className = "parent-subject-header";
      header.innerHTML = `
        <div class="parent-subject-header-info">
          <span style="font-weight: 800; font-size: 15px; color: var(--text-main); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
            ${sub.category_icon ? `<span style="margin-right:6px;">${sub.category_icon}</span>` : ''}${sub.subject_name}
          </span>
          <span style="font-size: 12px; color: var(--text-muted); font-weight: 600; background: #f1f5f9; padding: 2px 8px; border-radius: 6px; white-space: nowrap;">
            ${sub.start_time} - ${sub.end_time}
          </span>
        </div>
        <div class="parent-subject-header-actions">
          <button type="button" class="btn-edit-subject parent-only" title="Modifica questa materia">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path>
            </svg>
          </button>
          <button type="button" class="btn-delete-subject parent-only" title="Elimina questa materia dall'orario">
            <span style="font-size:13px; line-height:1;">🗑️</span>
            <span style="line-height:1;">Elimina</span>
          </button>
        </div>
      `;

      // Click modifica materia (solo genitore)
      const editBtn = header.querySelector(".btn-edit-subject");
      if (editBtn) {
        editBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          if (typeof window.openEditSubjectModal === "function") {
            window.openEditSubjectModal({
              slot_id: sub.slot_id || sub.id,
              event_id: sub.event_id,
              subject_name: sub.subject_name,
              day_of_week: this.selectedDayOfWeek || sub.day_of_week || 1,
              start_time: sub.start_time,
              end_time: sub.end_time,
              category_color: sub.category_color,
              category_icon: sub.category_icon
            });
          }
        });
      }

      // Click eliminazione materia (solo genitore)
      const delBtn = header.querySelector(".btn-delete-subject");
      if (delBtn) {
        delBtn.addEventListener("click", async (e) => {
          e.stopPropagation();
          const confirmMsg = `Vuoi davvero eliminare la materia "${sub.subject_name}" (${sub.start_time} - ${sub.end_time})?`;
          if (!confirm(confirmMsg)) return;

          try {
            if (sub.slot_id) {
              await API.deleteTimetableSlot(sub.slot_id);
            } else if (sub.event_id) {
              await API.deleteEvent(sub.event_id);
            }
            if (typeof window.App?.showToast === "function") {
              window.App.showToast(`Materia "${sub.subject_name}" eliminata con successo`, "🗑️");
            }
            await this.loadSelectedDay();
            if (window.Calendar) {
              await window.Calendar.renderDailySchedule();
            }
          } catch (err) {
            alert("Errore durante l'eliminazione della materia: " + err.message);
          }
        });
      }

      card.appendChild(header);
      container.appendChild(card);
    });
  },

  render() {
    if (!this.currentStats) return;

    const { general, by_category, top_deviations } = this.currentStats;
    const g = general || {};

    // 1. KPI Cards
    const actMin = g.total_actual_minutes || 0;
    const estMin = g.total_estimated_minutes || 0;
    const kpiAct = document.getElementById("kpiActualTime");
    const kpiEst = document.getElementById("kpiEstimatedTime");
    if (kpiAct) kpiAct.textContent = TaskTimer.formatMinutesHuman(actMin);
    if (kpiEst) kpiEst.textContent = `stima: ${TaskTimer.formatMinutesHuman(estMin)}`;

    const totalTasks = g.total_tasks || 0;
    const compTasks = g.completed_tasks || 0;
    const rate = totalTasks > 0 ? Math.round((compTasks / totalTasks) * 100) : 0;
    const kpiRate = document.getElementById("kpiCompletionRate");
    const kpiCount = document.getElementById("kpiCompletedTasksCount");
    if (kpiRate) kpiRate.textContent = `${rate}%`;
    if (kpiCount) kpiCount.textContent = `${compTasks} di ${totalTasks}`;

    const diff = actMin - estMin;
    const diffEl = document.getElementById("kpiTimeDiff");
    const diffStatusEl = document.getElementById("kpiDiffStatus");
    if (diffEl && diffStatusEl) {
      if (diff > 0) {
        diffEl.textContent = `+${TaskTimer.formatMinutesHuman(diff)}`;
        diffEl.style.color = "var(--danger)";
        diffStatusEl.textContent = "richiesto più tempo del previsto";
      } else if (diff < 0) {
        diffEl.textContent = `-${TaskTimer.formatMinutesHuman(Math.abs(diff))}`;
        diffEl.style.color = "var(--success)";
        diffStatusEl.textContent = "compiti svolti più rapidamente";
      } else {
        diffEl.textContent = "0m";
        diffEl.style.color = "var(--text-main)";
        diffStatusEl.textContent = "perfettamente in linea";
      }
    }

    // Materia più impegnativa (calcolata su tempo reale effettivo, poi stima, poi compiti)
    const kpiTop = document.getElementById("kpiTopSubject");
    const kpiTopH = document.getElementById("kpiTopSubjectHours");
    const activeCatsWithWork = (by_category || []).filter(c => ((c.actual_minutes || 0) > 0 || (c.estimated_minutes || 0) > 0 || (c.tasks_count || 0) > 0));
    if (activeCatsWithWork.length > 0) {
      const topCat = activeCatsWithWork[0];
      const catName = topCat.category_name || topCat.name || "Materia";
      if (kpiTop) kpiTop.textContent = catName;
      if (kpiTopH) {
        const countLabel = topCat.tasks_count === 1 ? "1 compito" : `${topCat.tasks_count || 0} compiti`;
        if ((topCat.actual_minutes || 0) > 0) {
          kpiTopH.textContent = `${TaskTimer.formatMinutesHuman(topCat.actual_minutes)} dedicati (${countLabel})`;
        } else {
          kpiTopH.textContent = `${countLabel} (stima ${TaskTimer.formatMinutesHuman(topCat.estimated_minutes || 0)})`;
        }
      }
    } else {
      if (kpiTop) kpiTop.textContent = "-";
      if (kpiTopH) kpiTopH.textContent = "Nessuna attività registrata";
    }

    // 2. Barre di confronto per materia (mostra tutte le materie dell'orario scolastico)
    const barsContainer = document.getElementById("subjectBarsContainer");
    if (barsContainer) {
      barsContainer.innerHTML = "";

      const allCats = by_category || [];
      if (allCats.length === 0) {
        barsContainer.innerHTML = `<p class="text-muted" style="font-size:13px; text-align:center; padding:24px 16px;">Nessuna materia configurata nell'orario scolastico o compiti registrati nel periodo selezionato.</p>`;
      } else {
        // Trova il massimo per scalare le barre
        const maxMin = Math.max(...allCats.map(c => Math.max(c.actual_minutes || 0, c.estimated_minutes || 0, 30)));

        allCats.forEach(cat => {
          const catName = cat.category_name || cat.name || "Materia";
          const catColor = cat.category_color || cat.color || "#3b82f6";
          const catAct = cat.actual_minutes || 0;
          const catEst = cat.estimated_minutes || 0;
          const catTasks = cat.tasks_count || 0;
          const catDone = cat.completed_count || 0;

          const row = document.createElement("div");
          row.className = "subject-bar-row";

          const actPct = Math.min(100, Math.round((catAct / maxMin) * 100));
          const estPct = Math.min(100, Math.round((catEst / maxMin) * 100));
          const catDiff = catAct - catEst;

          let diffBadge = "";
          if (catAct > 0 && catEst > 0) {
            if (catDiff > 0) {
              diffBadge = `<span class="time-badge act-over">+${catDiff}m</span>`;
            } else if (catDiff < 0) {
              diffBadge = `<span class="time-badge act-good">-${Math.abs(catDiff)}m</span>`;
            } else {
              diffBadge = `<span class="time-badge est">In linea</span>`;
            }
          }

          if (catTasks === 0) {
            row.innerHTML = `
              <div class="subject-bar-meta">
                <span>${catName} (0 compiti)</span>
                <div style="display:flex; align-items:center; gap:8px;">
                  <span style="font-size:12px; color:var(--text-muted); font-style:italic;">
                    Nessun compito registrato
                  </span>
                </div>
              </div>
              <div class="subject-bar-tracks" style="height: 6px; background: #f1f5f9;" title="Nessuna attività registrata per questa materia nel periodo">
                <div class="bar-act-fill" style="width: 0%; background: ${catColor};"></div>
              </div>
            `;
          } else {
            row.innerHTML = `
              <div class="subject-bar-meta">
                <span>${catName} (${catDone}/${catTasks} compiti)</span>
                <div style="display:flex; align-items:center; gap:8px;">
                  <span style="font-size:12px; color:var(--text-muted);">
                    Reale: <strong>${TaskTimer.formatMinutesHuman(catAct)}</strong> | Stima: ${TaskTimer.formatMinutesHuman(catEst)}
                  </span>
                  ${diffBadge}
                </div>
              </div>
              <div class="subject-bar-tracks" style="margin-bottom: 4px;" title="Tempo Effettivo: ${catAct}m">
                <div class="bar-act-fill" style="width: ${Math.max(4, actPct)}%; background: ${catColor};"></div>
              </div>
              <div class="subject-bar-tracks" style="height: 6px; background: #e2e8f0;" title="Tempo Stimato: ${catEst}m">
                <div class="bar-est-fill" style="width: ${Math.max(4, estPct)}%;"></div>
              </div>
            `;
          }

          barsContainer.appendChild(row);
        });
      }
    }

    // 3. Compiti con maggiore scostamento (Alert genitore per difficoltà o ritardi)
    const overList = document.getElementById("overtimeTasksList");
    if (overList) {
      overList.innerHTML = "";

      if (!top_deviations || top_deviations.length === 0) {
        overList.innerHTML = `<p class="text-muted" style="font-size:13px; text-align:center; padding:20px;">Nessuno scostamento anomalo registrato. Ottimo lavoro!</p>`;
      } else {
        top_deviations.forEach(task => {
          const item = document.createElement("div");
          item.className = "overtime-task-row";

          const diffVal = task.diff_minutes || 0;
          const isOver = diffVal > 0;

          item.innerHTML = `
            <div>
              <div class="overtime-title" style="display:flex; align-items:center; gap:6px;">
                <span style="font-size:14px; flex-shrink:0;">⚠️</span>
                <span>${task.task_title || 'Compito'}</span>
              </div>
              <div class="overtime-sub" style="margin-top:2px;">
                <span style="background:#eff6ff; color:#1d4ed8; padding:2px 6px; border-radius:4px; font-weight:700; font-size:11px;">
                  ${task.category_name || 'Generale'}
                </span>
                ${task.event_date ? `<span style="margin-left: 6px; font-size:11px; color:var(--text-muted);">Data: <strong>${this.formatEventDate(task.event_date)}</strong></span>` : ''}
              </div>
            </div>
            <div style="display:flex; align-items:center; gap:10px;">
              <div style="text-align:right; font-size:12px;">
                <div>Impiegato: <strong>${task.actual_minutes || 0}m</strong></div>
                <div class="text-muted">Stima: ${task.estimated_minutes || 0}m</div>
              </div>
              <span class="overtime-tag" style="background:${isOver ? '#fee2e2' : '#dcfce7'}; color:${isOver ? '#b91c1c' : '#166534'}; font-weight:800;">
                ${isOver ? `+${diffVal}m` : `${diffVal}m`}
              </span>
            </div>
          `;

          overList.appendChild(item);
        });
      }
    }
  },

  formatEventDate(dStr) {
    if (!dStr) return "";
    try {
      const parts = dStr.split("-");
      if (parts.length === 3) {
        const d = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
        const dayNames = ["Domenica", "Lunedì", "Martedì", "Mercoledì", "Giovedì", "Venerdì", "Sabato"];
        const dayName = dayNames[d.getDay()];
        return `${dayName} ${parts[2]}/${parts[1]}`;
      }
    } catch (e) {}
    return dStr;
  }
};

window.StatsDashboard = StatsDashboard;
