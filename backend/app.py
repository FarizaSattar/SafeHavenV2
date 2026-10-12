from __future__ import annotations

import json
import os
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import paho.mqtt.client as mqtt
from dotenv import load_dotenv
from flask import Flask, jsonify, request
from flask_cors import CORS


# ============================================================
# ENVIRONMENT
# ============================================================

load_dotenv()

MQTT_HOST = os.getenv("MQTT_HOST", "localhost")
MQTT_PORT = int(os.getenv("MQTT_PORT", "1883"))

MQTT_USERNAME = os.getenv("MQTT_USERNAME", "")
MQTT_PASSWORD = os.getenv("MQTT_PASSWORD", "")

MQTT_TOPIC = os.getenv(
    "MQTT_TOPIC",
    "project/+/telemetry",
)

MQTT_COMMAND_TOPIC = os.getenv(
    "MQTT_COMMAND_TOPIC",
    "project/{device_id}/command",
)

PORT = int(os.getenv("PORT", "5000"))


# ============================================================
# APPLICATION
# ============================================================

app = Flask(__name__)

CORS(
    app,
    resources={
        r"/api/*": {
            "origins": "*"
        }
    },
)


# ============================================================
# DATA STORAGE
# ============================================================

BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = BASE_DIR / "data"
STATE_FILE = DATA_DIR / "state.json"

DATA_DIR.mkdir(
    parents=True,
    exist_ok=True,
)


# ============================================================
# STATE
# ============================================================

devices: dict[str, dict[str, Any]] = {}

alerts: list[dict[str, Any]] = []

telemetry_history: dict[str, list[dict[str, Any]]] = {}

state_lock = threading.Lock()


# ============================================================
# HELPERS
# ============================================================

def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def safe_float(value: Any) -> float | None:
    try:
        if value is None:
            return None

        return float(value)

    except (ValueError, TypeError):
        return None


def save_state() -> None:
    """
    Persist application state to JSON.
    """

    with state_lock:

        data = {
            "devices": devices,
            "alerts": alerts[-100:],
            "telemetry_history": {
                device_id: history[-100:]
                for device_id, history in telemetry_history.items()
            },
        }

        temp_file = STATE_FILE.with_suffix(".tmp")

        try:
            with temp_file.open(
                "w",
                encoding="utf-8",
            ) as file:

                json.dump(
                    data,
                    file,
                    indent=2,
                )

            temp_file.replace(STATE_FILE)

        except OSError as error:
            print(
                f"[STATE] Unable to save state: {error}"
            )


def load_state() -> None:
    """
    Load persisted state.
    """

    if not STATE_FILE.exists():
        return

    try:

        with STATE_FILE.open(
            "r",
            encoding="utf-8",
        ) as file:

            data = json.load(file)

        with state_lock:

            devices.update(
                data.get(
                    "devices",
                    {},
                )
            )

            alerts.extend(
                data.get(
                    "alerts",
                    [],
                )
            )

            telemetry_history.update(
                data.get(
                    "telemetry_history",
                    {},
                )
            )

        print("[STATE] Previous state loaded.")

    except (
        OSError,
        json.JSONDecodeError,
    ) as error:

        print(
            f"[STATE] Unable to load saved state: {error}"
        )


# ============================================================
# DEVICE STATUS
# ============================================================

DEVICE_TIMEOUT_SECONDS = 15


def update_device_online_status() -> None:
    """
    Mark devices offline if they have not sent telemetry recently.
    """

    now = datetime.now(timezone.utc)

    with state_lock:

        for device in devices.values():

            last_seen = device.get("last_seen")

            if not last_seen:
                continue

            try:

                last_seen_dt = datetime.fromisoformat(
                    last_seen
                )

                elapsed = (
                    now - last_seen_dt
                ).total_seconds()

                device["online"] = (
                    elapsed <= DEVICE_TIMEOUT_SECONDS
                )

            except ValueError:
                device["online"] = False


# ============================================================
# ALERTS
# ============================================================

