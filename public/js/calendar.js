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

    // Pulsante Reset Filtro per tornare alla visione di tutti i todo del giorno
    document.getElementById("btnResetTodosFilter")?.addEventListener("click", () => {
      this.selectedSubjectEventId = null;
      if (this._lastSchedule) {
        this.renderDailyEventsColumn(this._lastSchedule);
        this.updateQuickTaskPlaceholder(this._lastSchedule);
        this.renderDailyTodosColumn(this._lastSchedule);
        this.updateDailyKpis(this._lastSchedule);
      }
    });

    // Form aggiunta to-do rapido nella colonna destra
    const quickForm = document.getElementById("dailyQuickTaskForm");
    quickForm?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const titleInput = document.getElementById("quickTaskTitleInput");
      const estInput = document.getElementById("quickTaskEstInput") || document.getElementById("quickTaskEstSelect");

      const title = titleInput?.value.trim();
      const estMin = Math.max(1, parseInt(estInput?.value || 25) || 25);
      const dateStr = this.formatDateIso(this.currentDate);
      let eventId = this.selectedSubjectEventId;
      if (!eventId && this._lastSchedule?.subjects?.length > 0) {
        eventId = this._lastSchedule.subjects[0].event_id;
      }

      if (!title) return;

      titleInput.value = "";
      titleInput.disabled = true;

      try {
        await API.quickCreateTask(eventId || 0, title, estMin, dateStr);
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
      if (!res.ok || !res.week) {
        container.innerHTML = `<div style="text-align:center; padding:30px; color:var(--text-muted); grid-column:1/-1;">Nessun dato disponibile per questa settimana</div>`;
        return;
      }

      container.innerHTML = "";

      res.week.forEach(day => {
        const isToday = day.date === todayStr;
        const col = document.createElement("div");
        col.className = `week-day-column ${isToday ? 'is-today' : ''}`;

        // Header del giorno (parsing data a mezzogiorno per evitare sfalsamenti di fuso orario)
        const parts = day.date.split("-").map(Number);
        const dayDateObj = new Date(parts[0], parts[1] - 1, parts[2], 12, 0, 0);
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

        const openDayInAgenda = () => {
          this.currentDate = new Date(parts[0], parts[1] - 1, parts[2], 12, 0, 0);
          this.selectedSubjectEventId = null;
          if (typeof window.App?.switchView === "function") {
            window.App.switchView("agenda");
          }
        };

        header.addEventListener("click", openDayInAgenda);
        col.appendChild(header);

        // Corpo della colonna con materie e relativi to-do
        const dayBody = document.createElement("div");
        dayBody.className = "week-day-body";

        // Cliccando sul corpo del giorno si apre la vista dettagliata di quel giorno
        dayBody.addEventListener("click", (e) => {
          if (e.target.closest("input") || e.target.closest("button") || e.target.closest(".week-subject-header")) return;
          openDayInAgenda();
        });

        const renderedTaskIds = new Set();
        const daySubjects = day.subjects || [];

        // Filtra eventuali eventi straordinari non ancora inclusi in daySubjects per evitare duplicazioni
        const renderedEventIds = new Set(
          daySubjects.map(s => String(s.event_id || s.slot_id || s.id || ""))
            .filter(id => id && id !== "null" && id !== "undefined")
        );

        const extraEventsToRender = (day.extra_events || []).filter(ex => {
          const exId = String(ex.event_id || ex.id || "");
          if (exId && renderedEventIds.has(exId)) return false;
          const exName = (ex.subject_name || ex.title || "").toLowerCase().trim();
          if (!exName) return false;
          return !daySubjects.some(s => {
            const sName = (s.subject_name || s.title || "").toLowerCase().trim();
            return sName === exName && s.start_time === ex.start_time;
          });
        });

        if (daySubjects.length === 0 && extraEventsToRender.length === 0) {
          const emptyDiv = document.createElement("div");
          emptyDiv.className = "week-day-empty-msg";
          emptyDiv.style.cursor = "pointer";
          emptyDiv.innerHTML = day.is_weekend 
            ? `<span>Nessun evento o materia</span><br><span style="font-size:11px; color:var(--primary); font-weight:700; margin-top:4px; display:inline-block;">Apri giorno →</span>`
            : `<span>Nessuna materia in programma</span><br><span style="font-size:11px; color:var(--primary); font-weight:700; margin-top:4px; display:inline-block;">Apri giorno →</span>`;
          dayBody.appendChild(emptyDiv);
        } else {
          // Elenco Materie con i to-do sotto ad ogni materia
          daySubjects.forEach(sub => {
            const card = document.createElement("div");
            card.className = "week-subject-card";
            card.style.borderTop = `3px solid ${sub.category_color || '#3b82f6'}`;

            // Header materia
            const subHeader = document.createElement("div");
            subHeader.className = "week-subject-header";
            const displayName = sub.subject_name || sub.title || "Materia";
            const timeStr = `${sub.start_time || '08:00'}${sub.end_time ? ' - ' + sub.end_time : ''}`;
            subHeader.title = `${displayName} (${timeStr}) - Clicca per aprire nel diario del giorno`;
            const iconSpan = sub.category_icon ? `<span class="week-subject-icon">${sub.category_icon}</span>` : '<span class="week-subject-icon">📚</span>';
            subHeader.innerHTML = `
              <div class="week-subject-header-title">
                ${iconSpan}<span class="week-subject-name">${displayName}</span>
              </div>
              <span class="week-subject-header-time">🕒 ${timeStr}</span>
            `;
            subHeader.addEventListener("click", (e) => {
              e.stopPropagation();
              this.currentDate = new Date(parts[0], parts[1] - 1, parts[2], 12, 0, 0);
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
                row.title = `${task.title} (Apri nel diario del giorno)`;
                row.style.cursor = "pointer";
                row.addEventListener("click", (e) => {
                  e.stopPropagation();
                  this.currentDate = new Date(parts[0], parts[1] - 1, parts[2], 12, 0, 0);
                  this.selectedSubjectEventId = sub.event_id || null;
                  if (typeof window.App?.switchView === "function") {
                    window.App.switchView("agenda");
                  }
                });

                const indicator = document.createElement("span");
                indicator.className = `week-todo-indicator ${task.completed ? 'completed' : 'pending'}`;
                indicator.title = task.completed ? "Compito completato" : "Compito da fare";
                indicator.innerHTML = task.completed ? "✓" : "";

                const titleSpan = document.createElement("span");
                titleSpan.className = "week-sub-todo-title";
                titleSpan.textContent = task.title;

                row.appendChild(indicator);
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

          // Eventi straordinari/pomeridiani (solo se non già inclusi in daySubjects)
          if (extraEventsToRender.length > 0) {
            extraEventsToRender.forEach(ex => {
              const exTitle = ex.subject_name || ex.title || "Evento";
              const exTimeStr = `${ex.start_time || 'Extra'}${ex.end_time ? ' - ' + ex.end_time : ''}`;
              const exCard = document.createElement("div");
              exCard.className = "week-subject-card extra-event";
              exCard.style.borderTop = `3px solid ${ex.category_color || '#8b5cf6'}`;

              const exHeader = document.createElement("div");
              exHeader.className = "week-subject-header";
              exHeader.title = `${exTitle} (${exTimeStr}) - Clicca per aprire nel diario del giorno`;
              const exIcon = ex.category_icon || '🌟';
              exHeader.innerHTML = `
                <div class="week-subject-header-title">
                  <span class="week-subject-icon">${exIcon}</span>
                  <span class="week-subject-name">${exTitle}</span>
                </div>
                <span class="week-subject-header-time">🕒 ${exTimeStr}</span>
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
                  row.title = `${task.title} (Apri nel diario del giorno)`;
                  row.style.cursor = "pointer";
                  row.addEventListener("click", (e) => {
                    e.stopPropagation();
                    this.currentDate = new Date(parts[0], parts[1] - 1, parts[2], 12, 0, 0);
                    this.selectedSubjectEventId = ex.event_id || ex.id || null;
                    if (typeof window.App?.switchView === "function") {
                      window.App.switchView("agenda");
                    }
                  });

                  const indicator = document.createElement("span");
                  indicator.className = `week-todo-indicator ${task.completed ? 'completed' : 'pending'}`;
                  indicator.title = task.completed ? "Compito completato" : "Compito da fare";
                  indicator.innerHTML = task.completed ? "✓" : "";

                  const titleSpan = document.createElement("span");
                  titleSpan.className = "week-sub-todo-title";
                  titleSpan.textContent = task.title;

                  row.appendChild(indicator);
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
                <span class="week-subject-icon">📝</span>
                <span class="week-subject-name">Altri Compiti</span>
              </div>
            `;
            otherCard.appendChild(otherHeader);

            const otherBox = document.createElement("div");
            otherBox.className = "week-subject-todos";
            unrendered.forEach(task => {
              const row = document.createElement("div");
              row.className = `week-sub-todo-row ${task.completed ? 'completed' : ''}`;
              row.title = `${task.title} (Apri nel diario del giorno)`;
              row.style.cursor = "pointer";
              row.addEventListener("click", (e) => {
                e.stopPropagation();
                this.currentDate = new Date(parts[0], parts[1] - 1, parts[2], 12, 0, 0);
                this.selectedSubjectEventId = null;
                if (typeof window.App?.switchView === "function") {
                  window.App.switchView("agenda");
                }
              });

              const indicator = document.createElement("span");
              indicator.className = `week-todo-indicator ${task.completed ? 'completed' : 'pending'}`;
              indicator.title = task.completed ? "Compito completato" : "Compito da fare";
              indicator.innerHTML = task.completed ? "✓" : "";

              const titleSpan = document.createElement("span");
              titleSpan.className = "week-sub-todo-title";
              titleSpan.textContent = task.title;

              row.appendChild(indicator);
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

      const targetDate = new Date(iter.getFullYear(), iter.getMonth(), iter.getDate(), 12, 0, 0);
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

    // Aggiorna strip giorni della settimana se presente
    this.renderDailyWeekStrip();

    try {
      const res = await API.getDailySchedule(dateStr);
      if (!res.ok || !res.schedule) return;
      const sched = res.schedule;

      if (titleEl) {
        titleEl.textContent = `${sched.day_name} ${this.formatDateReadable(this.currentDate)}`;
      }

      this._lastSchedule = sched;
      const subjects = sched.subjects || [];
      // Se era selezionata una materia specifica, verifica che esista ancora
      if (this.selectedSubjectEventId) {
        const stillValid = subjects.some(s => String(s.event_id) === String(this.selectedSubjectEventId));
        if (!stillValid) {
          this.selectedSubjectEventId = null;
        }
      }

      // 1. Aggiorna Banner KPI / Strip per la materia attiva o per la giornata intera
      this.updateDailyKpis(sched);

      // 2. Popola COLONNA SINISTRA: Solo ed esclusivamente le Materie del Giorno + pulsante reset
      this.renderDailyEventsColumn(sched);

      // 3. Aggiorna Placeholder del Form Rapido Compito
      this.updateQuickTaskPlaceholder(sched);

      // 4. Popola COLONNA DESTRA: I To-Do (tutti della giornata o filtrati per la materia selezionata)
      this.renderDailyTodosColumn(sched);

    } catch (err) {
      console.error("Errore caricamento daily schedule:", err);
    }
  },

  updateDailyKpis(sched) {
    const subjects = sched.subjects || [];
    const currentSub = this.selectedSubjectEventId ? subjects.find(s => String(s.event_id) === String(this.selectedSubjectEventId)) : null;
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

    // Aggiorna visibilità e stato del pulsante per tornare a tutti i compiti
    const resetBtn = document.getElementById("btnResetTodosFilter");
    if (resetBtn) {
      if (this.selectedSubjectEventId) {
        resetBtn.classList.remove("hidden");
        resetBtn.innerHTML = "✕ Tutti i compiti";
        resetBtn.title = "Torna alla visione di tutti i compiti del giorno";
        resetBtn.onclick = (e) => {
          e.preventDefault();
          this.selectedSubjectEventId = null;
          this.renderDailyEventsColumn(sched);
          this.updateQuickTaskPlaceholder(sched);
          this.renderDailyTodosColumn(sched);
          this.updateDailyKpis(sched);
        };
      } else {
        resetBtn.classList.add("hidden");
      }
    }

    const subjects = sched.subjects || [];
    const isWeekend = (this.currentDate && (this.currentDate.getDay() === 0 || this.currentDate.getDay() === 6)) || sched.is_weekend || (sched.day_of_week === 6 || sched.day_of_week === 7);

    if (subjects.length === 0) {
      const curDow = sched.day_of_week || (this.currentDate ? (this.currentDate.getDay() === 0 ? 7 : this.currentDate.getDay()) : 1);
      container.innerHTML = `
        <div style="text-align: center; padding: 32px 12px; background: #f8fafc; border-radius: 12px; border: 1px dashed var(--border-color);">
          <span style="font-size: 32px; display: block; margin-bottom: 6px;">${isWeekend ? '🏖️' : '🎒'}</span>
          <p style="font-size: 13px; font-weight: 700; color: var(--text-main); margin: 0;">Nessuna materia o evento in programma per ${sched.day_name || 'questo giorno'}</p>
          <button type="button" class="btn-primary parent-only" onclick="window.openSubjectModal(${curDow})" style="margin-top: 12px; font-size: 12px; padding: 6px 12px;">➕ Aggiungi Materia o Evento</button>
        </div>
      `;
      return;
    }

    subjects.forEach(sub => {
      const card = document.createElement("div");
      const isSelected = String(this.selectedSubjectEventId) === String(sub.event_id);
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
          <span class="daily-event-time">🕒 ${sub.start_time}${sub.end_time ? ' - ' + sub.end_time : ''}</span>
        </div>
        <div class="daily-event-title-row">
          <span class="daily-event-name">${sub.category_icon ? `<span style="margin-right:6px;">${sub.category_icon}</span>` : ''}${sub.subject_name}</span>
          ${sub.room ? `<span class="subject-room-badge" style="font-size:10px;">${sub.room}</span>` : ''}
        </div>
        <div class="daily-event-bottom">
          <span class="${taskCountClass}">
            ${hasTasks ? `${stats.completed_tasks}/${stats.total_tasks} compiti ${allDone ? '✓' : ''}` : '0 compiti'}
          </span>
        </div>
      `;

      card.addEventListener("click", () => {
        // Toggle: se già selezionata torna alla visione di tutti i compiti del giorno
        if (String(this.selectedSubjectEventId) === String(sub.event_id)) {
          this.selectedSubjectEventId = null;
        } else {
          this.selectedSubjectEventId = sub.event_id;
        }
        this.renderDailyEventsColumn(sched);
        this.updateQuickTaskPlaceholder(sched);
        this.renderDailyTodosColumn(sched);
        this.updateDailyKpis(sched);
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
      input.placeholder = `Nessuna materia o evento in programma per ${sched.day_name || 'questo giorno'}`;
      input.disabled = true;
      if (quickForm) quickForm.style.opacity = "0.5";
      return;
    }

    input.disabled = false;
    if (quickForm) quickForm.style.opacity = "1";

    const currentSub = this.selectedSubjectEventId ? subjects.find(s => String(s.event_id) === String(this.selectedSubjectEventId)) : null;
    if (currentSub) {
      input.placeholder = `✏️ Aggiungi compito per ${currentSub.category_icon ? currentSub.category_icon + ' ' : ''}${currentSub.subject_name}...`;
    } else {
      input.placeholder = "✏️ Aggiungi un compito o esercizio da fare...";
    }
  },

  /**
   * Rende i to-do della MATERIA SELEZIONATA oppure di TUTTA LA GIORNATA nella COLONNA DESTRA
   */
  renderDailyTodosColumn(sched) {
    const container = document.getElementById("dailyUnifiedTodosList");
    const titleEl = document.getElementById("todosColTitle");
    if (!container) return;
    container.innerHTML = "";

    const subjects = sched.subjects || [];
    const isWeekend = (this.currentDate && (this.currentDate.getDay() === 0 || this.currentDate.getDay() === 6)) || sched.is_weekend || (sched.day_of_week === 6 || sched.day_of_week === 7);

    if (subjects.length === 0) {
      const curDow = sched.day_of_week || (this.currentDate ? (this.currentDate.getDay() === 0 ? 7 : this.currentDate.getDay()) : 1);
      if (titleEl) titleEl.textContent = `📝 Nessuna Materia o Evento • ${sched.day_name || ''}`;
      container.innerHTML = `
        <div style="text-align: center; padding: 40px 20px; background: #f8fafc; border-radius: 16px; border: 1px dashed var(--border-color);">
          <span style="font-size: 36px; display: block; margin-bottom: 8px;">${isWeekend ? '🏖️' : '🎒'}</span>
          <h4 style="font-size: 15px; font-weight: 700; color: var(--text-main);">Nessuna materia o evento in programma per ${sched.day_name || 'questo giorno'}</h4>
          <p style="font-size: 13px; color: var(--text-muted); margin-top: 6px; max-width: 380px; margin-left: auto; margin-right: auto;">
            ${isWeekend ? 'Aggiungi una materia o un evento per il fine settimana.' : 'Usa le frecce ‹ › o seleziona un giorno in alto per consultare o assegnare i compiti.'}
          </p>
          <button type="button" class="btn-primary parent-only" onclick="window.openSubjectModal(${curDow})" style="margin-top: 14px; font-size: 13px; padding: 7px 16px;">➕ Aggiungi Materia o Evento</button>
        </div>
      `;
      return;
    }

    let items = [];
    if (this.selectedSubjectEventId) {
      // 1. Filtrato per materia selezionata
      const currentSub = subjects.find(s => String(s.event_id) === String(this.selectedSubjectEventId));
      if (currentSub) {
        if (titleEl) {
          titleEl.innerHTML = `${currentSub.category_icon ? currentSub.category_icon + ' ' : '📝 '}Compiti di <span style="color:${currentSub.category_color || 'var(--primary)'}; font-weight:800;">${currentSub.subject_name}</span>`;
        }
        items = (sched.unified_todos || []).filter(i => 
          String(i.event_id) === String(currentSub.event_id) ||
          (i.subject_name && currentSub.subject_name && i.subject_name.toLowerCase().trim() === currentSub.subject_name.toLowerCase().trim())
        );

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
      }
    } else {
      // 2. Visione di TUTTI i compiti della giornata
      if (titleEl) {
        titleEl.textContent = `📝 Tutti i Compiti del Giorno • ${sched.day_name || ''}`;
      }
      items = sched.unified_todos || [];

      if (items.length === 0) {
        container.innerHTML = `
          <div style="text-align: center; padding: 40px 20px; background: #f8fafc; border-radius: 16px; border: 1px dashed var(--border-color);">
            <span style="font-size: 36px; display: block; margin-bottom: 8px;">🎉</span>
            <h4 style="font-size: 15px; font-weight: 700; color: var(--text-main);">Nessun compito registrato per ${sched.day_name || 'questo giorno'}</h4>
            <p style="font-size: 13px; color: var(--text-muted); margin-top: 4px; max-width: 400px; margin-left: auto; margin-right: auto;">
              Nessun esercizio assegnato per oggi. Puoi aggiungerne uno dal modulo in alto.
            </p>
          </div>
        `;
        return;
      }
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
      pill.innerHTML = `<span>${item.category_icon ? item.category_icon + ' ' : ''}${item.subject_name}</span>`;

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

      // Pulsante Modifica Compito (icona matita coerente con la ✕)
      const editBtn = document.createElement("button");
      editBtn.type = "button";
      editBtn.className = "btn-task-edit";
      editBtn.title = "Modifica questo compito";
      editBtn.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path>
        </svg>
      `;
      editBtn.addEventListener("click", () => {
        if (typeof window.openTaskEditModal === "function") {
          window.openTaskEditModal(item, sched);
        }
      });
      rightDiv.appendChild(editBtn);

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
