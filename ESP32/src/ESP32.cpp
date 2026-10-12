#include <Arduino.h>
#include <WiFi.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>
#include <cstring>

// ============================================================
// SAFEHAVEN ESP32 IoT CONTROLLER
// ============================================================
//
// This ESP32 acts as the edge device for the SafeHaven
// home monitoring system.
//
// Responsibilities:
//   1. Connect to Wi-Fi
//   2. Connect to MQTT broker
//   3. Read sensors
//   4. Publish telemetry
//   5. Receive commands
//   6. Control relay and LED
//   7. Report device status
//
// Communication architecture:
//
// ESP32
//   |
//   | Wi-Fi
//   v
// MQTT Broker
//   |
//   v
// Flask Backend
//   |
//   v
// React Dashboard
//
// ============================================================

// ============================================================
// WIFI CONFIGURATION
// ============================================================
//
// IMPORTANT:
// Replace these values with your actual Wi-Fi credentials.
//
// Never commit real credentials to GitHub.
//

const char* WIFI_SSID = "YOUR_WIFI_NAME";
const char* WIFI_PASSWORD = "YOUR_WIFI_PASSWORD";

// ============================================================
// MQTT CONFIGURATION
// ============================================================
//
// IMPORTANT:
//
// MQTT_SERVER must be the IP address of the computer running
// your MQTT broker.
//
// DO NOT use "localhost" here.
//
// Example:
//
//     const char* MQTT_SERVER = "192.168.1.100";
//
// "localhost" from the ESP32 means the ESP32 itself.
//
// ============================================================

const char* MQTT_SERVER = "192.168.1.100";
const int MQTT_PORT = 1883;

const char* MQTT_USERNAME = "";
const char* MQTT_PASSWORD = "";

// Unique identifier for this ESP32.
//
// If you eventually have multiple SafeHaven devices:
//
//     esp32-01
//     esp32-02
//     esp32-03
//
// each device should have a unique ID.

const char* DEVICE_ID = "esp32-01";

// ============================================================
// MQTT TOPICS
// ============================================================
//
// Telemetry:
//     project/esp32-01/telemetry
//
// Status:
//     project/esp32-01/status
//
// Commands:
//     project/esp32-01/command
//
// ============================================================

String telemetryTopic;
String statusTopic;
String commandTopic;

// ============================================================
// GPIO CONFIGURATION
// ============================================================

// Built-in ESP32 LED
#define LED_PIN 2

// PIR motion sensor
#define MOTION_PIN 27

// Magnetic door/reed switch
#define DOOR_PIN 26

// Relay module
#define RELAY_PIN 25

// Water leak sensor
#define WATER_LEAK_PIN 33

// Analog pressure sensor
#define PRESSURE_PIN 34

// LM35 analog temperature sensor
#define TEMP_PIN 35

// ============================================================
// TIMING CONFIGURATION
// ============================================================

// Telemetry publishing interval.
//
// 5000 ms = 5 seconds.

const unsigned long TELEMETRY_INTERVAL = 5000;

// Used to determine when telemetry should next be published.

unsigned long lastTelemetry = 0;

// ============================================================
// NETWORK OBJECTS
// ============================================================

// Wi-Fi client used by MQTT.

WiFiClient espClient;

// MQTT client running on top of Wi-Fi.

PubSubClient mqttClient(espClient);

// ============================================================
// DEVICE STATE
// ============================================================

// Current relay state.

bool relayState = false;

// ============================================================
// WIFI CONNECTION
// ============================================================
//
// Connects the ESP32 to the configured Wi-Fi network.
//
// ============================================================

void connectWiFi()
{
Serial.println();
Serial.println("================================");
Serial.println("Connecting to Wi-Fi...");
Serial.println("================================");

```
WiFi.begin(
    WIFI_SSID,
    WIFI_PASSWORD
);

// Wait until Wi-Fi connection succeeds.

while (WiFi.status() != WL_CONNECTED)
{
    delay(500);
    Serial.print(".");
}

Serial.println();
Serial.println("Wi-Fi connected.");

Serial.print("IP address: ");
Serial.println(WiFi.localIP());

Serial.print("Signal strength: ");
Serial.print(WiFi.RSSI());
Serial.println(" dBm");
```

}

