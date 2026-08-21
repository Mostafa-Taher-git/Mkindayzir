// src/lib/config.ts
import { z } from 'zod';

const ModeSchema = z.enum(['personal', 'team', 'enterprise']);

const configSchema = z.object({
  mode: ModeSchema.default('personal'),
  port: z.coerce.number().default(3000),
  databaseProvider: z.enum(['sqlite', 'postgresql']).default('sqlite'),
  databaseUrl: z.string().default('file:./data/mkindayzir.db'),
  dataDir: z.string().default('./data'),
  sessionSecret: z.string().min(64),
  encryptionKey: z.string().min(32),
  sessionMaxAge: z.coerce.number().default(86400),
  bcryptRounds: z.coerce.number().default(12),
  maxUploadSize: z.coerce.number().default(26214400),
  rateLimitGeneral: z.coerce.number().default(100),
  rateLimitAi: z.coerce.number().default(20),
  rateLimitAuth: z.coerce.number().default(5),
  defaultAiProvider: z.string().default('openrouter'),
  defaultAiModel: z.string().default('anthropic/claude-sonnet-4-20250514'),
  logLevel: z.string().default('info'),
  logFormat: z.string().default('json'),
  autoLogin: z.coerce.boolean().default(false),
  registrationEnabled: z.coerce.boolean().default(false),
  nodeEnv: z.string().default('development'),
  baseUrl: z.string().default('http://localhost:3000'),
});

export type Config = z.infer<typeof configSchema>;

let cachedConfig: Config | null = null;

export function getConfig(): Config {
  if (cachedConfig) return cachedConfig;
  
  const raw = {
    mode: process.env.MKINDAYZIR_MODE ?? 'personal',
    port: process.env.PORT ?? '3000',
    databaseProvider: process.env.DATABASE_PROVIDER ?? 'sqlite',
    databaseUrl: process.env.DATABASE_URL ?? 'file:./data/mkindayzir.db',
    dataDir: process.env.DATA_DIR ?? './data',
    sessionSecret: process.env.SESSION_SECRET ?? '',
    encryptionKey: process.env.ENCRYPTION_KEY ?? '',
    sessionMaxAge: process.env.SESSION_MAX_AGE ?? '86400',
    bcryptRounds: process.env.BCRYPT_ROUNDS ?? '12',
    maxUploadSize: process.env.MAX_UPLOAD_SIZE ?? '26214400',
    rateLimitGeneral: process.env.RATE_LIMIT_GENERAL ?? '100',
    rateLimitAi: process.env.RATE_LIMIT_AI ?? '20',
    rateLimitAuth: process.env.RATE_LIMIT_AUTH ?? '5',
    defaultAiProvider: process.env.DEFAULT_AI_PROVIDER ?? 'openrouter',
    defaultAiModel: process.env.DEFAULT_AI_MODEL ?? 'anthropic/claude-sonnet-4-20250514',
    logLevel: process.env.LOG_LEVEL ?? 'info',
    logFormat: process.env.LOG_FORMAT ?? 'json',
    autoLogin: process.env.AUTO_LOGIN ?? 'false',
    registrationEnabled: process.env.REGISTRATION_ENABLED ?? 'false',
    nodeEnv: process.env.NODE_ENV ?? 'development',
    baseUrl: process.env.BASE_URL ?? 'http://localhost:3000',
  };

  const result = configSchema.safeParse(raw);
  if (!result.success) {
    throw new Error(`Invalid configuration: ${result.error.message}`);
  }

  cachedConfig = result.data;
  return cachedConfig;
}

export function isPersonalMode(): boolean {
  return getConfig().mode === 'personal';
}

export function isTeamMode(): boolean {
  return getConfig().mode === 'team';
}

export function isEnterpriseMode(): boolean {
  return getConfig().mode === 'enterprise';
}
