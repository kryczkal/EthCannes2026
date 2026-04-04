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

export const verificationStatusSchema = z.enum(['confirmed', 'rejected', 'inconclusive']);
export const verificationConfidenceSchema = z.enum(['low', 'medium', 'high']);

export const candidateResultSchema = z.object({
  id: z.string().min(1),
  status: verificationStatusSchema,
  file_name: z.string().min(1),
  where: z.string().min(1),
  potential_vulnerability: z.string().min(1),
  normalized_capability: z.string().min(1).nullable(),
  confidence: verificationConfidenceSchema,
  evidence: z.array(z.string()).default([]),
  tool_trace: z.array(z.string()).default([]),
  rationale: z.string().min(1),
});

export const verificationOutputSchema = z.object({
  package_name: z.string().min(1),
  package_version: z.string().min(1),
  verifier: z.enum(['ai-sdk', 'openclaw']),
  results: z.array(candidateResultSchema),
});

export const toolNameSchema = z.enum([
  'list_files',
  'read_file',
  'search_in_files',
  'eval_js',
  'require_and_trace',
  'run_npm_script',
  'fast_forward_timers',
]);

export const toolCallSchema = z.object({
  type: z.literal('tool_call'),
  tool: toolNameSchema,
  input: z.record(z.any()).default({}),
  reason: z.string().optional(),
});

export const toolFinalResultSchema = z.object({
  type: z.literal('final'),
  results: z.array(candidateResultSchema),
});

export const toolLoopResponseSchema = z.union([toolCallSchema, toolFinalResultSchema]);

export type Candidate = z.infer<typeof candidateSchema>;
export type VerificationInput = z.infer<typeof verificationInputSchema>;
export type CandidateResult = z.infer<typeof candidateResultSchema>;
export type VerificationOutput = z.infer<typeof verificationOutputSchema>;
export type ToolName = z.infer<typeof toolNameSchema>;
export type ToolLoopResponse = z.infer<typeof toolLoopResponseSchema>;
