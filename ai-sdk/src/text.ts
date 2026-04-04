export function truncateText(value: string, maxChars = 12000): string {
  if (value.length <= maxChars) {
    return value;
  }

  return `${value.slice(0, maxChars)}\n...[truncated ${value.length - maxChars} chars]`;
}

export function extractJsonObject(raw: string): string {
  const first = raw.indexOf('{');
  const last = raw.lastIndexOf('}');

  if (first === -1 || last === -1 || last <= first) {
    throw new Error('No JSON object found in model output.');
  }

  return raw.slice(first, last + 1);
}
