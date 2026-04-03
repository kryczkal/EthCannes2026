/**
 * Child process runner — forks a package entry point in a separate process
 * with a timeout. Used for DoS-style tests where the package hangs.
 */

const { fork } = require("child_process");
const path = require("path");

const PACKAGES_DIR = path.resolve(__dirname, "..", "test-fixtures");

/**
 * Run a package entry point in a child process with a timeout.
 *
 * @param {string} packageName - Directory name under test-packages/
 * @param {string} entryPoint - File to run (relative to package dir)
 * @param {object} options
 * @param {number} options.timeout - Kill the process after this many ms (default 3000)
 * @param {number} options.maxOutput - Max bytes of stdout/stderr to capture (default 65536)
 * @returns {Promise<{timedOut: boolean, killed: boolean, stdout: string, stderr: string, exitCode: number|null}>}
 */
async function runInChildProcess(packageName, entryPoint, options = {}) {
  const { timeout = 3000, maxOutput = 65536 } = options;

  const entryPath = path.join(PACKAGES_DIR, packageName, entryPoint);

  return new Promise((resolve) => {
    const child = fork(entryPath, [], {
      stdio: ["ignore", "pipe", "pipe", "ipc"],
      silent: true,
    });

    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let killed = false;

    child.stdout.on("data", (data) => {
      if (stdout.length < maxOutput) {
        stdout += data.toString().slice(0, maxOutput - stdout.length);
      }
    });

    child.stderr.on("data", (data) => {
      if (stderr.length < maxOutput) {
        stderr += data.toString().slice(0, maxOutput - stderr.length);
      }
    });

    const timer = setTimeout(() => {
      timedOut = true;
      killed = true;
      child.kill("SIGKILL");
    }, timeout);

    child.on("exit", (code) => {
      clearTimeout(timer);
      resolve({ timedOut, killed, stdout, stderr, exitCode: code });
    });

    child.on("error", (err) => {
      clearTimeout(timer);
      resolve({ timedOut, killed, stdout, stderr: stderr + err.message, exitCode: null });
    });
  });
}

module.exports = { runInChildProcess };
