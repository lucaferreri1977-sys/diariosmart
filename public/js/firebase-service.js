/**
 * Firebase Firestore Service per DiarioSmart
 * Fornisce persistenza cloud permanente per orario scolastico, materie, compiti, eventi e timer.
 */
const FirebaseService = {
  db: null,
  isReady: false,
  _initPromise: null,
  _listenersAttached: false,
  _listenersCallback: null,

  config: {
    apiKey: "AIzaSyBoWfyfpNiR5eRLsNZruPBzfcCc83SGx-E",
    authDomain: "diariosmart-fcdbf.firebaseapp.com",
    projectId: "diariosmart-fcdbf",
    storageBucket: "diariosmart-fcdbf.firebasestorage.app",
    messagingSenderId: "113141889358",
    appId: "1:113141889358:web:28e26dde82f1f5a2ab461f",
    measurementId: "G-4C4CTQQCFC"
  },

  defaultCategories: [
    { id: 1, name: "Matematica", color: "#3b82f6", icon: "📐" },
    { id: 2, name: "Italiano & Grammatica", color: "#ec4899", icon: "📖" },
    { id: 3, name: "Inglese", color: "#8b5cf6", icon: "🇬🇧" },
    { id: 4, name: "Scienze & Tecnologia", color: "#10b981", icon: "🔬" },
    { id: 5, name: "Storia & Geografia", color: "#f59e0b", icon: "🏛️" },
    { id: 6, name: "Sport & Movimento", color: "#06b6d4", icon: "⚽" },
    { id: 7, name: "Arte & Musica", color: "#f43f5e", icon: "🎨" },
    { id: 8, name: "Compiti Generali", color: "#6366f1", icon: "✏️" },
    { id: 9, name: "Tempo Libero / Svago", color: "#14b8a6", icon: "🎮" }
  ],

  async init() {
    if (this._initPromise) return this._initPromise;
    this._initPromise = (async () => {
      try {
        if (typeof firebase === "undefined") {
          console.warn("SDK Firebase non caricato, operatività fallback.");
          return false;
        }

        if (!firebase.apps.length) {
          firebase.initializeApp(this.config);
        }
        this.db = firebase.firestore();
        this.isReady = true;
        console.log("🔥 Firebase Firestore collegato con successo a DiarioSmart!");

        // Auto-seed iniziale se database vuoto
        await this.ensureInitialSeed();

        // Avvia i listener realtime se registrati
        if (this._listenersCallback && !this._listenersAttached) {
          this.setupRealtimeListeners(this._listenersCallback);
        }
        return true;
      } catch (err) {
        console.error("Errore inizializzazione Firebase:", err);
        return false;
      }
    })();
    return this._initPromise;
  },

  setupRealtimeListeners(callback) {
    if (callback) this._listenersCallback = callback;
    if (!this.db || this._listenersAttached) return;
    this._listenersAttached = true;

    try {
      // 1. Ascolta in tempo reale modifiche all'orario scolastico
      this.db.collection("timetable_slots").onSnapshot(
        snapshot => {
          console.log("⚡ Realtime sync: timetable_slots aggiornato");
          if (typeof this._listenersCallback === "function") {
            this._listenersCallback("timetable_slots");
          }
        },
        err => console.warn("Errore listener realtime timetable_slots:", err)
      );

      // 2. Ascolta in tempo reale modifiche ai compiti
      this.db.collection("todo_items").onSnapshot(
        snapshot => {
          console.log("⚡ Realtime sync: todo_items aggiornato");
          if (typeof this._listenersCallback === "function") {
            this._listenersCallback("todo_items");
          }
        },
        err => console.warn("Errore listener realtime todo_items:", err)
      );
    } catch (e) {
      console.warn("Impossibile agganciare i listener realtime di Firestore:", e);
    }
  },

  async ensureInitialSeed() {
    if (!this.db) return;
    try {
      // 1. Verifica slot orario (inserisci Matematica di Lunedì se vuoto)
      const slotsSnap = await this.db.collection("timetable_slots").limit(1).get();
      if (slotsSnap.empty) {
        console.log("🌱 Inizializzazione slot orario predefinito su Firestore...");
        await this.db.collection("timetable_slots").add({
          user_id: 2,
          day_of_week: 1, // Lunedì
          subject_name: "Matematica",
          start_time: "08:00",
          end_time: "09:00",
          category_id: 1,
          category_name: "Matematica",
          category_color: "#3b82f6",
          category_icon: "📐",
          period_number: 1,
          created_at: new Date().toISOString()
        });
      }
    } catch (e) {
      console.warn("Seed Firestore non riuscito o già presente:", e);
    }
  },

  // ==================== ORARIO SCOLASTICO (TIMETABLE) ====================

  async getTimetable(userId = 2) {
    await this.init();
    try {
      const snap = await this.db.collection("timetable_slots").get();

      const slots = [];
      snap.forEach(doc => {
        const d = doc.data();
        slots.push({
          id: doc.id,
          user_id: d.user_id || 2,
          day_of_week: parseInt(d.day_of_week || 1),
          period_number: parseInt(d.period_number || 1),
          category_id: d.category_id || 1,
          subject_name: d.subject_name || "Materia",
          category_name: d.category_name || d.subject_name,
          category_color: d.category_color || "#3b82f6",
          category_icon: d.category_icon || "📚",
          start_time: d.start_time || "08:00",
          end_time: d.end_time || "09:00",
          room: d.room || ""
        });
      });

      slots.sort((a, b) => (a.start_time > b.start_time ? 1 : -1));
      return { ok: true, timetable: slots };
    } catch (err) {
      console.error("Firebase getTimetable errore:", err);
      throw err;
    }
  },

  async addTimetableSlot(slotData) {
    await this.init();
    try {
      const matchedCat = this.defaultCategories.find(c => c.name.toLowerCase() === (slotData.subject_name || '').toLowerCase());
      const catId = slotData.category_id || (matchedCat ? matchedCat.id : 1);
      const catName = slotData.category_name || (matchedCat ? matchedCat.name : (slotData.subject_name || "Materia"));
      const catColor = slotData.category_color || (matchedCat ? matchedCat.color : "#3b82f6");
      const catIcon = slotData.category_icon || (matchedCat ? matchedCat.icon : "");

      const docRef = await this.db.collection("timetable_slots").add({
        user_id: slotData.user_id ? Number(slotData.user_id) : 2,
        day_of_week: parseInt(slotData.day_of_week || 1),
        period_number: parseInt(slotData.period_number || 1),
        category_id: catId,
        subject_name: slotData.subject_name || "Materia",
        category_name: catName,
        category_color: catColor,
        category_icon: catIcon,
        start_time: slotData.start_time || "08:00",
        end_time: slotData.end_time || "09:00",
        room: slotData.room || "",
        created_at: new Date().toISOString()
      });

      return { ok: true, id: docRef.id };
    } catch (err) {
      console.error("Firebase addTimetableSlot errore:", err);
      throw err;
    }
  },

  async updateTimetableSlot(slotId, slotData) {
    await this.init();
    try {
      const slotRef = this.db.collection("timetable_slots").doc(String(slotId));
      let oldName = null;
      if (slotData.subject_name !== undefined) {
        const oldSnap = await slotRef.get();
        if (oldSnap.exists) {
          oldName = oldSnap.data().subject_name;
        }
      }

      const updateObj = {};
      if (slotData.subject_name !== undefined) {
        updateObj.subject_name = slotData.subject_name;
        updateObj.category_name = slotData.subject_name;
      }
      if (slotData.day_of_week !== undefined) updateObj.day_of_week = parseInt(slotData.day_of_week);
      if (slotData.period_number !== undefined) updateObj.period_number = parseInt(slotData.period_number);
      if (slotData.start_time !== undefined) updateObj.start_time = slotData.start_time;
      if (slotData.end_time !== undefined) updateObj.end_time = slotData.end_time;
      if (slotData.room !== undefined) updateObj.room = slotData.room;
      if (slotData.category_color !== undefined) updateObj.category_color = slotData.category_color;
      updateObj.updated_at = new Date().toISOString();

      await slotRef.update(updateObj);

      if (oldName && slotData.subject_name && oldName.toLowerCase().trim() !== slotData.subject_name.toLowerCase().trim()) {
        const oldNameLower = oldName.toLowerCase().trim();
        const todoSnap = await this.db.collection("todo_items").get();
        const batch = this.db.batch();
        let count = 0;
        todoSnap.forEach(doc => {
          const d = doc.data();
          if (String(d.event_id) === String(slotId) || (d.subject_name && d.subject_name.toLowerCase().trim() === oldNameLower)) {
            batch.update(doc.ref, { subject_name: slotData.subject_name });
            count++;
          }
        });
        if (count > 0) {
          await batch.commit();
        }
      }

      return { ok: true };
    } catch (err) {
      console.error("Firebase updateTimetableSlot errore:", err);
      throw err;
    }
  },

  async deleteTimetableSlot(slotId) {
    await this.init();
    try {
      await this.db.collection("timetable_slots").doc(String(slotId)).delete();
      return { ok: true };
    } catch (err) {
      console.error("Firebase deleteTimetableSlot errore:", err);
      throw err;
    }
  },

  async saveTimetable(slots, userId = 2) {
    await this.init();
    try {
      const snap = await this.db.collection("timetable_slots").get();

      const batch = this.db.batch();
      snap.forEach(doc => batch.delete(doc.ref));
      await batch.commit();

      for (const slot of slots) {
        await this.addTimetableSlot({ ...slot, user_id: userId });
      }
      return { ok: true };
    } catch (err) {
      console.error("Firebase saveTimetable errore:", err);
      throw err;
    }
  },

  // ==================== DIARIO DEL GIORNO & SETTIMANA ====================

  async getDailySchedule(dateStr, userId = 2) {
    await this.init();
    try {
      const parts = dateStr.split("-");
      const dObj = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
      let dow = dObj.getDay();
      dow = dow === 0 ? 7 : dow; // 1 = Lunedì, ..., 7 = Domenica

      const dayNames = ["Lunedì", "Martedì", "Mercoledì", "Giovedì", "Venerdì", "Sabato", "Domenica"];
      const dayName = dayNames[dow - 1] || "Giorno";

      // 1. Recupera slot per questo giorno della settimana
      const ttRes = await this.getTimetable(userId);
      const daySlots = (ttRes.timetable || []).filter(s => s.day_of_week === dow);

      // 2. Recupera tutti i compiti (todo_items) per questa data
      const tasksSnap = await this.db.collection("todo_items")
        .where("date_str", "==", dateStr)
        .get();

      const tasksBySubject = {};
      const tasksByEventId = {};
      const allTasks = [];

      tasksSnap.forEach(tDoc => {
        const t = tDoc.data();
        const itemObj = {
          id: tDoc.id,
          title: t.title || "",
          estimated_minutes: parseInt(t.estimated_minutes || 0),
          actual_minutes: parseInt(t.actual_minutes || 0),
          completed: !!t.completed,
          event_id: String(t.event_id || ""),
          subject_name: t.subject_name || "",
          date_str: t.date_str || dateStr
        };
        allTasks.push(itemObj);

        if (itemObj.event_id) {
          if (!tasksByEventId[itemObj.event_id]) tasksByEventId[itemObj.event_id] = [];
          tasksByEventId[itemObj.event_id].push(itemObj);
        }

        const subKey = (t.subject_name || "").toLowerCase().trim();
        if (subKey) {
          if (!tasksBySubject[subKey]) tasksBySubject[subKey] = [];
          tasksBySubject[subKey].push(itemObj);
        }
      });

      // 3. Costruisci le materie
      const subjects = daySlots.map((slot, idx) => {
        const sKey = (slot.subject_name || "").toLowerCase().trim();
        const slotIdStr = String(slot.id);
        const items = tasksByEventId[slotIdStr] || tasksBySubject[sKey] || [];
        
        items.forEach(i => {
          i.event_id = slot.id;
          if (!i.subject_name) i.subject_name = slot.subject_name;
        });

        const subTasks = items.length;
        const subDone = items.filter(i => i.completed).length;
        const subEst = items.reduce((sum, i) => sum + (i.estimated_minutes || 0), 0);
        const subAct = items.reduce((sum, i) => sum + (i.actual_minutes || 0), 0);

        return {
          slot_id: slot.id,
          period_number: slot.period_number || (idx + 1),
          period_label: "",
          subject_name: slot.subject_name,
          category_id: slot.category_id,
          category_name: slot.category_name || slot.subject_name,
          category_color: slot.category_color || "#3b82f6",
          category_icon: slot.category_icon || "📚",
          start_time: slot.start_time,
          end_time: slot.end_time,
          room: slot.room || "",
          event_id: slot.id,
          lists: [
            {
              id: "list_" + slot.id,
              title: "Compiti",
              items: items
            }
          ],
          stats: {
            total_tasks: subTasks,
            completed_tasks: subDone,
            estimated_minutes: subEst,
            actual_minutes: subAct
          }
        };
      });

      // 4. Costruisci unified_todos per la colonna destra del diario
      const unified_todos = [];
      subjects.forEach(sub => {
        (sub.lists || []).forEach(l => {
          (l.items || []).forEach(item => {
            unified_todos.push({
              ...item,
              subject_name: sub.subject_name,
              category_name: sub.category_name,
              category_color: sub.category_color,
              category_icon: sub.category_icon,
              event_id: sub.event_id,
              start_time: sub.start_time,
              end_time: sub.end_time
            });
          });
        });
      });

      const totTasks = unified_todos.length;
      const doneTasks = unified_todos.filter(t => t.completed).length;
      const totEst = unified_todos.reduce((sum, t) => sum + (t.estimated_minutes || 0), 0);
      const totAct = unified_todos.reduce((sum, t) => sum + (t.actual_minutes || 0), 0);
      const progressPercent = totTasks > 0 ? Math.round((doneTasks / totTasks) * 100) : 0;

      return {
        ok: true,
        schedule: {
          date: dateStr,
          day_name: dayName,
          day_of_week: dow,
          is_weekend: (dow === 6 || dow === 7),
          subjects: subjects,
          unified_todos: unified_todos,
          extra_events: [],
          totals: {
            total_tasks: totTasks,
            completed_tasks: doneTasks,
            total_estimated_minutes: totEst,
            total_actual_minutes: totAct,
            progress_percent: progressPercent
          }
        }
      };
    } catch (err) {
      console.error("Firebase getDailySchedule errore:", err);
      throw err;
    }
  },

  async getWeeklySchedule(startDateStr, userId = 2) {
    await this.init();
    try {
      const parts = startDateStr.split("-");
      const dt = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
      let dow = dt.getDay();
      dow = (dow === 0) ? 7 : dow; // 1 = Lunedì
      const monday = new Date(dt);
      monday.setDate(dt.getDate() - (dow - 1));

      const datePromises = [];
      for (let i = 0; i < 7; i++) {
        const day = new Date(monday);
        day.setDate(monday.getDate() + i);
        const y = day.getFullYear();
        const m = String(day.getMonth() + 1).padStart(2, "0");
        const d = String(day.getDate()).padStart(2, "0");
        const dateStr = `${y}-${m}-${d}`;
        datePromises.push(this.getDailySchedule(dateStr, userId));
      }

      const results = await Promise.all(datePromises);
      const weekDays = results.map(r => r.schedule);
      return { ok: true, week: weekDays };
    } catch (err) {
      console.error("Firebase getWeeklySchedule errore:", err);
      throw err;
    }
  },

  // ==================== COMPITI (TODO ITEMS) ====================

  async quickCreateTask(eventId, title, estimatedMinutes = 0, dateStr = null) {
    await this.init();
    try {
      let taskDate = dateStr;
      let subName = "";

      if (eventId) {
        try {
          const slotDoc = await this.db.collection("timetable_slots").doc(String(eventId)).get();
          if (slotDoc.exists) {
            const data = slotDoc.data();
            subName = data.subject_name || "";
            if (!taskDate && data.day_of_week) {
              const targetDow = parseInt(data.day_of_week);
              const now = new Date();
              const curDow = now.getDay() === 0 ? 7 : now.getDay();
              const monday = new Date(now);
              if (curDow >= 6) {
                // Nel weekend si pianifica la settimana scolastica imminente
                monday.setDate(now.getDate() + (8 - curDow));
              } else {
                monday.setDate(now.getDate() - (curDow - 1));
              }
              const d = new Date(monday);
              d.setDate(monday.getDate() + (targetDow - 1));
              const y = d.getFullYear();
              const m = String(d.getMonth() + 1).padStart(2, "0");
              const day = String(d.getDate()).padStart(2, "0");
              taskDate = `${y}-${m}-${day}`;
            }
          }
        } catch (e) {}
      }

      if (!taskDate) {
        const now = new Date();
        const curDow = now.getDay() === 0 ? 7 : now.getDay();
        const monday = new Date(now);
        if (curDow >= 6) {
          monday.setDate(now.getDate() + (8 - curDow));
        } else {
          monday.setDate(now.getDate() - (curDow - 1));
        }
        const y = monday.getFullYear();
        const m = String(monday.getMonth() + 1).padStart(2, "0");
        const day = String(monday.getDate()).padStart(2, "0");
        taskDate = `${y}-${m}-${day}`;
      }

      const docRef = await this.db.collection("todo_items").add({
        event_id: String(eventId || ""),
        subject_name: subName,
        title: title.trim(),
        estimated_minutes: parseInt(estimatedMinutes || 0),
        actual_minutes: 0,
        completed: false,
        date_str: taskDate,
        created_at: new Date().toISOString()
      });

      return {
        ok: true,
        item: {
          id: docRef.id,
          event_id: String(eventId || ""),
          subject_name: subName,
          title: title.trim(),
          estimated_minutes: parseInt(estimatedMinutes || 0),
          actual_minutes: 0,
          completed: false,
          date_str: taskDate
        }
      };
    } catch (err) {
      console.error("Firebase quickCreateTask errore:", err);
      throw err;
    }
  },

  async toggleTodoItem(itemId, completed = null) {
    await this.init();
    try {
      const itemRef = this.db.collection("todo_items").doc(String(itemId));
      const doc = await itemRef.get();
      if (!doc.exists) throw new Error("Compito non trovato");

      const curVal = !!doc.data().completed;
      const newVal = completed !== null ? !!completed : !curVal;
      await itemRef.update({ completed: newVal });

      return {
        ok: true,
        item: { id: doc.id, ...doc.data(), completed: newVal }
      };
    } catch (err) {
      console.error("Firebase toggleTodoItem errore:", err);
      throw err;
    }
  },

  async updateTodoItem(itemId, data) {
    await this.init();
    try {
      const itemRef = this.db.collection("todo_items").doc(String(itemId));
      await itemRef.update(data);
      const updated = await itemRef.get();
      return { ok: true, item: { id: updated.id, ...updated.data() } };
    } catch (err) {
      console.error("Firebase updateTodoItem errore:", err);
      throw err;
    }
  },

  async deleteTodoItem(itemId) {
    await this.init();
    try {
      await this.db.collection("todo_items").doc(String(itemId)).delete();
      return { ok: true };
    } catch (err) {
      console.error("Firebase deleteTodoItem errore:", err);
      throw err;
    }
  },

  async startItemTimer(itemId) {
    await this.init();
    try {
      const itemRef = this.db.collection("todo_items").doc(String(itemId));
      const nowIso = new Date().toISOString();
      await itemRef.update({ timer_started_at: nowIso });
      return { ok: true, timer_started_at: nowIso };
    } catch (err) {
      console.error("Firebase startItemTimer errore:", err);
      throw err;
    }
  },

  async stopItemTimer(itemId, addedMinutes = null) {
    await this.init();
    try {
      const itemRef = this.db.collection("todo_items").doc(String(itemId));
      const doc = await itemRef.get();
      if (!doc.exists) throw new Error("Compito non trovato");

      const curAct = parseInt(doc.data().actual_minutes || 0);
      const add = parseInt(addedMinutes || 0);
      const newAct = curAct + add;
      await itemRef.update({
        actual_minutes: newAct,
        timer_started_at: null
      });

      return {
        ok: true,
        item: { id: doc.id, ...doc.data(), actual_minutes: newAct, timer_started_at: null }
      };
    } catch (err) {
      console.error("Firebase stopItemTimer errore:", err);
      throw err;
    }
  },

  // ==================== EVENTI PERSONALIZZATI & LISTE ====================

  async createEvent(eventData) {
    await this.init();
    try {
      const docRef = await this.db.collection("events").add({
        title: eventData.title || "",
        description: eventData.description || "",
        category_id: eventData.category_id || 1,
        event_date: eventData.event_date || new Date().toISOString().split("T")[0],
        start_time: eventData.start_time || "08:00",
        end_time: eventData.end_time || "09:00",
        is_all_day: !!eventData.is_all_day,
        assigned_to_user_id: eventData.assigned_to_user_id || 2,
        created_by_user_id: eventData.created_by_user_id || 1,
        is_recurring_weekly: !!eventData.is_recurring_weekly,
        recurrence_group_id: eventData.recurrence_group_id || null,
        created_at: new Date().toISOString()
      });
      return { ok: true, id: docRef.id, event_id: docRef.id };
    } catch (err) {
      console.error("Firebase createEvent errore:", err);
      throw err;
    }
  },

  async deleteEvent(eventId, deleteAllRecurring = false) {
    await this.init();
    try {
      await this.db.collection("events").doc(String(eventId)).delete();
      return { ok: true };
    } catch (err) {
      console.error("Firebase deleteEvent errore:", err);
      throw err;
    }
  },

  // ==================== STATISTICHE GENITORE ====================

  async getStats(startDate = null, endDate = null) {
    await this.init();
    try {
      // 1. Recupera tutte le materie presenti nell'orario scolastico (timetable_slots)
      const slotsSnap = await this.db.collection("timetable_slots").get();
      const bySubject = {};

      slotsSnap.forEach(doc => {
        const d = doc.data();
        const rawName = (d.subject_name || "").trim();
        if (rawName) {
          const key = rawName.toLowerCase();
          if (!bySubject[key]) {
            const catDef = this.defaultCategories.find(dc => dc.name.toLowerCase() === key);
            bySubject[key] = {
              name: rawName,
              color: d.category_color || (catDef ? catDef.color : "#3b82f6"),
              icon: d.category_icon || (catDef ? catDef.icon : "📚"),
              tasks_count: 0,
              completed_count: 0,
              estimated_minutes: 0,
              actual_minutes: 0,
              in_timetable: true
            };
          }
        }
      });

      // 2. Recupera tutti i compiti da todo_items
      const snap = await this.db.collection("todo_items").get();
      let totalTasks = 0;
      let completedTasks = 0;
      let totalEst = 0;
      let totalAct = 0;
      const topDeviations = [];

      const isDateInRange = (dStr, hasActual = false) => {
        if (!startDate && !endDate) return true;
        if (!dStr) return true; // Include anche compiti privi di data esplicita
        if (startDate && dStr < startDate) return false;
        if (endDate && dStr > endDate) {
          // Se il compito è già stato svolto o ha tempo effettivo registrato, non escluderlo
          if (hasActual) return true;
          return false;
        }
        return true;
      };

      snap.forEach(doc => {
        const d = doc.data();
        const taskDate = d.date_str || "";
        const est = parseInt(d.estimated_minutes || 0);
        const act = parseInt(d.actual_minutes || 0);
        if (!isDateInRange(taskDate, act > 0)) return;

        totalTasks++;
        if (d.completed) completedTasks++;
        totalEst += est;
        totalAct += act;

        const rawSub = (d.subject_name || "").trim();
        const subKey = rawSub ? rawSub.toLowerCase() : "generale";
        const displayName = rawSub || "Generale";

        if (!bySubject[subKey]) {
          const catDef = this.defaultCategories.find(dc => dc.name.toLowerCase() === subKey);
          bySubject[subKey] = {
            name: displayName,
            color: catDef ? catDef.color : (d.category_color || "#6366f1"),
            icon: catDef ? catDef.icon : (d.category_icon || "✏️"),
            tasks_count: 0,
            completed_count: 0,
            estimated_minutes: 0,
            actual_minutes: 0,
            in_timetable: false
          };
        }

        bySubject[subKey].tasks_count++;
        if (d.completed) bySubject[subKey].completed_count++;
        bySubject[subKey].estimated_minutes += est;
        bySubject[subKey].actual_minutes += act;

        // Scostamento / Alert: ha impiegato più tempo del previsto (act > est)
        const diff = act - est;
        if (act > 0 && est > 0 && diff > 0) {
          topDeviations.push({
            id: doc.id,
            task_title: d.title || "Compito",
            category_name: bySubject[subKey].name,
            event_title: bySubject[subKey].name,
            event_date: taskDate,
            actual_minutes: act,
            estimated_minutes: est,
            diff_minutes: diff,
            completed: !!d.completed
          });
        }
      });

      // Ordina gli alert di scostamento dal più alto al più basso
      topDeviations.sort((a, b) => b.diff_minutes - a.diff_minutes);

      // Costruisci lista materie / categorie
      const catList = Object.values(bySubject).map((c, idx) => ({
        id: idx + 1,
        name: c.name,
        category_name: c.name,
        color: c.color,
        category_color: c.color,
        icon: c.icon,
        category_icon: c.icon,
        tasks_count: c.tasks_count,
        completed_count: c.completed_count,
        estimated_minutes: c.estimated_minutes,
        actual_minutes: c.actual_minutes,
        in_timetable: !!c.in_timetable
      }));

      // Ordina le categorie:
      // 1. Minuti effettivi reali (chi ha richiesto più tempo reale effettivo)
      // 2. Minuti stimati (chi ha il carico stimato maggiore)
      // 3. Numero di compiti
      // 4. Ordine alfabetico per le restanti materie
      catList.sort((a, b) => {
        if (b.actual_minutes !== a.actual_minutes) {
          return b.actual_minutes - a.actual_minutes;
        }
        if (b.estimated_minutes !== a.estimated_minutes) {
          return b.estimated_minutes - a.estimated_minutes;
        }
        if (b.tasks_count !== a.tasks_count) {
          return b.tasks_count - a.tasks_count;
        }
        return a.name.localeCompare(b.name, "it", { sensitivity: "base" });
      });

      return {
        ok: true,
        stats: {
          general: {
            total_tasks: totalTasks,
            completed_tasks: completedTasks,
            total_estimated_minutes: totalEst,
            total_actual_minutes: totalAct
          },
          by_category: catList,
          top_deviations: topDeviations,
          daily_history: []
        }
      };
    } catch (err) {
      console.error("Firebase getStats errore:", err);
      throw err;
    }
  },

  // ==================== CATEGORIE E UTENTI ====================

  async getCategories() {
    return { ok: true, categories: this.defaultCategories };
  },

  async getUsers() {
    return {
      ok: true,
      users: [
        { id: 1, username: "genitore", role: "parent", display_name: "Genitore", avatar_emoji: "👨‍👧‍👦" },
        { id: 2, username: "giulio", role: "child", display_name: "Giulio", avatar_emoji: "🧒" }
      ]
    };
  }
};

window.FirebaseService = FirebaseService;