// ============================================================
// TEMPERATURE SENSOR
// ============================================================
//
// Current hardware:
//
//     LM35 analog temperature sensor
//
// LM35 output:
//     approximately 10 mV per °C
//
// ESP32 ADC:
//     12-bit ADC
//     range = 0 - 4095
//
// Reference voltage:
//     approximately 3.3 V
//
// NOTE:
// ADC calibration can vary between ESP32 boards.
// For a production system, calibration should be performed.
//
// ============================================================

float readTemperature()
{
int raw = analogRead(TEMP_PIN);

```
float voltage =
    raw * (3.3f / 4095.0f);

float temperature =
    voltage * 100.0f;

return temperature;
```

}

// ============================================================
// PRESSURE SENSOR
// ============================================================
//
// This is currently a PLACEHOLDER conversion.
//
// The actual conversion depends on the specific pressure
// sensor being used.
//
// Current implementation maps:
//
//     0 ADC       -> 0
//     4095 ADC    -> 1000
//
// Replace this with the sensor's real calibration equation.
//
// ============================================================

float readPressure()
{
int raw = analogRead(PRESSURE_PIN);

```
float pressure =
    (raw / 4095.0f) * 1000.0f;

return pressure;
```

}

// ============================================================
// WATER LEAK SENSOR
// ============================================================
//
// Returns:
//
//     true  = water detected
//     false = no water detected
//
// IMPORTANT:
// The exact HIGH/LOW behaviour depends on the sensor module.
//
// Verify the sensor's datasheet and adjust if necessary.
//
// ============================================================

bool readWaterLeak()
{
int value =
digitalRead(WATER_LEAK_PIN);

```
return value == HIGH;
```

}

// ============================================================
// MQTT CALLBACK
// ============================================================
//
// This function executes whenever the ESP32 receives an MQTT
// message on the command topic.
//
// Example incoming message:
//
// {
//     "command": "relay_on"
// }
//
// ============================================================

void mqttCallback(
char* topic,
byte* payload,
unsigned int length
)
{
Serial.println();
Serial.println("================================");
Serial.println("MQTT COMMAND RECEIVED");
Serial.println("================================");

```
Serial.print("Topic: ");
Serial.println(topic);

// Convert MQTT byte payload into a String.

String message;

for (unsigned int i = 0; i < length; i++)
{
    message += (char)payload[i];
}

Serial.print("Payload: ");
Serial.println(message);


// ========================================================
// PARSE JSON
// ========================================================

JsonDocument doc;

DeserializationError error =
    deserializeJson(
        doc,
        message
    );

if (error)
{
    Serial.print("JSON parsing failed: ");
    Serial.println(error.c_str());

    return;
}


// ========================================================
// EXTRACT COMMAND
// ========================================================

const char* command =
    doc["command"];

if (command == nullptr)
{
    Serial.println(
        "Command field is missing."
    );

    return;
}


Serial.print("Command: ");
Serial.println(command);


// ========================================================
// RELAY CONTROL
// ========================================================

if (strcmp(command, "relay_on") == 0)
{
    relayState = true;

    digitalWrite(
        RELAY_PIN,
        HIGH
    );

    Serial.println("Relay turned ON.");
}

else if (strcmp(command, "relay_off") == 0)
{
    relayState = false;

    digitalWrite(
        RELAY_PIN,
        LOW
    );

    Serial.println("Relay turned OFF.");
}


// ========================================================
// LED CONTROL
// ========================================================

else if (strcmp(command, "led_on") == 0)
{
    digitalWrite(
        LED_PIN,
        HIGH
    );

    Serial.println("LED turned ON.");
}

else if (strcmp(command, "led_off") == 0)
{
    digitalWrite(
        LED_PIN,
        LOW
    );

    Serial.println("LED turned OFF.");
}

else
{
    Serial.print("Unknown command: ");
    Serial.println(command);
}
```

}

