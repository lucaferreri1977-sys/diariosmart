#!/usr/bin/env bash
# FamilyCal - Script di avvio rapido
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$DIR"

echo "=================================================="
echo "📅 FamilyCal - Calendario & Controllo Compiti"
echo "=================================================="
echo "Avvio del server in corso..."

# Popola il database con dati di prova se non esistono
python3 seed_data.py

echo ""
echo "🚀 Server avviato su http://localhost:8000"
echo "👤 Account Genitore: username 'genitore' - password 'genitore123'"
echo "🧒 Account Figlio:   username 'figlio'   - password 'figlio123'"
echo ""
echo "Premi CTRL+C per arrestare il server."
echo "=================================================="

# Prova ad aprire il browser su macOS
if [[ "$OSTYPE" == "darwin"* ]]; then
  (sleep 1.2 && open "http://localhost:8000") &
fi

python3 server.py
