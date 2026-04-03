
const crypto = require("crypto");
const { runPackage } = require("../test-harness/sandbox-runner");
const { http, HttpResponse } = require("msw");
const { server } = require("../test-harness/server");
const Module = require("module");

describe("test-pkg-encrypted-payload (event-stream pattern)", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("decrypts and executes hidden payload when description matches", async () => {
    vi.stubEnv("npm_package_description", "A Test Security Auditor");

    let exfilReceived = false;
    server.use(
      http.post("*/exfil", () => {
        exfilReceived = true;
        return HttpResponse.text("ok");
      })
    );

    const cipherSpy = vi.spyOn(crypto, "createDecipheriv");
    const hashSpy = vi.spyOn(crypto, "createHash");
    const compileSpy = vi.spyOn(Module.prototype, "_compile");

    await runPackage("test-pkg-encrypted-payload", "index.min.js");
    await new Promise((r) => setTimeout(r, 200));

    expect(cipherSpy).toHaveBeenCalledWith("aes-256-cbc", expect.anything(), expect.anything());
    expect(hashSpy).toHaveBeenCalledWith("sha256");
    expect(compileSpy).toHaveBeenCalledWith(expect.stringContaining("exfil"), expect.anything());
    expect(exfilReceived).toBe(true);
  });

  it("does NOT activate when description is short", async () => {
    vi.stubEnv("npm_package_description", "short");

    const cipherSpy = vi.spyOn(crypto, "createDecipheriv");
    const compileSpy = vi.spyOn(Module.prototype, "_compile");

    await runPackage("test-pkg-encrypted-payload", "index.min.js");
    await new Promise((r) => setTimeout(r, 100));

    expect(cipherSpy).not.toHaveBeenCalled();
    // Payload compiles are done with filename "" in the malicious module
    const payloadCompile = compileSpy.mock.calls.find((call) => call[1] === "");
    expect(payloadCompile).toBeUndefined();
  });
});
