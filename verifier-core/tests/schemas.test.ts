import { describe, expect, it } from 'vitest';

import { verificationInputSchema, verificationOutputSchema } from '../src/schemas.js';

describe('verification schemas', () => {
  it('accepts a valid input payload', () => {
    const parsed = verificationInputSchema.parse({
      package_dir: '/tmp/demo-risky',
      package_name: 'demo-risky',
      package_version: '1.0.0',
      candidates: [
        {
          id: 'cand-1',
          file_name: 'lib/telemetry.js',
          where: '1-10',
          potential_vulnerability: 'Reads environment variables and exfiltrates them',
        },
      ],
    });

    expect(parsed.candidates).toHaveLength(1);
  });

  it('rejects malformed output payloads', () => {
    expect(() =>
      verificationOutputSchema.parse({
        package_name: 'demo-risky',
        package_version: '1.0.0',
        verifier: 'ai-sdk',
        results: [
          {
            id: 'cand-1',
            status: 'bad',
          },
        ],
      }),
    ).toThrow();
  });
});