def create_alert(
    device_id: str,
    message: str,
    severity: str = "warning",
    alert_type: str = "system",
) -> None:

    with state_lock:

        # Prevent the same alert from being generated
        # repeatedly every telemetry cycle.
        for alert in reversed(alerts[-20:]):

            if (
                alert.get("device_id") == device_id
                and alert.get("message") == message
                and not alert.get("acknowledged", False)
            ):
                return

        alert = {
            "id": (
                max(
                    [a.get("id", 0) for a in alerts],
                    default=0,
                )
                + 1
            ),
            "device_id": device_id,
            "message": message,
            "severity": severity,
            "type": alert_type,
            "timestamp": utc_now(),
            "acknowledged": False,
        }

        alerts.append(alert)

    save_state()


# ============================================================
# TELEMETRY
# ============================================================

def process_telemetry(
    data: dict[str, Any]
) -> None:

    device_id = data.get("device_id")

    if not device_id:
        print(
            "[MQTT] Telemetry missing device_id."
        )
        return

    timestamp = utc_now()

    # Normalize values
    data["device_id"] = str(device_id)
    data["last_seen"] = timestamp
    data["online"] = True

    if "temperature" in data:
        data["temperature"] = safe_float(
            data["temperature"]
        )

    if "humidity" in data:
        data["humidity"] = safe_float(
            data["humidity"]
        )

    if "pressure" in data:
        data["pressure"] = safe_float(
            data["pressure"]
        )

    # Normalize booleans
    data["motion"] = bool(
        data.get("motion", False)
    )

    data["door_open"] = bool(
        data.get("door_open", False)
    )

    data["water_leak"] = bool(
        data.get("water_leak", False)
    )

    data["relay"] = bool(
        data.get("relay", False)
    )

    # --------------------------------------------------------
    # Device state
    # --------------------------------------------------------

    with state_lock:

        devices[data["device_id"]] = data

        if data["device_id"] not in telemetry_history:
            telemetry_history[
                data["device_id"]
            ] = []

        telemetry_history[
            data["device_id"]
        ].append(
            data.copy()
        )

        telemetry_history[
            data["device_id"]
        ] = telemetry_history[
            data["device_id"]
        ][-100:]

    # --------------------------------------------------------
    # Temperature
    # --------------------------------------------------------

    temperature = data.get(
        "temperature"
    )

    if (
        temperature is not None
        and temperature >= 35
    ):

        create_alert(
            device_id,
            f"High temperature detected: {temperature:.1f}°C",
            severity="critical",
            alert_type="temperature",
        )

    # --------------------------------------------------------
    # Low temperature
    # --------------------------------------------------------

    if (
        temperature is not None
        and temperature <= 10
    ):

        create_alert(
            device_id,
            f"Low temperature detected: {temperature:.1f}°C",
            severity="warning",
            alert_type="temperature",
        )

    # --------------------------------------------------------
    # Motion
    # --------------------------------------------------------

    if data.get("motion"):

        create_alert(
            device_id,
            "Motion detected.",
            severity="info",
            alert_type="motion",
        )

    # --------------------------------------------------------
    # Door
    # --------------------------------------------------------

    if data.get("door_open"):

        create_alert(
            device_id,
            "Door is currently open.",
            severity="warning",
            alert_type="door",
        )

    # --------------------------------------------------------
    # Water leak
    # --------------------------------------------------------

    if data.get("water_leak"):

        create_alert(
            device_id,
            "Possible water leak detected.",
            severity="critical",
            alert_type="water",
        )

    # --------------------------------------------------------
    # Pressure
    # --------------------------------------------------------

    pressure = data.get("pressure")

    if (
        pressure is not None
        and pressure < 850
    ):

        create_alert(
            device_id,
            f"Abnormal pressure detected: {pressure:.1f}",
            severity="warning",
            alert_type="pressure",
        )

    save_state()


# ============================================================
# MQTT
# ============================================================

