import { useCallback, useEffect, useMemo, useState } from "react";
import "./App.css";

const API_URL =
  import.meta.env.VITE_API_URL ||
  "http://localhost:5000";


// ============================================================
// API
// ============================================================

async function api(path, options = {}) {
  const response = await fetch(
    `${API_URL}${path}`,
    {
      headers: {
        "Content-Type": "application/json",
        ...(options.headers || {}),
      },
      ...options,
    }
  );

  if (!response.ok) {
    let message = "Request failed.";

    try {
      const data = await response.json();
      message = data.error || message;
    } catch {
      // Ignore JSON parsing error
    }

    throw new Error(message);
  }

  return response.json();
}


// ============================================================
// HELPERS
// ============================================================

function formatTime(timestamp) {
  if (!timestamp) {
    return "Never";
  }

  const date = new Date(timestamp);

  if (Number.isNaN(date.getTime())) {
    return timestamp;
  }

  return date.toLocaleTimeString(
    [],
    {
      hour: "numeric",
      minute: "2-digit",
    }
  );
}


function formatDate(timestamp) {
  if (!timestamp) {
    return "Unknown";
  }

  const date = new Date(timestamp);

  if (Number.isNaN(date.getTime())) {
    return timestamp;
  }

  return date.toLocaleString(
    [],
    {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }
  );
}


function valueOrNA(value, suffix = "") {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return "N/A";
  }

  return `${value}${suffix}`;
}


// ============================================================
// ICONS
// ============================================================

function Icon({ name }) {
  const icons = {
    home: "⌂",
    activity: "◉",
    alert: "!",
    device: "▣",
    settings: "⚙",
    temperature: "°",
    humidity: "◌",
    motion: "⌁",
    door: "▯",
    water: "≈",
    pressure: "◒",
    relay: "⚡",
    led: "●",
    check: "✓",
    refresh: "↻",
  };

  return (
    <span
      className="icon"
      aria-hidden="true"
    >
      {icons[name] || "•"}
    </span>
  );
}


// ============================================================
// APP
// ============================================================

