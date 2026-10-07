import sqlite3
import os
import datetime
import secrets
from typing import Optional, Dict, Any, List
import auth

DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "calendar.db")
if os.environ.get("VERCEL"):
    DB_PATH = "/tmp/calendar.db"

def ensure_db_ready():
    """Assicura che il database sia presente e inizializzato, specialmente su Vercel (/tmp)."""
    if os.environ.get("VERCEL"):
        src_db = os.path.join(os.path.dirname(os.path.abspath(__file__)), "calendar.db")
        if not os.path.exists(DB_PATH) and os.path.exists(src_db):
            import shutil
            try:
                shutil.copy2(src_db, DB_PATH)
            except Exception:
                pass

def get_connection():
    """Restituisce una connessione al database SQLite con foreign keys abilitate."""
    ensure_db_ready()
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn

def init_db():
    """Inizializza le tabelle del database e inserisce i dati di default se vuoto."""
    with get_connection() as conn:
        cursor = conn.cursor()
        
        # Tabella Utenti
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT UNIQUE NOT NULL,
                password_hash TEXT NOT NULL,
                salt TEXT NOT NULL,
                role TEXT NOT NULL CHECK(role IN ('parent', 'child')),
                display_name TEXT NOT NULL,
                avatar_emoji TEXT DEFAULT '👤',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)

        # Tabella Sessioni
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS sessions (
                token TEXT PRIMARY KEY,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                expires_at TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)

        # Tabella Categorie / Materie
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS categories (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                color TEXT NOT NULL,
                icon TEXT DEFAULT '📚',
                is_default INTEGER DEFAULT 0
            )
        """)

        # Tabella Eventi
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS events (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT NOT NULL,
                description TEXT DEFAULT '',
                category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
                event_date TEXT NOT NULL, -- Formato YYYY-MM-DD
                start_time TEXT,          -- Formato HH:MM o NULL se tutto il giorno
                end_time TEXT,            -- Formato HH:MM o NULL se tutto il giorno
                is_all_day INTEGER DEFAULT 0,
                assigned_to_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                created_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
                is_recurring_weekly INTEGER DEFAULT 0,
                recurrence_group_id TEXT DEFAULT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)

        # Migrazione se colonne mancanti su tabella events già esistente
        cursor.execute("PRAGMA table_info(events)")
        existing_cols = [col["name"] for col in cursor.fetchall()]
        if "is_recurring_weekly" not in existing_cols:
            cursor.execute("ALTER TABLE events ADD COLUMN is_recurring_weekly INTEGER DEFAULT 0")
        if "recurrence_group_id" not in existing_cols:
            cursor.execute("ALTER TABLE events ADD COLUMN recurrence_group_id TEXT DEFAULT NULL")

        # Tabella To-Do List (un evento può avere più liste di compiti)
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS todo_lists (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
                title TEXT NOT NULL,
                sort_order INTEGER DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)

        # Tabella Singoli Compiti (To-Do Items)
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS todo_items (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                list_id INTEGER NOT NULL REFERENCES todo_lists(id) ON DELETE CASCADE,
                title TEXT NOT NULL,
                completed INTEGER DEFAULT 0,
                estimated_minutes INTEGER DEFAULT 0,
                actual_minutes INTEGER DEFAULT 0,
                timer_started_at TEXT DEFAULT NULL, -- Timestamp ISO se il cronometro è attivo
                notes TEXT DEFAULT '',
                sort_order INTEGER DEFAULT 0,
                completed_at TEXT DEFAULT NULL
            )
        """)

        # Tabella Orario Scolastico Settimanale (Timetable Slots)
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS timetable_slots (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                day_of_week INTEGER NOT NULL CHECK(day_of_week BETWEEN 1 AND 7), -- 1=Lunedì ... 7=Domenica
                period_number INTEGER NOT NULL,                                  -- 1, 2, 3, 4, 5, 6
                category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
                subject_name TEXT NOT NULL,
                start_time TEXT NOT NULL,                                        -- es. '08:00'
                end_time TEXT NOT NULL,                                          -- es. '09:00'
                room TEXT DEFAULT '',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(user_id, day_of_week, period_number)
            )
        """)

        # Inserisci categorie predefinite se non ce ne sono
        cursor.execute("SELECT COUNT(*) FROM categories")
        if cursor.fetchone()[0] == 0:
            default_categories = [
                ("Matematica", "#3b82f6", "📐", 1),
                ("Italiano & Grammatica", "#ec4899", "📖", 1),
                ("Inglese", "#8b5cf6", "🇬🇧", 1),
                ("Scienze & Tecnologia", "#10b981", "🔬", 1),
                ("Storia & Geografia", "#f59e0b", "🏛️", 1),
                ("Sport & Movimento", "#06b6d4", "⚽", 1),
                ("Arte & Musica", "#f43f5e", "🎨", 1),
                ("Compiti Generali", "#6366f1", "✏️", 1),
                ("Tempo Libero / Svago", "#14b8a6", "🎮", 1)
            ]
            cursor.executemany(
                "INSERT INTO categories (name, color, icon, is_default) VALUES (?, ?, ?, ?)",
                default_categories
            )

        # Inserisci utenti predefiniti (Genitore e Figlio) se non ci sono utenti
        cursor.execute("SELECT COUNT(*) FROM users")
        if cursor.fetchone()[0] == 0:
            parent_salt = auth.generate_salt()
            parent_hash = auth.hash_password("enrica06", parent_salt)
            cursor.execute("""
                INSERT INTO users (username, password_hash, salt, role, display_name, avatar_emoji)
                VALUES (?, ?, ?, 'parent', 'Genitore', '👨‍👧‍👦')
            """, ("genitore", parent_hash, parent_salt))

            child_salt = auth.generate_salt()
            child_hash = auth.hash_password("giulio06", child_salt)
            cursor.execute("""
                INSERT INTO users (username, password_hash, salt, role, display_name, avatar_emoji)
                VALUES (?, ?, ?, 'child', 'Giulio', '🧒')
            """, ("giulio", child_hash, child_salt))

        # Orario scolastico: nessun inserimento fittizio automatico (parte 100% vuoto)

        # Migrazione / aggiornamento nome utente per Giulio
        cursor.execute("UPDATE users SET username = 'giulio', display_name = 'Giulio' WHERE username = 'figlio'")

        conn.commit()

# --- Funzioni Utenti e Sessioni ---

def get_user_by_username(username: str) -> Optional[sqlite3.Row]:
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM users WHERE username = ?", (username,))
        row = cursor.fetchone()
        if not row and username.lower() in ("figlio", "giulio"):
            cursor.execute("SELECT * FROM users WHERE role = 'child' LIMIT 1")
            return cursor.fetchone()
        return row

def get_user_by_id(user_id: int) -> Optional[sqlite3.Row]:
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM users WHERE id = ?", (user_id,))
        return cursor.fetchone()

def get_all_users() -> List[sqlite3.Row]:
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT id, username, role, display_name, avatar_emoji, created_at FROM users ORDER BY id ASC")
        return cursor.fetchall()

def create_user(username: str, password: str, role: str, display_name: str, avatar_emoji: str = '👤') -> int:
    salt = auth.generate_salt()
    pw_hash = auth.hash_password(password, salt)
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO users (username, password_hash, salt, role, display_name, avatar_emoji)
            VALUES (?, ?, ?, ?, ?, ?)
        """, (username, pw_hash, salt, role, display_name, avatar_emoji))
        conn.commit()
        return cursor.lastrowid

