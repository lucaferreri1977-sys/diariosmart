/**
 * Gestione Rendering Calendario (Mese, Settimana e Agenda)
 */
const Calendar = {
  currentDate: new Date(),
  currentView: "agenda", // "agenda" (Orario Scolastico & Diario), "month", "week"
  events: [],
  categories: [],
  selectedCategoryId: null,

  selectedSubjectEventId: null,

  init() {
    if (this._initialized) return;
    this._initialized = true;
    this.bindEvents();
    this.updateTitle();
  },

  bindEvents() {
    // Navigazione Mese / Settimana (top bar)
    document.getElementById("btnPrev")?.addEventListener("click", () => this.navigate(-1));
    document.getElementById("btnNext")?.addEventListener("click", () => this.navigate(1));
    document.getElementById("btnToday")?.addEventListener("click", () => {
      this.currentDate = new Date();
      this.selectedSubjectEventId = null;
      this.refresh();
    });

    // Navigazione Settimana (sezione dedicata)
    document.getElementById("btnWeekPrev")?.addEventListener("click", () => this.navigate(-1));
    document.getElementById("btnWeekNext")?.addEventListener("click", () => this.navigate(1));
    document.getElementById("btnWeekToday")?.addEventListener("click", () => {
      this.currentDate = new Date();
      this.refresh();
    });

    // Navigazione Giorno (daily planner)
    document.getElementById("btnDailyPrev")?.addEventListener("click", () => this.navigate(-1));
    document.getElementById("btnDailyNext")?.addEventListener("click", () => this.navigate(1));
    document.getElementById("btnDailyToday")?.addEventListener("click", () => {
      this.currentDate = new Date();
      this.selectedSubjectEventId = null;
      this.refresh();
    });

    // Form aggiunta to-do rapido nella colonna destra
    const quickForm = document.getElementById("dailyQuickTaskForm");
    quickForm?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const titleInput = document.getElementById("quickTaskTitleInput");
      const estSelect = document.getElementById("quickTaskEstSelect");

      const title = titleInput?.value.trim();
      const estMin = parseInt(estSelect?.value || 25);
      const dateStr = this.formatDateIso(this.currentDate);
      const eventId = this.selectedSubjectEventId || 0;

      if (!title) return;

      titleInput.value = "";
      titleInput.disabled = true;

      try {
        await API.quickCreateTask(eventId, title, estMin, dateStr);
        if (typeof window.App?.showToast === "function") {
          window.App.showToast("Compito aggiunto con successo!", "📝");
        }
        await this.renderDailySchedule();
      } catch (err) {
        alert("Errore nell'aggiunta del compito: " + err.message);
      } finally {
        titleInput.disabled = false;
        titleInput.focus();
      }
    });
  },

  navigate(direction) {
    if (this.currentView === "month") {
      this.currentDate.setMonth(this.currentDate.getMonth() + direction);
    } else if (this.currentView === "week") {
      this.currentDate.setDate(this.currentDate.getDate() + (direction * 7));
    } else if (this.currentView === "agenda") {
      this.currentDate.setDate(this.currentDate.getDate() + direction);
    }
    this.selectedSubjectEventId = null;
    this.refresh();
  },

  updateTitle() {
    const titleEl = document.getElementById("calendarTitle");
    if (!titleEl) return;

    const months = [
      "Gennaio", "Febbraio", "Marzo", "Aprile", "Maggio", "Giugno",
      "Luglio", "Agosto", "Settembre", "Ottobre", "Novembre", "Dicembre"
    ];

    const y = this.currentDate.getFullYear();
    const m = months[this.currentDate.getMonth()];

    if (this.currentView === "month") {
      titleEl.textContent = `${m} ${y}`;
    } else if (this.currentView === "week") {
      const weekStart = this.getWeekStart(this.currentDate);
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekEnd.getDate() + 6);
      titleEl.textContent = `${weekStart.getDate()} - ${weekEnd.getDate()} ${months[weekEnd.getMonth()]} ${y}`;
    } else {
      titleEl.textContent = `${this.currentDate.getDate()} ${m} ${y}`;
    }
  },

  getWeekStart(date) {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Lunedì come primo giorno
    return new Date(d.setDate(diff));
  },

  formatDateIso(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  },

  async refresh() {
    this.updateTitle();
    
    // Determina il range di date in base alla vista
    let startDate, endDate;
    if (this.currentView === "month") {
      const firstDay = new Date(this.currentDate.getFullYear(), this.currentDate.getMonth(), 1);
      const lastDay = new Date(this.currentDate.getFullYear(), this.currentDate.getMonth() + 1, 0);
      
      const gridStart = this.getWeekStart(firstDay);
      const gridEnd = new Date(this.getWeekStart(lastDay));
      gridEnd.setDate(gridEnd.getDate() + 6);
      
      startDate = this.formatDateIso(gridStart);
      endDate = this.formatDateIso(gridEnd);
    } else if (this.currentView === "week") {
      const wStart = this.getWeekStart(this.currentDate);
      const wEnd = new Date(wStart);
      wEnd.setDate(wEnd.getDate() + 6);
      startDate = this.formatDateIso(wStart);
      endDate = this.formatDateIso(wEnd);
    } else {
      // Agenda: carica da 7 giorni prima a 7 giorni dopo
      const aStart = new Date(this.currentDate);
      aStart.setDate(aStart.getDate() - 3);
      const aEnd = new Date(this.currentDate);
      aEnd.setDate(aEnd.getDate() + 14);
      startDate = this.formatDateIso(aStart);
      endDate = this.formatDateIso(aEnd);
    }

    try {
      const res = await API.getEvents(startDate, endDate);
      if (res.ok) {
        this.events = res.events;
      }
    } catch (e) {
      console.error("Errore caricamento eventi calendario:", e);
    }

    // Renderizza la vista attiva
    if (this.currentView === "week") {
      this.renderWeekView();
    } else {
      this.renderAgendaView();
    }
  },

  renderMonthView() {
    // Vista mensile rimossa
  },

  async renderWeekView() {
    const container = document.getElementById("weekViewContainer");
    if (!container) return;
    container.innerHTML = `<div style="text-align:center; padding:30px; color:var(--text-muted); grid-column:1/-1;">Caricamento visione settimanale con compiti per materia...</div>`;

    const weekStart = this.getWeekStart(this.currentDate);
    const weekStartStr = this.formatDateIso(weekStart);
    const todayStr = this.formatDateIso(new Date());

    const months = [
      "Gennaio", "Febbraio", "Marzo", "Aprile", "Maggio", "Giugno",
      "Luglio", "Agosto", "Settembre", "Ottobre", "Novembre", "Dicembre"
    ];
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);

    const titleEl = document.getElementById("weekDateRangeTitle");
    if (titleEl) {
      titleEl.textContent = `Settimana ${weekStart.getDate()} - ${weekEnd.getDate()} ${months[weekEnd.getMonth()]} ${weekEnd.getFullYear()}`;
    }

    try {
      const res = await API.getWeeklySchedule(weekStartStr);
      if (!res.ok || !res.week) return;

      container.innerHTML = "";

      res.week.forEach(day => {
        const isToday = day.date === todayStr;
        const col = document.createElement("div");
        col.className = `week-day-column ${isToday ? 'is-today' : ''}`;

        // Header del giorno
        const dayDateObj = new Date(day.date);
        const header = document.createElement("div");
        header.className = "week-day-col-header";
        header.title = "Clicca per aprire la visione dettagliata di questo giorno";

        const allTodos = day.unified_todos || [];
        const doneCount = allTodos.filter(t => t.completed).length;

        header.innerHTML = `
          <div style="display:flex; align-items:center; gap:6px;">
            <span class="week-day-col-name">${day.day_name}</span>
            ${isToday ? '<span class="user-role-badge" style="background:#3b82f6; color:#fff; font-size:10px; padding:2px 6px;">Oggi</span>' : ''}
          </div>
          <div style="display:flex; align-items:center; gap:6px;">
            ${allTodos.length > 0 ? `<span style="font-size:10px; font-weight:700; color:${doneCount === allTodos.length ? 'var(--success)' : 'var(--text-muted)'}">${doneCount}/${allTodos.length}</span>` : ''}
            <span class="week-day-col-num">${dayDateObj.getDate()}</span>
          </div>
        `;
        header.addEventListener("click", () => {
          this.currentDate = new Date(day.date);
          this.selectedSubjectEventId = null;
          if (typeof window.App?.switchView === "function") {
            window.App.switchView("agenda");
          }
        });
        col.appendChild(header);

        // Corpo della colonna con materie e relativi to-do
        const dayBody = document.createElement("div");
        dayBody.className = "week-day-body";

        const renderedTaskIds = new Set();

        if (day.subjects.length === 0 && (!day.extra_events || day.extra_events.length === 0)) {
          if (!day.is_weekend) {
            const emptyDiv = document.createElement("div");
            emptyDiv.className = "week-day-empty-msg";
            emptyDiv.textContent = "Nessuna materia in programma";
            dayBody.appendChild(emptyDiv);
          }
        } else {
          // Elenco Materie con i to-do sotto ad ogni materia
          day.subjects.forEach(sub => {
            const card = document.createElement("div");
            card.className = "week-subject-card";
            card.style.borderTop = `3px solid ${sub.category_color || '#3b82f6'}`;

            // Header materia
            const subHeader = document.createElement("div");
            subHeader.className = "week-subject-header";
            subHeader.title = `Clicca per aprire la materia nel diario del giorno`;
            subHeader.innerHTML = `
              <div class="week-subject-header-title">
                <span>${sub.category_icon || '📚'}</span>
                <span>${sub.subject_name}</span>
              </div>
              <span class="week-subject-header-time">${sub.start_time} - ${sub.end_time}</span>
            `;
            subHeader.addEventListener("click", () => {
              this.currentDate = new Date(day.date);
              this.selectedSubjectEventId = sub.event_id;
              if (typeof window.App?.switchView === "function") {
                window.App.switchView("agenda");
              }
            });
            card.appendChild(subHeader);

            // To-Do sotto a questa materia
            const todosBox = document.createElement("div");
            todosBox.className = "week-subject-todos";

            // Estrai compiti da sub.lists oppure da unified_todos con event_id
            let tasks = [];
            if (sub.lists && sub.lists.length > 0) {
              sub.lists.forEach(l => {
                (l.items || []).forEach(it => tasks.push(it));
              });
            } else if (sub.event_id) {
              tasks = allTodos.filter(t => t.event_id === sub.event_id);
            }

            if (tasks.length === 0) {
              const noTasks = document.createElement("div");
              noTasks.className = "week-sub-no-tasks";
              noTasks.textContent = "Nessun compito";
              todosBox.appendChild(noTasks);
            } else {
              tasks.forEach(task => {
                renderedTaskIds.add(task.id);
                const row = document.createElement("div");
                row.className = `week-sub-todo-row ${task.completed ? 'completed' : ''}`;

                const chk = document.createElement("input");
                chk.type = "checkbox";
                chk.className = "week-todo-check";
                chk.checked = !!task.completed;
                chk.title = "Segna come completato / da fare";
                chk.addEventListener("change", async (e) => {
                  e.stopPropagation();
                  try {
                    await API.toggleTodoItem(task.id, chk.checked);
                    this.renderWeekView();
                  } catch (err) {
                    console.error("Errore toggle task:", err);
                  }
                });

                const titleSpan = document.createElement("span");
                titleSpan.className = "week-sub-todo-title";
                titleSpan.textContent = task.title;
                titleSpan.title = task.title;

                row.appendChild(chk);
                row.appendChild(titleSpan);

                if (task.estimated_minutes > 0) {
                  const estSpan = document.createElement("span");
                  estSpan.className = "week-sub-todo-est";
                  estSpan.textContent = `${task.estimated_minutes}m`;
                  row.appendChild(estSpan);
                }

                todosBox.appendChild(row);
              });
            }

            card.appendChild(todosBox);
            dayBody.appendChild(card);
          });

          // Eventi straordinari/pomeridiani (se presenti)
          if (day.extra_events && day.extra_events.length > 0) {
            day.extra_events.forEach(ex => {
              const exCard = document.createElement("div");
              exCard.className = "week-subject-card extra-event";
              exCard.style.borderTop = `3px solid ${ex.category_color || '#8b5cf6'}`;

              const exHeader = document.createElement("div");
              exHeader.className = "week-subject-header";
              exHeader.innerHTML = `
                <div class="week-subject-header-title">
                  <span>${ex.category_icon || '🌟'}</span>
                  <span>${ex.title}</span>
                </div>
                <span class="week-subject-header-time">${ex.start_time || 'Extra'}</span>
              `;
              exCard.appendChild(exHeader);

              const exTodosBox = document.createElement("div");
              exTodosBox.className = "week-subject-todos";

              let exTasks = [];
              (ex.lists || []).forEach(l => {
                (l.items || []).forEach(it => exTasks.push(it));
              });

              if (exTasks.length === 0) {
                const noTasks = document.createElement("div");
                noTasks.className = "week-sub-no-tasks";
                noTasks.textContent = "Nessun compito";
                exTodosBox.appendChild(noTasks);
              } else {
                exTasks.forEach(task => {
                  renderedTaskIds.add(task.id);
                  const row = document.createElement("div");
                  row.className = `week-sub-todo-row ${task.completed ? 'completed' : ''}`;

                  const chk = document.createElement("input");
                  chk.type = "checkbox";
                  chk.className = "week-todo-check";
                  chk.checked = !!task.completed;
                  chk.addEventListener("change", async (e) => {
                    e.stopPropagation();
                    try {
                      await API.toggleTodoItem(task.id, chk.checked);
                      this.renderWeekView();
                    } catch (err) {
                      console.error("Errore toggle extra task:", err);
                    }
                  });

                  const titleSpan = document.createElement("span");
                  titleSpan.className = "week-sub-todo-title";
                  titleSpan.textContent = task.title;

                  row.appendChild(chk);
                  row.appendChild(titleSpan);
                  if (task.estimated_minutes > 0) {
                    const estSpan = document.createElement("span");
                    estSpan.className = "week-sub-todo-est";
                    estSpan.textContent = `${task.estimated_minutes}m`;
                    row.appendChild(estSpan);
                  }
                  exTodosBox.appendChild(row);
                });
              }

              exCard.appendChild(exTodosBox);
              dayBody.appendChild(exCard);
            });
          }

          // Eventuali to-do orfani/generali non ancora renderizzati
          const unrendered = allTodos.filter(t => !renderedTaskIds.has(t.id));
          if (unrendered.length > 0) {
            const otherCard = document.createElement("div");
            otherCard.className = "week-subject-card";
            otherCard.style.borderTop = "3px solid #64748b";

            const otherHeader = document.createElement("div");
            otherHeader.className = "week-subject-header";
            otherHeader.innerHTML = `
              <div class="week-subject-header-title">
                <span>📝</span>
                <span>Altri Compiti</span>
              </div>
            `;
            otherCard.appendChild(otherHeader);

            const otherBox = document.createElement("div");
            otherBox.className = "week-subject-todos";
            unrendered.forEach(task => {
              const row = document.createElement("div");
              row.className = `week-sub-todo-row ${task.completed ? 'completed' : ''}`;

              const chk = document.createElement("input");
              chk.type = "checkbox";
              chk.className = "week-todo-check";
              chk.checked = !!task.completed;
              chk.addEventListener("change", async (e) => {
                e.stopPropagation();
                try {
                  await API.toggleTodoItem(task.id, chk.checked);
                  this.renderWeekView();
                } catch (err) {
                  console.error(err);
                }
              });

              const titleSpan = document.createElement("span");
              titleSpan.className = "week-sub-todo-title";
              titleSpan.textContent = task.title;

              row.appendChild(chk);
              row.appendChild(titleSpan);
              if (task.estimated_minutes > 0) {
                const estSpan = document.createElement("span");
                estSpan.className = "week-sub-todo-est";
                estSpan.textContent = `${task.estimated_minutes}m`;
                row.appendChild(estSpan);
              }
              otherBox.appendChild(row);
            });
            otherCard.appendChild(otherBox);
            dayBody.appendChild(otherCard);
          }
        }

        col.appendChild(dayBody);
        container.appendChild(col);
      });

    } catch (err) {
      console.error("Errore caricamento visione settimanale:", err);
      container.innerHTML = `<div style="text-align:center; padding:30px; color:var(--danger); grid-column:1/-1;">Errore nel caricamento della settimana: ${err.message}</div>`;
    }
  },

  formatDateReadable(date) {
    const months = [
      "Gennaio", "Febbraio", "Marzo", "Aprile", "Maggio", "Giugno",
      "Luglio", "Agosto", "Settembre", "Ottobre", "Novembre", "Dicembre"
    ];
    return `${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear()}`;
  },

  renderDailyWeekStrip() {
    const strip = document.getElementById("dailyWeekStrip");
    if (!strip) return;
    strip.innerHTML = "";

    const curr = new Date(this.currentDate);
    const weekStart = this.getWeekStart(curr);
    const dayNamesShort = ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"];
    const todayIso = this.formatDateIso(new Date());
    const selIso = this.formatDateIso(curr);

    const iter = new Date(weekStart);
    for (let i = 0; i < 7; i++) {
      const dateIso = this.formatDateIso(iter);
      const isSel = dateIso === selIso;
      const isToday = dateIso === todayIso;

      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = `btn-day-pill ${isSel ? 'active' : ''} ${isToday ? 'is-today' : ''}`;
      btn.innerHTML = `
        <span class="day-pill-name">${dayNamesShort[i]}</span>
        <span class="day-pill-num">${iter.getDate()}</span>
      `;

      const targetDate = new Date(iter);
      btn.addEventListener("click", () => {
        this.currentDate = targetDate;
        this.selectedSubjectEventId = null;
        this.refresh();
      });

      strip.appendChild(btn);
      iter.setDate(iter.getDate() + 1);
    }
  },

  async renderDailySchedule() {
    const dateStr = this.formatDateIso(this.currentDate);
    
    // Aggiorna titolo della data selezionata
    const titleEl = document.getElementById("dailyDateTitle");

    try {
      const res = await API.getDailySchedule(dateStr);
      if (!res.ok || !res.schedule) return;
      const sched = res.schedule;

      if (titleEl) {
        titleEl.textContent = `${sched.day_name} ${this.formatDateReadable(this.currentDate)}`;
      }

      // Seleziona la prima materia del giorno se non c'è una materia valida già selezionata
      const subjects = sched.subjects || [];
      if (subjects.length > 0) {
        const stillValid = subjects.some(s => s.event_id === this.selectedSubjectEventId);
        if (!stillValid) {
          this.selectedSubjectEventId = subjects[0].event_id;
        }
      } else {
        this.selectedSubjectEventId = null;
      }

      // 1. Aggiorna Banner KPI / Strip per la materia attiva (o per la giornata se nessuna materia)
      const currentSub = subjects.find(s => s.event_id === this.selectedSubjectEventId);
      const stats = currentSub ? (currentSub.stats || {}) : (sched.totals || {});
      const totTasks = stats.total_tasks || 0;
      const doneTasks = stats.completed_tasks || 0;
      const estMin = stats.estimated_minutes !== undefined ? stats.estimated_minutes : (stats.total_estimated_minutes || 0);
      const actMin = stats.actual_minutes !== undefined ? stats.actual_minutes : (stats.total_actual_minutes || 0);
      const pct = totTasks > 0 ? Math.round((doneTasks / totTasks) * 100) : 0;

      const totalTasksEl = document.getElementById("dailyTotalTasks");
      const estEl = document.getElementById("dailyEstimatedTime");
      const actEl = document.getElementById("dailyActualTime");
      const pctEl = document.getElementById("dailyProgressPercent");
      const barEl = document.getElementById("dailyProgressBar");

      if (totalTasksEl) totalTasksEl.textContent = `${doneTasks}/${totTasks}`;
      if (estEl) estEl.textContent = TaskTimer.formatMinutesHuman(estMin);
      if (actEl) actEl.textContent = TaskTimer.formatMinutesHuman(actMin);
      if (pctEl) pctEl.textContent = `${pct}%`;
      if (barEl) barEl.style.width = `${pct}%`;

      // 2. Popola COLONNA SINISTRA: Solo ed esclusivamente le Materie del Giorno
      this.renderDailyEventsColumn(sched);

      // 3. Aggiorna Placeholder del Form Rapido Compito
      this.updateQuickTaskPlaceholder(sched);

      // 4. Popola COLONNA DESTRA: I To-Do per la materia selezionata
      this.renderDailyTodosColumn(sched);

    } catch (err) {
      console.error("Errore caricamento daily schedule:", err);
    }
  },

  renderAgendaView() {
    return this.renderDailySchedule();
  },

  /**
   * Rende l'elenco delle sole Materie del giorno nella COLONNA SINISTRA
   */
  renderDailyEventsColumn(sched) {
    const container = document.getElementById("dailyEventsList");
    if (!container) return;
    container.innerHTML = "";

    const subjects = sched.subjects || [];

    if (subjects.length === 0) {
      container.innerHTML = `
        <div style="text-align: center; padding: 32px 12px; background: #f8fafc; border-radius: 12px; border: 1px dashed var(--border-color);">
          <span style="font-size: 32px; display: block; margin-bottom: 6px;">🎒</span>
          <p style="font-size: 13px; font-weight: 700; color: var(--text-main); margin: 0;">Nessuna materia in programma per ${sched.day_name || 'questo giorno'}</p>
        </div>
      `;
      return;
    }

    subjects.forEach(sub => {
      const card = document.createElement("div");
      const isSelected = this.selectedSubjectEventId === sub.event_id;
      card.className = `daily-event-card ${isSelected ? 'selected' : ''}`;
      card.style.borderLeftColor = sub.category_color || "#3b82f6";
      card.style.cursor = "pointer";

      const stats = sub.stats || { total_tasks: 0, completed_tasks: 0 };
      const hasTasks = stats.total_tasks > 0;
      const allDone = hasTasks && stats.completed_tasks === stats.total_tasks;

      let taskCountClass = "daily-event-task-count";
      if (allDone) taskCountClass += " all-done";
      else if (hasTasks) taskCountClass += " has-tasks";

      card.innerHTML = `
        <div class="daily-event-top">
          <span class="daily-event-period">${sub.period_label || (sub.period_number + 'ª Ora')}</span>
          <span class="daily-event-time">🕒 ${sub.start_time}${sub.end_time ? ' - ' + sub.end_time : ''}</span>
        </div>
        <div class="daily-event-title-row">
          <span class="daily-event-icon">${sub.category_icon || '📚'}</span>
          <span class="daily-event-name">${sub.subject_name}</span>
          ${sub.room ? `<span class="subject-room-badge" style="font-size:10px;">${sub.room}</span>` : ''}
        </div>
        <div class="daily-event-bottom">
          <span class="${taskCountClass}">
            ${hasTasks ? `${stats.completed_tasks}/${stats.total_tasks} compiti ${allDone ? '✓' : ''}` : '0 compiti'}
          </span>
        </div>
      `;

      card.addEventListener("click", () => {
        this.selectedSubjectEventId = sub.event_id;
        this.renderDailyEventsColumn(sched);
        this.updateQuickTaskPlaceholder(sched);
        this.renderDailyTodosColumn(sched);

        // Aggiorna KPI per la materia cliccata
        const sStats = sub.stats || {};
        const sTot = sStats.total_tasks || 0;
        const sDone = sStats.completed_tasks || 0;
        const sEst = sStats.estimated_minutes || 0;
        const sAct = sStats.actual_minutes || 0;
        const sPct = sTot > 0 ? Math.round((sDone / sTot) * 100) : 0;
        const totalTasksEl = document.getElementById("dailyTotalTasks");
        const estEl = document.getElementById("dailyEstimatedTime");
        const actEl = document.getElementById("dailyActualTime");
        const pctEl = document.getElementById("dailyProgressPercent");
        const barEl = document.getElementById("dailyProgressBar");
        if (totalTasksEl) totalTasksEl.textContent = `${sDone}/${sTot}`;
        if (estEl) estEl.textContent = TaskTimer.formatMinutesHuman(sEst);
        if (actEl) actEl.textContent = TaskTimer.formatMinutesHuman(sAct);
        if (pctEl) pctEl.textContent = `${sPct}%`;
        if (barEl) barEl.style.width = `${sPct}%`;
      });

      container.appendChild(card);
    });
  },

  updateQuickTaskPlaceholder(sched) {
    const input = document.getElementById("quickTaskTitleInput");
    const quickForm = document.getElementById("dailyQuickTaskForm");
    if (!input) return;

    const subjects = sched.subjects || [];
    if (subjects.length === 0) {
      input.placeholder = `Nessuna materia in programma per ${sched.day_name || 'questo giorno'}`;
      input.disabled = true;
      if (quickForm) quickForm.style.opacity = "0.5";
      return;
    }

    input.disabled = false;
    if (quickForm) quickForm.style.opacity = "1";

    const currentSub = subjects.find(s => s.event_id === this.selectedSubjectEventId) || subjects[0];
    if (currentSub) {
      input.placeholder = `✏️ Aggiungi compito per ${currentSub.subject_name}...`;
    } else {
      input.placeholder = "✏️ Aggiungi un compito o esercizio da fare...";
    }
  },

  /**
   * Rende i to-do della MATERIA SELEZIONATA per la giornata nella COLONNA DESTRA
   */
  renderDailyTodosColumn(sched) {
    const container = document.getElementById("dailyUnifiedTodosList");
    const titleEl = document.getElementById("todosColTitle");
    const resetBtn = document.getElementById("btnResetTodosFilter");
    if (resetBtn) resetBtn.classList.add("hidden");
    if (!container) return;
    container.innerHTML = "";

    const subjects = sched.subjects || [];

    if (subjects.length === 0) {
      if (titleEl) titleEl.textContent = `📝 Nessuna Materia in Orario • ${sched.day_name || ''}`;
      container.innerHTML = `
        <div style="text-align: center; padding: 40px 20px; background: #f8fafc; border-radius: 16px; border: 1px dashed var(--border-color);">
          <span style="font-size: 36px; display: block; margin-bottom: 8px;">🎒</span>
          <h4 style="font-size: 15px; font-weight: 700; color: var(--text-main);">Nessuna materia in programma per ${sched.day_name || 'questo giorno'}</h4>
          <p style="font-size: 13px; color: var(--text-muted); margin-top: 6px; max-width: 380px; margin-left: auto; margin-right: auto;">
            Usa le frecce ‹ › in alto per spostarti su un giorno scolastico per consultare o assegnare i compiti.
          </p>
        </div>
      `;
      return;
    }

    const currentSub = subjects.find(s => s.event_id === this.selectedSubjectEventId) || subjects[0];
    if (titleEl && currentSub) {
      titleEl.innerHTML = `📝 Compiti di <span style="color:${currentSub.category_color || 'var(--primary)'}; font-weight:800;">${currentSub.category_icon || '📚'} ${currentSub.subject_name}</span>`;
    }

    // Filtra esclusivamente i to-do di questa materia
    let items = (sched.unified_todos || []).filter(i => i.event_id === currentSub.event_id);

    if (items.length === 0) {
      container.innerHTML = `
        <div style="text-align: center; padding: 40px 20px; background: #f8fafc; border-radius: 16px; border: 1px dashed var(--border-color);">
          <span style="font-size: 36px; display: block; margin-bottom: 8px;">📝</span>
          <h4 style="font-size: 15px; font-weight: 700; color: var(--text-main);">Nessun compito registrato per ${currentSub.subject_name}</h4>
          <p style="font-size: 13px; color: var(--text-muted); margin-top: 4px; max-width: 400px; margin-left: auto; margin-right: auto;">
            Scrivi cosa c'è da fare nel campo in alto e clicca su "+ Aggiungi" per assegnare un compito a questa materia!
          </p>
        </div>
      `;
      return;
    }

    items.forEach(item => {
      const row = document.createElement("div");
      row.className = `daily-todo-item-row ${item.completed ? 'completed' : ''}`;

      // Left: Checkbox + Subject Pill + Title
      const leftDiv = document.createElement("div");
      leftDiv.className = "todo-item-left";

      const chk = document.createElement("input");
      chk.type = "checkbox";
      chk.className = "todo-item-checkbox";
      chk.checked = !!item.completed;
      chk.title = "Segna come completato / da fare";
      chk.addEventListener("change", async () => {
        try {
          await API.toggleTodoItem(item.id, chk.checked);
          if (chk.checked && typeof window.App?.showToast === "function") {
            window.App.showToast("Bravissimo! Compito completato! 🎉", "🌟");
          }
          await this.renderDailySchedule();
        } catch (e) {
          console.error(e);
        }
      });

      const pill = document.createElement("span");
      pill.className = "todo-item-subject-pill";
      pill.style.background = item.category_color || "#3b82f6";
      pill.style.color = "#ffffff";
      pill.innerHTML = `<span>${item.category_icon || '📚'}</span> <span>${item.subject_name}</span>`;

      const titleSpan = document.createElement("span");
      titleSpan.className = "todo-item-title";
      titleSpan.textContent = item.title;

      leftDiv.appendChild(chk);
      leftDiv.appendChild(pill);
      leftDiv.appendChild(titleSpan);
      row.appendChild(leftDiv);

      // Right: Stima, Tempo Reale, Orologio, Elimina
      const rightDiv = document.createElement("div");
      rightDiv.className = "todo-item-right";

      if (item.estimated_minutes > 0) {
        const est = document.createElement("span");
        est.className = "time-badge est";
        est.textContent = `⏱️ ${item.estimated_minutes}m`;
        est.title = "Tempo stimato per questo compito";
        rightDiv.appendChild(est);
      }

      if (item.actual_minutes > 0) {
        const isOver = item.estimated_minutes > 0 && item.actual_minutes > item.estimated_minutes;
        const act = document.createElement("span");
        act.className = `time-badge ${isOver ? 'act-over' : 'act-good'}`;
        act.textContent = isOver 
          ? `⚠️ ${item.actual_minutes}m (+${item.actual_minutes - item.estimated_minutes}m)` 
          : `⌛ ${item.actual_minutes}m`;
        act.title = isOver ? "Tempo effettivo superiore alla stima" : "Tempo impiegato";
        rightDiv.appendChild(act);
      }

      // Pulsante Orologio Visivo
      const isRunning = TaskTimer.isTimerRunning(item.id);
      const timerBtn = document.createElement("button");
      timerBtn.type = "button";
      timerBtn.className = `btn-pomodoro-timer ${isRunning ? 'running' : ''}`;
      timerBtn.innerHTML = `<span>⏰</span> <span>${isRunning ? 'Orologio Attivo...' : 'Orologio'}</span>`;
      timerBtn.title = "Avvia l'orologio visivo con conto alla rovescia";
      timerBtn.addEventListener("click", () => {
        TaskTimer.openModal(item, {
          name: item.subject_name,
          icon: item.category_icon || '📚',
          color: item.category_color || '#3b82f6'
        });
      });
      rightDiv.appendChild(timerBtn);

      // Pulsante Elimina Compito
      const delBtn = document.createElement("button");
      delBtn.type = "button";
      delBtn.className = "btn-task-del";
      delBtn.innerHTML = "✕";
      delBtn.title = "Elimina questo compito";
      delBtn.addEventListener("click", async () => {
        if (!confirm(`Vuoi eliminare il compito "${item.title}"?`)) return;
        try {
          await API.deleteTodoItem(item.id);
          await this.renderDailySchedule();
        } catch (e) {
          console.error(e);
        }
      });
      rightDiv.appendChild(delBtn);

      row.appendChild(rightDiv);
      container.appendChild(row);
    });
  }
};

window.Calendar = Calendar;
