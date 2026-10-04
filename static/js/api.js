/**
 * Client API per FamilyCal
 * Gestione chiamate HTTP, autenticazione e token di sessione.
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
    // Imposta anche un cookie per comodità
    document.cookie = `calendar_session=${token}; path=/; max-age=604800; SameSite=Lax`;
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

  async request(endpoint, options = {}) {
    const headers = {
      "Content-Type": "application/json",
      ...(options.headers || {})
    };

    const token = this.getToken();
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }

    const config = {
      ...options,
      headers
    };

    try {
      const res = await fetch(endpoint, config);
      const data = await res.json();

      if (res.status === 401) {
        // Se non autorizzato, apri modale di login se non già sulla pagina di login
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
    const res = await this.request("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ username, password })
    });
    if (res.ok && res.token) {
      this.setSession(res.token, res.user);
    }
    return res;
  },

  async getMe() {
    return await this.request("/api/auth/me");
  },

  async logout() {
    try {
      await this.request("/api/auth/logout", { method: "POST" });
    } catch (e) {}
    this.clearSession();
  },

  // --- Utenti ---
  async getUsers() {
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
    let url = `/api/events?start_date=${startDate}&end_date=${endDate}`;
    if (userId) url += `&user_id=${userId}`;
    return await this.request(url);
  },

  async getEventDetails(eventId) {
    return await this.request(`/api/events/${eventId}`);
  },

  async createEvent(eventData) {
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
    let url = `/api/events/${eventId}`;
    if (deleteAllRecurring) url += "?all_recurring=true";
    return await this.request(url, {
      method: "DELETE"
    });
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
    return await this.request(`/api/items/${itemId}`, {
      method: "PUT",
      body: JSON.stringify(data)
    });
  },

  async toggleTodoItem(itemId, completed = null) {
    return await this.request(`/api/items/${itemId}/toggle`, {
      method: "PATCH",
      body: JSON.stringify({ completed })
    });
  },

  async deleteTodoItem(itemId) {
    return await this.request(`/api/items/${itemId}`, {
      method: "DELETE"
    });
  },

  // --- Cronometro / Timer ---
  async startItemTimer(itemId) {
    return await this.request(`/api/items/${itemId}/timer/start`, {
      method: "POST"
    });
  },

  async stopItemTimer(itemId, addedMinutes = null) {
    return await this.request(`/api/items/${itemId}/timer/stop`, {
      method: "POST",
      body: JSON.stringify({ added_minutes: addedMinutes })
    });
  },

  // --- Statistiche Genitore ---
  async getStats(startDate = null, endDate = null, childId = null) {
    let url = "/api/stats?";
    if (startDate) url += `start_date=${startDate}&`;
    if (endDate) url += `end_date=${endDate}&`;
    if (childId) url += `child_id=${childId}&`;
    return await this.request(url);
  },

  // --- Orario Scolastico (Timetable) & Diario del Giorno ---
  async getDailySchedule(dateStr, userId = null) {
    let url = `/api/daily-schedule?date=${dateStr}`;
    if (userId) url += `&user_id=${userId}`;
    return await this.request(url);
  },

  async getWeeklySchedule(startDateStr, userId = null) {
    let url = `/api/weekly-schedule?start_date=${startDateStr}`;
    if (userId) url += `&user_id=${userId}`;
    return await this.request(url);
  },

  async quickCreateTask(eventId, title, estimatedMinutes = 0, dateStr = null) {
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
    let url = "/api/timetable";
    if (userId) url += `?user_id=${userId}`;
    return await this.request(url);
  },

  async saveTimetable(slots, userId = null) {
    return await this.request("/api/timetable", {
      method: "POST",
      body: JSON.stringify({ slots, user_id: userId })
    });
  },

  async addTimetableSlot(slotData) {
    return await this.request("/api/timetable", {
      method: "POST",
      body: JSON.stringify(slotData)
    });
  },

  async deleteTimetableSlot(slotId) {
    return await this.request(`/api/timetable/${slotId}`, {
      method: "DELETE"
    });
  }
};

window.API = API;