def update_user(user_id: int, display_name: Optional[str] = None, avatar_emoji: Optional[str] = None, password: Optional[str] = None) -> bool:
    updates = []
    params = []
    if display_name is not None:
        updates.append("display_name = ?")
        params.append(display_name)
    if avatar_emoji is not None:
        updates.append("avatar_emoji = ?")
        params.append(avatar_emoji)
    if password is not None and len(password) > 0:
        salt = auth.generate_salt()
        pw_hash = auth.hash_password(password, salt)
        updates.append("password_hash = ?, salt = ?")
        params.extend([pw_hash, salt])
    
    if not updates:
        return False

    params.append(user_id)
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(f"UPDATE users SET {', '.join(updates)} WHERE id = ?", tuple(params))
        conn.commit()
        return cursor.rowcount > 0

def create_session(user_id: int) -> str:
    user = get_user_by_id(user_id)
    username = user["username"] if user else ""
    role = user["role"] if user else "child"
    token = auth.create_signed_token(user_id, username, role)
    expiry = auth.calculate_session_expiry()
    try:
        with get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)", (token, user_id, expiry))
            conn.commit()
    except Exception:
        pass
    return token

def get_user_from_session(token: str) -> Optional[sqlite3.Row]:
    if not token:
        return None

    # 1. Verifica token stateless firmato (valido e verificato su qualsiasi worker serverless)
    payload = auth.verify_signed_token(token)
    if payload and "uid" in payload:
        user = get_user_by_id(payload["uid"])
        if user:
            return user
        if "usr" in payload:
            user = get_user_by_username(payload["usr"])
            if user:
                return user

    # 2. Fallback su tabella sessions (per token legacy generati in precedenza)
    try:
        with get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                SELECT u.id, u.username, u.role, u.display_name, u.avatar_emoji
                FROM sessions s
                JOIN users u ON s.user_id = u.id
                WHERE s.token = ? AND datetime(s.expires_at) > datetime('now')
            """, (token,))
            return cursor.fetchone()
    except Exception:
        return None

def delete_session(token: str):
    try:
        with get_connection() as conn:
            conn.execute("DELETE FROM sessions WHERE token = ?", (token,))
            conn.commit()
    except Exception:
        pass

# --- Funzioni Categorie ---

def get_categories() -> List[sqlite3.Row]:
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM categories ORDER BY id ASC")
        return cursor.fetchall()

def create_category(name: str, color: str, icon: str = '📚') -> int:
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("INSERT INTO categories (name, color, icon) VALUES (?, ?, ?)", (name, color, icon))
        conn.commit()
        return cursor.lastrowid

def update_category(cat_id: int, name: str, color: str, icon: str) -> bool:
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("UPDATE categories SET name = ?, color = ?, icon = ? WHERE id = ?", (name, color, icon, cat_id))
        conn.commit()
        return cursor.rowcount > 0

def delete_category(cat_id: int) -> bool:
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("DELETE FROM categories WHERE id = ?", (cat_id,))
        conn.commit()
        return cursor.rowcount > 0

# --- Funzioni Eventi & To-Do Lists ---

def get_events(start_date: Optional[str] = None, end_date: Optional[str] = None, user_id: Optional[int] = None) -> List[Dict[str, Any]]:
    """Restituisce la lista degli eventi completi con statistiche aggregate sui task (totali, completati, tempi)."""
    query = """
        SELECT e.*, c.name as category_name, c.color as category_color, c.icon as category_icon,
               u.display_name as assigned_to_name, u.avatar_emoji as assigned_to_emoji
        FROM events e
        LEFT JOIN categories c ON e.category_id = c.id
        LEFT JOIN users u ON e.assigned_to_user_id = u.id
        WHERE 1=1
    """
    params = []
    if start_date:
        query += " AND e.event_date >= ?"
        params.append(start_date)
    if end_date:
        query += " AND e.event_date <= ?"
        params.append(end_date)
    if user_id:
        query += " AND e.assigned_to_user_id = ?"
        params.append(user_id)
        
    query += " ORDER BY e.event_date ASC, CASE WHEN e.is_all_day = 1 THEN 0 ELSE 1 END ASC, e.start_time ASC"

    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(query, tuple(params))
        events_rows = cursor.fetchall()
        
        events_list = []
        for row in events_rows:
            ev = dict(row)
            # Calcola aggregazioni to-do per questo evento
            cursor.execute("""
                SELECT 
                    COUNT(ti.id) as total_tasks,
                    SUM(CASE WHEN ti.completed = 1 THEN 1 ELSE 0 END) as completed_tasks,
                    COALESCE(SUM(ti.estimated_minutes), 0) as total_estimated_minutes,
                    COALESCE(SUM(ti.actual_minutes), 0) as total_actual_minutes,
                    MAX(CASE WHEN ti.timer_started_at IS NOT NULL THEN 1 ELSE 0 END) as has_active_timer
                FROM todo_lists tl
                LEFT JOIN todo_items ti ON tl.id = ti.list_id
                WHERE tl.event_id = ?
            """, (ev["id"],))
            stats = cursor.fetchone()
            ev["total_tasks"] = stats["total_tasks"] if stats else 0
            ev["completed_tasks"] = stats["completed_tasks"] if stats else 0
            ev["total_estimated_minutes"] = stats["total_estimated_minutes"] if stats else 0
            ev["total_actual_minutes"] = stats["total_actual_minutes"] if stats else 0
            ev["has_active_timer"] = bool(stats["has_active_timer"]) if stats else False
            events_list.append(ev)
            
        return events_list

def get_event_details(event_id: int) -> Optional[Dict[str, Any]]:
    """Restituisce un evento completo con tutte le sue todo-lists e i relativi todo-items."""
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT e.*, c.name as category_name, c.color as category_color, c.icon as category_icon,
                   u.display_name as assigned_to_name, u.avatar_emoji as assigned_to_emoji
            FROM events e
            LEFT JOIN categories c ON e.category_id = c.id
            LEFT JOIN users u ON e.assigned_to_user_id = u.id
            WHERE e.id = ?
        """, (event_id,))
        row = cursor.fetchone()
        if not row:
            return None
        
        ev = dict(row)
        # Recupera tutte le liste per questo evento
        cursor.execute("SELECT * FROM todo_lists WHERE event_id = ? ORDER BY sort_order ASC, id ASC", (event_id,))
        lists_rows = cursor.fetchall()
        
        lists = []
        for l_row in lists_rows:
            l_dict = dict(l_row)
            cursor.execute("SELECT * FROM todo_items WHERE list_id = ? ORDER BY sort_order ASC, id ASC", (l_dict["id"],))
            items_rows = cursor.fetchall()
            l_dict["items"] = [dict(i) for i in items_rows]
            lists.append(l_dict)
            
        ev["lists"] = lists
        return ev

