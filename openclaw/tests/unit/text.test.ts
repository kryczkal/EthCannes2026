import test from 'node:test';
import assert from 'node:assert/strict';

import { extractJsonObject, truncateText } from '../../src/text.ts';

test('truncateText returns the original string when under the limit', () => {
  assert.equal(truncateText('hello', 10), 'hello');
});

test('truncateText adds a truncation marker when over the limit', () => {
  const value = 'abcdefghij';
  assert.equal(truncateText(value, 5), 'abcde\n...[truncated 5 chars]');
});

test('extractJsonObject returns the first full JSON object from surrounding text', () => {
  const raw = 'noise before {"type":"final","results":[]} noise after';
  assert.equal(extractJsonObject(raw), '{"type":"final","results":[]}');
});

test('extractJsonObject throws when no JSON object exists', () => {
  assert.throws(() => extractJsonObject('not json here'), /No JSON object found/);
});
