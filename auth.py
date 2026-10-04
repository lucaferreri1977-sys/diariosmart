import hashlib
import secrets
import datetime
import hmac
import base64
import json
import time
import os
from typing import Optional, Dict, Any

# Costanti di sicurezza
HASH_ITERATIONS = 100000
SESSION_DURATION_DAYS = 30
SECRET_KEY = os.environ.get("SESSION_SECRET", "diariosmart-secret-salt-family-cal-2026")

def generate_salt() -> str:
    """Genera un salt casuale sicuro."""
    return secrets.token_hex(16)

def hash_password(password: str, salt: str) -> str:
    """Calcola l'hash sicuro della password tramite PBKDF2-HMAC-SHA256."""
    return hashlib.pbkdf2_hmac(
        'sha256',
        password.encode('utf-8'),
        salt.encode('utf-8'),
        HASH_ITERATIONS
    ).hex()

def verify_password(password: str, salt: str, password_hash: str) -> bool:
    """Verifica se la password corrisponde all'hash memorizzato."""
    computed_hash = hash_password(password, salt)
    return secrets.compare_digest(computed_hash, password_hash)

def create_signed_token(user_id: int, username: str, role: str) -> str:
    """Crea un token firmato crittograficamente con HMAC-SHA256.
    Essendo stateless, è valido e verificabile istantaneamente su qualsiasi istanza serverless (Vercel)."""
    payload = {
        "uid": int(user_id),
        "usr": str(username),
        "rol": str(role),
        "exp": int(time.time()) + (SESSION_DURATION_DAYS * 86400)
    }
    payload_json = json.dumps(payload, separators=(',', ':')).encode('utf-8')
    payload_b64 = base64.urlsafe_b64encode(payload_json).decode('utf-8').rstrip('=')
    sig = hmac.new(SECRET_KEY.encode('utf-8'), payload_b64.encode('utf-8'), hashlib.sha256).hexdigest()
    return f"v1.{payload_b64}.{sig}"

def verify_signed_token(token: str) -> Optional[Dict[str, Any]]:
    """Verifica la firma crittografica del token e la data di scadenza."""
    if not token or not isinstance(token, str) or not token.startswith("v1."):
        return None
    parts = token.split(".")
    if len(parts) != 3:
        return None
    _, payload_b64, sig = parts
    expected_sig = hmac.new(SECRET_KEY.encode('utf-8'), payload_b64.encode('utf-8'), hashlib.sha256).hexdigest()
    if not secrets.compare_digest(sig, expected_sig):
        return None
    try:
        padding = '=' * (4 - len(payload_b64) % 4)
        payload_json = base64.urlsafe_b64decode(payload_b64 + padding).decode('utf-8')
        payload = json.loads(payload_json)
        if payload.get("exp", 0) < int(time.time()):
            return None # Scaduto
        return payload
    except Exception:
        return None

def generate_session_token() -> str:
    """Genera un token di sessione sicuro e casuale."""
    return secrets.token_urlsafe(32)

def calculate_session_expiry() -> str:
    """Restituisce la data di scadenza della sessione in formato ISO."""
    expiry = datetime.datetime.utcnow() + datetime.timedelta(days=SESSION_DURATION_DAYS)
    return expiry.isoformat() + "Z"
