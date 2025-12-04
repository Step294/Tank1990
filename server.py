import os
from flask import Flask, send_from_directory, jsonify

print("🟡 SERVER STARTED")
print("🟡 THIS server.py FILE IS:", __file__)

# Корневая папка репозитория
ROOT_DIR = os.path.dirname(os.path.abspath(__file__))
print("🟡 ROOT FOLDER SET TO:", ROOT_DIR)

app = Flask(__name__, static_folder=ROOT_DIR)


@app.route("/")
def index():
    print("➡ GET /")
    return send_from_directory(ROOT_DIR, "index.html")


@app.route("/<path:filename>")
def serve_files(filename):
    print(f"➡ REQUEST: {filename}")
    return send_from_directory(ROOT_DIR, filename)


@app.route("/api/test")
def test():
    return jsonify({"ok": True})


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=8000, debug=True)
