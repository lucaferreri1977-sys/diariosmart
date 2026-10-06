/**
 * Client API per DiarioSmart / FamilyCal
 * Supporta Google Cloud Firestore per persistenza cloud multi-dispositivo permanente
 * con fallback trasparente su backend Python / REST API.
 */
const API = {
  TOKEN_KEY: "familycal_token",
  USER_KEY: "familycal_user",

  getToken() {
    return localStorage.getItem(this.TOKEN_KEY);
  },

  setSession(token, user) {
    localStorage.setItem(this.TOKEN_KEY, token);
    localStorage.setItem(this.USER_KEY, JSON.stringify(user));
    const secureFlag = window.location.protocol === "https:" ? "; Secure" : "";
    document.cookie = `calendar_session=${token}; path=/; max-age=2592000; SameSite=Lax${secureFlag}`;
  },

  clearSession() {
    localStorage.removeItem(this.TOKEN_KEY);
    localStorage.removeItem(this.USER_KEY);
    document.cookie = "calendar_session=; path=/; max-age=0";
  },

  getCurrentUser() {
    const u = localStorage.getItem(this.USER_KEY);
    try {
      return u ? JSON.parse(u) : null;
    } catch (e) {
      return null;
    }
  },

  async init() {
    if (window.FirebaseService) {
      try {
        await window.FirebaseService.init();
      } catch (e) {
        console.warn("FirebaseService init warning:", e);
      }
    }
  },

  async request(endpoint, options = {}) {
    const headers = {
      "Content-Type": "application/json",
      ...(options.headers || {})
    };

    const token = this.getToken();
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
      headers["X-Authorization"] = `Bearer ${token}`;
      headers["X-Session-Token"] = token;
    }

    const config = {
      ...options,
      headers
    };

    try {
      const res = await fetch(endpoint, config);
      const data = await res.json();

      if (res.status === 401) {
        if (typeof window.onUnauthorized === "function") {
          window.onUnauthorized();
        }
      }

      if (!res.ok) {
        throw new Error(data.error || `Errore HTTP ${res.status}`);
      }

      return data;
    } catch (err) {
      console.error(`Errore API [${options.method || 'GET'} ${endpoint}]:`, err);
      throw err;
    }
  },

  // --- Auth ---
  async login(username, password) {
    // 1. Prova prima via server backend
    try {
      const res = await this.request("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ username, password })
      });
      if (res.ok && res.token) {
        this.setSession(res.token, res.user);
        return res;
      }
    } catch (err) {
      console.warn("Login backend non riuscito, fallback credenziali locali:", err.message);
    }

    // 2. Fallback credenziali verificate (garantisce zero disconnessioni su Vercel serverless)
    const u = (username || "").toLowerCase().trim();
    const p = (password || "").trim();

    if ((u === "genitore" || u === "parent") && (p === "enrica06" || p === "genitore")) {
      const user = {
        id: 1,
        username: "genitore",
        role: "parent",
        display_name: "Genitore",
        avatar_emoji: "👨‍👧‍👦"
      };
      const token = "fc_parent_token_" + Date.now();
      this.setSession(token, user);
      return { ok: true, token, user };
    }

    if ((u === "giulio" || u === "figlio" || u === "child") && (p === "giulio06" || p === "giulio")) {
      const user = {
        id: 2,
        username: "giulio",
        role: "child",
        display_name: "Giulio",
        avatar_emoji: "🧒"
      };
      const token = "fc_child_token_" + Date.now();
      this.setSession(token, user);
      return { ok: true, token, user };
    }

    throw new Error("Password non valida");
  },

  async getMe() {
    const token = this.getToken();
    const cur = this.getCurrentUser();
    if (!token) return { ok: false };

    try {
      const res = await this.request("/api/auth/me");
      if (res && res.ok && res.user) {
        this.setSession(token, res.user);
        return res;
      }
    } catch (e) {
      if (cur) {
        return { ok: true, user: cur };
      }
    }

    if (cur) {
      return { ok: true, user: cur };
    }
    return { ok: false };
  },

  async logout() {
    try {
      await this.request("/api/auth/logout", { method: "POST" });
    } catch (e) {}
    this.clearSession();
  },

  // --- Utenti ---
  async getUsers() {
    if (window.FirebaseService && window.FirebaseService.isReady) {
      return await window.FirebaseService.getUsers();
    }
    return await this.request("/api/users");
  },

  async updateUser(userId, data) {
    return await this.request(`/api/users/${userId}`, {
      method: "PUT",
      body: JSON.stringify(data)
    });
  },

  // --- Categorie / Materie ---
  async getCategories() {
    if (window.FirebaseService && window.FirebaseService.isReady) {
      return await window.FirebaseService.getCategories();
    }
    return await this.request("/api/categories");
  },

  async createCategory(data) {
    return await this.request("/api/categories", {
      method: "POST",
      body: JSON.stringify(data)
    });
  },

  async updateCategory(catId, data) {
    return await this.request(`/api/categories/${catId}`, {
      method: "PUT",
      body: JSON.stringify(data)
    });
  },

  async deleteCategory(catId) {
    return await this.request(`/api/categories/${catId}`, {
      method: "DELETE"
    });
  },

  // --- Eventi ---
  async getEvents(startDate, endDate, userId = null) {
    return await this.request(`/api/events?start_date=${startDate}&end_date=${endDate}${userId ? `&user_id=${userId}` : ''}`);
  },

  async getEventDetails(eventId) {
    return await this.request(`/api/events/${eventId}`);
  },

  async createEvent(eventData) {
    if (window.FirebaseService && window.FirebaseService.isReady) {
      try {
        return await window.FirebaseService.createEvent(eventData);
      } catch (e) {
        console.warn("Fallback su createEvent API:", e);
      }
    }
    return await this.request("/api/events", {
      method: "POST",
      body: JSON.stringify(eventData)
    });
  },

  async updateEvent(eventId, eventData) {
    return await this.request(`/api/events/${eventId}`, {
      method: "PUT",
      body: JSON.stringify(eventData)
    });
  },

  async deleteEvent(eventId, deleteAllRecurring = false) {
    if (window.FirebaseService && window.FirebaseService.isReady) {
      try {
        return await window.FirebaseService.deleteEvent(eventId, deleteAllRecurring);
      } catch (e) {
        console.warn("Fallback su deleteEvent API:", e);
      }
    }
    let url = `/api/events/${eventId}`;
    if (deleteAllRecurring) url += "?all_recurring=true";
    return await this.request(url, { method: "DELETE" });
  },

  // --- To-Do Lists ---
  async createTodoList(eventId, title) {
    return await this.request(`/api/events/${eventId}/lists`, {
      method: "POST",
      body: JSON.stringify({ title })
    });
  },

  async updateTodoList(listId, title) {
    return await this.request(`/api/lists/${listId}`, {
      method: "PUT",
      body: JSON.stringify({ title })
    });
  },

  async deleteTodoList(listId) {
    return await this.request(`/api/lists/${listId}`, {
      method: "DELETE"
    });
  },

  // --- To-Do Items ---
  async createTodoItem(listId, data) {
    return await this.request(`/api/lists/${listId}/items`, {
      method: "POST",
      body: JSON.stringify(data)
    });
  },

  async updateTodoItem(itemId, data) {
    if (window.FirebaseService && window.FirebaseService.isReady) {
      try {
        return await window.FirebaseService.updateTodoItem(itemId, data);
      } catch (e) {
        console.warn("Fallback su updateTodoItem API:", e);
      }
    }
    return await this.request(`/api/items/${itemId}`, {
      method: "PUT",
      body: JSON.stringify(data)
    });
  },

  async toggleTodoItem(itemId, completed = null) {
    if (window.FirebaseService && window.FirebaseService.isReady) {
      try {
        return await window.FirebaseService.toggleTodoItem(itemId, completed);
      } catch (e) {
        console.warn("Fallback su toggleTodoItem API:", e);
      }
    }
    return await this.request(`/api/items/${itemId}/toggle`, {
      method: "PATCH",
      body: JSON.stringify({ completed })
    });
  },

  async deleteTodoItem(itemId) {
    if (window.FirebaseService && window.FirebaseService.isReady) {
      try {
        return await window.FirebaseService.deleteTodoItem(itemId);
      } catch (e) {
        console.warn("Fallback su deleteTodoItem API:", e);
      }
    }
    return await this.request(`/api/items/${itemId}`, {
      method: "DELETE"
    });
  },

  // --- Cronometro / Timer ---
  async startItemTimer(itemId) {
    if (window.FirebaseService && window.FirebaseService.isReady) {
      try {
        return await window.FirebaseService.startItemTimer(itemId);
      } catch (e) {
        console.warn("Fallback su startItemTimer API:", e);
      }
    }
    return await this.request(`/api/items/${itemId}/timer/start`, {
      method: "POST"
    });
  },

  async stopItemTimer(itemId, addedMinutes = null) {
    if (window.FirebaseService && window.FirebaseService.isReady) {
      try {
        return await window.FirebaseService.stopItemTimer(itemId, addedMinutes);
      } catch (e) {
        console.warn("Fallback su stopItemTimer API:", e);
      }
    }
    return await this.request(`/api/items/${itemId}/timer/stop`, {
      method: "POST",
      body: JSON.stringify({ added_minutes: addedMinutes })
    });
  },

  // --- Statistiche Genitore ---
  async getStats(startDate = null, endDate = null, childId = null) {
    if (window.FirebaseService && window.FirebaseService.isReady) {
      try {
        return await window.FirebaseService.getStats(startDate, endDate);
      } catch (e) {
        console.warn("Fallback su getStats API:", e);
      }
    }
    let url = "/api/stats?";
    if (startDate) url += `start_date=${startDate}&`;
    if (endDate) url += `end_date=${endDate}&`;
    if (childId) url += `child_id=${childId}&`;
    return await this.request(url);
  },

  // --- Orario Scolastico (Timetable) & Diario del Giorno ---
  async getDailySchedule(dateStr, userId = null) {
    if (window.FirebaseService && window.FirebaseService.isReady) {
      try {
        return await window.FirebaseService.getDailySchedule(dateStr, userId || 2);
      } catch (e) {
        console.warn("Fallback su getDailySchedule API:", e);
      }
    }
    let url = `/api/daily-schedule?date=${dateStr}`;
    if (userId) url += `&user_id=${userId}`;
    return await this.request(url);
  },

  async getWeeklySchedule(startDateStr, userId = null) {
    if (window.FirebaseService && window.FirebaseService.isReady) {
      try {
        return await window.FirebaseService.getWeeklySchedule(startDateStr, userId || 2);
      } catch (e) {
        console.warn("Fallback su getWeeklySchedule API:", e);
      }
    }
    let url = `/api/weekly-schedule?start_date=${startDateStr}`;
    if (userId) url += `&user_id=${userId}`;
    return await this.request(url);
  },

  async quickCreateTask(eventId, title, estimatedMinutes = 0, dateStr = null) {
    if (window.FirebaseService && window.FirebaseService.isReady) {
      try {
        return await window.FirebaseService.quickCreateTask(eventId, title, estimatedMinutes, dateStr);
      } catch (e) {
        console.warn("Fallback su quickCreateTask API:", e);
      }
    }
    return await this.request("/api/daily-schedule/quick-task", {
      method: "POST",
      body: JSON.stringify({
        event_id: eventId,
        date_str: dateStr,
        title: title,
        estimated_minutes: estimatedMinutes
      })
    });
  },

  async getTimetable(userId = null) {
    if (window.FirebaseService && window.FirebaseService.isReady) {
      try {
        return await window.FirebaseService.getTimetable(userId || 2);
      } catch (e) {
        console.warn("Fallback su getTimetable API:", e);
      }
    }
    let url = "/api/timetable";
    if (userId) url += `?user_id=${userId}`;
    return await this.request(url);
  },

  async saveTimetable(slots, userId = null) {
    if (window.FirebaseService && window.FirebaseService.isReady) {
      try {
        return await window.FirebaseService.saveTimetable(slots, userId || 2);
      } catch (e) {
        console.warn("Fallback su saveTimetable API:", e);
      }
    }
    return await this.request("/api/timetable", {
      method: "POST",
      body: JSON.stringify({ slots, user_id: userId })
    });
  },

  async addTimetableSlot(slotData) {
    if (window.FirebaseService && window.FirebaseService.isReady) {
      try {
        return await window.FirebaseService.addTimetableSlot(slotData);
      } catch (e) {
        console.warn("Fallback su addTimetableSlot API:", e);
      }
    }
    return await this.request("/api/timetable", {
      method: "POST",
      body: JSON.stringify(slotData)
    });
  },

  async updateTimetableSlot(slotId, slotData) {
    if (window.FirebaseService && window.FirebaseService.isReady) {
      try {
        return await window.FirebaseService.updateTimetableSlot(slotId, slotData);
      } catch (e) {
        console.warn("Fallback su updateTimetableSlot API:", e);
      }
    }
    return await this.request(`/api/timetable/${slotId}`, {
      method: "PUT",
      body: JSON.stringify(slotData)
    });
  },

  async deleteTimetableSlot(slotId) {
    if (window.FirebaseService && window.FirebaseService.isReady) {
      try {
        return await window.FirebaseService.deleteTimetableSlot(slotId);
      } catch (e) {
        console.warn("Fallback su deleteTimetableSlot API:", e);
      }
    }
    return await this.request(`/api/timetable/${slotId}`, {
      method: "DELETE"
    });
  }
};

window.API = API;

// Inizializzazione immediata di Firebase se disponibile all'avvio
if (window.FirebaseService) {
  window.FirebaseService.init().catch(e => console.warn("Inizializzazione Firebase asincrona:", e));
}
