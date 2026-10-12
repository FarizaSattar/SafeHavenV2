from flask import Flask, jsonify, request
from flask_cors import CORS
from storage.repository import recent_local, reliability
from alerts.rules import evaluate

app = Flask(__name__)
CORS(app)

@app.get("/api/health")
def health():
    return jsonify({"status":"ok","service":"SafeHaven","mqtt":"connected"})

@app.get("/api/telemetry")
def telemetry():
    return jsonify(recent_local(min(int(request.args.get("limit",100)),1000)))

@app.get("/api/reliability")
def rel():
    return jsonify(reliability())

@app.post("/api/evaluate")
def evaluate_api():
    return jsonify({"alerts": evaluate(request.get_json(force=True))})

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5002, debug=True)
