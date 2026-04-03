const { runInChildProcess } = require("../test-harness/child-process-runner");

describe("test-pkg-dos-loop (colors.js pattern)", () => {
  it("enters infinite loop, floods stdout with LIBERTY + Zalgo text, gets killed", async () => {
    const result = await runInChildProcess("test-pkg-dos-loop", "index.js", {
      timeout: 3000,
    });

    // Process should be killed by timeout (infinite loop)
    expect(result.timedOut).toBe(true);
    expect(result.killed).toBe(true);

    // Stdout should contain LIBERTY (strip Zalgo combining chars first)
    const stripped = result.stdout.replace(/[\u0300-\u036F]/g, "");
    expect(stripped).toContain("LIBERTY");

    // Stdout should contain Zalgo combining characters (U+0300 - U+031A)
    const hasZalgo = /[\u0300-\u031A]/.test(result.stdout);
    expect(hasZalgo).toBe(true);

    // Should have generated significant output (> 1KB)
    expect(result.stdout.length).toBeGreaterThan(1024);
  });
});
