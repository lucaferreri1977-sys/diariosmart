/**
 * Modulo Statistiche & Dashboard di Controllo Genitore
 */
const StatsDashboard = {
  currentStats: null,
  selectedDayOfWeek: null,

  init() {
    if (this._initialized) return;
    this._initialized = true;

    const periodSelect = document.getElementById("statsPeriodSelect");
    periodSelect?.addEventListener("change", () => this.refresh());

    const refreshBtn = document.getElementById("btnRefreshStats");
    refreshBtn?.addEventListener("click", () => this.refresh());

    if (this.selectedDayOfWeek === null) {
      const dow = new Date().getDay();
      this.selectedDayOfWeek = dow === 0 ? 1 : dow;
    }
  },

  async refresh() {
    const days = parseInt(document.getElementById("statsPeriodSelect")?.value || 7);
    const today = new Date();
    const endDate = Calendar.formatDateIso(today);
    
    const startDateObj = new Date(today);
    startDateObj.setDate(startDateObj.getDate() - days);
    const startDate = Calendar.formatDateIso(startDateObj);

    if (this.selectedDayOfWeek === null) {
      const dow = today.getDay();
      this.selectedDayOfWeek = dow === 0 ? 1 : dow;
    }

    // Calcola la data corrispondente al giorno selezionato nella settimana corrente
    const todayDow = today.getDay() === 0 ? 7 : today.getDay();
    const monday = new Date(today);
    monday.setDate(today.getDate() - (todayDow - 1));

    const targetDate = new Date(monday);
    targetDate.setDate(monday.getDate() + (this.selectedDayOfWeek - 1));
    const targetDateStr = Calendar.formatDateIso(targetDate);

    try {
      const [statsRes, schedRes] = await Promise.all([
        API.getStats(startDate, endDate),
        API.getDailySchedule(targetDateStr)
      ]);

      if (statsRes.ok) {
        this.currentStats = statsRes.stats;
        this.render();
      }

      if (schedRes && schedRes.ok && schedRes.schedule) {
        this.renderParentTodayMonitor(schedRes.schedule, targetDateStr, targetDate);
      }
    } catch (err) {
      console.error("Errore caricamento statistiche / monitor genitore:", err);
    }
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
      { dow: 6, name: "Sabato" }
    ];

    days.forEach(d => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = `parent-day-tab-btn ${this.selectedDayOfWeek === d.dow ? 'active' : ''}`;
      btn.textContent = d.name;
      btn.addEventListener("click", () => {
        this.selectedDayOfWeek = d.dow;
        this.refresh();
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
        <div style="grid-column: 1 / -1; padding: 28px 16px; text-align: center; background: #f8fafc; border-radius: 14px; border: 1px dashed var(--border-color);">
          <span style="font-size: 32px; display: block; margin-bottom: 6px;">🎒</span>
          <p style="font-weight: 700; font-size: 14px; color: var(--text-main); margin: 0;">Nessuna materia in orario per ${sched.day_name || 'questo giorno'}</p>
        </div>
      `;
      return;
    }

    subjects.forEach(sub => {
      const card = document.createElement("div");
      card.className = "parent-subject-card";
      card.style.borderLeft = `4px solid ${sub.category_color || '#3b82f6'}`;

      const sStats = sub.stats || { total_tasks: 0, completed_tasks: 0, actual_minutes: 0, estimated_minutes: 0 };
      const isComplete = sStats.total_tasks > 0 && sStats.completed_tasks === sStats.total_tasks;

      // Header
      const header = document.createElement("div");
      header.className = "parent-subject-header";
      header.innerHTML = `
        <div style="display: flex; align-items: center; gap: 8px; flex: 1; min-width: 0;">
          <span style="font-weight: 800; font-size: 15px; color: var(--text-main); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
            ${sub.category_icon || '📚'} ${sub.subject_name}
          </span>
          <span style="font-size: 12px; color: var(--text-muted); font-weight: 600; background: #f1f5f9; padding: 2px 8px; border-radius: 6px; white-space: nowrap;">
            ${sub.start_time} - ${sub.end_time}
          </span>
        </div>
        <div style="display: flex; align-items: center; gap: 8px; flex-shrink: 0;">
          <span class="subject-progress-pill ${isComplete ? 'all-done' : ''}" style="font-size: 11px;">
            ${sStats.completed_tasks}/${sStats.total_tasks} ${isComplete ? '✓' : ''}
          </span>
          ${sStats.actual_minutes > 0 ? `<span class="time-badge act-good" style="font-size:11px;">⌛ ${sStats.actual_minutes}m</span>` : ''}
          <button type="button" class="btn-delete-subject parent-only" title="Elimina questa materia dall'orario">
            <span>🗑️</span>
            <span>Elimina</span>
          </button>
        </div>
      `;

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
            await this.refresh();
            if (window.Calendar) {
              await window.Calendar.renderDailySchedule();
            }
          } catch (err) {
            alert("Errore durante l'eliminazione della materia: " + err.message);
          }
        });
      }

      card.appendChild(header);

      // Tasks
      const tasksDiv = document.createElement("div");
      tasksDiv.className = "parent-subject-tasks";

      const allItems = [];
      (sub.lists || []).forEach(l => {
        (l.items || []).forEach(i => allItems.push(i));
      });

      if (allItems.length === 0) {
        tasksDiv.innerHTML = `<div style="font-size: 12px; color: var(--text-light); font-style: italic; margin-bottom: 6px;">Nessun compito registrato per oggi.</div>`;
      } else {
        allItems.forEach(item => {
          const tRow = document.createElement("div");
          tRow.className = `parent-task-item ${item.completed ? 'completed' : ''}`;
          tRow.innerHTML = `
            <div style="display: flex; align-items: center; gap: 8px; flex: 1; min-width: 0;">
              <input type="checkbox" class="parent-task-check" ${item.completed ? 'checked' : ''} style="cursor: pointer;">
              <span class="parent-task-title" style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${item.title}</span>
            </div>
            <div style="display: flex; align-items: center; gap: 6px; font-size: 11px; flex-shrink: 0;">
              <span class="time-badge est">⏱️ ${item.estimated_minutes}m</span>
              ${item.actual_minutes > 0 ? `<span class="time-badge act-good">⌛ ${item.actual_minutes}m</span>` : ''}
            </div>
          `;

          // Click spunta per genitore
          const chk = tRow.querySelector(".parent-task-check");
          chk.addEventListener("change", async () => {
            try {
              await API.toggleTodoItem(item.id, chk.checked);
              this.refresh();
              Calendar.renderDailySchedule();
            } catch (e) {
              console.error(e);
            }
          });

          tasksDiv.appendChild(tRow);
        });
      }
      card.appendChild(tasksDiv);

      // Quick Add Task form directly inside Parent Dashboard
      const quickAdd = document.createElement("div");
      quickAdd.className = "parent-quick-add-task";
      quickAdd.innerHTML = `
        <input type="text" class="parent-quick-input" placeholder="✏️ Assegna compito a Giulio..." />
        <select class="parent-quick-est" title="Tempo stimato">
          <option value="15">15 min</option>
          <option value="20">20 min</option>
          <option value="25" selected>25 min</option>
          <option value="30">30 min</option>
          <option value="45">45 min</option>
          <option value="60">60 min</option>
        </select>
        <button type="button" class="parent-quick-btn">+ Assegna</button>
      `;

      const input = quickAdd.querySelector(".parent-quick-input");
      const estSelect = quickAdd.querySelector(".parent-quick-est");
      const btn = quickAdd.querySelector(".parent-quick-btn");

      const submitQuick = async () => {
        const title = input.value.trim();
        if (!title) return;
        const estMin = parseInt(estSelect.value || 25);
        input.value = "";
        input.disabled = true;
        try {
          await API.quickCreateTask(sub.event_id, title, estMin);
          if (typeof window.App?.showToast === "function") {
            window.App.showToast(`Compito assegnato a Giulio per ${sub.subject_name}!`, "📝");
          }
          await this.refresh();
          await Calendar.renderDailySchedule();
        } catch (e) {
          console.error(e);
        } finally {
          input.disabled = false;
        }
      };

      btn.addEventListener("click", submitQuick);
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") submitQuick();
      });

      card.appendChild(quickAdd);
      container.appendChild(card);
    });
  },

  render() {
    if (!this.currentStats) return;

    const { general, by_category, top_deviations } = this.currentStats;

    // 1. KPI Cards
    const actMin = general.total_actual_minutes || 0;
    const estMin = general.total_estimated_minutes || 0;
    document.getElementById("kpiActualTime").textContent = TaskTimer.formatMinutesHuman(actMin);
    document.getElementById("kpiEstimatedTime").textContent = `stima: ${TaskTimer.formatMinutesHuman(estMin)}`;

    const totalTasks = general.total_tasks || 0;
    const compTasks = general.completed_tasks || 0;
    const rate = totalTasks > 0 ? Math.round((compTasks / totalTasks) * 100) : 0;
    document.getElementById("kpiCompletionRate").textContent = `${rate}%`;
    document.getElementById("kpiCompletedTasksCount").textContent = `${compTasks} di ${totalTasks}`;

    const diff = actMin - estMin;
    const diffEl = document.getElementById("kpiTimeDiff");
    const diffStatusEl = document.getElementById("kpiDiffStatus");
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

    // Materia più impegnativa
    if (by_category && by_category.length > 0 && (by_category[0].actual_minutes > 0 || by_category[0].tasks_count > 0)) {
      const topCat = by_category[0];
      document.getElementById("kpiTopSubject").textContent = `${topCat.category_icon || '📚'} ${topCat.category_name}`;
      document.getElementById("kpiTopSubjectHours").textContent = `${TaskTimer.formatMinutesHuman(topCat.actual_minutes)} dedicati (${topCat.tasks_count} compiti)`;
    } else {
      document.getElementById("kpiTopSubject").textContent = "-";
      document.getElementById("kpiTopSubjectHours").textContent = "Nessuna attività registrata";
    }

    // 2. Barre di confronto per materia
    const barsContainer = document.getElementById("subjectBarsContainer");
    if (barsContainer) {
      barsContainer.innerHTML = "";

      const activeCats = (by_category || []).filter(c => (c.tasks_count > 0 || c.actual_minutes > 0 || c.estimated_minutes > 0));
      if (activeCats.length === 0) {
        barsContainer.innerHTML = `<p class="text-muted" style="font-size:13px; text-align:center; padding:24px 16px;">Nessuna attività registrata nel periodo selezionato. Quando Giulio svolgerà compiti o sessioni di studio, qui vedrai la distribuzione del tempo per materia.</p>`;
      } else {
        // Trova il massimo per scalare le barre
        const maxMin = Math.max(...activeCats.map(c => Math.max(c.actual_minutes, c.estimated_minutes, 30)));

        activeCats.forEach(cat => {
          const row = document.createElement("div");
          row.className = "subject-bar-row";

          const actPct = Math.min(100, Math.round((cat.actual_minutes / maxMin) * 100));
          const estPct = Math.min(100, Math.round((cat.estimated_minutes / maxMin) * 100));
          const catDiff = cat.actual_minutes - cat.estimated_minutes;

          let diffBadge = "";
          if (cat.actual_minutes > 0 && cat.estimated_minutes > 0) {
            if (catDiff > 0) {
              diffBadge = `<span class="time-badge act-over">+${catDiff}m</span>`;
            } else if (catDiff < 0) {
              diffBadge = `<span class="time-badge act-good">-${Math.abs(catDiff)}m</span>`;
            } else {
              diffBadge = `<span class="time-badge est">In linea</span>`;
            }
          }

          row.innerHTML = `
            <div class="subject-bar-meta">
              <span>${cat.category_icon} ${cat.category_name} (${cat.completed_count}/${cat.tasks_count} compiti)</span>
              <div style="display:flex; align-items:center; gap:8px;">
                <span style="font-size:12px; color:var(--text-muted);">
                  Reale: <strong>${TaskTimer.formatMinutesHuman(cat.actual_minutes)}</strong> | Stima: ${TaskTimer.formatMinutesHuman(cat.estimated_minutes)}
                </span>
                ${diffBadge}
              </div>
            </div>
            <div class="subject-bar-tracks" style="margin-bottom: 4px;" title="Tempo Effettivo: ${cat.actual_minutes}m">
              <div class="bar-act-fill" style="width: ${Math.max(4, actPct)}%; background: ${cat.category_color};"></div>
            </div>
            <div class="subject-bar-tracks" style="height: 6px; background: #e2e8f0;" title="Tempo Stimato: ${cat.estimated_minutes}m">
              <div class="bar-est-fill" style="width: ${Math.max(4, estPct)}%;"></div>
            </div>
          `;

          barsContainer.appendChild(row);
        });
      }
    }

    // 3. Compiti con maggiore scostamento (Alert genitore)
    const overList = document.getElementById("overtimeTasksList");
    if (overList) {
      overList.innerHTML = "";

      if (!top_deviations || top_deviations.length === 0) {
        overList.innerHTML = `<p class="text-muted" style="font-size:13px; text-align:center; padding:20px;">Nessuno scostamento anomalo registrato. Ottimo lavoro!</p>`;
      } else {
        top_deviations.forEach(task => {
          const item = document.createElement("div");
          item.className = "overtime-task-row";

          const diffVal = task.diff_minutes;
          const isOver = diffVal > 0;

          item.innerHTML = `
            <div>
              <div class="overtime-title">${task.task_title}</div>
              <div class="overtime-sub">
                ${task.category_name} • Evento: <strong>${task.event_title}</strong> (${task.event_date})
              </div>
            </div>
            <div style="display:flex; align-items:center; gap:10px;">
              <div style="text-align:right; font-size:12px;">
                <div>Impiegato: <strong>${task.actual_minutes}m</strong></div>
                <div class="text-muted">Stima: ${task.estimated_minutes}m</div>
              </div>
              <span class="overtime-tag" style="background:${isOver ? '#fee2e2' : '#dcfce7'}; color:${isOver ? '#b91c1c' : '#166534'};">
                ${isOver ? `+${diffVal}m` : `${diffVal}m`}
              </span>
            </div>
          `;

          overList.appendChild(item);
        });
      }
    }
  }
};

window.StatsDashboard = StatsDashboard;
