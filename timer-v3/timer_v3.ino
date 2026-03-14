// ========== LIBRARIES ==========
#include <SPI.h>
#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#include <Bounce2.h>
#include "esp_timer.h"
#include <WiFi.h>
#include <PubSubClient.h>

// ========== WIFI CREDENTIALS ==========
const char* ssid          = "YOUR_SSID";
const char* password      = "YOUR_PASSWORD";


// ========== MQTT CREDENTIALS ==========
const char* mqtt_server   = "YOUR_BROKER_IP";
const int   mqtt_port     = 1883;
const char* mqtt_user     = "esp32";
const char* mqtt_password = "YOUR_MQTT_PASSWORD";
const char* mqtt_clientId = "waterpump-esp32";

// ========== MQTT TOPICS ==========
// Published by ESP32
#define TOPIC_DEVICE_STATUS  "waterpump/device/status"
#define TOPIC_DEVICE_FLOW    "waterpump/device/flow"
#define TOPIC_DEVICE_BUTTON  "waterpump/device/button"
// Subscribed by ESP32
#define TOPIC_CONTROL_BUTTON "waterpump/control/button"

// ========== CONSTANTS ==========
#define OFF_BUTTON        16
#define SELECTOR_BUTTON   17
#define OK_BUTTON          5

#define OFF_LED           15
#define SELECTOR_LED       2
#define OK_LED             4
#define ON_INDICATOR_LED  19

#define IR_SENSOR         18
#define RELAY             23
#define FLOWSENSOR        25

#define MAX_HOURS_TIMER    6

enum modeStates {OFF, ON, ERROR_STATE};

// ========== DISPLAY ==========
#define OLED_RESET     -1
#define SCREEN_ADDRESS 0x3C
#define SCREEN_WIDTH  128
#define SCREEN_HEIGHT  64
Adafruit_SSD1306 display(SCREEN_WIDTH, SCREEN_HEIGHT, &Wire, OLED_RESET);

// ========== VARIABLES ==========
Bounce buttonOff      = Bounce();
Bounce buttonSelector = Bounce();
Bounce buttonOk       = Bounce();

int        hourIndicator{0};
modeStates modeIndicator{OFF};

bool    isTimerRunning = false;
int64_t timerStartTime = 0;
int64_t timerDuration  = 0;

// ========== FLOW SENSOR ==========
volatile uint32_t flowPulseCount = 0;
float    flowRateLPH    = 0.0f;
uint32_t lastFlowCalcMs = 0;

// ========== PUBLISH INTERVALS ==========
// Flow is published every second, status every 5 seconds
uint32_t lastFlowPublishMs   = 0;
uint32_t lastStatusPublishMs = 0;

// ========== MQTT CLIENT ==========
WiFiClient   wifiClient;
PubSubClient mqtt(wifiClient);

// ========== FLOW SENSOR ISR ==========
void IRAM_ATTR flowISR() {
  flowPulseCount++;
}

// ========== MQTT CALLBACK ==========
// Called automatically when a message arrives on a subscribed topic.
void mqttCallback(char* topic, byte* payload, unsigned int length) {
  // Convert payload bytes to a String
  String message;
  for (unsigned int i = 0; i < length; i++) {
    message += (char)payload[i];
  }

  Serial.println("MQTT recibido [" + String(topic) + "]: " + message);

  // Only handle control/button topic
  if (String(topic) == TOPIC_CONTROL_BUTTON) {

    // Parse "button" field manually (avoids ArduinoJson dependency)
    // Expected payloads:
    //   {"button":"ok","hours":3}
    //   {"button":"off"}
    //   {"button":"selector"}

    if (message.indexOf("\"off\"") >= 0) {
      // Web OFF button pressed
      digitalWrite(RELAY, LOW);
      isTimerRunning = false;
      modeIndicator  = OFF;
      Serial.println("MQTT: Apagado remoto.");

    } else if (message.indexOf("\"ok\"") >= 0) {
      // Web OK button pressed — extract hours value
      int hoursIndex = message.indexOf("\"hours\":") + 8;
      if (hoursIndex >= 8) {
        int h = message.substring(hoursIndex).toInt();
        h = constrain(h, 1, MAX_HOURS_TIMER);
        hourIndicator  = h - 1;
        modeIndicator  = ON;
        isTimerRunning = false; // handleRelay() arms the timer on next loop
        Serial.println("MQTT: Temporizador remoto " + String(h) + "h.");
      }

    } else if (message.indexOf("\"selector\"") >= 0) {
      // Web SELECTOR button pressed
      if (modeIndicator == OFF) {
        hourIndicator = (hourIndicator + 1) % MAX_HOURS_TIMER;
        Serial.println("MQTT: Selector remoto → " + String(hourIndicator + 1) + "h.");
      }
    }

    // After any control message, publish updated status immediately
    publishStatus();
  }
}

