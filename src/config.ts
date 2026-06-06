import "dotenv/config";

function requiredEnv(name: string): string {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

function normalizeSupabaseUrl(url: string): string {
  return url.replace(/\/rest\/v1\/?$/, "").replace(/\/$/, "");
}

export const config = {
  port: Number(process.env.PORT) || 3000,
  host: process.env.HOST ?? "0.0.0.0",
  physicsTickIntervalMs: 10_000,
  sectorSize: 100_000,
  corsOrigin: process.env.CORS_ORIGIN ?? "*",
  snapshotIntervalMs: Number(process.env.SNAPSHOT_INTERVAL_MS) || 5 * 60 * 1000,
  constellationCount: 12,
  gravityTetherRadius: 35_000,
  gravityMaxDistance: 45_000,
  gravityPullStrength: 2.5,
  blackHoleShellDepth: 5_000,
  warpBurstVelocity: 120,
  supabase: {
    url: normalizeSupabaseUrl(requiredEnv("SUPABASE_URL")),
    key:
      process.env.SUPABASE_SERVICE_ROLE_KEY ??
      requiredEnv("SUPABASE_ANON_KEY"),
  },
} as const;