def create_event(title: str, description: str = "", category_id: Optional[int] = None, event_date: str = "",
                 start_time: Optional[str] = None, end_time: Optional[str] = None, is_all_day: bool = False,
                 assigned_to_user_id: int = 1, created_by_user_id: int = 1,
                 is_recurring_weekly: bool = False, repeat_weeks: int = 1,
                 category_color: Optional[str] = None) -> int:
    with get_connection() as conn:
        cursor = conn.cursor()
        
        if category_color:
            if not category_id:
                cursor.execute("SELECT id FROM categories WHERE LOWER(TRIM(name)) = LOWER(TRIM(?)) LIMIT 1", (title,))
                c_row = cursor.fetchone()
                if c_row:
                    category_id = c_row["id"]
                    cursor.execute("UPDATE categories SET color = ? WHERE id = ?", (category_color, category_id))
                else:
                    cursor.execute("INSERT INTO categories (name, color, icon) VALUES (?, ?, '📅')", (title, category_color))
                    category_id = cursor.lastrowid
            else:
                cursor.execute("UPDATE categories SET color = ? WHERE id = ?", (category_color, category_id))

        repeat_count = max(1, int(repeat_weeks)) if is_recurring_weekly else 1
        rec_group_id = f"rec_{secrets.token_hex(8)}" if is_recurring_weekly and repeat_count > 1 else None
        
        base_dt = datetime.date.fromisoformat(event_date)
        first_event_id = None

        for w in range(repeat_count):
            curr_date = (base_dt + datetime.timedelta(weeks=w)).isoformat()
            cursor.execute("""
                INSERT INTO events (title, description, category_id, event_date, start_time, end_time, is_all_day, assigned_to_user_id, created_by_user_id, is_recurring_weekly, recurrence_group_id)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (title, description, category_id, curr_date, start_time, end_time, 1 if is_all_day else 0, assigned_to_user_id, created_by_user_id, 1 if is_recurring_weekly else 0, rec_group_id))
            ev_id = cursor.lastrowid
            if first_event_id is None:
                first_event_id = ev_id
            # Crea automaticamente una to-do list per ogni ricorrenza
            cursor.execute("INSERT INTO todo_lists (event_id, title) VALUES (?, ?)", (ev_id, "Compiti & Attività"))

        conn.commit()
        return first_event_id

def update_event(event_id: int, title: str, description: str, category_id: Optional[int],
                 event_date: str, start_time: Optional[str], end_time: Optional[str],
                 is_all_day: bool, assigned_to_user_id: int,
                 update_all_recurring: bool = False,
                 category_color: Optional[str] = None) -> bool:
    with get_connection() as conn:
        cursor = conn.cursor()
        
        if category_color:
            if category_id:
                cursor.execute("UPDATE categories SET color = ? WHERE id = ?", (category_color, category_id))
            else:
                cursor.execute("SELECT category_id, title FROM events WHERE id = ?", (event_id,))
                ev_row = cursor.fetchone()
                if ev_row and ev_row["category_id"]:
                    category_id = ev_row["category_id"]
                    cursor.execute("UPDATE categories SET color = ? WHERE id = ?", (category_color, category_id))
                elif ev_row:
                    cat_name = title or ev_row["title"]
                    cursor.execute("SELECT id FROM categories WHERE LOWER(TRIM(name)) = LOWER(TRIM(?)) LIMIT 1", (cat_name,))
                    c_found = cursor.fetchone()
                    if c_found:
                        category_id = c_found["id"]
                        cursor.execute("UPDATE categories SET color = ? WHERE id = ?", (category_color, category_id))
                    else:
                        cursor.execute("INSERT INTO categories (name, color, icon) VALUES (?, ?, '📅')", (cat_name, category_color))
                        category_id = cursor.lastrowid

        if update_all_recurring:
            cursor.execute("SELECT recurrence_group_id, event_date FROM events WHERE id = ?", (event_id,))
            row = cursor.fetchone()
            if row and row["recurrence_group_id"]:
                cursor.execute("""
                    UPDATE events
                    SET title = ?, description = ?, category_id = ?,
                        start_time = ?, end_time = ?, is_all_day = ?, assigned_to_user_id = ?,
                        updated_at = CURRENT_TIMESTAMP
                    WHERE recurrence_group_id = ? AND event_date >= ?
                """, (title, description, category_id, start_time, end_time, 1 if is_all_day else 0, assigned_to_user_id, row["recurrence_group_id"], row["event_date"]))
                conn.commit()
                return cursor.rowcount > 0

        cursor.execute("""
            UPDATE events
            SET title = ?, description = ?, category_id = ?, event_date = ?,
                start_time = ?, end_time = ?, is_all_day = ?, assigned_to_user_id = ?,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        """, (title, description, category_id, event_date, start_time, end_time, 1 if is_all_day else 0, assigned_to_user_id, event_id))
        conn.commit()
        return cursor.rowcount > 0

def delete_event(event_id: int, delete_all_recurring: bool = False) -> bool:
    with get_connection() as conn:
        cursor = conn.cursor()
        if delete_all_recurring:
            cursor.execute("SELECT recurrence_group_id, event_date FROM events WHERE id = ?", (event_id,))
            row = cursor.fetchone()
            if row and row["recurrence_group_id"]:
                cursor.execute("DELETE FROM events WHERE recurrence_group_id = ? AND event_date >= ?", (row["recurrence_group_id"], row["event_date"]))
                conn.commit()
                return cursor.rowcount > 0

        cursor.execute("DELETE FROM events WHERE id = ?", (event_id,))
        conn.commit()
        return cursor.rowcount > 0

# --- Funzioni To-Do List ---

def create_todo_list(event_id: int, title: str) -> int:
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("INSERT INTO todo_lists (event_id, title) VALUES (?, ?)", (event_id, title))
        conn.commit()
        return cursor.lastrowid

def update_todo_list(list_id: int, title: str) -> bool:
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("UPDATE todo_lists SET title = ? WHERE id = ?", (title, list_id))
        conn.commit()
        return cursor.rowcount > 0

def delete_todo_list(list_id: int) -> bool:
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("DELETE FROM todo_lists WHERE id = ?", (list_id,))
        conn.commit()
        return cursor.rowcount > 0

# --- Funzioni Singoli Compiti (Todo Items) ---

def create_todo_item(list_id: int, title: str, estimated_minutes: int = 0, actual_minutes: int = 0, notes: str = '') -> int:
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO todo_items (list_id, title, estimated_minutes, actual_minutes, notes)
            VALUES (?, ?, ?, ?, ?)
        """, (list_id, title, estimated_minutes, actual_minutes, notes))
        conn.commit()
        return cursor.lastrowid

