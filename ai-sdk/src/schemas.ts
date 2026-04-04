import { z } from 'zod';

export const candidateSchema = z.object({
  id: z.string().min(1),
  file_name: z.string().min(1),
  where: z.string().min(1),
  potential_vulnerability: z.string().min(1),
});

export const verificationInputSchema = z.object({
  package_dir: z.string().min(1),
  package_name: z.string().min(1),
  package_version: z.string().min(1),
  candidates: z.array(candidateSchema).min(1),
});

export const verificationOutputSchema = z.object({
  package_name: z.string().min(1),
  package_version: z.string().min(1),
  verifier: z.literal('ai-sdk'),
  results: z.array(
    z.object({
      id: z.string().min(1),
      status: z.enum(['confirmed', 'rejected', 'inconclusive']),
      file_name: z.string().min(1),
      where: z.string().min(1),
      potential_vulnerability: z.string().min(1),
      normalized_capability: z.string().min(1).nullable(),
      confidence: z.enum(['low', 'medium', 'high']),
      evidence: z.array(z.string()).default([]),
      tool_trace: z.array(z.string()).default([]),
      rationale: z.string().min(1),
    }),
  ),
});

export type VerificationInput = z.infer<typeof verificationInputSchema>;
export type VerificationOutput = z.infer<typeof verificationOutputSchema>;
