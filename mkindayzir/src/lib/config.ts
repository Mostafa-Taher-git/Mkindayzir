// src/lib/config.ts
import { z } from 'zod';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const ModeSchema = z.enum(['personal', 'team', 'enterprise']);

const configSchema = z.object({
  mode: ModeSchema.default('personal'),
  port: z.coerce.number().default(3000),
  databaseProvider: z.enum(['sqlite', 'postgresql']).default('sqlite'),
  databaseUrl: z.string().default('file:./data/mkindayzir.db'),
  dataDir: z.string().default('./data'),
  sessionSecret: z.string().min(64),
  encryptionKey: z.string().min(64),
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

function generateSecretHex(bytes: number): string {
  return crypto.randomBytes(bytes).toString('hex');
}

/**
 * Loads secrets from data/secrets.json, generating and persisting them on first
 * boot when they are missing or too weak. This makes Personal mode zero-config.
 */
function loadOrGenerateSecrets(dataDir: string): { sessionSecret: string; encryptionKey: string } {
  const secretsPath = path.resolve(process.cwd(), dataDir, 'secrets.json');
  try {
    if (fs.existsSync(secretsPath)) {
      const parsed = JSON.parse(fs.readFileSync(secretsPath, 'utf-8'));
      if (
        typeof parsed.sessionSecret === 'string' && parsed.sessionSecret.length >= 64 &&
        typeof parsed.encryptionKey === 'string' && parsed.encryptionKey.length >= 64
      ) {
        return { sessionSecret: parsed.sessionSecret, encryptionKey: parsed.encryptionKey };
      }
    }
  } catch {
    // ignore and regenerate
  }

  const secrets = {
    sessionSecret: generateSecretHex(32),
    encryptionKey: generateSecretHex(32),
  };

  try {
    fs.mkdirSync(path.dirname(secretsPath), { recursive: true });
    fs.writeFileSync(secretsPath, JSON.stringify(secrets, null, 2));
  } catch (e) {
    console.warn('[config] Could not persist generated secrets:', (e as Error).message);
  }

  return secrets;
}

function loadModeFromConfigJson(dataDir: string): string | undefined {
  const configPath = path.resolve(process.cwd(), dataDir, 'config.json');
  try {
    if (fs.existsSync(configPath)) {
      const parsed = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      if (typeof parsed.mode === 'string') return parsed.mode;
    }
  } catch {
    // ignore
  }
  return undefined;
}

/**
 * Persists the chosen mode to data/config.json so the setup wizard selection
 * is honored on subsequent boots (env MKINDAYZIR_MODE takes precedence).
 */
export function persistMode(mode: string): void {
  const dataDir = process.env.DATA_DIR ?? './data';
  const configPath = path.resolve(process.cwd(), dataDir, 'config.json');
  try {
    fs.mkdirSync(path.dirname(configPath), { recursive: true });
    fs.writeFileSync(configPath, JSON.stringify({ mode }, null, 2));
  } catch (e) {
    console.warn('[config] Could not persist mode:', (e as Error).message);
  }
}

export function invalidateConfigCache(): void {
  cachedConfig = null;
}

let cachedConfig: Config | null = null;

export function getConfig(): Config {
  if (cachedConfig) return cachedConfig;

  const dataDir = process.env.DATA_DIR ?? './data';

  const rawSessionSecret = process.env.SESSION_SECRET ?? '';
  const rawEncryptionKey = process.env.ENCRYPTION_KEY ?? '';

  // Only trust env secrets if they meet the strength requirement. Weak or
  // placeholder values are ignored in favour of auto-generated secrets so a
  // fresh clone boots without manual secret provisioning.
  const envSessionSecret = rawSessionSecret.length >= 64 ? rawSessionSecret : '';
  const envEncryptionKey = rawEncryptionKey.length >= 64 ? rawEncryptionKey : '';

  const secrets = !envSessionSecret || !envEncryptionKey
    ? loadOrGenerateSecrets(dataDir)
    : { sessionSecret: envSessionSecret, encryptionKey: envEncryptionKey };

  const resolvedMode = process.env.MKINDAYZIR_MODE ?? loadModeFromConfigJson(dataDir) ?? 'personal';

  const raw = {
    mode: resolvedMode,
    port: process.env.PORT ?? '3000',
    databaseProvider: process.env.DATABASE_PROVIDER ?? 'sqlite',
    databaseUrl: process.env.DATABASE_URL ?? 'file:./data/mkindayzir.db',
    dataDir,
    sessionSecret: secrets.sessionSecret,
    encryptionKey: secrets.encryptionKey,
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
