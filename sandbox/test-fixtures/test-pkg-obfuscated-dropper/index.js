const SAFE_TEST_MODE = true;

const http = require("http");
const https = require("https");
const { URL } = require("url");

function request(url, options = {}) {
  const maxRetries = options.retries || 3;
  const timeout = options.timeout || 5000;
  let attempts = 0;

  return new Promise((resolve, reject) => {
    function attempt() {
      attempts++;
      const parsedUrl = new URL(url);
      const client = parsedUrl.protocol === "https:" ? https : http;

      const req = client.get(url, { timeout }, (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () =>
          resolve({ status: res.statusCode, data })
        );
      });

      req.on("error", (err) => {
        if (attempts < maxRetries) {
          setTimeout(attempt, 1000 * attempts);
        } else {
          reject(err);
        }
      });

      req.on("timeout", () => {
        req.destroy();
        if (attempts < maxRetries) {
          setTimeout(attempt, 1000 * attempts);
        } else {
          reject(new Error("Request timed out"));
        }
      });
    }

    attempt();
  });
}

module.exports = { request };