// ========== MQTT CONNECT / RECONNECT ==========
void mqttReconnect() {
  while (!mqtt.connected()) {
    Serial.print("Conectando a MQTT...");
    if (mqtt.connect(mqtt_clientId, mqtt_user, mqtt_password)) {
      Serial.println(" conectado.");
      // Subscribe to the control topic after every (re)connection
      mqtt.subscribe(TOPIC_CONTROL_BUTTON);
    } else {
      Serial.println(" fallo (rc=" + String(mqtt.state()) + "). Reintentando en 5s.");
      delay(5000);
    }
  }
}

// ========== PUBLISH HELPERS ==========
void publishStatus() {
  int64_t remainingSec = 0;
  if (isTimerRunning) {
    int64_t elapsed   = esp_timer_get_time() - timerStartTime;
    int64_t remaining = timerDuration - elapsed;
    remainingSec      = (remaining > 0) ? remaining / 1000000LL : 0;
  }

  String payload = "{";
  payload += "\"mode\":"            + String((int)modeIndicator) + ",";
  payload += "\"isRunning\":"       + String(isTimerRunning ? "true" : "false") + ",";
  payload += "\"remainingSeconds\":" + String((long)remainingSec) + ",";
  payload += "\"hourIndicator\":"   + String(hourIndicator);
  payload += "}";

  mqtt.publish(TOPIC_DEVICE_STATUS, payload.c_str(), true); // retain=true so web gets latest on connect
}

void publishFlow() {
  String payload = "{\"lph\":" + String(flowRateLPH, 1) + "}";
  mqtt.publish(TOPIC_DEVICE_FLOW, payload.c_str());
}

void publishButtonEvent(String buttonName, int hours = 0) {
  String payload = "{\"button\":\"" + buttonName + "\"";
  if (hours > 0) payload += ",\"hours\":" + String(hours);
  payload += "}";
  mqtt.publish(TOPIC_DEVICE_BUTTON, payload.c_str());
}

// ========== SETUP ==========
void setup() {
  Serial.begin(9600);

  // Buttons
  pinMode(OFF_BUTTON,      INPUT_PULLUP);
  pinMode(SELECTOR_BUTTON, INPUT_PULLUP);
  pinMode(OK_BUTTON,       INPUT_PULLUP);
  buttonOff.attach(OFF_BUTTON);
  buttonSelector.attach(SELECTOR_BUTTON);
  buttonOk.attach(OK_BUTTON);
  buttonOff.interval(30);
  buttonSelector.interval(30);
  buttonOk.interval(30);

  // LEDs & relay
  pinMode(OFF_LED,          OUTPUT);
  pinMode(SELECTOR_LED,     OUTPUT);
  pinMode(OK_LED,           OUTPUT);
  pinMode(ON_INDICATOR_LED, OUTPUT);
  digitalWrite(ON_INDICATOR_LED, HIGH);
  pinMode(RELAY, OUTPUT);
  digitalWrite(RELAY, LOW);

  // IR sensor
  pinMode(IR_SENSOR, INPUT);

  // Flow sensor
  pinMode(FLOWSENSOR, INPUT_PULLUP);
  attachInterrupt(digitalPinToInterrupt(FLOWSENSOR), flowISR, RISING);

  // OLED
  if (!display.begin(SSD1306_SWITCHCAPVCC, SCREEN_ADDRESS)) {
    Serial.println(F("SSD1306 allocation failed"));
    handleError("Fallo display. Reinicia el equipo.");
  }
  delay(2000);
  display.clearDisplay();
  display.display();

  // WiFi
  Serial.print("Conectando a WiFi");
  WiFi.begin(ssid, password);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println("\nWiFi conectado. IP: " + WiFi.localIP().toString());
  Serial.println("MAC: " + WiFi.macAddress());

  // MQTT
  mqtt.setServer(mqtt_server, mqtt_port);
  mqtt.setCallback(mqttCallback);
  mqttReconnect();
}