mqtt_client = mqtt.Client(
    mqtt.CallbackAPIVersion.VERSION2
)


def mqtt_on_connect(
    client,
    userdata,
    flags,
    reason_code,
    properties,
):

    print(
        f"[MQTT] Connected: {reason_code}"
    )

    result = client.subscribe(
        MQTT_TOPIC
    )

    print(
        f"[MQTT] Subscribed to {MQTT_TOPIC} "
        f"(result={result[0]})"
    )


def mqtt_on_message(
    client,
    userdata,
    message,
):

    try:

        payload = message.payload.decode(
            "utf-8"
        )

        data = json.loads(
            payload
        )

        print(
            f"[MQTT] {message.topic}: {data}"
        )

        process_telemetry(
            data
        )

    except UnicodeDecodeError as error:

        print(
            f"[MQTT] Invalid UTF-8 payload: {error}"
        )

    except json.JSONDecodeError as error:

        print(
            f"[MQTT] Invalid JSON payload: {error}"
        )

    except Exception as error:

        print(
            f"[MQTT] Error processing message: {error}"
        )


def mqtt_on_disconnect(
    client,
    userdata,
    disconnect_flags,
    reason_code,
    properties,
):

    print(
        f"[MQTT] Disconnected: {reason_code}"
    )


def start_mqtt() -> None:

    mqtt_client.on_connect = (
        mqtt_on_connect
    )

    mqtt_client.on_message = (
        mqtt_on_message
    )

    mqtt_client.on_disconnect = (
        mqtt_on_disconnect
    )

    if MQTT_USERNAME:

        mqtt_client.username_pw_set(
            MQTT_USERNAME,
            MQTT_PASSWORD,
        )

    try:

        print(
            f"[MQTT] Connecting to "
            f"{MQTT_HOST}:{MQTT_PORT}"
        )

        mqtt_client.connect(
            MQTT_HOST,
            MQTT_PORT,
            keepalive=60,
        )

        mqtt_client.loop_forever()

    except Exception as error:

        print(
            f"[MQTT] Connection failed: {error}"
        )


def start_mqtt_thread() -> None:

    thread = threading.Thread(
        target=start_mqtt,
        daemon=True,
    )

    thread.start()


# ============================================================
# BACKGROUND STATUS MONITOR
# ============================================================

def status_monitor() -> None:

    while True:

        update_device_online_status()

        # Check every 5 seconds
        threading.Event().wait(5)


def start_status_monitor() -> None:

    thread = threading.Thread(
        target=status_monitor,
        daemon=True,
    )

    thread.start()


# ============================================================
# API
# ============================================================

@app.get("/")
def root():

    return jsonify(
        {
            "name": "SafeHaven IoT Backend",
            "status": "running",
            "version": "2.0.0",
        }
    )


@app.get("/api/health")
def health():

    update_device_online_status()

    return jsonify(
        {
            "status": "healthy",
            "mqtt": mqtt_client.is_connected(),
            "devices": len(devices),
            "active_alerts": len(
                [
                    alert
                    for alert in alerts
                    if not alert.get(
                        "acknowledged",
                        False,
                    )
                ]
            ),
        }
    )


# ============================================================
# DEVICES
# ============================================================

@app.get("/api/devices")
def get_devices():

    update_device_online_status()

    with state_lock:

        return jsonify(
            {
                "devices": list(
                    devices.values()
                )
            }
        )


@app.get("/api/devices/<device_id>")
def get_device(
    device_id: str
):

    update_device_online_status()

    with state_lock:

        device = devices.get(
            device_id
        )

        if device is None:

            return jsonify(
                {
                    "error": "Device not found"
                }
            ), 404

        return jsonify(
            device
        )


@app.get("/api/devices/<device_id>/history")
def get_device_history(
    device_id: str
):

    limit = request.args.get(
        "limit",
        default=50,
        type=int,
    )

    limit = max(
        1,
        min(limit, 100),
    )

    with state_lock:

        history = telemetry_history.get(
            device_id,
            [],
        )

        return jsonify(
            {
                "device_id": device_id,
                "history": history[-limit:],
            }
        )


