import eventlet

# os=False matters, and matches what gunicorn's own eventlet worker does.
# Greening os.write breaks gunicorn's arbiter: it writes to an internal wakeup
# pipe from the main loop, and a greened write raises "do not call blocking
# functions from the mainloop", killing the master and restarting the instance
# in a loop. Everything else is still patched, so Flask-SocketIO works as before.
eventlet.monkey_patch(os=False)
import os

# joblib/scikit-learn default to a multiprocessing ("loky") backend for
# inference. Worker processes spawned post-fork under eventlet's cooperative
# scheduler can deadlock waiting on a semaphore that never gets signaled,
# silently hanging the entire server. Force joblib to stay single-process.
os.environ.setdefault("JOBLIB_MULTIPROCESSING", "0")

from app import create_app
from app.extensions import socketio

app = create_app(os.environ.get("FLASK_ENV", "development"))

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5001))
    socketio.run(app, host="0.0.0.0", port=port, debug=app.debug, allow_unsafe_werkzeug=True)