// ========== LOOP ==========
void loop() {
  // Keep MQTT connection alive and process incoming messages
  if (!mqtt.connected()) {
    mqttReconnect();
  }
  mqtt.loop();

  readButtons();
  handleStates();
  handleRelay();
  handleDisplay();
  updateFlowRate();
  publishPeriodic();
}

// ========== PERIODIC PUBLISHING ==========
void publishPeriodic() {
  uint32_t now = millis();

  // Publish flow every 1 second
  if (now - lastFlowPublishMs >= 1000) {
    publishFlow();
    lastFlowPublishMs = now;
  }

  // Publish status every 5 seconds
  if (now - lastStatusPublishMs >= 5000) {
    publishStatus();
    lastStatusPublishMs = now;
  }
}

// ========== FLOW RATE CALCULATION ==========
void updateFlowRate() {
  uint32_t now = millis();
  if (now - lastFlowCalcMs >= 1000) {
    noInterrupts();
    uint32_t pulses = flowPulseCount;
    flowPulseCount  = 0;
    interrupts();

    // YF-S201: Hz = 7.5 * Q(L/min) → L/hour = pulses * 60 / 7.5
    flowRateLPH    = (float)pulses * 60.0f / 7.5f;
    lastFlowCalcMs = now;
  }
}

// ========== RELAY HANDLER ==========
void handleRelay() {
  if (modeIndicator == ON && !isTimerRunning) {
    timerDuration  = (int64_t)(hourIndicator + 1) * 3600LL * 1000000LL;
    isTimerRunning = true;
    timerStartTime = esp_timer_get_time();
    digitalWrite(RELAY, HIGH);
    Serial.println("Relay ON. Timer: " + String(hourIndicator + 1) + "h");
    publishStatus(); // Notify immediately when relay turns on
  }

  if (isTimerRunning) {
    int64_t currentMicros = esp_timer_get_time();
    if ((currentMicros - timerStartTime) >= timerDuration) {
      digitalWrite(RELAY, LOW);
      modeIndicator  = OFF;
      isTimerRunning = false;
      Serial.println("Timer finalizado. Relay OFF.");
      publishStatus(); // Notify immediately when timer ends
    }
  }
}

// ========== STATE / LED HANDLER ==========
void handleStates() {
  static int64_t lastMicrosLed = 0;
  int64_t currentMicros = esp_timer_get_time();

  if (modeIndicator == OFF) {
    digitalWrite(OFF_LED,      LOW);
    digitalWrite(SELECTOR_LED, HIGH);
    if (currentMicros - lastMicrosLed >= 1000000) {
      digitalWrite(OK_LED, !digitalRead(OK_LED));
      lastMicrosLed = currentMicros;
    }
  } else if (modeIndicator == ON) {
    digitalWrite(SELECTOR_LED, LOW);
    digitalWrite(OK_LED,       LOW);
    if (currentMicros - lastMicrosLed >= 1000000) {
      digitalWrite(OFF_LED, !digitalRead(OFF_LED));
      lastMicrosLed = currentMicros;
    }
  }
}

