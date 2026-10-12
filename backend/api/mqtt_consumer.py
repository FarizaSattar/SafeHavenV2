import json, os
import paho.mqtt.client as mqtt
from dotenv import load_dotenv
from storage.repository import save_local
from alerts.rules import evaluate

load_dotenv()

def on_connect(client, userdata, flags, reason_code, properties):
    print("SafeHaven MQTT connected:", reason_code)
    client.subscribe(os.getenv("MQTT_TOPIC","safehaven/+/telemetry"), qos=1)

def on_message(client, userdata, msg):
    try:
        p = json.loads(msg.payload.decode())
        p["processed"] = True
        p["alerts"] = evaluate(p)
        save_local(p)
        print("processed:", p)
    except Exception as exc:
        print("telemetry error:", exc)

client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, client_id="safehaven-backend")
client.on_connect = on_connect
client.on_message = on_message
client.connect(os.getenv("MQTT_HOST","localhost"), int(os.getenv("MQTT_PORT","1883")), 60)
client.loop_forever()
