"""
Script di popolamento dati dimostrativi per FamilyCal.
Crea eventi di esempio con to-do list collegate, stime e tempi reali per testare subito l'applicazione.
"""
import datetime
import database

def seed():
    database.init_db()
    
    # Verifica se ci sono già eventi
    events = database.get_events()
    if len(events) > 0:
        print(f"Il database contiene già {len(events)} eventi. Seed saltato per non sovrascrivere.")
        return

    today = datetime.date.today()
    child = database.get_user_by_username("figlio")
    parent = database.get_user_by_username("genitore")
    cats = {c["name"]: c["id"] for c in database.get_categories()}

    child_id = child["id"] if child else 2
    parent_id = parent["id"] if parent else 1

    # 1. Evento Oggi: Matematica
    ev1_id = database.create_event(
        title="Compiti di Matematica & Geometria",
        description="Esercizi sulle equazioni e problemi con il triangolo rettangolo.",
        category_id=cats.get("Matematica"),
        event_date=today.isoformat(),
        start_time="15:00",
        end_time="16:30",
        is_all_day=False,
        assigned_to_user_id=child_id,
        created_by_user_id=parent_id
    )

    # Recupera la lista di default creata
    with database.get_connection() as conn:
        cur = conn.cursor()
        cur.execute("SELECT id FROM todo_lists WHERE event_id = ?", (ev1_id,))
        first_list_id = cur.fetchone()["id"]
        # Rinomina prima lista
        cur.execute("UPDATE todo_lists SET title = 'Esercizi Scritti' WHERE id = ?", (first_list_id,))
        conn.commit()

    # Task per Lista 1
    t1 = database.create_todo_item(first_list_id, "Esercizi pag. 142 n. 1, 2, 3", estimated_minutes=25, actual_minutes=20, notes="Completati senza difficoltà")
    database.toggle_todo_item(t1, True)

    t2 = database.create_todo_item(first_list_id, "Problema n. 5 con Pitagora", estimated_minutes=20, actual_minutes=35, notes="Ha richiesto un po' più di tempo per i calcoli")
    database.toggle_todo_item(t2, True)

    # Crea Seconda Lista per lo stesso evento!
    list2_id = database.create_todo_list(ev1_id, "Studio Teoria & Formule")
    database.create_todo_item(list2_id, "Ripetere formule delle aree a voce alta", estimated_minutes=15, actual_minutes=0, notes="Da fare prima di cena")

    # 2. Evento Ieri: Scienze & Tecnologia
    yesterday = today - datetime.timedelta(days=1)
    ev2_id = database.create_event(
        title="Scienze - Ricerca sul Sistema Solare",
        description="Preparazione della mappa concettuale sui pianeti rocciosi.",
        category_id=cats.get("Scienze & Tecnologia"),
        event_date=yesterday.isoformat(),
        start_time="16:30",
        end_time="17:45",
        is_all_day=False,
        assigned_to_user_id=child_id,
        created_by_user_id=parent_id
    )
    with database.get_connection() as conn:
        cur = conn.cursor()
        cur.execute("SELECT id FROM todo_lists WHERE event_id = ?", (ev2_id,))
        scienze_list_id = cur.fetchone()["id"]

    t3 = database.create_todo_item(scienze_list_id, "Disegnare la mappa concettuale a colori", estimated_minutes=30, actual_minutes=30)
    database.toggle_todo_item(t3, True)
    t4 = database.create_todo_item(scienze_list_id, "Leggere pag. 88-91 e rispondere alle 4 domande", estimated_minutes=25, actual_minutes=25)
    database.toggle_todo_item(t4, True)

    # 3. Evento Domani: Italiano
    tomorrow = today + datetime.timedelta(days=1)
    ev3_id = database.create_event(
        title="Italiano - Brano di Narrativa & Grammatica",
        description="Lettura capitolo 3 e analisi logica delle prime 5 frasi.",
        category_id=cats.get("Italiano & Grammatica"),
        event_date=tomorrow.isoformat(),
        start_time="15:30",
        end_time="17:00",
        is_all_day=False,
        assigned_to_user_id=child_id,
        created_by_user_id=parent_id
    )
    with database.get_connection() as conn:
        cur = conn.cursor()
        cur.execute("SELECT id FROM todo_lists WHERE event_id = ?", (ev3_id,))
        ita_list_id = cur.fetchone()["id"]
        cur.execute("UPDATE todo_lists SET title = 'Compiti del Libro' WHERE id = ?", (ita_list_id,))
        conn.commit()

    database.create_todo_item(ita_list_id, "Leggere capitolo 3 da pag. 45", estimated_minutes=30, actual_minutes=0)
    database.create_todo_item(ita_list_id, "Esercizi di analisi logica n. 1 e 2", estimated_minutes=25, actual_minutes=0)

    # 4. Evento Sabato: Sport / Allenamento
    days_to_saturday = (5 - today.weekday()) % 7
    saturday = today + datetime.timedelta(days=days_to_saturday if days_to_saturday > 0 else 7)
    ev4_id = database.create_event(
        title="Allenamento di Calcio ⚽",
        description="Partita amichevole e borsa sportiva da preparare.",
        category_id=cats.get("Sport & Movimento"),
        event_date=saturday.isoformat(),
        start_time="10:00",
        end_time="12:00",
        is_all_day=False,
        assigned_to_user_id=child_id,
        created_by_user_id=parent_id
    )
    with database.get_connection() as conn:
        cur = conn.cursor()
        cur.execute("SELECT id FROM todo_lists WHERE event_id = ?", (ev4_id,))
        sport_list_id = cur.fetchone()["id"]
        cur.execute("UPDATE todo_lists SET title = 'Preparazione Zaino & Materiale' WHERE id = ?", (sport_list_id,))
        conn.commit()

    database.create_todo_item(sport_list_id, "Preparare scarpe da calcio con tacchetti pulite", estimated_minutes=10, actual_minutes=5)
    database.create_todo_item(sport_list_id, "Borraccia e divisa lavata", estimated_minutes=5, actual_minutes=5)

    print("✅ Dati dimostrativi inseriti con successo!")

if __name__ == "__main__":
    seed()
