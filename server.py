import os
import json
import datetime
import urllib.parse
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
import database
import auth

PORT = 8000
STATIC_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "static")

class CalendarRequestHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        if "directory" not in kwargs and os.path.exists(STATIC_DIR):
            kwargs["directory"] = STATIC_DIR
        super().__init__(*args, **kwargs)

    def log_message(self, format, *args):
        # Log pulito delle richieste
        print(f"[{self.log_date_time_string()}] {self.command} {self.path} - {args[0] if args else ''}")

    def send_json(self, status_code: int, data: dict):
        response_bytes = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(status_code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(response_bytes)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS")
        self.end_headers()
        self.wfile.write(response_bytes)

    def parse_body(self) -> dict:
        content_length = int(self.headers.get("Content-Length", 0))
        if content_length > 0:
            body = self.rfile.read(content_length).decode("utf-8")
            try:
                return json.loads(body)
            except Exception:
                return {}
        return {}

    def get_current_user(self):
        token = None
        auth_header = self.headers.get("Authorization")
        if auth_header and auth_header.startswith("Bearer "):
            token = auth_header.split(" ")[1]
        
        if not token:
            cookie_header = self.headers.get("Cookie")
            if cookie_header:
                for cookie in cookie_header.split(";"):
                    cookie = cookie.strip()
                    if cookie.startswith("calendar_session="):
                        token = cookie.split("=")[1]
                        break

        if not token:
            return None
        user = database.get_user_from_session(token)
        return dict(user) if user else None

    def end_headers(self):
        self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS")
        self.end_headers()

    def do_GET(self):
        parsed_url = urllib.parse.urlparse(self.path)
        path = parsed_url.path
        query = urllib.parse.parse_qs(parsed_url.query)

        # Gestione API
        if path.startswith("/api/"):
            return self.handle_api_get(path, query)

        # Servire i file statici (index.html, style.css, app.js, ecc.)
        if path == "/" or not os.path.exists(os.path.join(STATIC_DIR, path.lstrip("/"))):
            self.path = "/index.html"
            
        return super().do_GET()

    def resolve_target_child_id(self, user: dict, req_user_id=None) -> int:
        if user.get("role") == "child":
            return user["id"]
        if req_user_id is not None and str(req_user_id).strip() != "":
            try:
                return int(req_user_id)
            except (ValueError, TypeError):
                pass
        child_u = database.get_user_by_username("giulio")
        if not child_u:
            users = database.get_all_users()
            children = [u for u in users if u.get("role") == "child"]
            if children:
                return children[0]["id"]
        return child_u["id"] if child_u else user["id"]

    def handle_api_get(self, path: str, query: dict):
        user = self.get_current_user()

        # Endpoint pubblici
        if path == "/api/auth/me":
            if user:
                return self.send_json(200, {"ok": True, "user": user})
            return self.send_json(401, {"ok": False, "error": "Non autenticato"})

        if not user:
            return self.send_json(401, {"ok": False, "error": "Accesso non autorizzato. Effettua il login."})

        # Utenti
        if path == "/api/users":
            users = [dict(u) for u in database.get_all_users()]
            return self.send_json(200, {"ok": True, "users": users})

        # Categorie
        if path == "/api/categories":
            cats = [dict(c) for c in database.get_categories()]
            return self.send_json(200, {"ok": True, "categories": cats})

        # Eventi (filtri start_date, end_date, user_id)
        if path == "/api/events":
            start_date = query.get("start_date", [None])[0]
            end_date = query.get("end_date", [None])[0]
            req_user_id = query.get("user_id", [None])[0]
            
            # Se l'utente è un figlio, vede solo i propri eventi
            if user["role"] == "child":
                target_user_id = user["id"]
            else:
                target_user_id = int(req_user_id) if req_user_id else None

            events = database.get_events(start_date, end_date, target_user_id)
            return self.send_json(200, {"ok": True, "events": events})

        # Dettaglio singolo evento con to-do lists e items
        if path.startswith("/api/events/") and path.count("/") == 3:
            event_id = int(path.split("/")[3])
            ev = database.get_event_details(event_id)
            if not ev:
                return self.send_json(404, {"ok": False, "error": "Evento non trovato"})
            return self.send_json(200, {"ok": True, "event": ev})

        # Statistiche per il Genitore
        if path == "/api/stats":
            if user["role"] != "parent":
                # Anche il figlio può vedere le proprie statistiche motivazionali
                child_id = user["id"]
            else:
                req_child_id = query.get("child_id", [None])[0]
                child_u = database.get_user_by_username("giulio")
                default_target = child_u["id"] if child_u else None
                child_id = int(req_child_id) if req_child_id else default_target
                
            start_date = query.get("start_date", [None])[0]
            end_date = query.get("end_date", [None])[0]
            stats = database.get_parent_stats(start_date, end_date, child_id)
            return self.send_json(200, {"ok": True, "stats": stats})

        # Orario Scolastico Settimanale: GET /api/timetable
        if path == "/api/timetable":
            req_user_id = query.get("user_id", [None])[0]
            target_user_id = self.resolve_target_child_id(user, req_user_id)
            tt = database.get_timetable(target_user_id)
            return self.send_json(200, {"ok": True, "timetable": tt})

        # Visione Giornaliera Orario Scolastico & Compiti per Materia: GET /api/daily-schedule
        if path == "/api/daily-schedule":
            date_str = query.get("date", [datetime.date.today().isoformat()])[0]
            req_user_id = query.get("user_id", [None])[0]
            target_user_id = self.resolve_target_child_id(user, req_user_id)
            sched = database.get_daily_schedule(target_user_id, date_str)
            return self.send_json(200, {"ok": True, "schedule": sched})

        # Visione Settimanale con Preview Eventi & To-Do: GET /api/weekly-schedule
        if path == "/api/weekly-schedule":
            start_date = query.get("start_date", [datetime.date.today().isoformat()])[0]
            req_user_id = query.get("user_id", [None])[0]
            target_user_id = self.resolve_target_child_id(user, req_user_id)
            week_data = database.get_weekly_schedule(target_user_id, start_date)
            return self.send_json(200, {"ok": True, "week": week_data})

        return self.send_json(404, {"ok": False, "error": f"Endpoint GET non trovato: {path}"})

    def do_POST(self):
        parsed_url = urllib.parse.urlparse(self.path)
        path = parsed_url.path
        body = self.parse_body()

        # Login
        if path == "/api/auth/login":
            username = body.get("username", "").strip()
            password = body.get("password", "")
            u_row = database.get_user_by_username(username)
            if not u_row:
                return self.send_json(401, {"ok": False, "error": "Utente non trovato"})
            
            is_valid = auth.verify_password(password, u_row["salt"], u_row["password_hash"])

            if not is_valid:
                return self.send_json(401, {"ok": False, "error": "Password non valida"})
            
            token = database.create_session(u_row["id"])
            user_data = {
                "id": u_row["id"],
                "username": u_row["username"],
                "role": u_row["role"],
                "display_name": u_row["display_name"],
                "avatar_emoji": u_row["avatar_emoji"]
            }
            return self.send_json(200, {"ok": True, "token": token, "user": user_data})

        # Autenticazione richiesta per tutto il resto
        user = self.get_current_user()
        if not user:
            return self.send_json(401, {"ok": False, "error": "Non autorizzato"})

        # Logout
        if path == "/api/auth/logout":
            token = None
            auth_header = self.headers.get("Authorization")
            if auth_header and auth_header.startswith("Bearer "):
                token = auth_header.split(" ")[1]
            if token:
                database.delete_session(token)
            return self.send_json(200, {"ok": True, "message": "Logout effettuato"})

        # Creazione nuovo utente (solo genitore)
        if path == "/api/users":
            if user["role"] != "parent":
                return self.send_json(403, {"ok": False, "error": "Solo il genitore può aggiungere utenti"})
            new_id = database.create_user(
                username=body.get("username"),
                password=body.get("password"),
                role=body.get("role", "child"),
                display_name=body.get("display_name"),
                avatar_emoji=body.get("avatar_emoji", "👤")
            )
            return self.send_json(201, {"ok": True, "id": new_id})

        # Creazione Categoria
        if path == "/api/categories":
            if user["role"] != "parent":
                return self.send_json(403, {"ok": False, "error": "Solo il genitore può gestire le categorie"})
            cat_id = database.create_category(body.get("name"), body.get("color"), body.get("icon", "📚"))
            return self.send_json(201, {"ok": True, "id": cat_id})

        # Creazione Evento
        if path == "/api/events":
            assigned_id = body.get("assigned_to_user_id") or user["id"]
            if user["role"] == "child":
                assigned_id = user["id"]
                
            event_id = database.create_event(
                title=body.get("title", "Nuovo Evento"),
                description=body.get("description", ""),
                category_id=body.get("category_id"),
                event_date=body.get("event_date"),
                start_time=body.get("start_time"),
                end_time=body.get("end_time"),
                is_all_day=body.get("is_all_day", False),
                assigned_to_user_id=assigned_id,
                created_by_user_id=user["id"],
                is_recurring_weekly=bool(body.get("is_recurring_weekly", False)),
                repeat_weeks=int(body.get("repeat_weeks", 1))
            )
            return self.send_json(201, {"ok": True, "id": event_id})

        # Creazione To-Do List in un evento: POST /api/events/:id/lists
        if path.startswith("/api/events/") and path.endswith("/lists"):
            event_id = int(path.split("/")[3])
            list_id = database.create_todo_list(event_id, body.get("title", "Nuova Lista"))
            return self.send_json(201, {"ok": True, "id": list_id})

        # Creazione To-Do Item in una lista: POST /api/lists/:id/items
        if path.startswith("/api/lists/") and path.endswith("/items"):
            list_id = int(path.split("/")[3])
            item_id = database.create_todo_item(
                list_id=list_id,
                title=body.get("title", "Nuovo Compito"),
                estimated_minutes=int(body.get("estimated_minutes", 0)),
                actual_minutes=int(body.get("actual_minutes", 0)),
                notes=body.get("notes", "")
            )
            return self.send_json(201, {"ok": True, "id": item_id})

        # Avvio timer per un task: POST /api/items/:id/timer/start
        if path.startswith("/api/items/") and path.endswith("/timer/start"):
            item_id = int(path.split("/")[3])
            updated = database.start_item_timer(item_id)
            return self.send_json(200, {"ok": True, "item": updated})

        # Stop timer per un task: POST /api/items/:id/timer/stop
        if path.startswith("/api/items/") and path.endswith("/timer/stop"):
            item_id = int(path.split("/")[3])
            added_min = body.get("added_minutes")
            updated = database.stop_item_timer(item_id, added_min)
            return self.send_json(200, {"ok": True, "item": updated})

        # Salvataggio Orario Scolastico: POST /api/timetable
        if path == "/api/timetable":
            if user["role"] != "parent":
                return self.send_json(403, {"ok": False, "error": "Solo il genitore può aggiungere o modificare materie"})

            target_user_id = self.resolve_target_child_id(user, body.get("user_id"))
            
            slots = body.get("slots")
            if slots is not None and isinstance(slots, list):
                database.save_full_timetable(target_user_id, slots)
                return self.send_json(200, {"ok": True, "message": "Orario scolastico aggiornato"})
            else:
                period_num = int(body.get("period_number")) if body.get("period_number") else None
                slot_id = database.save_timetable_slot(
                    user_id=target_user_id,
                    day_of_week=int(body.get("day_of_week", 1)),
                    period_number=period_num,
                    category_id=body.get("category_id"),
                    subject_name=body.get("subject_name", "Materia").strip(),
                    start_time=body.get("start_time", "08:00"),
                    end_time=body.get("end_time", "09:00"),
                    room=body.get("room", "")
                )
                return self.send_json(201, {"ok": True, "id": slot_id})

        # Creazione rapida compito per materia del giorno: POST /api/daily-schedule/quick-task
        if path == "/api/daily-schedule/quick-task":
            event_id = int(body.get("event_id", 0))
            date_str = body.get("date_str")
            title = body.get("title", "").strip()
            if not title:
                return self.send_json(400, {"ok": False, "error": "Il titolo del compito è obbligatorio"})
            est_min = int(body.get("estimated_minutes", 0))
            target_user_id = self.resolve_target_child_id(user, body.get("user_id"))

            if not event_id and date_str:
                sched = database.get_daily_schedule(target_user_id, date_str)
                if sched.get("subjects") and len(sched["subjects"]) > 0:
                    event_id = sched["subjects"][0]["event_id"]
                elif sched.get("extra_events") and len(sched["extra_events"]) > 0:
                    event_id = sched["extra_events"][0]["id"]
                else:
                    event_id = database.create_event(
                        title="Compiti del Giorno",
                        event_date=date_str,
                        is_all_day=True,
                        assigned_to_user_id=target_user_id,
                        created_by_user_id=target_user_id
                    )
            elif not event_id:
                today_str = datetime.date.today().isoformat()
                sched = database.get_daily_schedule(target_user_id, today_str)
                if sched.get("subjects") and len(sched["subjects"]) > 0:
                    event_id = sched["subjects"][0]["event_id"]
                else:
                    event_id = database.create_event(
                        title="Compiti del Giorno",
                        event_date=today_str,
                        is_all_day=True,
                        assigned_to_user_id=target_user_id,
                        created_by_user_id=target_user_id
                    )

            item = database.quick_add_task_to_event(event_id, title, est_min)
            return self.send_json(201, {"ok": True, "item": item})

        return self.send_json(404, {"ok": False, "error": f"Endpoint POST non trovato: {path}"})

    def do_PUT(self):
        parsed_url = urllib.parse.urlparse(self.path)
        path = parsed_url.path
        body = self.parse_body()
        user = self.get_current_user()
        if not user:
            return self.send_json(401, {"ok": False, "error": "Non autorizzato"})

        # Modifica Evento: PUT /api/events/:id
        if path.startswith("/api/events/") and path.count("/") == 3:
            event_id = int(path.split("/")[3])
            assigned_id = body.get("assigned_to_user_id") or user["id"]
            update_all = bool(body.get("update_all_recurring", False))
            success = database.update_event(
                event_id=event_id,
                title=body.get("title"),
                description=body.get("description", ""),
                category_id=body.get("category_id"),
                event_date=body.get("event_date"),
                start_time=body.get("start_time"),
                end_time=body.get("end_time"),
                is_all_day=body.get("is_all_day", False),
                assigned_to_user_id=assigned_id,
                update_all_recurring=update_all
            )
            return self.send_json(200, {"ok": success})

        # Modifica To-Do List: PUT /api/lists/:id
        if path.startswith("/api/lists/") and path.count("/") == 3:
            list_id = int(path.split("/")[3])
            success = database.update_todo_list(list_id, body.get("title"))
            return self.send_json(200, {"ok": success})

        # Modifica To-Do Item: PUT /api/items/:id
        if path.startswith("/api/items/") and path.count("/") == 3:
            item_id = int(path.split("/")[3])
            success = database.update_todo_item(
                item_id=item_id,
                title=body.get("title"),
                estimated_minutes=body.get("estimated_minutes"),
                actual_minutes=body.get("actual_minutes"),
                notes=body.get("notes")
            )
            return self.send_json(200, {"ok": success})

        # Modifica Categoria: PUT /api/categories/:id
        if path.startswith("/api/categories/") and path.count("/") == 3:
            if user["role"] != "parent":
                return self.send_json(403, {"ok": False, "error": "Solo il genitore può modificare categorie"})
            cat_id = int(path.split("/")[3])
            success = database.update_category(cat_id, body.get("name"), body.get("color"), body.get("icon"))
            return self.send_json(200, {"ok": success})

        # Modifica Utente (nome, avatar, password): PUT /api/users/:id
        if path.startswith("/api/users/") and path.count("/") == 3:
            target_id = int(path.split("/")[3])
            if user["role"] != "parent" and user["id"] != target_id:
                return self.send_json(403, {"ok": False, "error": "Permesso negato"})
            success = database.update_user(
                user_id=target_id,
                display_name=body.get("display_name"),
                avatar_emoji=body.get("avatar_emoji"),
                password=body.get("password")
            )
            return self.send_json(200, {"ok": success})

        return self.send_json(404, {"ok": False, "error": f"Endpoint PUT non trovato: {path}"})

    def do_PATCH(self):
        parsed_url = urllib.parse.urlparse(self.path)
        path = parsed_url.path
        body = self.parse_body()
        user = self.get_current_user()
        if not user:
            return self.send_json(401, {"ok": False, "error": "Non autorizzato"})

        # Toggle completamento task: PATCH /api/items/:id/toggle
        if path.startswith("/api/items/") and path.endswith("/toggle"):
            item_id = int(path.split("/")[3])
            completed = body.get("completed")
            updated = database.toggle_todo_item(item_id, completed)
            return self.send_json(200, {"ok": True, "item": updated})

        return self.send_json(404, {"ok": False, "error": f"Endpoint PATCH non trovato: {path}"})

    def do_DELETE(self):
        parsed_url = urllib.parse.urlparse(self.path)
        path = parsed_url.path
        user = self.get_current_user()
        if not user:
            return self.send_json(401, {"ok": False, "error": "Non autorizzato"})

        # Elimina Evento
        if path.startswith("/api/events/") and path.count("/") == 3:
            event_id = int(path.split("/")[3])
            query = urllib.parse.parse_qs(parsed_url.query)
            delete_all = query.get("all_recurring", ["false"])[0].lower() == "true"
            success = database.delete_event(event_id, delete_all_recurring=delete_all)
            return self.send_json(200, {"ok": success})

        # Elimina To-Do List
        if path.startswith("/api/lists/") and path.count("/") == 3:
            list_id = int(path.split("/")[3])
            success = database.delete_todo_list(list_id)
            return self.send_json(200, {"ok": success})

        # Elimina To-Do Item
        if path.startswith("/api/items/") and path.count("/") == 3:
            item_id = int(path.split("/")[3])
            success = database.delete_todo_item(item_id)
            return self.send_json(200, {"ok": success})

        # Elimina Categoria (solo genitore)
        if path.startswith("/api/categories/") and path.count("/") == 3:
            if user["role"] != "parent":
                return self.send_json(403, {"ok": False, "error": "Solo il genitore può eliminare categorie"})
            cat_id = int(path.split("/")[3])
            success = database.delete_category(cat_id)
            return self.send_json(200, {"ok": success})

        # Elimina Slot Orario Scolastico: DELETE /api/timetable/:id
        if path.startswith("/api/timetable/") and path.count("/") == 3:
            if user["role"] != "parent":
                return self.send_json(403, {"ok": False, "error": "Solo il genitore può eliminare le materie"})
            slot_id = int(path.split("/")[3])
            success = database.delete_timetable_slot(slot_id)
            return self.send_json(200, {"ok": success})

        return self.send_json(404, {"ok": False, "error": f"Endpoint DELETE non trovato: {path}"})

def run_server(port=PORT):
    database.init_db()
    server_address = ("", port)
    httpd = ThreadingHTTPServer(server_address, CalendarRequestHandler)
    print(f"🚀 Server avviato con successo su http://localhost:{port}")
    print(f"👉 Modalità multi-utente attiva: Genitore & Figlio")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nArresto del server...")
        httpd.server_close()

if __name__ == "__main__":
    run_server()
