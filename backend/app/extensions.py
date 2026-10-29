from flask_sqlalchemy import SQLAlchemy
from flask_jwt_extended import JWTManager, get_jwt_identity
from flask_socketio import SocketIO
from flask_bcrypt import Bcrypt
from flask_migrate import Migrate
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address

db = SQLAlchemy()
jwt = JWTManager()
socketio = SocketIO()
bcrypt = Bcrypt()
migrate = Migrate()

def _rate_limit_key() -> str:
    try:
        identity = get_jwt_identity()
        if identity:
            return f"user:{identity}"
    except Exception:
        pass
    return get_remote_address()

# In-memory storage, stated explicitly rather than left as the default
# flask-limiter warns about on every boot. It's correct here because the server
# runs a single gunicorn worker, so one process sees every request. If workers
# are ever increased, each would count separately and the limits would
# effectively multiply — at that point switch to a shared store (redis://).
limiter = Limiter(key_func=_rate_limit_key, default_limits=[], storage_uri="memory://")
