"""
Suite di test completa per verificare la logica di FamilyCal:
Autenticazione, Eventi, To-Do List Multiple, Cronometro e Statistiche.
"""
import os
import sys
import tempfile
import datetime
import database
import auth

def run_tests():
    print("▶️ Inizio test unitari e di integrazione...")
    test_db = tempfile.mktemp(suffix=".db")
    database.DB_PATH = test_db
    database.init_db()

    # Test 1: Autenticazione
    print("Test 1: Verifica utenti e password...")
    p_user = database.get_user_by_username("genitore")
    assert p_user is not None, "Utente genitore non trovato"
    assert auth.verify_password("enrica06", p_user["salt"], p_user["password_hash"]), "Password genitore errata"
    assert not auth.verify_password("genitore123", p_user["salt"], p_user["password_hash"]), "Vecchia password genitore ancora valida"

    c_user = database.get_user_by_username("giulio")
    assert c_user is not None, "Utente giulio non trovato"
    assert auth.verify_password("giulio06", c_user["salt"], c_user["password_hash"]), "Password giulio errata"
    assert not auth.verify_password("giulio123", c_user["salt"], c_user["password_hash"]), "Vecchia password giulio ancora valida"

    token = database.create_session(p_user["id"])
    assert token is not None and len(token) > 20
    session_user = database.get_user_from_session(token)
    assert session_user["username"] == "genitore"
    print("✅ Test 1 superato!")

    # Test 2: Creazione Evento e To-Do Lists Multiple
    print("Test 2: Creazione evento con liste multiple...")
    today_str = datetime.date.today().isoformat()
    ev_id = database.create_event(
        title="Test Evento Speciale",
        description="Descrizione di test",
        category_id=1,
        event_date=today_str,
        start_time="14:00",
        end_time="15:30",
        is_all_day=False,
        assigned_to_user_id=c_user["id"],
        created_by_user_id=p_user["id"]
    )
    assert ev_id > 0

    # Aggiungi una seconda lista
    list2_id = database.create_todo_list(ev_id, "Seconda Lista Compiti")
    assert list2_id > 0

    # Aggiungi task con tempo stimato
    item1_id = database.create_todo_item(list2_id, "Compito 1 di test", estimated_minutes=30, actual_minutes=0)
    assert item1_id > 0

    # Verifica dettagli evento
    details = database.get_event_details(ev_id)
    assert details is not None
    assert len(details["lists"]) >= 2
    print(f"✅ Test 2 superato! Evento {ev_id} ha {len(details['lists'])} liste collegate.")

    # Test 3: Cronometro e Registrazione Tempo
    print("Test 3: Cronometro e registrazione del tempo effettivo...")
    started_item = database.start_item_timer(item1_id)
    assert started_item["timer_started_at"] is not None

    # Ferma cronometro simulando 25 minuti impiegati
    stopped_item = database.stop_item_timer(item1_id, add_elapsed_minutes=25)
    assert stopped_item["timer_started_at"] is None
    assert stopped_item["actual_minutes"] == 25

    # Segna come completato
    toggled = database.toggle_todo_item(item1_id, True)
    assert toggled["completed"] == 1
    assert toggled["completed_at"] is not None
    print(f"✅ Test 3 superato! Compito completato in {stopped_item['actual_minutes']}m con stima di 30m.")

    # Test 4: Statistiche Genitore
    print("Test 4: Statistiche e calcolo scostamenti...")
    stats = database.get_parent_stats(child_id=c_user["id"])
    assert "general" in stats
    assert "by_category" in stats
    assert stats["general"]["total_tasks"] > 0
    print(f"✅ Test 4 superato! Statistiche calcolate: {stats['general']['completed_tasks']} completati su {stats['general']['total_tasks']} totali.")

    # Test 5: Cadenza Settimanale (Ricorrenza)
    print("Test 5: Programmazione eventi con cadenza settimanale...")
    rec_ev_id = database.create_event(
        title="Lezione di Inglese Settimanale",
        description="Corso settimanale di conversazione",
        category_id=1,
        event_date=today_str,
        start_time="17:00",
        end_time="18:00",
        is_all_day=False,
        assigned_to_user_id=c_user["id"],
        created_by_user_id=p_user["id"],
        is_recurring_weekly=True,
        repeat_weeks=4
    )
    rec_details = database.get_event_details(rec_ev_id)
    assert rec_details["is_recurring_weekly"] == 1
    assert rec_details["recurrence_group_id"] is not None

    with database.get_connection() as conn:
        cur = conn.cursor()
        cur.execute("SELECT COUNT(*) FROM events WHERE recurrence_group_id = ?", (rec_details["recurrence_group_id"],))
        count = cur.fetchone()[0]
        assert count == 4, f"Attesi 4 eventi settimanali, trovati {count}"

    # Elimina tutta la serie
    database.delete_event(rec_ev_id, delete_all_recurring=True)
    with database.get_connection() as conn:
        cur = conn.cursor()
        cur.execute("SELECT COUNT(*) FROM events WHERE recurrence_group_id = ?", (rec_details["recurrence_group_id"],))
        remaining = cur.fetchone()[0]
        assert remaining == 0, f"Attesi 0 eventi dopo eliminazione serie, trovati {remaining}"
    print("✅ Test 5 superato! Creazione ed eliminazione serie settimanale verificate con successo.")

    # Test 6: Orario Scolastico Settimanale e Diario Giornaliero (Parte 100% vuoto)
    print("Test 6: Orario scolastico vuoto di base e aggiunta prima materia...")
    tt = database.get_timetable(c_user["id"])
    initial_count = len(tt)
    print(f"  Orario scolastico attualmente configurato con {initial_count} materie.")

    # Aggiungi una materia da genitore per test
    test_slot_id = database.save_timetable_slot(
        user_id=c_user["id"],
        day_of_week=6, # Sabato per non collidere
        subject_name="Chimica Sperimentale",
        start_time="10:00",
        end_time="11:00"
    )
    assert test_slot_id > 0
    tt_after = database.get_timetable(c_user["id"])
    assert len(tt_after) == initial_count + 1, "Attesa +1 materia configurata"

    # Visione giornaliera per sabato
    test_day = "2026-10-10" # Sabato
    daily = database.get_daily_schedule(c_user["id"], test_day)
    assert daily["day_name"] == "Sabato"
    assert len(daily["subjects"]) >= 1, "Attesa materia per Sabato"
    first_sub = daily["subjects"][0]
    assert first_sub["event_id"] > 0
    print(f"  Materia configurata di Sabato: {first_sub['subject_name']} ({first_sub['start_time']}-{first_sub['end_time']})")

    # Aggiungi rapido compito per la prima materia (es. Matematica)
    quick_item = database.quick_add_task_to_event(first_sub["event_id"], "Esercizi geometria pag 88 n 1,2", estimated_minutes=25)
    assert quick_item["id"] > 0
    assert quick_item["estimated_minutes"] == 25
    print(f"  Compito rapido aggiunto con successo: '{quick_item['title']}' (id: {quick_item['id']})")

    # Ricarica daily schedule e verifica che il compito appaia
    daily_updated = database.get_daily_schedule(c_user["id"], test_day)
    assert daily_updated["totals"]["total_tasks"] > 0
    print(f"✅ Test 6 superato! Visione giornaliera e compiti per materia perfettamente integrati.")

    # Test 7: Aggiunta ed eliminazione materia con orari (gestione materie per genitore)
    print("Test 7: Aggiunta ed eliminazione materia con orari...")
    slot_id = database.save_timetable_slot(
        user_id=c_user["id"],
        day_of_week=3, # Mercoledì
        subject_name="Informatica Applicata",
        start_time="11:00",
        end_time="12:00"
    )
    assert slot_id > 0, "Slot ID non valido"
    
    # Verifica che la nuova materia sia presente nel programma del mercoledì
    daily_wed = database.get_daily_schedule(c_user["id"], "2026-10-07")
    wed_subs = [s["subject_name"] for s in daily_wed["subjects"]]
    assert "Informatica Applicata" in wed_subs, "Materia non trovata nel mercoledì"
    print(f"  Materia 'Informatica Applicata' (11:00-12:00) aggiunta con slot {slot_id} e presente in orario.")

    # Eliminazione della materia
    del_ok = database.delete_timetable_slot(slot_id, user_id=c_user["id"])
    assert del_ok == True, "Eliminazione slot fallita"

    # Verifica che la materia non sia più presente e che il DB non abbia resettato le materie
    daily_wed_after = database.get_daily_schedule(c_user["id"], "2026-10-07")
    wed_subs_after = [s["subject_name"] for s in daily_wed_after["subjects"]]
    assert "Informatica Applicata" not in wed_subs_after, "Materia ancora presente dopo eliminazione"
    print("✅ Test 7 superato! Aggiunta ed eliminazione materia verificate con successo.")

    # Test 8: Modifica materia e modifica parametri compito
    print("Test 8: Modifica materia e modifica parametri compito...")
    slot_to_edit = database.save_timetable_slot(
        user_id=c_user["id"],
        day_of_week=4, # Giovedì
        subject_name="Fisica Generale",
        start_time="09:00",
        end_time="10:00"
    )
    edit_slot_ok = database.update_timetable_slot(
        slot_id=slot_to_edit,
        user_id=c_user["id"],
        subject_name="Fisica Applicata",
        start_time="09:15",
        end_time="10:15"
    )
    assert edit_slot_ok == True, "Modifica materia fallita"
    daily_thu = database.get_daily_schedule(c_user["id"], "2026-10-08")
    thu_subs = {s["subject_name"]: s for s in daily_thu["subjects"]}
    assert "Fisica Applicata" in thu_subs, "Materia modificata non trovata"
    assert thu_subs["Fisica Applicata"]["start_time"] == "09:15", "Orario inizio non aggiornato"

    # Modifica compito rapido
    item_to_edit = database.quick_add_task_to_event(thu_subs["Fisica Applicata"]["event_id"], "Esercizi cap 3", 20)
    edit_item_ok = database.update_todo_item(
        item_id=item_to_edit["id"],
        title="Esercizi cap 3 e 4 completi",
        estimated_minutes=35
    )
    assert edit_item_ok == True, "Modifica compito fallita"
    database.delete_todo_item(item_to_edit["id"])
    database.delete_timetable_slot(slot_to_edit, user_id=c_user["id"])
    print("✅ Test 8 superato! Modifica materia e modifica compito verificate con successo.")

    # Test 9: Configurazione materia o evento nel weekend (Domenica)
    print("Test 9: Configurazione materia o evento nel weekend (Domenica)...")
    sun_slot_id = database.save_timetable_slot(
        user_id=c_user["id"],
        day_of_week=7, # Domenica
        subject_name="Corso Musica / Evento Domenicale",
        start_time="10:00",
        end_time="11:30"
    )
    assert sun_slot_id > 0, "Salvataggio slot Domenica fallito"
    sun_daily = database.get_daily_schedule(c_user["id"], "2026-10-11") # Domenica
    assert sun_daily["day_name"] == "Domenica"
    assert any(s["subject_name"] == "Corso Musica / Evento Domenicale" for s in sun_daily["subjects"]), "Slot Domenica non trovato"
    database.delete_timetable_slot(sun_slot_id, user_id=c_user["id"])
    print("✅ Test 9 superato! Configurazione materie ed eventi per Domenica verificata con successo.")

    # Cleanup evento di test 1, slot di test 6 e compito rapido di test 6
    database.delete_todo_item(quick_item["id"])
    database.delete_timetable_slot(test_slot_id, user_id=c_user["id"])
    database.delete_event(ev_id)
    print("🧹 Pulizia dati di test completata.")
    if os.path.exists(test_db):
        try:
            os.remove(test_db)
        except Exception:
            pass
    print("🎉 TUTTI I TEST SONO PASSATI CON SUCCESSO!")

if __name__ == "__main__":
    run_tests()
