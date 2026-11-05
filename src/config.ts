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
  physicsTickIntervalMs: 5_000,
  sectorSize: 100_000,
  sectorGridSize: Number(process.env.SECTOR_GRID_SIZE) || 50,
  maxPlanets: Number(process.env.MAX_PLANETS) || 1200,
  corsOrigin: process.env.CORS_ORIGIN ?? "*",
  snapshotIntervalMs: Number(process.env.SNAPSHOT_INTERVAL_MS) || 60 * 1000,
  constellationCount: 12,
  gravityTetherRadius: 35_000,
  // sectorSize 이하여야 3x3x3 인접 청크 조회만으로 유효 거리 안의 행성을 빠짐없이 포함함
  gravityMaxDistance: 100_000,
  gravityPullStrength: 5_000_000_000,
  supabase: {
    url: normalizeSupabaseUrl(requiredEnv("SUPABASE_URL")),
    key:
      process.env.SUPABASE_SERVICE_ROLE_KEY ??
      requiredEnv("SUPABASE_ANON_KEY"),
  },
  jwtSecretKey: requiredEnv("JWT_SECRET_KEY"),
} as const;