// ========== PHYSICAL BUTTON HANDLER ==========
void readButtons() {
  buttonOff.update();
  buttonSelector.update();
  buttonOk.update();

  if (buttonOff.fell() && modeIndicator == ON) {
    digitalWrite(RELAY, LOW);
    isTimerRunning = false;
    modeIndicator  = OFF;
    Serial.println("Manual override. Relay OFF.");
    publishButtonEvent("off");
    publishStatus();
  }

  if (buttonSelector.fell() && modeIndicator == OFF) {
    hourIndicator = (hourIndicator + 1) % MAX_HOURS_TIMER;
    Serial.println("Selector → " + String(hourIndicator + 1) + "h");
    publishButtonEvent("selector");
    publishStatus(); // Publish so web updates hourIndicator highlight
  }

  if (buttonOk.fell() && modeIndicator == OFF) {
    modeIndicator = ON;
    Serial.println("OK presionado. Iniciando temporizador.");
    publishButtonEvent("ok", hourIndicator + 1);
    // publishStatus() called inside handleRelay() when timer arms
  }
}

// ========== DISPLAY ==========
void renderNumber(int number) {
  display.setTextSize(3);
  display.setTextColor(WHITE);
  display.setCursor(42, 29);
  display.println(number);
  display.setTextSize(1);
  display.setCursor(62, 42);
  display.println("HRS");
}

String formatNumber(int number) {
  return (number < 10 ? "0" : "") + String(number);
}

void renderTime(int hour, int minute) {
  String t = formatNumber(hour) + ":" + formatNumber(minute);
  display.setTextSize(3);
  display.setTextColor(WHITE);
  display.setCursor(20, 29);
  display.println(t.c_str());
}

void renderTitle(String title) {
  const int size = title.length() * 6;
  const int x    = 64 - (size / 2);
  display.setTextSize(1);
  display.setTextColor(WHITE);
  display.setCursor(x, 7);
  display.println(title.c_str());
}

void handleDisplay() {
  static int64_t lastMicrosDisplay = 0;
  static bool    displayActive     = false;
  static bool    displayCleared    = true;
  int64_t currentMicros = esp_timer_get_time();
  int presence = digitalRead(IR_SENSOR);

  if (presence == LOW) {
    displayActive     = true;
    lastMicrosDisplay = currentMicros;
    displayCleared    = false;
  }

  if (displayActive) {
    if ((currentMicros - lastMicrosDisplay) < 30LL * 1000000LL) {
      display.clearDisplay();
      if (modeIndicator == OFF) {
        renderTitle("ELIGE TEMPORIZADOR...");
        renderNumber(hourIndicator + 1);
      } else if (modeIndicator == ON && isTimerRunning) {
        renderTitle("TIEMPO RESTANTE");
        int64_t elapsed         = currentMicros - timerStartTime;
        int64_t remainingMicros = timerDuration - elapsed;
        if (remainingMicros < 0) remainingMicros = 0;
        int totalSec = remainingMicros / 1000000;
        renderTime(totalSec / 3600, (totalSec % 3600) / 60);
      }
      display.display();
    } else {
      displayActive = false;
      if (!displayCleared) {
        display.clearDisplay();
        display.display();
        displayCleared = true;
      }
    }
  }
}

// ========== ERROR HANDLER ==========
void handleError(String errorMessage) {
  modeIndicator = ERROR_STATE;
  digitalWrite(ON_INDICATOR_LED, LOW);
  while (true) {
    Serial.println("CRITICAL ERROR: " + errorMessage);
    digitalWrite(OFF_LED, HIGH); digitalWrite(SELECTOR_LED, HIGH); digitalWrite(OK_LED, HIGH);
    delay(200);
    digitalWrite(OFF_LED, LOW);  digitalWrite(SELECTOR_LED, LOW);  digitalWrite(OK_LED, LOW);
    delay(200);
    digitalWrite(OFF_LED, HIGH); digitalWrite(SELECTOR_LED, HIGH); digitalWrite(OK_LED, HIGH);
    delay(200);
    digitalWrite(OFF_LED, LOW);  digitalWrite(SELECTOR_LED, LOW);  digitalWrite(OK_LED, LOW);
    delay(600);
  }
}