def update_todo_item(item_id: int, title: Optional[str] = None, estimated_minutes: Optional[int] = None,
                     actual_minutes: Optional[int] = None, notes: Optional[str] = None) -> bool:
    updates = []
    params = []
    if title is not None:
        updates.append("title = ?")
        params.append(title)
    if estimated_minutes is not None:
        updates.append("estimated_minutes = ?")
        params.append(estimated_minutes)
    if actual_minutes is not None:
        updates.append("actual_minutes = ?")
        params.append(actual_minutes)
    if notes is not None:
        updates.append("notes = ?")
        params.append(notes)
    
    if not updates:
        return False
        
    params.append(item_id)
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(f"UPDATE todo_items SET {', '.join(updates)} WHERE id = ?", tuple(params))
        conn.commit()
        return cursor.rowcount > 0

def toggle_todo_item(item_id: int, completed: Optional[bool] = None) -> Dict[str, Any]:
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT completed FROM todo_items WHERE id = ?", (item_id,))
        row = cursor.fetchone()
        if not row:
            return {}
        
        current_status = bool(row["completed"])
        new_status = not current_status if completed is None else completed
        completed_at = datetime.datetime.utcnow().isoformat() + "Z" if new_status else None
        
        cursor.execute("""
            UPDATE todo_items 
            SET completed = ?, completed_at = ?
            WHERE id = ?
        """, (1 if new_status else 0, completed_at, item_id))
        conn.commit()
        
        cursor.execute("SELECT * FROM todo_items WHERE id = ?", (item_id,))
        return dict(cursor.fetchone())

def delete_todo_item(item_id: int) -> bool:
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("DELETE FROM todo_items WHERE id = ?", (item_id,))
        conn.commit()
        return cursor.rowcount > 0

# --- Funzioni Cronometro / Timer ---

