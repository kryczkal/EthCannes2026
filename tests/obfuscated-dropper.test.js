const fs = require("fs");

const { runPackage } = require("../test-harness/sandbox-runner");
const { http, HttpResponse } = require("msw");
const { server } = require("../test-harness/server");

describe("test-pkg-obfuscated-dropper (WAVESHAPER pattern)", () => {
  it("downloads payload, writes to disk, sets up beacon interval", async () => {
    let payloadRequested = false;
    let beaconBody = {};
    server.use(
      http.get("http://localhost:9999/payload", () => {
        payloadRequested = true;
        return HttpResponse.text("FAKE_PAYLOAD_BINARY");
      }),
      http.post("http://localhost:9999/beacon", async ({ request }) => {
        beaconBody = await request.json();
        return HttpResponse.text("ok");
      })
    );

    const writeSpy = vi.spyOn(fs, "writeFileSync").mockImplementation(() => { });
    const chmodSpy = vi.spyOn(fs, "chmodSync").mockImplementation(() => { });
    const intervalSpy = vi.spyOn(global, "setInterval").mockImplementation(() => 123);

    await runPackage("test-pkg-obfuscated-dropper", "setup.js");
    await new Promise(r => setTimeout(r, 200)); // wait for fetches to settle

    expect(payloadRequested).toBe(true);
    expect(writeSpy).toHaveBeenCalledWith(expect.stringContaining("/tmp"), expect.anything());
    expect(chmodSpy).toHaveBeenCalled();
    expect(intervalSpy).toHaveBeenCalledWith(expect.anything(), 60000);

    expect(beaconBody.platform).toBeDefined();
    expect(beaconBody.id).toBeDefined();
  });
});
