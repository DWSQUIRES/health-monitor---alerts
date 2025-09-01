import { z } from 'zod';

const EnvSchema = z.object({
  RPC_URL: z.string().min(1, 'RPC_URL is required'),
  PRIVATE_KEY: z.string().optional().or(z.literal('')).transform(v => (v ? v : undefined)),
  COMET_ADDRESS: z.string().optional().or(z.literal('')).transform(v => (v ? v : undefined)),
  COMET_REWARDS_ADDRESS: z.string().optional().or(z.literal('')).transform(v => (v ? v : undefined)),
});

export type Env = z.infer<typeof EnvSchema>;

export function loadEnv(): Env {
  const parsed = EnvSchema.safeParse({
    RPC_URL: process.env.RPC_URL,
    PRIVATE_KEY: process.env.PRIVATE_KEY,
    COMET_ADDRESS: process.env.COMET_ADDRESS,
    COMET_REWARDS_ADDRESS: process.env.COMET_REWARDS_ADDRESS,
  });
  if (!parsed.success) {
    const issues = parsed.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Invalid environment: ${issues}`);
  }
  return parsed.data;
} 