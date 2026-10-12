# ESP32 firmware integration

The backend expects MQTT JSON on:
`safehaven/<device_id>/telemetry`

Example:
```json
{
  "device_id": "SAFE-001",
  "timestamp": "2026-09-02T12:00:00Z",
  "motion": false,
  "temperature_c": 22.4,
  "humidity": 45.1,
  "door_open": false,
  "smoke": false
}
```

For the real hardware phase, implement this contract in ESP32 C++ using an MQTT client and TLS certificates. Never commit private keys/certificates.