// ============================================================
// MQTT CONNECTION
// ============================================================
//
// Attempts to connect the ESP32 to the MQTT broker.
//
// After connecting:
//
//     1. Subscribe to command topic
//     2. Publish online status
//
// ============================================================

void connectMQTT()
{
while (!mqttClient.connected())
{
Serial.println();
Serial.println("Connecting to MQTT broker...");

```
    // Generate a unique MQTT client ID.

    String clientId =
        String(DEVICE_ID)
        + "-"
        + String(
            random(0xffff),
            HEX
        );


    bool connected = false;


    // ====================================================
    // MQTT AUTHENTICATION
    // ====================================================

    if (strlen(MQTT_USERNAME) > 0)
    {
        connected =
            mqttClient.connect(
                clientId.c_str(),
                MQTT_USERNAME,
                MQTT_PASSWORD
            );
    }
    else
    {
        connected =
            mqttClient.connect(
                clientId.c_str()
            );
    }


    // ====================================================
    // CONNECTION RESULT
    // ====================================================

    if (connected)
    {
        Serial.println("MQTT connected.");

        // Subscribe to commands.

        bool subscribed =
            mqttClient.subscribe(
                commandTopic.c_str()
            );

        if (subscribed)
        {
            Serial.print(
                "Subscribed to: "
            );

            Serial.println(
                commandTopic
            );
        }
        else
        {
            Serial.println(
                "MQTT subscription failed."
            );
        }

        // Tell backend that the device is online.

        publishStatus();
    }
    else
    {
        Serial.print(
            "MQTT connection failed. State: "
        );

        Serial.println(
            mqttClient.state()
        );

        Serial.println(
            "Retrying in 3 seconds..."
        );

        delay(3000);
    }
}
```

}

// ============================================================
// DEVICE STATUS
// ============================================================
//
// Publishes information about the ESP32's current state.
//
// Example:
//
// {
//     "device_id": "esp32-01",
//     "status": "online",
//     "relay": false,
//     "ip": "192.168.1.50"
// }
//
// The message is retained by the MQTT broker.
//
// ============================================================

void publishStatus()
{
JsonDocument doc;

```
doc["device_id"] =
    DEVICE_ID;

doc["status"] =
    "online";

doc["relay"] =
    relayState;

doc["ip"] =
    WiFi.localIP().toString();

doc["rssi"] =
    WiFi.RSSI();


char buffer[512];

serializeJson(
    doc,
    buffer
);


mqttClient.publish(
    statusTopic.c_str(),
    buffer,
    true
);


Serial.println(
    "Device status published."
);
```

}

// ============================================================
// TELEMETRY
// ============================================================
//
// Reads all sensors and sends their values to the backend.
//
// Example:
//
// {
//     "device_id": "esp32-01",
//     "temperature": 23.5,
//     "humidity": null,
//     "motion": false,
//     "door_open": false,
//     "water_leak": false,
//     "pressure": 500,
//     "relay": false,
//     "uptime": 120000,
//     "rssi": -55
// }
//
// ============================================================

void publishTelemetry()
{
// ========================================================
// READ DIGITAL SENSORS
// ========================================================

```
bool motion =
    digitalRead(
        MOTION_PIN
    ) == HIGH;


bool doorOpen =
    digitalRead(
        DOOR_PIN
    ) == HIGH;


bool waterLeak =
    readWaterLeak();


// ========================================================
// READ ANALOG SENSORS
// ========================================================

float temperature =
    readTemperature();


float pressure =
    readPressure();


// ========================================================
// CREATE JSON DOCUMENT
// ========================================================

JsonDocument doc;


// Device identification.

doc["device_id"] =
    DEVICE_ID;


// Environmental data.

doc["temperature"] =
    temperature;


// No humidity sensor is currently configured.

doc["humidity"] =
    nullptr;


// Security sensors.

doc["motion"] =
    motion;

doc["door_open"] =
    doorOpen;

doc["water_leak"] =
    waterLeak;


// Other sensors.

doc["pressure"] =
    pressure;


// Actuator state.

doc["relay"] =
    relayState;


// Device health.

doc["uptime"] =
    millis();

doc["rssi"] =
    WiFi.RSSI();


// ========================================================
// SERIALIZE JSON
// ========================================================

char buffer[768];

serializeJson(
    doc,
    buffer
);


// ========================================================
// PUBLISH MQTT TELEMETRY
// ========================================================

bool published =
    mqttClient.publish(
        telemetryTopic.c_str(),
        buffer
    );


// ========================================================
// DEBUG OUTPUT
// ========================================================

if (published)
{
    Serial.println();
    Serial.println("Telemetry published:");
    Serial.println(buffer);
}
else
{
    Serial.println(
        "Telemetry publication failed."
    );
}
```

}

// ============================================================
// SETUP
// ============================================================
//
// Arduino executes setup() once when the ESP32 boots.
//
// ============================================================

void setup()
{
// ========================================================
// SERIAL MONITOR
// ========================================================

```
Serial.begin(115200);

delay(1000);

Serial.println();
Serial.println("========================================");
Serial.println("        SAFEHAVEN ESP32 V2");
Serial.println("        IoT SECURITY CONTROLLER");
Serial.println("========================================");


// ========================================================
// GPIO CONFIGURATION
// ========================================================

pinMode(
    LED_PIN,
    OUTPUT
);


pinMode(
    MOTION_PIN,
    INPUT
);


// Door sensor uses internal pull-up resistor.

pinMode(
    DOOR_PIN,
    INPUT_PULLUP
);


pinMode(
    WATER_LEAK_PIN,
    INPUT
);


pinMode(
    RELAY_PIN,
    OUTPUT
);


// Make sure relay starts OFF.

digitalWrite(
    RELAY_PIN,
    LOW
);


// Make sure LED starts OFF.

digitalWrite(
    LED_PIN,
    LOW
);


// ========================================================
// CREATE MQTT TOPICS
// ========================================================

telemetryTopic =
    "project/"
    + String(DEVICE_ID)
    + "/telemetry";


statusTopic =
    "project/"
    + String(DEVICE_ID)
    + "/status";


commandTopic =
    "project/"
    + String(DEVICE_ID)
    + "/command";


Serial.println();
Serial.println("MQTT topics:");

Serial.print("Telemetry: ");
Serial.println(telemetryTopic);

Serial.print("Status: ");
Serial.println(statusTopic);

Serial.print("Command: ");
Serial.println(commandTopic);


// ========================================================
// CONNECT TO WI-FI
// ========================================================

connectWiFi();


// ========================================================
// CONFIGURE MQTT
// ========================================================

mqttClient.setServer(
    MQTT_SERVER,
    MQTT_PORT
);


mqttClient.setCallback(
    mqttCallback
);


// Increase MQTT packet buffer size.

mqttClient.setBufferSize(1024);


// ========================================================
// INITIALIZATION COMPLETE
// ========================================================

Serial.println();
Serial.println(
    "SafeHaven ESP32 initialization complete."
);
```

}

// ============================================================
// MAIN LOOP
// ============================================================
//
// loop() executes continuously.
//
// The ESP32:
//
//     1. Checks Wi-Fi
//     2. Checks MQTT
//     3. Processes MQTT messages
//     4. Publishes telemetry periodically
//
// ============================================================

void loop()
{
// ========================================================
// WI-FI RECOVERY
// ========================================================

```
if (WiFi.status() != WL_CONNECTED)
{
    Serial.println(
        "Wi-Fi connection lost."
    );

    connectWiFi();
}


// ========================================================
// MQTT RECOVERY
// ========================================================

if (!mqttClient.connected())
{
    connectMQTT();
}


// ========================================================
// PROCESS MQTT
// ========================================================
//
// This must be called regularly so that incoming MQTT
// commands can be processed.

mqttClient.loop();


// ========================================================
// PERIODIC TELEMETRY
// ========================================================

unsigned long now =
    millis();


if (
    now - lastTelemetry
    >= TELEMETRY_INTERVAL
)
{
    lastTelemetry =
        now;

    publishTelemetry();
}
```

}