def start_item_timer(item_id: int) -> Dict[str, Any]:
    """Avvia il cronometro per un compito, registrando il timestamp di partenza."""
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM todo_items WHERE id = ?", (item_id,))
        row = cursor.fetchone()
        if not row:
            return {}
        
        now_iso = datetime.datetime.utcnow().isoformat() + "Z"
        cursor.execute("UPDATE todo_items SET timer_started_at = ? WHERE id = ?", (now_iso, item_id))
        conn.commit()
        
        cursor.execute("SELECT * FROM todo_items WHERE id = ?", (item_id,))
        return dict(cursor.fetchone())

def stop_item_timer(item_id: int, add_elapsed_minutes: Optional[int] = None) -> Dict[str, Any]:
    """Ferma il cronometro e calcola o aggiunge i minuti trascorsi ad actual_minutes."""
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM todo_items WHERE id = ?", (item_id,))
        row = cursor.fetchone()
        if not row:
            return {}
        
        item = dict(row)
        current_actual = item.get("actual_minutes") or 0
        minutes_to_add = 0
        
        if add_elapsed_minutes is not None:
            minutes_to_add = max(0, add_elapsed_minutes)
        elif item.get("timer_started_at"):
            try:
                # Calcola minuti dal timestamp
                started_iso = item["timer_started_at"].replace("Z", "+00:00")
                started_dt = datetime.datetime.fromisoformat(started_iso)
                now_dt = datetime.datetime.now(datetime.timezone.utc)
                delta = now_dt - started_dt
                minutes_to_add = max(1, int(round(delta.total_seconds() / 60.0)))
            except Exception:
                minutes_to_add = 1
                
        new_actual = current_actual + minutes_to_add
        cursor.execute("""
            UPDATE todo_items 
            SET timer_started_at = NULL, actual_minutes = ? 
            WHERE id = ?
        """, (new_actual, item_id))
        conn.commit()
        
        cursor.execute("SELECT * FROM todo_items WHERE id = ?", (item_id,))
        return dict(cursor.fetchone())

# --- Statistiche per il Controllo Genitore ---

def get_parent_stats(start_date: Optional[str] = None, end_date: Optional[str] = None, child_id: Optional[int] = None) -> Dict[str, Any]:
    """Calcola statistiche aggregate di rendimento, tempi stimati vs reali e suddivisione materie."""
    if not start_date or not end_date:
        today = datetime.date.today()
        # Default ultimi 7 giorni con estensione alla fine della settimana scolastica corrente (Domenica)
        cur_dow = today.isoweekday() # 1=Lunedì, 7=Domenica
        end_date = (today + datetime.timedelta(days=(7 - cur_dow))).isoformat()
        start_date = (today - datetime.timedelta(days=7)).isoformat()
        
    with get_connection() as conn:
        cursor = conn.cursor()
        
        # Filtro base
        user_filter = "AND e.assigned_to_user_id = ?" if child_id else ""
        params = [start_date, end_date]
        if child_id:
            params.append(child_id)
            
        # 1. Totali generali
        cursor.execute(f"""
            SELECT 
                COUNT(DISTINCT e.id) as total_events,
                COUNT(ti.id) as total_tasks,
                SUM(CASE WHEN ti.completed = 1 THEN 1 ELSE 0 END) as completed_tasks,
                COALESCE(SUM(ti.estimated_minutes), 0) as total_estimated_minutes,
                COALESCE(SUM(ti.actual_minutes), 0) as total_actual_minutes
            FROM events e
            LEFT JOIN todo_lists tl ON e.id = tl.event_id
            LEFT JOIN todo_items ti ON tl.id = ti.list_id
            WHERE e.event_date >= ? AND e.event_date <= ? {user_filter}
        """, tuple(params))
        general = dict(cursor.fetchone())
        
        # 2. Suddivisione per Categoria / Materia
        cursor.execute(f"""
            SELECT 
                COALESCE(c.name, 'Senza Categoria') as category_name,
                COALESCE(c.color, '#6b7280') as category_color,
                COALESCE(c.icon, '📚') as category_icon,
                COUNT(ti.id) as tasks_count,
                SUM(CASE WHEN ti.completed = 1 THEN 1 ELSE 0 END) as completed_count,
                COALESCE(SUM(ti.estimated_minutes), 0) as estimated_minutes,
                COALESCE(SUM(ti.actual_minutes), 0) as actual_minutes
            FROM events e
            LEFT JOIN categories c ON e.category_id = c.id
            LEFT JOIN todo_lists tl ON e.id = tl.event_id
            LEFT JOIN todo_items ti ON tl.id = ti.list_id
            WHERE e.event_date >= ? AND e.event_date <= ? {user_filter}
            GROUP BY c.id
            HAVING (COUNT(ti.id) > 0 OR COALESCE(SUM(ti.actual_minutes), 0) > 0 OR COALESCE(SUM(ti.estimated_minutes), 0) > 0)
            ORDER BY actual_minutes DESC, estimated_minutes DESC
        """, tuple(params))
        by_category = [dict(r) for r in cursor.fetchall()]
        
        # 3. Compiti con maggior scostamento di tempo (dove il figlio ha impiegato più tempo del previsto)
        cursor.execute(f"""
            SELECT 
                ti.id, ti.title as task_title, e.title as event_title, e.event_date,
                c.name as category_name, c.color as category_color,
                ti.estimated_minutes, ti.actual_minutes,
                (ti.actual_minutes - ti.estimated_minutes) as diff_minutes,
                ti.completed
            FROM todo_items ti
            JOIN todo_lists tl ON ti.list_id = tl.id
            JOIN events e ON tl.event_id = e.id
            LEFT JOIN categories c ON e.category_id = c.id
            WHERE e.event_date >= ? AND e.event_date <= ? {user_filter}
              AND ti.actual_minutes > 0
              AND (ti.actual_minutes - ti.estimated_minutes) > 0
            ORDER BY (ti.actual_minutes - ti.estimated_minutes) DESC
            LIMIT 6
        """, tuple(params))
        top_deviations = [dict(r) for r in cursor.fetchall()]

        # 4. Giorni recenti con impegno orario
        cursor.execute(f"""
            SELECT 
                e.event_date,
                COALESCE(SUM(ti.estimated_minutes), 0) as day_estimated,
                COALESCE(SUM(ti.actual_minutes), 0) as day_actual,
                COUNT(ti.id) as day_tasks,
                SUM(CASE WHEN ti.completed = 1 THEN 1 ELSE 0 END) as day_completed
            FROM events e
            LEFT JOIN todo_lists tl ON e.id = tl.event_id
            LEFT JOIN todo_items ti ON tl.id = ti.list_id
            WHERE e.event_date >= ? AND e.event_date <= ? {user_filter}
            GROUP BY e.event_date
            ORDER BY e.event_date ASC
        """, tuple(params))
        daily_breakdown = [dict(r) for r in cursor.fetchall()]
        
        return {
            "period": {"start_date": start_date, "end_date": end_date},
            "general": general,
            "by_category": by_category,
            "top_deviations": top_deviations,
            "daily_breakdown": daily_breakdown
        }

