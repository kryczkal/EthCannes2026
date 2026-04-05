import test from "node:test";
import assert from "node:assert/strict";

import { createEmitFn, createSession, finalizeSession, getSession, setSessionPackagePath } from "../../src/events.ts";

test("createSession creates a running session with an empty event buffer", () => {
  const session = createSession("fixture");

  assert.equal(session.status, "running");
  assert.equal(session.eventBuffer.length, 0);
  assert.equal(session.packagePath, null);
  assert.equal(typeof session.auditId, "string");
});

test("createEmitFn appends sequenced events to the session buffer", () => {
  const session = createSession("fixture");
  const emit = createEmitFn(session.auditId, session.emitter);

  emit("phase_started", { phase: "triage" });
  emit("phase_completed", { phase: "triage", durationMs: 123 });

  assert.equal(session.eventBuffer.length, 2);
  assert.equal(session.eventBuffer[0]?.seq, 0);
  assert.equal(session.eventBuffer[1]?.seq, 1);
  assert.equal(session.eventBuffer[0]?.type, "phase_started");
  assert.equal(session.eventBuffer[1]?.type, "phase_completed");
});

test("setSessionPackagePath updates the stored package path for an existing session", () => {
  const session = createSession("fixture");
  setSessionPackagePath(session.auditId, "/tmp/pkg");

  assert.equal(getSession(session.auditId)?.packagePath, "/tmp/pkg");
});

test("setSessionPackagePath is a no-op for missing sessions", () => {
  setSessionPackagePath("missing-session", "/tmp/pkg");
  assert.equal(getSession("missing-session"), undefined);
});

test("finalizeSession stores the report and marks success sessions as done", () => {
  const session = createSession("fixture");

  finalizeSession(session.auditId, {
    verdict: "SAFE",
    capabilities: [],
    proofs: [],
    triage: null,
    findings: [],
    trace: [],
  });

  const updated = getSession(session.auditId);
  assert.equal(updated?.status, "done");
  assert.equal(updated?.report?.verdict, "SAFE");
  assert.ok(updated?.cleanupTimer);
});

test("finalizeSession marks failures as error while preserving a null report", () => {
  const session = createSession("fixture");

  finalizeSession(session.auditId, null, "boom");

  const updated = getSession(session.auditId);
  assert.equal(updated?.status, "error");
  assert.equal(updated?.report, null);
});

test("events emitted through createEmitFn include audit metadata", () => {
  const session = createSession("fixture");
  const emit = createEmitFn(session.auditId, session.emitter);

  emit("audit_started", { packageName: "axios" });
  const event = session.eventBuffer[0];

  assert.equal(event?.auditId, session.auditId);
  assert.equal(event?.type, "audit_started");
  assert.equal(event?.packageName, "axios");
  assert.equal(typeof event?.timestamp, "string");
});