# ============================================================
# COMMANDS
# ============================================================

ALLOWED_COMMANDS = {
    "relay_on",
    "relay_off",
    "led_on",
    "led_off",
}


@app.post(
    "/api/devices/<device_id>/command"
)
def send_command(
    device_id: str
):

    with state_lock:

        if device_id not in devices:

            return jsonify(
                {
                    "error": "Device not found"
                }
            ), 404

    body = request.get_json(
        silent=True
    )

    if not isinstance(
        body,
        dict,
    ):

        return jsonify(
            {
                "error": "JSON body required"
            }
        ), 400

    command = body.get(
        "command"
    )

    if command not in ALLOWED_COMMANDS:

        return jsonify(
            {
                "error": "Invalid command",
                "allowed": sorted(
                    ALLOWED_COMMANDS
                ),
            }
        ), 400

    topic = MQTT_COMMAND_TOPIC.format(
        device_id=device_id
    )

    payload = json.dumps(
        {
            "command": command,
            "timestamp": utc_now(),
        }
    )

    try:

        result = mqtt_client.publish(
            topic,
            payload,
            qos=1,
        )

        if result.rc != mqtt.MQTT_ERR_SUCCESS:

            return jsonify(
                {
                    "error": "Failed to publish command",
                    "mqtt_code": result.rc,
                }
            ), 500

    except Exception as error:

        return jsonify(
            {
                "error": str(error)
            }
        ), 500

    return jsonify(
        {
            "success": True,
            "device_id": device_id,
            "command": command,
        }
    )


# ============================================================
# ALERTS
# ============================================================

@app.get("/api/alerts")
def get_alerts():

    with state_lock:

        return jsonify(
            {
                "alerts": alerts[-50:][::-1]
            }
        )


@app.get("/api/alerts/active")
def get_active_alerts():

    with state_lock:

        active = [
            alert
            for alert in alerts
            if not alert.get(
                "acknowledged",
                False,
            )
        ]

        return jsonify(
            {
                "alerts": active[::-1]
            }
        )


@app.post(
    "/api/alerts/<int:alert_id>/acknowledge"
)
def acknowledge_alert(
    alert_id: int
):

    with state_lock:

        for alert in alerts:

            if alert["id"] == alert_id:

                alert[
                    "acknowledged"
                ] = True

                save_state()

                return jsonify(
                    {
                        "success": True
                    }
                )

    return jsonify(
        {
            "error": "Alert not found"
        }
    ), 404


# ============================================================
# SUMMARY
# ============================================================

@app.get("/api/summary")
def summary():

    update_device_online_status()

    with state_lock:

        active_alerts = [
            alert
            for alert in alerts
            if not alert.get(
                "acknowledged",
                False,
            )
        ]

        online_devices = [
            device
            for device in devices.values()
            if device.get("online")
        ]

        return jsonify(
            {
                "total_devices": len(
                    devices
                ),
                "online_devices": len(
                    online_devices
                ),
                "active_alerts": len(
                    active_alerts
                ),
                "critical_alerts": len(
                    [
                        a
                        for a in active_alerts
                        if a.get("severity")
                        == "critical"
                    ]
                ),
            }
        )


# ============================================================
# STARTUP
# ============================================================

load_state()


if __name__ == "__main__":

    print()
    print("=" * 60)
    print("SafeHaven Backend")
    print("=" * 60)
    print(
        f"MQTT Broker: {MQTT_HOST}:{MQTT_PORT}"
    )
    print(
        f"Telemetry Topic: {MQTT_TOPIC}"
    )
    print(
        f"API: http://localhost:{PORT}"
    )
    print("=" * 60)
    print()

    start_mqtt_thread()
    start_status_monitor()

    app.run(
        host="0.0.0.0",
        port=PORT,
        debug=True,
        use_reloader=False,
    )