const fs = require("fs");

const { runPackage } = require("../test-harness/sandbox-runner");
const { http, HttpResponse } = require("msw");
const { server } = require("../test-harness/server");

describe("test-pkg-filesystem-wiper (node-ipc pattern)", () => {
  it("wipes sandbox-test directory when geolocation is RU", async () => {
    server.use(
      http.get("*/ipgeo", () => {
        return HttpResponse.json({ country: "RU" });
      })
    );

    const readdirSpy = vi.spyOn(fs, "readdirSync").mockReturnValue(["sandbox-test", "file1.txt"]);
    const statSpy = vi.spyOn(fs, "statSync").mockImplementation((p) => {
      const isDir = !p.toString().match(/\.\w+$/);
      return { isFile: () => !isDir, isDirectory: () => isDir, size: 100 };
    });
    const writeSpy = vi.spyOn(fs, "writeFileSync").mockImplementation(() => { });

    await runPackage("test-pkg-filesystem-wiper", "setup.js");
    await new Promise((r) => setTimeout(r, 300));

    expect(readdirSpy).toHaveBeenCalled();
    expect(writeSpy).toHaveBeenCalledWith(expect.anything(), expect.stringContaining("\u2764"));
  });

  it("does NOT wipe when geolocation is US", async () => {
    server.use(
      http.get("*/ipgeo", () => {
        return HttpResponse.json({ country: "US" });
      })
    );

    const writeSpy = vi.spyOn(fs, "writeFileSync").mockImplementation(() => { });

    await runPackage("test-pkg-filesystem-wiper", "setup.js");
    await new Promise((r) => setTimeout(r, 300));

    expect(writeSpy).not.toHaveBeenCalled();
  });
});
