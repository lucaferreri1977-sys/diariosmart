/**
 * Applicazione Principale FamilyCal
 * Gestione dello stato dell'interfaccia, eventi, modali, to-do lists multiple e permessi.
 */
const App = {
  currentUser: null,
  categories: [],
  users: [],
  currentEventDetail: null,

  async init() {
    window.onUnauthorized = () => {
      if (this._isLoggingIn) return;
      this.showLoginScreen();
    };
    this.bindGlobalEvents();
    await this.checkAuth();
  },

  bindGlobalEvents() {
    // Gestione chiusura modali con click su pulsanti o sfondo
    document.querySelectorAll("[data-close-modal]").forEach(btn => {
      btn.addEventListener("click", () => {
        const modalId = btn.getAttribute("data-close-modal");
        this.closeModal(modalId);
      });
    });

    document.querySelectorAll(".modal-backdrop").forEach(modal => {
      modal.addEventListener("click", (e) => {
        if (e.target === modal && modal.id !== "authModal") {
          this.closeModal(modal.id);
        }
      });
    });

    // Schermata di Login Separata: Azioni (password obbligatoria per entrambi i profili)
    document.getElementById("childLoginForm")?.addEventListener("submit", (e) => {
      e.preventDefault();
      const input = document.getElementById("childLoginPassword");
      this.quickLogin("giulio", input?.value || "", input);
    });

    document.getElementById("parentLoginForm")?.addEventListener("submit", (e) => {
      e.preventDefault();
      const input = document.getElementById("parentLoginPassword");
      this.quickLogin("genitore", input?.value || "", input);
    });

    // Azioni Hero Banner Dashboard Genitore
    document.getElementById("btnParentQuickAssign")?.addEventListener("click", () => {
      this.openCreateEventModal(Calendar.formatDateIso(new Date()));
    });
    document.getElementById("btnParentViewAgenda")?.addEventListener("click", () => {
      this.switchView("agenda");
    });

    // Click su Logo Brand: torna alla pagina iniziale (Visione Giornaliera di Oggi)
    document.getElementById("brandHomeBtn")?.addEventListener("click", () => {
      Calendar.currentDate = new Date();
      Calendar.selectedSubjectEventId = null;
      this.switchView("agenda");
      Calendar.refresh();
      document.querySelectorAll(".modal-backdrop").forEach(m => m.classList.add("hidden"));
    });

    // Switch viste calendario / statistiche
    document.querySelectorAll(".view-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        const view = btn.getAttribute("data-view");
        this.switchView(view);
      });
    });

    // Modale Dettaglio Evento: Azioni
    document.getElementById("btnAddTodoList")?.addEventListener("click", () => this.promptAddTodoList());

    // Pulsante Logout
    document.getElementById("btnLogout")?.addEventListener("click", () => this.handleLogout());

    // Form Nuova Categoria
    document.getElementById("newCategoryForm")?.addEventListener("submit", (e) => this.handleNewCategorySubmit(e));

    // Gestione Aggiungi Materia (solo Dashboard Genitore)
    document.getElementById("btnParentAddSubject")?.addEventListener("click", () => {
      this.openSubjectModal();
    });

    document.getElementById("subjectForm")?.addEventListener("submit", (e) => {
      this.handleSubjectFormSubmit(e);
    });
  },

  showToast(message, icon = "✅") {
    // Evita notifiche duplicate entro 2.5 secondi
    const now = Date.now();
    if (this._lastToastMsg === message && (now - (this._lastToastTime || 0)) < 2500) {
      return;
    }
    this._lastToastMsg = message;
    this._lastToastTime = now;

    const container = document.getElementById("toastContainer");
    if (!container) return;
    const toast = document.createElement("div");
    toast.className = "toast";
    toast.innerHTML = `<span>${icon}</span> <span>${message}</span>`;
    container.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = "0";
      toast.style.transform = "translateX(50px)";
      toast.style.transition = "all 0.3s ease";
      setTimeout(() => toast.remove(), 300);
    }, 3200);
  },

  openModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
      modal.classList.remove("hidden");
      modal.style.display = "flex";
    }
  },

  closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
      modal.classList.add("hidden");
      modal.style.display = "none";
    }
    if (modalId === "eventDetailModal") {
      this.currentEventDetail = null;
      Calendar.refresh(); // Ricarica il calendario per aggiornare i contatori
    }
  },

  showLoginScreen() {
    const ls = document.getElementById("loginScreen");
    const as = document.getElementById("appShell");
    if (ls) ls.classList.remove("hidden");
    if (as) as.classList.add("hidden");
    const err = document.getElementById("loginScreenError");
    if (err) err.classList.add("hidden");
  },

  hideLoginScreen() {
    const ls = document.getElementById("loginScreen");
    const as = document.getElementById("appShell");
    if (ls) ls.classList.add("hidden");
    if (as) as.classList.remove("hidden");
  },

  async checkAuth() {
    const token = API.getToken();
    const hasExplicitlyLoggedOut = sessionStorage.getItem("user_explicit_logout") === "true";

    // Nessun accesso automatico: senza una sessione valida si mostra la schermata di login con password
    if (hasExplicitlyLoggedOut || !token) {
      this.showLoginScreen();
      return;
    }

    try {
      const res = await API.getMe();
      if (res.ok && res.user) {
        this.setUser(res.user);
        this.hideLoginScreen();
        await this.loadInitialData();
      } else {
        API.clearSession();
        this.showLoginScreen();
      }
    } catch (e) {
      console.error(e);
      API.clearSession();
      this.showLoginScreen();
    }
  },

  _isLoggingIn: false,

  async quickLogin(username, password, passwordInput = null) {
    if (this._isLoggingIn) return;
    this._isLoggingIn = true;

    const screenErr = document.getElementById("loginScreenError");
    if (screenErr) screenErr.classList.add("hidden");

    if (!password) {
      if (screenErr) {
        screenErr.textContent = "Inserisci la password.";
        screenErr.classList.remove("hidden");
      }
      passwordInput?.focus();
      this._isLoggingIn = false;
      return;
    }

    const submitBtns = [
      document.getElementById("btnLoginAsChild"),
      document.getElementById("btnLoginAsParent"),
      document.getElementById("btnLoginSubmit")
    ].filter(Boolean);

    submitBtns.forEach(b => {
      b.disabled = true;
      b.dataset.prevHtml = b.innerHTML;
      b.innerHTML = `<span>⏳ Accesso in corso...</span>`;
    });

    try {
      const res = await API.login(username, password);
      if (res.ok) {
        if (passwordInput) passwordInput.value = "";
        sessionStorage.removeItem("user_explicit_logout");
        this.setUser(res.user);
        this.hideLoginScreen();
        this.closeModal("authModal");
        this.showToast(`Benvenuto, ${res.user.display_name}!`, "👋");
        await this.loadInitialData();
        if (res.user.role === "parent") {
          this.switchView("stats");
        } else {
          const now = new Date();
          if (now.getDay() === 0) {
            Calendar.currentDate = new Date(now);
            Calendar.currentDate.setDate(now.getDate() + 1);
          } else if (now.getDay() === 6) {
            Calendar.currentDate = new Date(now);
            Calendar.currentDate.setDate(now.getDate() + 2);
          }
          this.switchView("agenda");
        }
      }
    } catch (err) {
      if (screenErr) {
        screenErr.textContent = "Password errata. Riprova.";
        screenErr.classList.remove("hidden");
      }
      if (passwordInput) {
        passwordInput.value = "";
        passwordInput.focus();
      }
    } finally {
      this._isLoggingIn = false;
      submitBtns.forEach(b => {
        b.disabled = false;
        if (b.dataset.prevHtml) {
          b.innerHTML = b.dataset.prevHtml;
        }
      });
    }
  },

  async handleLoginSubmit(e) {
    e.preventDefault();
    const u = document.getElementById("loginUsername")?.value.trim() || "";
    const pInput = document.getElementById("loginPassword");
    await this.quickLogin(u, pInput?.value || "", pInput);
  },

  async handleLogout() {
    await API.logout();
    this.currentUser = null;
    sessionStorage.setItem("user_explicit_logout", "true");
    this.showLoginScreen();
  },

  setUser(user) {
    this.currentUser = user;
    const isParent = user.role === "parent";

    // Aggiorna Navbar: solo il nome testuale, senza immagini né emoji
    const nameEl = document.getElementById("userName");
    if (nameEl) nameEl.textContent = user.display_name;

    // Gestione visibilità Tab Dashboard Genitore
    const tabStats = document.getElementById("tabStats");
    if (tabStats) {
      tabStats.style.display = isParent ? "" : "none";
    }

    // Gestione elementi riservati ai genitori
    document.querySelectorAll(".parent-only").forEach(el => {
      el.style.display = isParent ? "" : "none";
    });
  },

  openSubjectModal() {
    this.openModal("subjectModal");

    const nameInput = document.getElementById("subjectNameInput");
    if (nameInput) nameInput.value = "";
    
    // Preseleziona il giorno attualmente visualizzato nella dashboard o oggi (Lunedì - Venerdì)
    const daySelect = document.getElementById("subjectDaySelect");
    if (daySelect) {
      let currentDay = (window.StatsDashboard && window.StatsDashboard.selectedDayOfWeek) || (new Date().getDay());
      if (currentDay < 1 || currentDay > 5) currentDay = 1;
      daySelect.value = String(currentDay);
    }
    
    const startInput = document.getElementById("subjectStartTimeInput");
    if (startInput) startInput.value = "08:00";
    
    const endInput = document.getElementById("subjectEndTimeInput");
    if (endInput) endInput.value = "09:00";
    
    const recCheck = document.getElementById("subjectRecurringCheck");
    if (recCheck) recCheck.checked = true;

    setTimeout(() => {
      nameInput?.focus();
    }, 50);
  },

  async handleSubjectFormSubmit(e) {
    e.preventDefault();
    if (this.currentUser?.role !== "parent") {
      alert("Solo il profilo genitore può gestire le materie.");
      return;
    }

    const name = document.getElementById("subjectNameInput")?.value.trim();
    const dayOfWeek = parseInt(document.getElementById("subjectDaySelect")?.value || "1");
    const startTime = document.getElementById("subjectStartTimeInput")?.value || "08:00";
    const endTime = document.getElementById("subjectEndTimeInput")?.value || "09:00";
    const isRecurring = document.getElementById("subjectRecurringCheck")?.checked !== false;

    if (!name) {
      alert("Inserisci il nome della materia.");
      return;
    }

    const saveBtn = document.getElementById("btnSaveSubject");
    if (saveBtn) {
      saveBtn.disabled = true;
      saveBtn.textContent = "Salvataggio...";
    }

    try {
      if (isRecurring) {
        await API.addTimetableSlot({
          day_of_week: dayOfWeek,
          subject_name: name,
          start_time: startTime,
          end_time: endTime
        });
        this.showToast(`Materia "${name}" aggiunta all'orario settimanale!`, "📚");
      } else {
        // Evento singolo per il giorno scelto
        const today = new Date();
        const currentDow = today.getDay() === 0 ? 7 : today.getDay();
        let diffDays = (dayOfWeek - currentDow);
        if (diffDays < 0) diffDays += 7;
        const targetDate = new Date(today);
        targetDate.setDate(targetDate.getDate() + diffDays);
        const dateIso = Calendar.formatDateIso(targetDate);

        let childUser = (this.users || []).find(u => u.role === "child" || u.username === "giulio");
        await API.createEvent({
          title: name,
          description: `Materia programmata (${startTime} - ${endTime})`,
          event_date: dateIso,
          start_time: startTime,
          end_time: endTime,
          is_all_day: false,
          assigned_to_user_id: childUser ? childUser.id : this.currentUser.id,
          is_recurring_weekly: false,
          repeat_weeks: 1
        });
        this.showToast(`Materia "${name}" aggiunta come evento per ${dateIso}!`, "📅");
      }

      window.closeSubjectModal();
      if (window.StatsDashboard) {
        window.StatsDashboard.selectedDayOfWeek = dayOfWeek;
        await window.StatsDashboard.refresh();
      }
      if (window.Calendar) {
        await window.Calendar.refresh();
      }
    } catch (err) {
      alert("Errore durante il salvataggio della materia: " + err.message);
    } finally {
      if (saveBtn) {
        saveBtn.disabled = false;
        saveBtn.textContent = "Salva Materia";
      }
    }
  },

  async loadInitialData() {
    try {
      const [catsRes, usersRes] = await Promise.all([
        API.getCategories(),
        API.getUsers()
      ]);

      if (catsRes.ok) {
        this.categories = catsRes.categories;
        Calendar.categories = catsRes.categories;
        this.renderCategoryFilters();
      }

      if (usersRes.ok) {
        this.users = usersRes.users;
      }

      // Inizializza calendario e viste
      Calendar.init();
      StatsDashboard.init();

      if (this.currentUser?.role === "parent") {
        this.switchView("stats");
      } else {
        const now = new Date();
        if (now.getDay() === 0) {
          Calendar.currentDate = new Date(now);
          Calendar.currentDate.setDate(now.getDate() + 1);
        } else if (now.getDay() === 6) {
          Calendar.currentDate = new Date(now);
          Calendar.currentDate.setDate(now.getDate() + 2);
        }
        this.switchView("agenda");
      }
    } catch (e) {
      console.error("Errore caricamento dati iniziali:", e);
    }
  },

  switchView(viewName) {
    if (viewName === "month") viewName = "agenda";

    document.querySelectorAll(".view-btn").forEach(b => {
      b.classList.toggle("active", b.getAttribute("data-view") === viewName);
    });

    document.querySelectorAll(".view-container").forEach(c => c.classList.remove("active"));

    if (viewName === "week") {
      document.getElementById("viewWeek")?.classList.add("active");
      Calendar.currentView = "week";
      Calendar.refresh();
    } else if (viewName === "stats") {
      document.getElementById("viewStats")?.classList.add("active");
      StatsDashboard.refresh();
    } else {
      // Default: agenda (Giorno)
      document.getElementById("viewAgenda")?.classList.add("active");
      Calendar.currentView = "agenda";
      Calendar.refresh();
    }
  },

  renderCategoryFilters() {
    const list = document.getElementById("categoryFilterList");
    if (!list) return;

    list.innerHTML = `
      <button class="cat-filter-btn ${Calendar.selectedCategoryId === null ? 'active' : ''}" data-cat-id="">
        <span>📚 Tutte le Materie</span>
      </button>
    `;

    this.categories.forEach(cat => {
      const btn = document.createElement("button");
      btn.className = `cat-filter-btn ${Calendar.selectedCategoryId === cat.id ? 'active' : ''}`;
      btn.innerHTML = `
        <span><span class="cat-filter-dot" style="background:${cat.color};"></span>${cat.icon} ${cat.name}</span>
      `;
      btn.addEventListener("click", () => {
        Calendar.selectedCategoryId = cat.id;
        this.renderCategoryFilters();
        Calendar.refresh();
      });
      list.appendChild(btn);
    });

    list.querySelector("[data-cat-id='']")?.addEventListener("click", () => {
      Calendar.selectedCategoryId = null;
      this.renderCategoryFilters();
      Calendar.refresh();
    });
  },

  // ==================== GESTIONE EVENTI ====================
  openCreateEventModal(defaultDate = null) {
    document.getElementById("eventFormTitle").textContent = "Nuovo Evento nel Calendario";
    document.getElementById("eventFormId").value = "";
    document.getElementById("eventTitleInput").value = "";
    document.getElementById("eventDateInput").value = defaultDate || Calendar.formatDateIso(new Date());
    document.getElementById("eventStartTimeInput").value = "15:00";
    document.getElementById("eventEndTimeInput").value = "16:30";

    // Reset cadenza settimanale
    const recCheck = document.getElementById("eventRecurringWeeklyCheck");
    if (recCheck) recCheck.checked = false;
    const recRow = document.getElementById("recurringWeeksRow");
    if (recRow) recRow.style.display = "none";
    const recSelect = document.getElementById("repeatWeeksSelect");
    if (recSelect) recSelect.value = "8";

    this.openModal("eventFormModal");
  },

  async handleEventFormSubmit(e) {
    e.preventDefault();
    const eventId = document.getElementById("eventFormId").value;
    const isRecurring = document.getElementById("eventRecurringWeeklyCheck")?.checked || false;
    const repeatWeeks = parseInt(document.getElementById("repeatWeeksSelect")?.value || 1);

    // Assegna automaticamente a Giulio (figlio) se presente, o all'utente corrente
    let assignedUserId = this.currentUser?.id;
    const childUser = (this.users || []).find(u => u.role === "child");
    if (childUser) {
      assignedUserId = childUser.id;
    }

    const payload = {
      title: document.getElementById("eventTitleInput").value.trim(),
      category_id: null,
      assigned_to_user_id: assignedUserId,
      event_date: document.getElementById("eventDateInput").value,
      is_all_day: false,
      start_time: document.getElementById("eventStartTimeInput")?.value || "15:00",
      end_time: document.getElementById("eventEndTimeInput")?.value || "16:30",
      description: "",
      is_recurring_weekly: isRecurring,
      repeat_weeks: isRecurring ? repeatWeeks : 1
    };

    try {
      if (eventId) {
        if (this.currentEventDetail?.is_recurring_weekly) {
          const updateAll = confirm("Questo evento fa parte di una serie settimanale.\n\nVuoi aggiornare anche tutti i futuri eventi ricorrenti di questa serie?");
          payload.update_all_recurring = updateAll;
        }
        await API.updateEvent(eventId, payload);
        this.showToast("Evento aggiornato con successo!", "✏️");
      } else {
        const res = await API.createEvent(payload);
        if (isRecurring) {
          this.showToast(`Programmati ${repeatWeeks} eventi settimanali! 🔁`, "📅");
        } else {
          this.showToast("Nuovo evento aggiunto al calendario!", "📅");
        }
        // Apri subito il dettaglio del nuovo evento per permettere di compilare la to-do list
        if (res.id) {
          this.closeModal("eventFormModal");
          await Calendar.refresh();
          await this.openEventDetailModal(res.id);
          return;
        }
      }
      this.closeModal("eventFormModal");
      await Calendar.refresh();
    } catch (err) {
      alert("Errore salvataggio evento: " + err.message);
    }
  },

  // ==================== MODALE DETTAGLIO EVENTO & MULTIPLE TO-DO LISTS ====================
  async openEventDetailModal(eventId) {
    try {
      const res = await API.getEventDetails(eventId);
      if (!res.ok || !res.event) {
        alert("Impossibile caricare i dettagli dell'evento.");
        return;
      }

      this.currentEventDetail = res.event;
      this.renderEventDetailModal(res.event);
      this.openModal("eventDetailModal");
    } catch (err) {
      console.error("Errore caricamento dettagli evento:", err);
    }
  },

  renderEventDetailModal(ev) {
    // Header & Meta
    const badge = document.getElementById("modalEventCategoryBadge");
    badge.textContent = `${ev.category_icon || '📚'} ${ev.category_name || 'Generale'}`;
    badge.style.backgroundColor = ev.category_color || "var(--primary)";

    document.getElementById("modalEventTitle").textContent = ev.title;
    
    const timeStr = ev.is_all_day ? "Tutto il giorno" : `${ev.start_time || ''} - ${ev.end_time || ''}`;
    const recStr = ev.is_recurring_weekly ? " • 🔁 Cadenza Settimanale" : "";
    document.getElementById("modalEventMeta").textContent = `📅 ${ev.event_date} • 🕒 ${timeStr} • 👤 Assegnato a: ${ev.assigned_to_name}${recStr}`;

    const descEl = document.getElementById("modalEventDescription");
    if (ev.description) {
      descEl.textContent = ev.description;
      descEl.style.display = "block";
    } else {
      descEl.style.display = "none";
    }

    // Totali e avanzamento
    let totalTasks = 0;
    let completedTasks = 0;
    let estMinTotal = 0;
    let actMinTotal = 0;

    (ev.lists || []).forEach(l => {
      (l.items || []).forEach(i => {
        totalTasks++;
        if (i.completed) completedTasks++;
        estMinTotal += (i.estimated_minutes || 0);
        actMinTotal += (i.actual_minutes || 0);
      });
    });

    document.getElementById("modalEventTaskCounts").textContent = `${completedTasks}/${totalTasks} completati`;
    document.getElementById("modalEventEstTotal").textContent = `Stimato: ${TaskTimer.formatMinutesHuman(estMinTotal)}`;
    document.getElementById("modalEventActTotal").textContent = `Impiegato: ${TaskTimer.formatMinutesHuman(actMinTotal)}`;

    // Renderizza Liste To-Do
    const container = document.getElementById("modalTodoListsContainer");
    container.innerHTML = "";

    if (!ev.lists || ev.lists.length === 0) {
      container.innerHTML = `
        <div style="text-align:center; padding: 20px; background:#f8fafc; border-radius: var(--radius-md);">
          <p class="text-muted" style="margin-bottom:10px;">Nessuna lista di compiti creata per questo evento.</p>
          <button class="btn-primary btn-sm" onclick="App.promptAddTodoList()">+ Crea la prima To-Do List</button>
        </div>
      `;
      return;
    }

    ev.lists.forEach(list => {
      const block = document.createElement("div");
      block.className = "todo-list-block";

      // Intestazione Lista
      const titleRow = document.createElement("div");
      titleRow.className = "todo-list-title-row";
      titleRow.innerHTML = `
        <div class="todo-list-title">
          <span>📋</span> <span>${list.title}</span>
          <span style="font-size:11px; color:var(--text-muted); font-weight:normal;">(${list.items ? list.items.length : 0} compiti)</span>
        </div>
        <div style="display:flex; gap:6px;">
          <button class="btn-ghost btn-sm btn-delete-list text-danger" title="Elimina questa lista">🗑️</button>
        </div>
      `;

      titleRow.querySelector(".btn-delete-list").addEventListener("click", () => {
        if (confirm(`Vuoi eliminare la lista "${list.title}" e tutti i suoi compiti?`)) {
          this.deleteTodoList(list.id);
        }
      });

      block.appendChild(titleRow);

      // Elenco Compiti (Items)
      const itemsList = document.createElement("div");
      itemsList.className = "todo-items-list";

      (list.items || []).forEach(item => {
        const itemCard = this.createTodoItemElement(item, list.id);
        itemsList.appendChild(itemCard);
      });

      block.appendChild(itemsList);

      // Form Aggiunta Nuovo Compito in questa Lista
      const addRow = document.createElement("form");
      addRow.className = "add-task-row";
      addRow.innerHTML = `
        <input type="text" class="form-control" placeholder="Aggiungi compito (es. Esercizi pag. 50 n. 1-4)..." required>
        <div class="time-input-wrap" title="Minuti stimati per completare questo compito">
          <input type="number" class="form-control" placeholder="Stima" min="0" step="5" value="20">
          <span class="unit">min</span>
        </div>
        <button type="submit" class="btn-secondary btn-sm">+ Aggiungi</button>
      `;

      addRow.addEventListener("submit", async (e) => {
        e.preventDefault();
        const titleInput = addRow.querySelector("input[type='text']");
        const timeInput = addRow.querySelector("input[type='number']");
        const title = titleInput.value.trim();
        const estMin = parseInt(timeInput.value || 0);

        if (!title) return;

        try {
          await API.createTodoItem(list.id, {
            title,
            estimated_minutes: estMin,
            actual_minutes: 0,
            notes: ""
          });
          this.showToast("Compito aggiunto!", "✅");
          await this.reloadCurrentEventDetail();
        } catch (err) {
          alert("Errore aggiunta compito: " + err.message);
        }
      });

      block.appendChild(addRow);
      container.appendChild(block);
    });
  },

  createTodoItemElement(item, listId) {
    const card = document.createElement("div");
    card.className = `todo-item-card ${item.completed ? 'completed' : ''}`;
    card.id = `todo-item-${item.id}`;

    // Sinistra: Checkbox e Titolo
    const left = document.createElement("div");
    left.className = "todo-item-left";

    const chk = document.createElement("input");
    chk.type = "checkbox";
    chk.className = "todo-checkbox";
    chk.checked = !!item.completed;
    chk.addEventListener("change", async () => {
      try {
        await API.toggleTodoItem(item.id, chk.checked);
        if (chk.checked) {
          this.showToast("Compito completato! Bravissimo! 🎉", "🌟");
        }
        await this.reloadCurrentEventDetail();
      } catch (err) {
        chk.checked = !chk.checked;
        alert("Errore aggiornamento compito: " + err.message);
      }
    });

    const info = document.createElement("div");
    info.className = "todo-item-info";

    const titleSpan = document.createElement("span");
    titleSpan.className = "todo-item-title";
    titleSpan.textContent = item.title;

    info.appendChild(titleSpan);
    if (item.notes) {
      const noteSpan = document.createElement("span");
      noteSpan.className = "todo-item-notes";
      noteSpan.textContent = item.notes;
      info.appendChild(noteSpan);
    }

    left.appendChild(chk);
    left.appendChild(info);
    card.appendChild(left);

    // Destra: Badge Tempi & Cronometro
    const right = document.createElement("div");
    right.className = "todo-item-right";

    // Badge stima vs reale
    const badges = document.createElement("div");
    badges.className = "time-badges";

    // Badge Stima
    const estBadge = document.createElement("span");
    estBadge.className = "time-badge est";
    estBadge.title = "Tempo stimato assegnato";
    estBadge.innerHTML = `⏱️ ${item.estimated_minutes || 0}m st.`;
    badges.appendChild(estBadge);

    // Badge Reale & Scostamento
    const actBadge = document.createElement("span");
    const diff = (item.actual_minutes || 0) - (item.estimated_minutes || 0);
    
    if (item.actual_minutes > 0) {
      if (item.estimated_minutes > 0 && diff > 0) {
        actBadge.className = "time-badge act-over";
        actBadge.title = `Superato di ${diff} minuti rispetto alla stima`;
        actBadge.innerHTML = `⌛ ${item.actual_minutes}m (+${diff}m)`;
      } else if (item.estimated_minutes > 0 && diff < 0) {
        actBadge.className = "time-badge act-good";
        actBadge.title = `Completato in ${Math.abs(diff)} minuti in meno!`;
        actBadge.innerHTML = `⚡ ${item.actual_minutes}m (${diff}m)`;
      } else {
        actBadge.className = "time-badge act-good";
        actBadge.innerHTML = `⌛ ${item.actual_minutes}m imp.`;
      }
    } else {
      actBadge.className = "time-badge est";
      actBadge.innerHTML = `⌛ 0m imp.`;
    }

    // Permetti al genitore o al figlio di modificare manualmente i minuti effettivi con un click
    actBadge.style.cursor = "pointer";
    actBadge.title += " (Clicca per modificare manualmente i minuti)";
    actBadge.addEventListener("click", () => this.promptEditActualMinutes(item));

    badges.appendChild(actBadge);
    right.appendChild(badges);

    // Widget Orologio Visivo
    const timerWidget = document.createElement("div");
    timerWidget.className = "visual-clock-widget";

    const targetMinutes = item.estimated_minutes > 0 ? item.estimated_minutes : 25;
    const initialRemainingMin = targetMinutes;
    
    // Contenitore Mini Orologio SVG (mostra il conto alla rovescia)
    const clockHolder = document.createElement("div");
    clockHolder.className = "mini-clock-holder";
    clockHolder.title = "Clicca per ingrandire l'Orologio Visivo!";
    clockHolder.innerHTML = TaskTimer.generateClockSVG(initialRemainingMin, 54, {
      idPrefix: `item_${item.id}`,
      targetMinutes: targetMinutes,
      showCase: true
    });

    // Cliccando sull'orologio si apre la modale grande
    clockHolder.addEventListener("click", () => {
      TaskTimer.openModal(item, {
        name: this.currentEventDetail?.category_name,
        icon: this.currentEventDetail?.category_icon
      });
    });

    // Colonna info tempo digitale & bottoni
    const timerControlsCol = document.createElement("div");
    timerControlsCol.className = "timer-controls-col";

    const digitalRow = document.createElement("div");
    digitalRow.className = "timer-digital-row";

    const ticker = document.createElement("span");
    ticker.className = "timer-ticker";
    ticker.textContent = TaskTimer.formatDuration(targetMinutes * 60);

    digitalRow.appendChild(ticker);

    const btnRow = document.createElement("div");
    btnRow.className = "timer-buttons-row";

    const playBtn = document.createElement("button");
    playBtn.type = "button";
    playBtn.className = "btn-clock-action btn-clock-play";
    playBtn.title = "Avvia conto alla rovescia";
    playBtn.innerHTML = "▶️";

    const pauseBtn = document.createElement("button");
    pauseBtn.type = "button";
    pauseBtn.className = "btn-clock-action btn-clock-pause hidden";
    pauseBtn.title = "Metti in pausa";
    pauseBtn.innerHTML = "⏸️";

    const stopBtn = document.createElement("button");
    stopBtn.type = "button";
    stopBtn.className = "btn-clock-action btn-clock-stop hidden";
    stopBtn.title = "Ferma orologio e salva tempo effettivo";
    stopBtn.innerHTML = "⏹️";

    const expandBtn = document.createElement("button");
    expandBtn.type = "button";
    expandBtn.className = "btn-clock-action btn-clock-expand";
    expandBtn.title = "Ingrandisci orologio a tutto schermo";
    expandBtn.innerHTML = "🔍";
    expandBtn.addEventListener("click", () => {
      TaskTimer.openModal(item, {
        name: this.currentEventDetail?.category_name,
        icon: this.currentEventDetail?.category_icon
      });
    });

    // Funzione tick per aggiornare ticker e orologio SVG inline nel conto alla rovescia
    const handleTick = (formattedCountdown, remainingSec, remainingMin, elapsedSec, isOvertime) => {
      ticker.textContent = (isOvertime ? "+" : "") + formattedCountdown;
      ticker.style.color = isOvertime ? "var(--danger)" : "var(--text-main)";
      clockHolder.innerHTML = TaskTimer.generateClockSVG(remainingMin, 54, {
        idPrefix: `item_${item.id}`,
        targetMinutes: targetMinutes,
        isOvertime: isOvertime,
        showCase: true
      });
    };

    // Controlla se il timer è attivo
    const timerState = TaskTimer.getTimerState(item.id);
    if (item.timer_started_at || (timerState && !timerState.isPaused)) {
      playBtn.classList.add("hidden");
      pauseBtn.classList.remove("hidden");
      stopBtn.classList.remove("hidden");
      timerWidget.classList.add("running");

      TaskTimer.start(item.id, targetMinutes, item.timer_started_at, handleTick);
    }

    playBtn.addEventListener("click", async () => {
      playBtn.classList.add("hidden");
      pauseBtn.classList.remove("hidden");
      stopBtn.classList.remove("hidden");
      timerWidget.classList.add("running");

      this.showToast(`Conto alla rovescia avviato da ${targetMinutes}m! Guarda il disco rosso ritirarsi!`, "⏳");

      await TaskTimer.start(item.id, targetMinutes, null, handleTick);
    });

    pauseBtn.addEventListener("click", () => {
      TaskTimer.pause(item.id);
      pauseBtn.classList.add("hidden");
      playBtn.classList.remove("hidden");
      timerWidget.classList.remove("running");
    });

    stopBtn.addEventListener("click", async () => {
      timerWidget.classList.remove("running");
      playBtn.classList.remove("hidden");
      pauseBtn.classList.add("hidden");
      stopBtn.classList.add("hidden");

      const updated = await TaskTimer.stop(item.id);
      this.showToast(`Tempo effettivo registrato: ${updated.actual_minutes} minuti!`, "💾");
      await this.reloadCurrentEventDetail();
    });

    btnRow.appendChild(playBtn);
    btnRow.appendChild(pauseBtn);
    btnRow.appendChild(stopBtn);
    btnRow.appendChild(expandBtn);

    timerControlsCol.appendChild(digitalRow);
    timerControlsCol.appendChild(btnRow);

    timerWidget.appendChild(clockHolder);
    timerWidget.appendChild(timerControlsCol);
    right.appendChild(timerWidget);

    // Elimina Task
    const delTaskBtn = document.createElement("button");
    delTaskBtn.className = "btn-ghost btn-sm text-danger";
    delTaskBtn.title = "Elimina compito";
    delTaskBtn.textContent = "✕";
    delTaskBtn.addEventListener("click", async () => {
      if (confirm(`Eliminare il compito "${item.title}"?`)) {
        await API.deleteTodoItem(item.id);
        await this.reloadCurrentEventDetail();
      }
    });
    right.appendChild(delTaskBtn);

    card.appendChild(right);
    return card;
  },

  async promptEditActualMinutes(item) {
    const current = item.actual_minutes || 0;
    const newVal = prompt(`Modifica i minuti effettivamente impiegati per:\n"${item.title}"\n(Valore attuale: ${current} min)`, current);
    if (newVal !== null && !isNaN(parseInt(newVal))) {
      try {
        await API.updateTodoItem(item.id, { actual_minutes: parseInt(newVal) });
        this.showToast("Tempo effettivo aggiornato!", "⏱️");
        await this.reloadCurrentEventDetail();
      } catch (err) {
        alert("Errore aggiornamento tempo: " + err.message);
      }
    }
  },

  async promptAddTodoList() {
    if (!this.currentEventDetail) return;
    const title = prompt("Inserisci il nome della nuova lista per questo evento:\n(es. 'Compiti scritti', 'Studio orale', 'Materiali da portare')", "Nuova Lista Compiti");
    if (title && title.trim()) {
      try {
        await API.createTodoList(this.currentEventDetail.id, title.trim());
        this.showToast("Nuova lista aggiunta all'evento!", "📋");
        await this.reloadCurrentEventDetail();
      } catch (err) {
        alert("Errore creazione lista: " + err.message);
      }
    }
  },

  async deleteTodoList(listId) {
    try {
      await API.deleteTodoList(listId);
      this.showToast("Lista eliminata", "🗑️");
      await this.reloadCurrentEventDetail();
    } catch (err) {
      alert("Errore eliminazione lista: " + err.message);
    }
  },

  async reloadCurrentEventDetail() {
    if (!this.currentEventDetail) return;
    const res = await API.getEventDetails(this.currentEventDetail.id);
    if (res.ok && res.event) {
      this.currentEventDetail = res.event;
      this.renderEventDetailModal(res.event);
    }
  },

  handleEditCurrentEvent() {
    if (!this.currentEventDetail) return;
    const ev = this.currentEventDetail;
    this.closeModal("eventDetailModal");

    document.getElementById("eventFormTitle").textContent = "Modifica Evento";
    document.getElementById("eventFormId").value = ev.id;
    document.getElementById("eventTitleInput").value = ev.title;
    document.getElementById("eventDateInput").value = ev.event_date;
    document.getElementById("eventStartTimeInput").value = ev.start_time || "15:00";
    document.getElementById("eventEndTimeInput").value = ev.end_time || "16:30";

    this.openModal("eventFormModal");
  },

  async handleDeleteCurrentEvent() {
    if (!this.currentEventDetail) return;
    const ev = this.currentEventDetail;

    if (ev.is_recurring_weekly && ev.recurrence_group_id) {
      const choice = confirm(`Questo evento fa parte di una serie con cadenza settimanale.\n\nPremi OK per eliminare TUTTI gli eventi futuri di questa serie.\nPremi ANNULLA se invece desideri eliminare solo questo specifico evento.`);
      if (choice) {
        try {
          await API.deleteEvent(ev.id, true);
          this.showToast("Tutti gli eventi futuri della serie sono stati eliminati", "🗑️");
          this.closeModal("eventDetailModal");
          await Calendar.refresh();
          return;
        } catch (err) {
          alert("Errore eliminazione serie: " + err.message);
          return;
        }
      } else {
        const singleChoice = confirm(`Vuoi eliminare SOLO l'evento di questa data (${ev.event_date})?`);
        if (!singleChoice) return;
      }
    } else {
      if (!confirm(`Sei sicuro di voler eliminare l'evento "${ev.title}" e tutti i suoi compiti?`)) {
        return;
      }
    }

    try {
      await API.deleteEvent(ev.id, false);
      this.showToast("Evento eliminato con successo", "🗑️");
      this.closeModal("eventDetailModal");
      await Calendar.refresh();
    } catch (err) {
      alert("Errore eliminazione evento: " + err.message);
    }
  },

  // ==================== GESTIONE CATEGORIE / MATERIE ====================
  openCategoriesModal() {
    this.renderCategoriesManagementList();
    this.openModal("categoriesModal");
  },

  renderCategoriesManagementList() {
    const list = document.getElementById("categoryManagementList");
    if (!list) return;
    list.innerHTML = "";

    this.categories.forEach(cat => {
      const row = document.createElement("div");
      row.className = "cat-manage-item";
      row.innerHTML = `
        <div style="display:flex; align-items:center; gap:8px;">
          <span style="font-size:18px;">${cat.icon}</span>
          <span style="display:inline-block; width:12px; height:12px; border-radius:50%; background:${cat.color};"></span>
          <strong>${cat.name}</strong>
        </div>
        <button class="btn-ghost btn-sm text-danger btn-del-cat" title="Elimina materia">🗑️</button>
      `;

      row.querySelector(".btn-del-cat").addEventListener("click", async () => {
        if (confirm(`Eliminare la materia "${cat.name}"?`)) {
          try {
            await API.deleteCategory(cat.id);
            this.showToast("Materia eliminata", "🗑️");
            const res = await API.getCategories();
            if (res.ok) {
              this.categories = res.categories;
              Calendar.categories = res.categories;
              this.renderCategoryFilters();
              this.renderCategoriesManagementList();
              Calendar.refresh();
            }
          } catch (e) {
            alert("Errore eliminazione: " + e.message);
          }
        }
      });

      list.appendChild(row);
    });
  },

  async handleNewCategorySubmit(e) {
    e.preventDefault();
    const name = document.getElementById("newCatName").value.trim();
    const icon = document.getElementById("newCatIcon").value.trim() || "📚";
    const color = document.getElementById("newCatColor").value;

    if (!name) return;

    try {
      await API.createCategory({ name, icon, color });
      this.showToast(`Materia "${name}" aggiunta!`, "🎨");
      document.getElementById("newCatName").value = "";

      const res = await API.getCategories();
      if (res.ok) {
        this.categories = res.categories;
        Calendar.categories = res.categories;
        this.renderCategoryFilters();
        this.renderCategoriesManagementList();
        Calendar.refresh();
      }
    } catch (err) {
      alert("Errore creazione materia: " + err.message);
    }
  },

  // ==================== GESTIONE ORARIO SCOLASTICO SETTIMANALE ====================
  currentTimetableDay: 1, // 1 = Lunedì ... 6 = Sabato
  timetableSlots: [],

  async openTimetableModal() {
    this.openModal("timetableModal");
    try {
      const res = await API.getTimetable();
      if (res.ok && res.timetable) {
        this.timetableSlots = res.timetable;
      }
      this.currentTimetableDay = 1;
      this.renderTimetableModal();
    } catch (e) {
      console.error("Errore caricamento orario:", e);
    }
  },

  renderTimetableModal() {
    // 1. Aggiorna tab giorni
    document.querySelectorAll(".tt-day-tab").forEach(tab => {
      const d = parseInt(tab.dataset.day);
      tab.classList.toggle("active", d === this.currentTimetableDay);
    });

    // 2. Filtra slot per il giorno selezionato
    const daySlots = this.timetableSlots.filter(s => parseInt(s.day_of_week) === this.currentTimetableDay);
    daySlots.sort((a, b) => parseInt(a.period_number) - parseInt(b.period_number));

    const list = document.getElementById("timetableSlotsList");
    if (!list) return;
    list.innerHTML = "";

    if (daySlots.length === 0) {
      list.innerHTML = `
        <div style="padding: 24px; text-align: center; color: var(--text-muted); font-size: 13px;">
          Nessuna ora programmata per questo giorno. Clicca su "+ Aggiungi Ora di Lezione" per impostarla.
        </div>
      `;
      return;
    }

    daySlots.forEach((slot, idx) => {
      const row = document.createElement("div");
      row.className = "timetable-slot-row";
      row.dataset.slotIndex = idx;

      // Select categorie options
      let catOptions = `<option value="">-- Seleziona Materia --</option>`;
      this.categories.forEach(c => {
        const sel = (slot.category_id && slot.category_id === c.id) || (slot.subject_name && slot.subject_name.toLowerCase() === c.name.toLowerCase()) ? "selected" : "";
        catOptions += `<option value="${c.id}" ${sel}>${c.icon} ${c.name}</option>`;
      });

      row.innerHTML = `
        <div style="width: 80px; font-weight: 800; font-size: 13px; color: var(--text-main);">
          ${slot.period_number}ª Ora
        </div>
        <div style="width: 140px; display: flex; gap: 4px; align-items: center;">
          <input type="time" class="form-control tt-input-start" style="padding: 4px 6px; font-size: 12px; width: 68px;" value="${slot.start_time || '08:00'}" />
          <span>-</span>
          <input type="time" class="form-control tt-input-end" style="padding: 4px 6px; font-size: 12px; width: 68px;" value="${slot.end_time || '09:00'}" />
        </div>
        <div style="flex: 1;">
          <select class="form-select tt-select-cat" style="padding: 5px 8px; font-size: 13px;">
            ${catOptions}
          </select>
        </div>
        <div style="width: 150px;">
          <input type="text" class="form-control tt-input-room" placeholder="es. Aula 2B" style="padding: 5px 8px; font-size: 12px;" value="${slot.room || ''}" />
        </div>
        <div style="width: 60px; text-align: center;">
          <button type="button" class="btn-task-del tt-btn-remove" title="Rimuovi questa ora">🗑️</button>
        </div>
      `;

      // Eventi di cambio
      const catSelect = row.querySelector(".tt-select-cat");
      catSelect.addEventListener("change", (e) => {
        const catId = parseInt(e.target.value) || null;
        const found = this.categories.find(c => c.id === catId);
        slot.category_id = catId;
        slot.subject_name = found ? found.name : "Materia";
      });

      row.querySelector(".tt-input-start").addEventListener("change", (e) => {
        slot.start_time = e.target.value;
      });
      row.querySelector(".tt-input-end").addEventListener("change", (e) => {
        slot.end_time = e.target.value;
      });
      row.querySelector(".tt-input-room").addEventListener("input", (e) => {
        slot.room = e.target.value;
      });

      row.querySelector(".tt-btn-remove").addEventListener("click", () => {
        this.timetableSlots = this.timetableSlots.filter(s => s !== slot);
        // Rinumera le ore rimaste per questo giorno
        const remaining = this.timetableSlots.filter(s => parseInt(s.day_of_week) === this.currentTimetableDay);
        remaining.sort((a, b) => parseInt(a.period_number) - parseInt(b.period_number));
        remaining.forEach((s, i) => s.period_number = i + 1);
        this.renderTimetableModal();
      });

      list.appendChild(row);
    });
  },

  addTimetablePeriodRow() {
    const daySlots = this.timetableSlots.filter(s => parseInt(s.day_of_week) === this.currentTimetableDay);
    const nextPeriod = daySlots.length + 1;
    
    // Calcola orario indicativo in base all'ora precedente
    let defaultStart = "08:00";
    let defaultEnd = "09:00";
    if (daySlots.length > 0) {
      const last = daySlots[daySlots.length - 1];
      defaultStart = last.end_time || "09:00";
      const parts = defaultStart.split(":");
      const nextH = Math.min(18, parseInt(parts[0]) + 1);
      defaultEnd = `${String(nextH).padStart(2, '0')}:${parts[1] || '00'}`;
    }

    const firstCat = this.categories[0];
    this.timetableSlots.push({
      day_of_week: this.currentTimetableDay,
      period_number: nextPeriod,
      category_id: firstCat ? firstCat.id : 1,
      subject_name: firstCat ? firstCat.name : "Matematica",
      start_time: defaultStart,
      end_time: defaultEnd,
      room: "Aula 2B"
    });

    this.renderTimetableModal();
  },

  async resetTimetableDefaults() {
    if (!confirm("Vuoi ripristinare l'orario scolastico standard predefinito (Lunedì-Venerdì, 5 ore al giorno)?")) return;
    try {
      const defaultSlots = [
        // Lunedì
        { day_of_week: 1, period_number: 1, category_id: 1, subject_name: "Matematica", start_time: "08:00", end_time: "09:00", room: "Aula 2B" },
        { day_of_week: 1, period_number: 2, category_id: 1, subject_name: "Matematica", start_time: "09:00", end_time: "10:00", room: "Aula 2B" },
        { day_of_week: 1, period_number: 3, category_id: 2, subject_name: "Italiano", start_time: "10:00", end_time: "11:00", room: "Aula 2B" },
        { day_of_week: 1, period_number: 4, category_id: 3, subject_name: "Inglese", start_time: "11:15", end_time: "12:15", room: "Lab Lingue" },
        { day_of_week: 1, period_number: 5, category_id: 5, subject_name: "Storia", start_time: "12:15", end_time: "13:15", room: "Aula 2B" },
        // Martedì
        { day_of_week: 2, period_number: 1, category_id: 2, subject_name: "Italiano", start_time: "08:00", end_time: "09:00", room: "Aula 2B" },
        { day_of_week: 2, period_number: 2, category_id: 2, subject_name: "Italiano", start_time: "09:00", end_time: "10:00", room: "Aula 2B" },
        { day_of_week: 2, period_number: 3, category_id: 4, subject_name: "Scienze", start_time: "10:00", end_time: "11:00", room: "Lab Scienze" },
        { day_of_week: 2, period_number: 4, category_id: 5, subject_name: "Geografia", start_time: "11:15", end_time: "12:15", room: "Aula 2B" },
        { day_of_week: 2, period_number: 5, category_id: 7, subject_name: "Arte", start_time: "12:15", end_time: "13:15", room: "Aula Arte" },
        // Mercoledì
        { day_of_week: 3, period_number: 1, category_id: 1, subject_name: "Matematica", start_time: "08:00", end_time: "09:00", room: "Aula 2B" },
        { day_of_week: 3, period_number: 2, category_id: 4, subject_name: "Scienze", start_time: "09:00", end_time: "10:00", room: "Lab Scienze" },
        { day_of_week: 3, period_number: 3, category_id: 3, subject_name: "Inglese", start_time: "10:00", end_time: "11:00", room: "Lab Lingue" },
        { day_of_week: 3, period_number: 4, category_id: 2, subject_name: "Italiano", start_time: "11:15", end_time: "12:15", room: "Aula 2B" },
        { day_of_week: 3, period_number: 5, category_id: 6, subject_name: "Scienze Motorie", start_time: "12:15", end_time: "13:15", room: "Palestra" },
        // Giovedì
        { day_of_week: 4, period_number: 1, category_id: 5, subject_name: "Storia", start_time: "08:00", end_time: "09:00", room: "Aula 2B" },
        { day_of_week: 4, period_number: 2, category_id: 2, subject_name: "Italiano", start_time: "09:00", end_time: "10:00", room: "Aula 2B" },
        { day_of_week: 4, period_number: 3, category_id: 1, subject_name: "Matematica", start_time: "10:00", end_time: "11:00", room: "Aula 2B" },
        { day_of_week: 4, period_number: 4, category_id: 3, subject_name: "Inglese", start_time: "11:15", end_time: "12:15", room: "Lab Lingue" },
        { day_of_week: 4, period_number: 5, category_id: 4, subject_name: "Tecnologia", start_time: "12:15", end_time: "13:15", room: "Aula 2B" },
        // Venerdì
        { day_of_week: 5, period_number: 1, category_id: 2, subject_name: "Italiano", start_time: "08:00", end_time: "09:00", room: "Aula 2B" },
        { day_of_week: 5, period_number: 2, category_id: 1, subject_name: "Matematica", start_time: "09:00", end_time: "10:00", room: "Aula 2B" },
        { day_of_week: 5, period_number: 3, category_id: 7, subject_name: "Musica", start_time: "10:00", end_time: "11:00", room: "Aula Musica" },
        { day_of_week: 5, period_number: 4, category_id: 6, subject_name: "Scienze Motorie", start_time: "11:15", end_time: "12:15", room: "Palestra" },
        { day_of_week: 5, period_number: 5, category_id: 8, subject_name: "Studio Guidato", start_time: "12:15", end_time: "13:15", room: "Aula 2B" }
      ];

      await API.saveTimetable(defaultSlots);
      this.timetableSlots = defaultSlots;
      this.renderTimetableModal();
      this.showToast("Orario standard ripristinato con successo!", "🎒");
      await Calendar.renderDailySchedule();
    } catch (err) {
      alert("Errore nel ripristino dell'orario: " + err.message);
    }
  },

  async saveTimetableModal() {
    try {
      await API.saveTimetable(this.timetableSlots);
      this.closeModal("timetableModal");
      this.showToast("Orario scolastico settimanale salvato!", "💾");
      await Calendar.renderDailySchedule();
    } catch (err) {
      alert("Errore nel salvataggio dell'orario: " + err.message);
    }
  }
};

// Hook globale per errori 401
window.onUnauthorized = () => {
  if (window.App && window.App._isLoggingIn) return;
  if (window.App && typeof window.App.showLoginScreen === "function") {
    window.App.showLoginScreen();
  }
};

// Funzioni globali di aggancio
window.App = App;
window.openSubjectModal = () => App.openSubjectModal();
window.openEventDetailModal = (id) => App.openEventDetailModal(id);
window.openCreateEventModal = (date) => App.openCreateEventModal(date);

document.addEventListener("DOMContentLoaded", () => {
  App.init();
});