export default function App() {
  const [devices, setDevices] = useState([]);
  const [alerts, setAlerts] = useState([]);

  const [activePage, setActivePage] =
    useState("overview");

  const [selectedDeviceId, setSelectedDeviceId] =
    useState(null);

  const [loading, setLoading] =
    useState(true);

  const [refreshing, setRefreshing] =
    useState(false);

  const [error, setError] =
    useState("");

  const [apiOnline, setApiOnline] =
    useState(false);

  const [lastUpdated, setLastUpdated] =
    useState(null);


  // ==========================================================
  // LOAD DATA
  // ==========================================================

  const loadData = useCallback(
    async (showRefresh = false) => {
      if (showRefresh) {
        setRefreshing(true);
      }

      try {
        const [
          devicesResponse,
          alertsResponse,
          healthResponse,
        ] = await Promise.all([
          api("/api/devices"),
          api("/api/alerts"),
          api("/api/health"),
        ]);

        setDevices(
          devicesResponse.devices || []
        );

        setAlerts(
          alertsResponse.alerts || []
        );

        setApiOnline(
          healthResponse.status ===
            "healthy"
        );

        setLastUpdated(
          new Date()
        );

        setError("");

      } catch (err) {
        setApiOnline(false);

        setError(
          err.message ||
            "Unable to connect to SafeHaven backend."
        );

      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    []
  );


  useEffect(() => {
    loadData();

    const interval =
      setInterval(
        () => loadData(),
        3000
      );

    return () =>
      clearInterval(interval);
  }, [loadData]);


  // ==========================================================
  // SELECT DEFAULT DEVICE
  // ==========================================================

  useEffect(() => {
    if (
      devices.length > 0 &&
      !selectedDeviceId
    ) {
      setSelectedDeviceId(
        devices[0].device_id
      );
    }
  }, [
    devices,
    selectedDeviceId,
  ]);


  // ==========================================================
  // DEVICE
  // ==========================================================

  const selectedDevice = useMemo(
    () =>
      devices.find(
        (device) =>
          device.device_id ===
          selectedDeviceId
      ) || devices[0],
    [
      devices,
      selectedDeviceId,
    ]
  );


  // ==========================================================
  // STATS
  // ==========================================================

  const onlineDevices =
    devices.filter(
      (device) =>
        device.online
    ).length;


  const activeAlerts =
    alerts.filter(
      (alert) =>
        !alert.acknowledged
    );


  const criticalAlerts =
    activeAlerts.filter(
      (alert) =>
        alert.severity ===
        "critical"
    );


  // ==========================================================
  // COMMAND
  // ==========================================================

  async function sendCommand(
    command
  ) {
    if (!selectedDevice) {
      return;
    }

    try {
      await api(
        `/api/devices/${selectedDevice.device_id}/command`,
        {
          method: "POST",

          body: JSON.stringify({
            command,
          }),
        }
      );

      await loadData();

    } catch (err) {
      setError(
        err.message
      );
    }
  }


  // ==========================================================
  // ACKNOWLEDGE
  // ==========================================================

  async function acknowledgeAlert(
    alertId
  ) {
    try {
      await api(
        `/api/alerts/${alertId}/acknowledge`,
        {
          method: "POST",
        }
      );

      await loadData();

    } catch (err) {
      setError(
        err.message
      );
    }
  }


  // ==========================================================
  // RENDER
  // ==========================================================

  return (
    <div className="app-shell">

      {/* ================================================== */}
      {/* SIDEBAR */}
      {/* ================================================== */}

      <aside className="sidebar">

        <div className="brand">

          <div className="brand-mark">
            <span>⌂</span>
          </div>

          <div>
            <div className="brand-name">
              SafeHaven
            </div>

            <div className="brand-subtitle">
              Home safety
            </div>
          </div>

        </div>


        <nav className="navigation">

          <NavItem
            icon="home"
            label="Overview"
            active={
              activePage ===
              "overview"
            }
            onClick={() =>
              setActivePage(
                "overview"
              )
            }
          />

          <NavItem
            icon="activity"
            label="Live monitoring"
            active={
              activePage ===
              "monitoring"
            }
            onClick={() =>
              setActivePage(
                "monitoring"
              )
            }
          />

          <NavItem
            icon="alert"
            label="Alerts"
            count={
              activeAlerts.length
            }
            active={
              activePage ===
              "alerts"
            }
            onClick={() =>
              setActivePage(
                "alerts"
              )
            }
          />

          <NavItem
            icon="device"
            label="Devices"
            active={
              activePage ===
              "devices"
            }
            onClick={() =>
              setActivePage(
                "devices"
              )
            }
          />

        </nav>


        <div className="sidebar-bottom">

          <div className="connection-card">

            <div
              className={`connection-dot ${
                apiOnline
                  ? "online"
                  : "offline"
              }`}
            />

            <div>

              <strong>
                {apiOnline
                  ? "System connected"
                  : "System offline"}
              </strong>

              <span>
                {apiOnline
                  ? "Monitoring is active"
                  : "Check backend"}
              </span>

            </div>

          </div>

        </div>

      </aside>


      {/* ================================================== */}
      {/* MAIN */}
      {/* ================================================== */}

      <main className="main-content">

        {/* HEADER */}

        <header className="topbar">

          <div>

            <div className="eyebrow">
              {getPageEyebrow(
                activePage
              )}
            </div>

            <h1>
              {getPageTitle(
                activePage
              )}
            </h1>

          </div>


          <div className="topbar-actions">

            <div className="last-updated">

              <span
                className={`status-dot ${
                  apiOnline
                    ? "online"
                    : "offline"
                }`}
              />

              {lastUpdated
                ? `Updated ${formatTime(
                    lastUpdated
                  )}`
                : "Connecting..."}

            </div>


            <button
              className="refresh-button"
              onClick={() =>
                loadData(true)
              }
              disabled={refreshing}
            >
              <Icon name="refresh" />

              {refreshing
                ? "Refreshing"
                : "Refresh"}
            </button>

          </div>

        </header>


        {/* ERROR */}

        {error && (
          <div className="error-banner">

            <div>
              <strong>
                Connection issue
              </strong>

              <span>
                {error}
              </span>
            </div>

            <button
              onClick={() =>
                loadData(true)
              }
            >
              Retry
            </button>

          </div>
        )}


        {/* ================================================= */}
        {/* OVERVIEW */}
        {/* ================================================= */}

        {activePage ===
          "overview" && (
          <Overview
            devices={devices}
            selectedDevice={
              selectedDevice
            }
            onlineDevices={
              onlineDevices
            }
            activeAlerts={
              activeAlerts
            }
            criticalAlerts={
              criticalAlerts
            }
            onSelectDevice={
              setSelectedDeviceId
            }
            onCommand={
              sendCommand
            }
            onAcknowledge={
              acknowledgeAlert
            }
          />
        )}


        {/* ================================================= */}
        {/* MONITORING */}
        {/* ================================================= */}

        {activePage ===
          "monitoring" && (
          <Monitoring
            devices={devices}
            selectedDevice={
              selectedDevice
            }
            onSelectDevice={
              setSelectedDeviceId
            }
          />
        )}


        {/* ================================================= */}
        {/* ALERTS */}
        {/* ================================================= */}

        {activePage ===
          "alerts" && (
          <AlertsPage
            alerts={alerts}
            onAcknowledge={
              acknowledgeAlert
            }
          />
        )}


        {/* ================================================= */}
        {/* DEVICES */}
        {/* ================================================= */}

        {activePage ===
          "devices" && (
          <DevicesPage
            devices={devices}
            selectedDevice={
              selectedDevice
            }
            onSelectDevice={
              setSelectedDeviceId
            }
            onCommand={
              sendCommand
            }
          />
        )}

      </main>

    </div>
  );
}


// ============================================================
// NAV ITEM
// ============================================================

function NavItem({
  icon,
  label,
  count,
  active,
  onClick,
}) {
  return (
    <button
      className={`nav-item ${
        active ? "active" : ""
      }`}
      onClick={onClick}
    >
      <Icon name={icon} />

      <span>
        {label}
      </span>

      {count > 0 && (
        <span className="nav-count">
          {count}
        </span>
      )}

    </button>
  );
}


// ============================================================
// OVERVIEW
// ============================================================

function Overview({
  devices,
  selectedDevice,
  onlineDevices,
  activeAlerts,
  criticalAlerts,
  onSelectDevice,
  onCommand,
  onAcknowledge,
}) {
  return (
    <>

      {/* SUMMARY */}

      <section className="stats-grid">

        <StatCard
          label="Homes monitored"
          value={devices.length}
          detail={
            devices.length === 1
              ? "1 connected device"
              : `${devices.length} connected devices`
          }
          icon="home"
        />

        <StatCard
          label="Devices online"
          value={onlineDevices}
          detail={
            devices.length
              ? `${Math.round(
                  (onlineDevices /
                    devices.length) *
                    100
                )}% online`
              : "No devices"
          }
          icon="device"
          positive
        />

        <StatCard
          label="Active alerts"
          value={activeAlerts.length}
          detail={
            criticalAlerts.length
              ? `${criticalAlerts.length} critical`
              : "Nothing critical"
          }
          icon="alert"
          warning={
            activeAlerts.length > 0
          }
        />

      </section>


      {/* DEVICE SELECTOR */}

      {devices.length > 0 && (
        <section className="section">

          <div className="section-heading">

            <div>
              <h2>
                Home status
              </h2>

              <p>
                Live information from your SafeHaven device.
              </p>
            </div>


            <select
              className="device-select"
              value={
                selectedDevice?.device_id ||
                ""
              }
              onChange={(event) =>
                onSelectDevice(
                  event.target.value
                )
              }
            >
              {devices.map(
                (device) => (
                  <option
                    key={
                      device.device_id
                    }
                    value={
                      device.device_id
                    }
                  >
                    {device.device_id}
                  </option>
                )
              )}
            </select>

          </div>


          {selectedDevice && (
            <SensorGrid
              device={
                selectedDevice
              }
            />
          )}

        </section>
      )}


      {/* NO DEVICE */}

      {devices.length === 0 && (
        <EmptyState />
      )}


      {/* CONTROLS */}

      {selectedDevice && (
        <section className="section">

          <div className="section-heading">

            <div>
              <h2>
                Home controls
              </h2>

              <p>
                Send commands to your SafeHaven device.
              </p>
            </div>

          </div>


          <ControlPanel
            device={
              selectedDevice
            }
            onCommand={
              onCommand
            }
          />

        </section>
      )}


      {/* ALERTS */}

      <section className="section">

        <div className="section-heading">

          <div>
            <h2>
              Recent alerts
            </h2>

            <p>
              Events that may need your attention.
            </p>
          </div>

        </div>


        <AlertList
          alerts={
            activeAlerts.slice(
              0,
              5
            )
          }
          onAcknowledge={
            onAcknowledge
          }
        />

      </section>

    </>
  );
}


// ============================================================
// SENSOR GRID
// ============================================================

function SensorGrid({
  device,
}) {
  return (
    <div className="sensor-grid">

      <SensorCard
        icon="temperature"
        label="Temperature"
        value={valueOrNA(
          device.temperature,
          "°C"
        )}
        state={
          device.temperature >= 35
            ? "critical"
            : device.temperature <= 10
            ? "warning"
            : "normal"
        }
      />

      <SensorCard
        icon="humidity"
        label="Humidity"
        value={valueOrNA(
          device.humidity,
          "%"
        )}
        state="normal"
      />

      <SensorCard
        icon="motion"
        label="Motion"
        value={
          device.motion
            ? "Detected"
            : "Clear"
        }
        state={
          device.motion
            ? "info"
            : "normal"
        }
      />

      <SensorCard
        icon="door"
        label="Front door"
        value={
          device.door_open
            ? "Open"
            : "Closed"
        }
        state={
          device.door_open
            ? "warning"
            : "normal"
        }
      />

      <SensorCard
        icon="water"
        label="Water leak"
        value={
          device.water_leak
            ? "Detected"
            : "Clear"
        }
        state={
          device.water_leak
            ? "critical"
            : "normal"
        }
      />

      <SensorCard
        icon="pressure"
        label="Pressure"
        value={valueOrNA(
          device.pressure
        )}
        state="normal"
      />

    </div>
  );
}


// ============================================================
// SENSOR CARD
// ============================================================

function SensorCard({
  icon,
  label,
  value,
  state,
}) {
  return (
    <article
      className={`sensor-card ${state}`}
    >

      <div className="sensor-card-top">

        <div className="sensor-icon">
          <Icon name={icon} />
        </div>

        <span
          className={`sensor-status ${state}`}
        >
          {state === "normal"
            ? "Normal"
            : state === "critical"
            ? "Attention"
            : state === "warning"
            ? "Warning"
            : "Activity"}
        </span>

      </div>


      <div className="sensor-label">
        {label}
      </div>


      <div className="sensor-value">
        {value}
      </div>

    </article>
  );
}


// ============================================================
// CONTROL PANEL
// ============================================================

function ControlPanel({
  device,
  onCommand,
}) {
  return (
    <div className="control-panel">

      <ControlButton
        icon="relay"
        label="Turn relay on"
        description="Activate connected device"
        onClick={() =>
          onCommand(
            "relay_on"
          )
        }
      />

      <ControlButton
        icon="relay"
        label="Turn relay off"
        description="Deactivate connected device"
        onClick={() =>
          onCommand(
            "relay_off"
          )
        }
      />

      <ControlButton
        icon="led"
        label="Turn LED on"
        description="Activate ESP32 status LED"
        onClick={() =>
          onCommand(
            "led_on"
          )
        }
      />

      <ControlButton
        icon="led"
        label="Turn LED off"
        description="Deactivate ESP32 status LED"
        onClick={() =>
          onCommand(
            "led_off"
          )
        }
      />

    </div>
  );
}


function ControlButton({
  icon,
  label,
  description,
  onClick,
}) {
  return (
    <button
      className="control-button"
      onClick={onClick}
    >

      <div className="control-icon">
        <Icon name={icon} />
      </div>

      <div>
        <strong>
          {label}
        </strong>

        <span>
          {description}
        </span>
      </div>

      <span className="control-arrow">
        →
      </span>

    </button>
  );
}


// ============================================================
// ALERT LIST
// ============================================================

function AlertList({
  alerts,
  onAcknowledge,
}) {
  if (alerts.length === 0) {
    return (
      <div className="empty-alerts">

        <div className="empty-check">
          <Icon name="check" />
        </div>

        <div>
          <strong>
            Everything looks good
          </strong>

          <span>
            There are no active alerts requiring attention.
          </span>
        </div>

      </div>
    );
  }


  return (
    <div className="alerts-list">

      {alerts.map(
        (alert) => (
          <article
            className={`alert-row ${alert.severity}`}
            key={alert.id}
          >

            <div className="alert-severity">
              {alert.severity ===
              "critical"
                ? "!"
                : alert.severity ===
                  "warning"
                ? "!"
                : "i"}
            </div>


            <div className="alert-content">

              <strong>
                {alert.message}
              </strong>

              <span>
                {formatDate(
                  alert.timestamp
                )}
              </span>

            </div>


            <button
              className="ack-button"
              onClick={() =>
                onAcknowledge(
                  alert.id
                )
              }
            >
              Acknowledge
            </button>

          </article>
        )
      )}

    </div>
  );
}


// ============================================================
// ALERT PAGE
// ============================================================

function AlertsPage({
  alerts,
  onAcknowledge,
}) {
  return (
    <section className="page-section">

      <div className="page-intro">

        <h2>
          Alerts
        </h2>

        <p>
          Review safety events detected by your SafeHaven system.
        </p>

      </div>


      <AlertList
        alerts={alerts}
        onAcknowledge={
          onAcknowledge
        }
      />

    </section>
  );
}


// ============================================================
// MONITORING
// ============================================================

function Monitoring({
  devices,
  selectedDevice,
  onSelectDevice,
}) {
  return (
    <section className="page-section">

      <div className="page-intro">

        <h2>
          Live monitoring
        </h2>

        <p>
          Real-time sensor information from your home.
        </p>

      </div>


      <div className="monitoring-layout">

        <div className="device-list">

          {devices.map(
            (device) => (
              <button
                className={`device-list-item ${
                  selectedDevice?.device_id ===
                  device.device_id
                    ? "selected"
                    : ""
                }`}
                key={
                  device.device_id
                }
                onClick={() =>
                  onSelectDevice(
                    device.device_id
                  )
                }
              >

                <div className="device-avatar">
                  <Icon name="device" />
                </div>

                <div>

                  <strong>
                    {device.device_id}
                  </strong>

                  <span>
                    {device.online
                      ? "Online"
                      : "Offline"}
                  </span>

                </div>

                <span
                  className={`device-online-dot ${
                    device.online
                      ? "online"
                      : "offline"
                  }`}
                />

              </button>
            )
          )}

        </div>


        <div>

          {selectedDevice ? (
            <SensorGrid
              device={
                selectedDevice
              }
            />
          ) : (
            <EmptyState />
          )}

        </div>

      </div>

    </section>
  );
}


// ============================================================
// DEVICES
// ============================================================

function DevicesPage({
  devices,
  selectedDevice,
  onSelectDevice,
  onCommand,
}) {
  return (
    <section className="page-section">

      <div className="page-intro">

        <h2>
          Devices
        </h2>

        <p>
          Manage connected SafeHaven hardware.
        </p>

      </div>


      <div className="devices-table">

        <div className="table-header">
          <span>Device</span>
          <span>Status</span>
          <span>Last seen</span>
          <span>Relay</span>
        </div>


        {devices.map(
          (device) => (
            <button
              className={`table-row ${
                selectedDevice?.device_id ===
                device.device_id
                  ? "selected"
                  : ""
              }`}
              key={
                device.device_id
              }
              onClick={() =>
                onSelectDevice(
                  device.device_id
                )
              }
            >

              <span className="table-device">
                <span className="device-avatar small">
                  <Icon name="device" />
                </span>

                <strong>
                  {device.device_id}
                </strong>
              </span>


              <span>
                <span
                  className={`status-pill ${
                    device.online
                      ? "online"
                      : "offline"
                  }`}
                >
                  {device.online
                    ? "Online"
                    : "Offline"}
                </span>
              </span>


              <span>
                {formatDate(
                  device.last_seen
                )}
              </span>


              <span>
                {device.relay
                  ? "On"
                  : "Off"}
              </span>

            </button>
          )
        )}

      </div>


      {selectedDevice && (
        <div className="device-details">

          <div className="detail-header">

            <div>

              <span className="eyebrow">
                Selected device
              </span>

              <h3>
                {selectedDevice.device_id}
              </h3>

            </div>

            <span
              className={`status-pill ${
                selectedDevice.online
                  ? "online"
                  : "offline"
              }`}
            >
              {selectedDevice.online
                ? "Online"
                : "Offline"}
            </span>

          </div>


          <div className="detail-grid">

            <DetailItem
              label="IP address"
              value={
                selectedDevice.ip ||
                "Not available"
              }
            />

            <DetailItem
              label="Uptime"
              value={
                selectedDevice.uptime
                  ? `${Math.floor(
                      selectedDevice.uptime /
                        1000
                    )} seconds`
                  : "N/A"
              }
            />

            <DetailItem
              label="Last seen"
              value={formatDate(
                selectedDevice.last_seen
              )}
            />

            <DetailItem
              label="Relay"
              value={
                selectedDevice.relay
                  ? "On"
                  : "Off"
              }
            />

          </div>


          <ControlPanel
            device={
              selectedDevice
            }
            onCommand={
              onCommand
            }
          />

        </div>
      )}

    </section>
  );
}


// ============================================================
// STAT CARD
// ============================================================

function StatCard({
  label,
  value,
  detail,
  icon,
  positive,
  warning,
}) {
  return (
    <article className="stat-card">

      <div className="stat-card-top">

        <span>
          {label}
        </span>

        <div
          className={`stat-icon ${
            warning
              ? "warning"
              : positive
              ? "positive"
              : ""
          }`}
        >
          <Icon name={icon} />
        </div>

      </div>


      <div className="stat-value">
        {value}
      </div>


      <div
        className={`stat-detail ${
          warning
            ? "warning"
            : positive
            ? "positive"
            : ""
        }`}
      >
        {detail}
      </div>

    </article>
  );
}


// ============================================================
// DETAIL ITEM
// ============================================================

function DetailItem({
  label,
  value,
}) {
  return (
    <div className="detail-item">

      <span>
        {label}
      </span>

      <strong>
        {value}
      </strong>

    </div>
  );
}


// ============================================================
// EMPTY STATE
// ============================================================

function EmptyState() {
  return (
    <div className="empty-state">

      <div className="empty-state-icon">
        <Icon name="device" />
      </div>

      <h3>
        Waiting for your SafeHaven device
      </h3>

      <p>
        Start the MQTT broker and ESP32 to begin receiving telemetry.
      </p>

    </div>
  );
}


// ============================================================
// PAGE TITLES
// ============================================================

function getPageTitle(page) {
  switch (page) {
    case "monitoring":
      return "Live monitoring";

    case "alerts":
      return "Safety alerts";

    case "devices":
      return "Connected devices";

    default:
      return "Good evening";
  }
}


function getPageEyebrow(page) {
  switch (page) {
    case "monitoring":
      return "REAL-TIME SENSOR DATA";

    case "alerts":
      return "SAFETY CENTER";

    case "devices":
      return "HARDWARE";

    default:
      return "SAFEHAVEN DASHBOARD";
  }
}