# --- Funzioni Orario Scolastico (Timetable) & Diario del Giorno ---

def init_default_timetable_if_empty(user_id: int):
    """Nessun dato fittizio automatico: l'orario scolastico parte completamente vuoto."""
    pass

def get_timetable(user_id: int) -> List[Dict[str, Any]]:
    """Restituisce l'orario scolastico dell'utente con dettagli su categorie e colori."""
    init_default_timetable_if_empty(user_id)
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT t.*, c.name as category_name, c.color as category_color, c.icon as category_icon
            FROM timetable_slots t
            LEFT JOIN categories c ON t.category_id = c.id
            WHERE t.user_id = ?
            ORDER BY t.day_of_week ASC, t.start_time ASC, t.period_number ASC
        """, (user_id,))
        return [dict(r) for r in cursor.fetchall()]

def save_timetable_slot(user_id: int, day_of_week: int, period_number: Optional[int] = None,
                        category_id: Optional[int] = None, subject_name: str = "Materia",
                        start_time: str = "08:00", end_time: str = "09:00", room: str = '',
                        category_color: Optional[str] = None) -> int:
    """Inserisce o aggiorna una singola materia nell'orario scolastico."""
    with get_connection() as conn:
        cursor = conn.cursor()
        if not period_number:
            cursor.execute(
                "SELECT COALESCE(MAX(period_number), 0) + 1 FROM timetable_slots WHERE user_id = ? AND day_of_week = ?",
                (user_id, day_of_week)
            )
            period_number = cursor.fetchone()[0]

        if not category_id:
            cursor.execute("SELECT id FROM categories WHERE LOWER(TRIM(name)) = LOWER(TRIM(?)) LIMIT 1", (subject_name,))
            cat_row = cursor.fetchone()
            if not cat_row:
                cursor.execute("SELECT id FROM categories WHERE LOWER(TRIM(name)) LIKE LOWER(TRIM(?)) LIMIT 1", (f"%{subject_name}%",))
                cat_row = cursor.fetchone()
            if cat_row:
                category_id = cat_row["id"]
                if category_color:
                    cursor.execute("UPDATE categories SET color = ? WHERE id = ?", (category_color, category_id))
            else:
                cursor.execute("INSERT INTO categories (name, color, icon) VALUES (?, ?, '📚')", (subject_name, category_color or '#3b82f6'))
                category_id = cursor.lastrowid
        elif category_color:
            cursor.execute("UPDATE categories SET color = ? WHERE id = ?", (category_color, category_id))

        cursor.execute("""
            INSERT INTO timetable_slots (user_id, day_of_week, period_number, category_id, subject_name, start_time, end_time, room)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(user_id, day_of_week, period_number) DO UPDATE SET
                category_id = excluded.category_id,
                subject_name = excluded.subject_name,
                start_time = excluded.start_time,
                end_time = excluded.end_time,
                room = excluded.room
        """, (user_id, day_of_week, period_number, category_id, subject_name, start_time, end_time, room))
        conn.commit()
        return cursor.lastrowid

def delete_timetable_slot(slot_id: int, user_id: Optional[int] = None) -> bool:
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT user_id, subject_name FROM timetable_slots WHERE id = ?", (slot_id,))
        slot_info = cursor.fetchone()

        if user_id:
            cursor.execute("DELETE FROM timetable_slots WHERE id = ? AND user_id = ?", (slot_id, user_id))
        else:
            cursor.execute("DELETE FROM timetable_slots WHERE id = ?", (slot_id,))

        deleted = cursor.rowcount > 0
        if deleted and slot_info:
            # Elimina anche gli eventi generati per questa specifica materia
            cursor.execute(
                "DELETE FROM events WHERE assigned_to_user_id = ? AND LOWER(TRIM(title)) = LOWER(TRIM(?))",
                (slot_info["user_id"], slot_info["subject_name"])
            )
        conn.commit()
        return deleted

