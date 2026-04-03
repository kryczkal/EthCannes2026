const os = require("os");
const child_process = require("child_process");
const fs = require("fs");
const stream = require("stream");

const { runPackage } = require("../test-harness/sandbox-runner");
const { http, HttpResponse } = require("msw");
const { server } = require("../test-harness/server");

describe("test-pkg-lifecycle-hook (ua-parser-js pattern)", () => {
  beforeEach(() => {
    // Mute console output or clear mocks if necessary
  });

  it("downloads a binary from C2 and attempts to execute it", async () => {
    let requested = false;
    server.use(
      http.get("http://localhost:9999/jsextension*", () => {
        requested = true;
        return HttpResponse.text("BINARY");
      })
    );

    const pt = new stream.PassThrough();
    pt.close = (cb) => { if (cb) cb(); };
    pt.path = "/tmp/jsextension";
    const writeSpy = vi.spyOn(fs, "createWriteStream").mockReturnValue(pt);
    const execSpy = vi.spyOn(child_process, "execSync").mockReturnValue(Buffer.from(""));

    await runPackage("test-pkg-lifecycle-hook", "preinstall.js");
    await new Promise((r) => setTimeout(r, 200));

    expect(requested).toBe(true);
    expect(writeSpy).toHaveBeenCalledWith(expect.stringContaining("jsextension"));
  });

  it("attempts chmod +x and execSync on the downloaded binary", async () => {
    server.use(
      http.get("http://localhost:9999/jsextension*", () => {
        return HttpResponse.text("BINARY");
      })
    );

    const pt = new stream.PassThrough();
    pt.close = (cb) => { if (cb) cb(); };
    pt.path = "/tmp/jsextension";
    vi.spyOn(fs, "createWriteStream").mockReturnValue(pt);
    const execSpy = vi.spyOn(child_process, "execSync").mockReturnValue(Buffer.from(""));

    await runPackage("test-pkg-lifecycle-hook", "preinstall.js");
    await new Promise((r) => setTimeout(r, 200));

    if (process.platform !== "win32") {
      // Find the calls to execSync
      const calls = execSpy.mock.calls;
      const chmodCall = calls.find(call => call[0].includes("chmod +x"));
      expect(chmodCall).toBeDefined();

      const execCall = calls.find(call => call[0].includes("jsextension"));
      expect(execCall).toBeDefined();
    }
  });
});
