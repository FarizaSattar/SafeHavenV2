import json, math, os, random, time
from datetime import datetime, timezone
import paho.mqtt.client as mqtt
from dotenv import load_dotenv

load_dotenv()
client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, client_id="safehaven-simulator")
client.connect(os.getenv("MQTT_HOST","localhost"), int(os.getenv("MQTT_PORT","1883")), 60)

print("SafeHaven sensor simulator running...")
n = 0
try:
    while True:
        n += 1
        temperature = 22.0 + 1.2*math.sin(n/20) + random.gauss(0,.2)
        payload = {
            "device_id":"SAFE-001",
            "timestamp":datetime.now(timezone.utc).isoformat(),
            "motion": random.random() < .12,
            "temperature_c": round(temperature,2),
            "humidity": round(44 + random.gauss(0,2),2),
            "door_open": random.random() < .04,
            "smoke": random.random() < .005
        }
        client.publish("safehaven/SAFE-001/telemetry", json.dumps(payload), qos=1)
        print(payload)
        time.sleep(2)
except KeyboardInterrupt:
    client.disconnect()
