import sys
import os

# Aggiungi la root del repository al sys.path
root_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if root_dir not in sys.path:
    sys.path.insert(0, root_dir)

import database
from server import CalendarRequestHandler

# Assicura inizializzazione DB su serverless
database.init_db()

class handler(CalendarRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