def update_timetable_slot(slot_id: int, user_id: Optional[int] = None, **kwargs) -> bool:
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT user_id, subject_name, category_id FROM timetable_slots WHERE id = ?", (slot_id,))
        old_slot = cursor.fetchone()
        if not old_slot:
            return False

        color_updated = False
        cat_color = kwargs.get("category_color")
        if cat_color:
            current_cat_id = kwargs.get("category_id") or old_slot["category_id"]
            if current_cat_id:
                cursor.execute("UPDATE categories SET color = ? WHERE id = ?", (cat_color, current_cat_id))
                color_updated = True
            else:
                sub_n = kwargs.get("subject_name") or old_slot["subject_name"]
                cursor.execute("INSERT INTO categories (name, color, icon) VALUES (?, ?, '📚')", (sub_n, cat_color))
                new_cat_id = cursor.lastrowid
                kwargs["category_id"] = new_cat_id
                color_updated = True

        fields = []
        params = []
        for key in ["day_of_week", "period_number", "category_id", "subject_name", "start_time", "end_time", "room"]:
            if key in kwargs and kwargs[key] is not None:
                fields.append(f"{key} = ?")
                params.append(kwargs[key])
        if not fields:
            if color_updated:
                conn.commit()
                return True
            return False

        query = f"UPDATE timetable_slots SET {', '.join(fields)} WHERE id = ?"
        params.append(slot_id)
        if user_id:
            query += " AND user_id = ?"
            params.append(user_id)

        cursor.execute(query, tuple(params))
        updated = cursor.rowcount > 0

        new_name = kwargs.get("subject_name")
        if updated and new_name and old_slot["subject_name"] != new_name:
            cursor.execute(
                "UPDATE events SET title = ? WHERE assigned_to_user_id = ? AND LOWER(TRIM(title)) = LOWER(TRIM(?))",
                (new_name, old_slot["user_id"], old_slot["subject_name"])
            )
        conn.commit()
        return updated

