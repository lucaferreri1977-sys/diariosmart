# 📅 FamilyCal - Calendario & Controllo Compiti con To-Do List Multiple

Applicazione web moderna e responsive creata su misura per la gestione dello studio e delle attività quotidiane di tuo figlio, con controllo e pianificazione genitoriale.

---

## ✨ Funzionalità Principali

1. **Visione Giornaliera dell'Orario Scolastico & Diario dei Compiti (Vista Principale)**:
   - Visualizzazione immediata della giornata scolastica con le materie in ordine orario (1ª ora, 2ª ora, 3ª ora...).
   - **Compiti per Materia Aperti e Direttamente Visibili**: niente modali o popup nidificati per vedere i compiti; ogni materia mostra la sua checklist interattiva con spunta di completamento.
   - **Aggiunta Rapida Compiti**: modulo inline `+ Aggiungi compito per [Materia]` con stima minuti (es. 20, 25, 30 min) direttamente sotto ciascuna materia.
   - Navigazione rapida tra i giorni della settimana con pulsanti pillola `[Lun] [Mar] [Mer] [Gio] [Ven] [Sab]` e frecce `‹ Ieri` / `Domani ›`.
   - Sezione separata per attività pomeridiane o straordinarie (sport, musica, visite).

2. **Orologio a Pomodoro Visivo con Conto alla Rovescia (Time Timer)**:
   - Ispirato al celebre timer analogico con cassa azzurra, manopola centrale e **disco rosso che si ritrae in senso orario man mano che il tempo scorre**.
   - Mostra visivamente quanti minuti mancano al traguardo (0–60 min sul quadrante).
   - Rintocco acustico dolce (*Ding-Dong*) quando il conto alla rovescia tocca lo zero.
   - Tracciamento automatico del tempo effettivo impiegato per ciascun compito.

3. **Orario Scolastico Settimanale Configurabile (Lunedì - Sabato)**:
   - Pulsante `⚙️ Orario Settimanale` per personalizzare o modificare la griglia delle materie settimanali.
   - Pre-popolato con un orario scolastico realistico (Matematica, Italiano, Scienze, Inglese, Storia, Arte, Motoria).

4. **Autenticazione & Ruoli Differenziati**:
   - **Profilo Genitore**: Pianificazione, controllo compiti, gestione materie e accesso al pannello di controllo e statistiche.
   - **Profilo Figlio**: Diario scolastico con spunte dei compiti e orologio pomodoro visivo.

5. **Stima del Tempo vs Tempo Reale Impiegato**:
   - Tempo stimato impostato dal genitore o dal figlio.
   - Monitoraggio del tempo reale tramite l'orologio visivo o inserimento manuale.
   - Alert visivi se il tempo effettivo supera la stima (es. `⚠️ 35m (+10m)`).

6. **Viste Calendario Multiple**:
   - **🎒 Orario & Compiti di Oggi**: Diario giornaliero scolastico con compiti aperti.
   - **🗓️ Vista Mese**: Panoramica mensile con badge compiti e avanzamento.
   - **📅 Vista Settimana**: Distribuzione settimanale degli impegni.
   - **📊 Controllo Genitore**: Statistiche, KPI di rendimento, tempi per materia e compiti con maggiore scostamento.

7. **Programmazione con Cadenza Settimanale**:
   - Spunta `🔁 Ripeti ogni settimana` per programmare impegni ricorrenti (4, 8, 12, 24, 36 settimane).

7. **Zero Dipendenze Esterne**:
   - Realizzato con la libreria standard di Python 3 (`http.server`, `sqlite3`, `hashlib`).
   - Nessun bisogno di `npm` o pacchetti esterni, funziona istantaneamente su qualsiasi Mac o computer.

---

## 🚀 Avvio Rapido

Apri il Terminale nella cartella del progetto ed esegui:

```bash
./start.sh
```

Lo script avvierà il server e aprirà automaticamente il browser su **`http://localhost:8000`**.

In alternativa puoi avviarlo manualmente con:

```bash
python3 server.py
```
e aprire il browser su [http://localhost:8000](http://localhost:8000).

---

## 👥 Credenziali di Accesso Predefinite

Nella schermata di login troverai sia i pulsanti per l'accesso rapido che il form credenziali:

| Ruolo | Username | Password | Permessi |
|---|---|---|---|
| **Genitore** | `genitore` | `genitore123` | Pianificazione, controllo compiti, gestione materie, statistiche |
| **Figlio** | `figlio` | `figlio123` | Visualizzazione calendario, spunta compiti, cronometro tempo reale |

> 💡 *Puoi passare istantaneamente tra i due profili dal menu a discesa in alto a destra.*

---

## 📂 Struttura del Progetto

```
CALENDARIO/
├── server.py              # Server HTTP REST multi-thread e gestione API
├── database.py            # Database SQLite con tabelle utenti, eventi, to-do list e compiti
├── auth.py                # Hashing sicuro password (PBKDF2-SHA256) e sessioni
├── seed_data.py           # Script con dati dimostrativi di esempio (eventi e compiti)
├── start.sh               # Script eseguibile per avvio rapido con un click
├── static/
│   ├── index.html         # Interfaccia grafica completa
│   ├── css/
│   │   └── style.css      # Stili moderni, responsive (desktop, tablet, mobile)
│   └── js/
│       ├── api.js         # Client API e gestione token
│       ├── calendar.js    # Rendering del calendario (Mese, Settimana, Agenda)
│       ├── timer.js       # Motore del cronometro per i singoli compiti
│       ├── stats.js       # Dashboard di controllo e statistiche genitore
│       └── app.js         # Controller principale dell'applicazione
└── test_suite.py          # Test unitari e di integrazione
```

---

## 🛠️ Come Usare l'Applicazione

### 1. Creare un Evento nel Calendario
1. Clicca su **"+ Nuovo Evento"** (o sul tasto `+` su un giorno specifico del calendario).
2. Assegna un titolo (es. *Compiti di Matematica*), la materia (es. *Matematica* 📐), data e orario.
3. Clicca su **"Salva Evento"**: si aprirà subito la schermata di gestione dei compiti.

### 2. Aggiungere To-Do List e Compiti all'Evento
1. Clicca sull'evento nel calendario per aprirne i dettagli.
2. Troverai una prima lista predefinita. Puoi crearne altre cliccando su **"+ Nuova Lista per questo Evento"** (es. *Studio Orale*, *Esercizi Scritti*).
3. All'interno di ogni lista, scrivi il compito nel campo di testo, indica i minuti stimati (es. `20` min) e clicca su **"+ Aggiungi"**.

### 3. Usare il Cronometro per il Tempo Reale
1. Quando tuo figlio si siede a fare i compiti, preme il tasto ▶️ accanto al compito assegnato.
2. Il cronometro parte e mostra il conteggio dei minuti e secondi in diretta.
3. Al termine del compito, clicca su ⏹️: il tempo effettivo impiegato viene registrato e confrontato con la stima!
4. Clicca sulla casella di spunta per segnare il compito come completato.

### 4. Consultare le Statistiche (Genitore)
1. Clicca sul tab **"📊 Controllo Genitore"** nella barra in alto.
2. Visualizza il grafico comparativo del tempo per ogni materia.
3. Consulta la sezione **⚠️ Compiti con Maggiore Scostamento** per vedere dove tuo figlio ha impiegato più tempo rispetto alla stima.
