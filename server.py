import os
from flask import Flask, send_from_directory, jsonify

print("🟡 SERVER STARTED")
print("🟡 THIS server.py FILE IS:", __file__)

app = Flask(__name__, static_folder="static")

print("🟡 STATIC FOLDER SET TO:", app.static_folder)
print("🟡 STATIC FOLDER ABSOLUTE:", os.path.abspath(app.static_folder))


@app.route("/")
def index():
    print("➡ GET /")
    return send_from_directory(app.static_folder, "index.html")


@app.route("/<path:filename>")
def serve_static_files(filename):
    print(f"➡ STATIC REQUEST: {filename}")
    return send_from_directory(app.static_folder, filename)


@app.route("/api/test")
def test():
    return jsonify({"ok": True})


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=8000, debug=True)
