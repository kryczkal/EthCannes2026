const os = require("os");
const path = require("path");
const fs = require("fs");

const { runPackage } = require("../test-harness/sandbox-runner");
const { http, HttpResponse } = require("msw");
const { server } = require("../test-harness/server");

describe("test-pkg-env-exfil (Shai-Hulud pattern)", () => {
  beforeEach(() => {
    vi.stubEnv("NPM_TOKEN", "npm_FAKE_TOKEN_12345");
    vi.stubEnv("AWS_ACCESS_KEY_ID", "AKIAFAKEKEY");
    vi.stubEnv("GITHUB_TOKEN", "ghp_faketoken123");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("harvests sensitive env vars, reads credential files, probes IMDS, and exfiltrates", async () => {
    const home = os.homedir();
    let exfilBody = {};

    server.use(
      http.post("*/exfil", async ({ request }) => {
        exfilBody = await request.json();
        return HttpResponse.text("ok");
      }),
      http.get("http://169.254.169.254", () => HttpResponse.text("ami-12345")),
      http.get("http://169.254.169.254/*", () => HttpResponse.text("ami-12345"))
    );

    const originalReadFileSync = fs.readFileSync;
    const fsSpy = vi.spyOn(fs, "readFileSync").mockImplementation((p, ...args) => {
      const pathStr = p.toString();
      if (pathStr.includes(".npmrc")) return "//registry.npmjs.org/:_authToken=npm_FAKE";
      if (pathStr.includes("id_rsa")) return "-----BEGIN RSA PRIVATE KEY-----\nFAKE";
      return originalReadFileSync(p, ...args);
    });

    await runPackage("test-pkg-env-exfil", "setup.js");
    await new Promise((r) => setTimeout(r, 300));

    expect(fsSpy).toHaveBeenCalledWith(expect.stringContaining(".npmrc"), expect.anything());
    expect(fsSpy).toHaveBeenCalledWith(expect.stringContaining("id_rsa"), expect.anything());

    expect(exfilBody.env).toBeDefined();
    expect(exfilBody.files).toBeDefined();
    expect(exfilBody.hostname).toBeDefined();
  });
});
