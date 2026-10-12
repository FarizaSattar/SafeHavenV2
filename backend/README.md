# SafeHaven Backend

IoT telemetry backend for an ESP32 smart-building monitoring system.

## Quick start
```bash
python -m venv .venv
pip install -r requirements.txt
docker compose up -d
```
Then run:
```bash
python simulator/sensor_simulator.py
```
and:
```bash
python -m api.mqtt_consumer
```
and:
```bash
python -m api.app
```

API runs on port 5002.

## AWS phase
The local repository is deliberately the first stage. Next, replace `storage.repository` with a DynamoDB repository and configure AWS IoT Core MQTT/TLS. Use AWS IAM roles/profiles or environment-based secrets; never commit credentials.
