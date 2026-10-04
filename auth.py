import hashlib
import secrets
import datetime

# Costanti di sicurezza
HASH_ITERATIONS = 100000
SESSION_DURATION_DAYS = 7

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

def generate_session_token() -> str:
    """Genera un token di sessione sicuro e casuale."""
    return secrets.token_urlsafe(32)

def calculate_session_expiry() -> str:
    """Restituisce la data di scadenza della sessione in formato ISO."""
    expiry = datetime.datetime.utcnow() + datetime.timedelta(days=SESSION_DURATION_DAYS)
    return expiry.isoformat() + "Z"