def save_full_timetable(user_id: int, slots: List[Dict[str, Any]]) -> bool:
    """Salva l'intera griglia oraria dell'utente."""
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("DELETE FROM timetable_slots WHERE user_id = ?", (user_id,))
        for s in slots:
            cursor.execute("""
                INSERT INTO timetable_slots (user_id, day_of_week, period_number, category_id, subject_name, start_time, end_time, room)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                user_id,
                int(s["day_of_week"]),
                int(s["period_number"]),
                s.get("category_id"),
                s.get("subject_name", "Materia"),
                s.get("start_time", "08:00"),
                s.get("end_time", "09:00"),
                s.get("room", "")
            ))
        conn.commit()
        return True

def quick_add_task_to_event(event_id: int, title: str, estimated_minutes: int = 0) -> Dict[str, Any]:
    """Aggiunge all'istante un compito alla to-do list dell'evento, creandola se non presente."""
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT id FROM todo_lists WHERE event_id = ? ORDER BY sort_order ASC, id ASC LIMIT 1", (event_id,))
        row = cursor.fetchone()
        if not row:
            cursor.execute("INSERT INTO todo_lists (event_id, title) VALUES (?, ?)", (event_id, "Compiti & Attività"))
            list_id = cursor.lastrowid
        else:
            list_id = row["id"]

        cursor.execute("""
            INSERT INTO todo_items (list_id, title, estimated_minutes, actual_minutes)
            VALUES (?, ?, ?, 0)
        """, (list_id, title, estimated_minutes))
        item_id = cursor.lastrowid
        conn.commit()

        cursor.execute("SELECT * FROM todo_items WHERE id = ?", (item_id,))
        return dict(cursor.fetchone())

def get_daily_schedule(user_id: int, date_str: str) -> Dict[str, Any]:
    """
    Restituisce la visione completa della giornata scolastica per l'utente:
    - Materie dell'orario scolastico previste per il giorno della settimana (Lunedì-Venerdì)
    - Compiti e to-do list per ciascuna materia
    - Eventi o compiti straordinari del giorno
    - Statistiche del giorno (compiti fatti/totali, tempo stimato vs reale)
    """
    init_default_timetable_if_empty(user_id)
    
    dt = datetime.date.fromisoformat(date_str)
    dow = dt.isoweekday() # 1 = Lunedì, 7 = Domenica
    day_names = ["Lunedì", "Martedì", "Mercoledì", "Giovedì", "Venerdì", "Sabato", "Domenica"]
    day_name = day_names[dow - 1]

    # 1. Recupera slot orario per questo giorno
    timetable_slots = []
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT t.*, c.name as category_name, c.color as category_color, c.icon as category_icon
            FROM timetable_slots t
            LEFT JOIN categories c ON t.category_id = c.id
            WHERE t.user_id = ? AND t.day_of_week = ?
            ORDER BY t.start_time ASC, t.period_number ASC
        """, (user_id, dow))
        timetable_slots = [dict(r) for r in cursor.fetchall()]

    # 2. Recupera gli eventi già registrati nel DB per questa data e utente
    existing_events = get_events(start_date=date_str, end_date=date_str, user_id=user_id)

    matched_event_ids = set()
    subjects = []

    for slot in timetable_slots:
        matched_ev = None
        for ev in existing_events:
            if ev["id"] in matched_event_ids:
                continue
            cat_match = slot["category_id"] and ev.get("category_id") == slot["category_id"]
            title_match = ev["title"].strip().lower() == slot["subject_name"].strip().lower()
            if cat_match or title_match:
                matched_ev = ev
                matched_event_ids.add(ev["id"])
                break

        if not matched_ev:
            # Crea l'evento nel DB per questo giorno così i compiti possono essere salvati stabilmente
            new_ev_id = create_event(
                title=slot["subject_name"],
                description=f"Orario scolastico ({slot['start_time']} - {slot['end_time']})",
                category_id=slot["category_id"],
                event_date=date_str,
                start_time=slot["start_time"],
                end_time=slot["end_time"],
                is_all_day=False,
                assigned_to_user_id=user_id,
                created_by_user_id=user_id
            )
            matched_event_ids.add(new_ev_id)
            ev_details = get_event_details(new_ev_id)
        else:
            ev_details = get_event_details(matched_ev["id"])

        # Estrai la prima lista di compiti o liste
        lists = ev_details.get("lists", [])
        if not lists:
            create_todo_list(ev_details["id"], "Compiti")
            ev_details = get_event_details(ev_details["id"])
            lists = ev_details.get("lists", [])

        # Calcola statistiche per questa materia
        s_tasks = 0
        s_completed = 0
        s_est = 0
        s_act = 0
        for l in lists:
            for item in l.get("items", []):
                s_tasks += 1
                if item.get("completed"):
                    s_completed += 1
                s_est += int(item.get("estimated_minutes") or 0)
                s_act += int(item.get("actual_minutes") or 0)

        subject_card = {
            "slot_id": slot["id"],
            "is_event": False,
            "period_number": slot["period_number"],
            "period_label": "",
            "subject_name": slot["subject_name"],
            "category_id": slot["category_id"],
            "category_name": slot.get("category_name") or ev_details.get("category_name") or slot["subject_name"],
            "category_color": slot.get("category_color") or ev_details.get("category_color") or "#3b82f6",
            "category_icon": slot.get("category_icon") or ev_details.get("category_icon") or "📚",
            "start_time": slot["start_time"],
            "end_time": slot["end_time"],
            "room": slot.get("room", ""),
            "event_id": ev_details["id"],
            "event": ev_details,
            "lists": lists,
            "stats": {
                "total_tasks": s_tasks,
                "completed_tasks": s_completed,
                "estimated_minutes": s_est,
                "actual_minutes": s_act
            }
        }
        subjects.append(subject_card)

    # 2b. Recupera eventi straordinari o singoli del giorno non legati all'orario scolastico fisso
    extra_events = []
    for ev in existing_events:
        if ev["id"] in matched_event_ids:
            continue
        ev_details = get_event_details(ev["id"])
        lists = ev_details.get("lists", [])
        if not lists:
            create_todo_list(ev_details["id"], "Compiti")
            ev_details = get_event_details(ev_details["id"])
            lists = ev_details.get("lists", [])

        s_tasks = 0
        s_completed = 0
        s_est = 0
        s_act = 0
        for l in lists:
            for item in l.get("items", []):
                s_tasks += 1
                if item.get("completed"):
                    s_completed += 1
                s_est += int(item.get("estimated_minutes") or 0)
                s_act += int(item.get("actual_minutes") or 0)

        event_card = {
            "slot_id": None,
            "is_event": True,
            "period_number": len(subjects) + len(extra_events) + 1,
            "period_label": "Evento",
            "subject_name": ev_details.get("title") or "Evento",
            "category_id": ev_details.get("category_id") or 1,
            "category_name": ev_details.get("category_name") or ev_details.get("title") or "Evento",
            "category_color": ev_details.get("category_color") or "#3b82f6",
            "category_icon": ev_details.get("category_icon") or "📅",
            "start_time": ev_details.get("start_time") or "08:00",
            "end_time": ev_details.get("end_time") or "09:00",
            "room": ev_details.get("room", ""),
            "event_id": ev_details["id"],
            "event": ev_details,
            "lists": lists,
            "stats": {
                "total_tasks": s_tasks,
                "completed_tasks": s_completed,
                "estimated_minutes": s_est,
                "actual_minutes": s_act
            }
        }
        extra_events.append(event_card)
        subjects.append(event_card)

    subjects.sort(key=lambda s: s.get("start_time") or "00:00")

    # 3. Totali generali per la giornata (materie scolastiche ed eventi)
    tot_tasks = sum(s["stats"]["total_tasks"] for s in subjects)
    tot_done = sum(s["stats"]["completed_tasks"] for s in subjects)
    tot_est = sum(s["stats"]["estimated_minutes"] for s in subjects)
    tot_act = sum(s["stats"]["actual_minutes"] for s in subjects)

    # 4. Lista unificata dei compiti per le materie e gli eventi della giornata
    unified_todos = []
    for sub in subjects:
        for l in sub.get("lists", []):
            for item in l.get("items", []):
                item_copy = dict(item)
                item_copy["subject_name"] = sub.get("subject_name")
                item_copy["category_name"] = sub.get("category_name")
                item_copy["category_color"] = sub.get("category_color")
                item_copy["category_icon"] = sub.get("category_icon")
                item_copy["event_id"] = sub.get("event_id")
                item_copy["start_time"] = sub.get("start_time")
                item_copy["end_time"] = sub.get("end_time")
                item_copy["period_label"] = sub.get("period_label")
                unified_todos.append(item_copy)

    return {
        "date": date_str,
        "day_of_week": dow,
        "day_name": day_name,
        "is_weekend": dow in (6, 7),
        "subjects": subjects,
        "extra_events": extra_events,
        "unified_todos": unified_todos,
        "totals": {
            "total_tasks": tot_tasks,
            "completed_tasks": tot_done,
            "total_estimated_minutes": tot_est,
            "total_actual_minutes": tot_act,
            "progress_percent": round((tot_done / tot_tasks * 100) if tot_tasks > 0 else 0)
        }
    }

def get_weekly_schedule(user_id: int, start_date_str: str) -> List[Dict[str, Any]]:
    """
    Restituisce la settimana (7 giorni da Lunedì a Domenica) con gli eventi e
    la preview dei to-do per ciascun giorno.
    """
    dt = datetime.date.fromisoformat(start_date_str)
    dow = dt.isoweekday() # 1 = Lunedì
    monday = dt - datetime.timedelta(days=dow - 1)

    week_days = []
    for i in range(7):
        day_date = monday + datetime.timedelta(days=i)
        day_iso = day_date.isoformat()
        day_sched = get_daily_schedule(user_id, day_iso)
        week_days.append(day_sched)

    return week_days


