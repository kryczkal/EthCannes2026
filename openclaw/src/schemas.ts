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

export const candidateResultSchema = z.object({
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
});

export const verificationOutputSchema = z.object({
  package_name: z.string().min(1),
  package_version: z.string().min(1),
  verifier: z.literal('openclaw'),
  results: z.array(candidateResultSchema),
});

export const toolLoopResponseSchema = z.union([
  z.object({
    type: z.literal('tool_call'),
    tool: z.enum([
      'list_files',
      'read_file',
      'search_in_files',
      'eval_js',
      'require_and_trace',
      'run_npm_script',
      'fast_forward_timers',
    ]),
    input: z.record(z.any()).default({}),
    reason: z.string().optional(),
  }),
  z.object({
    type: z.literal('final'),
    results: z.array(candidateResultSchema),
  }),
]);

export type VerificationInput = z.infer<typeof verificationInputSchema>;
export type VerificationOutput = z.infer<typeof verificationOutputSchema>;
export type ToolLoopResponse = z.infer<typeof toolLoopResponseSchema>;
