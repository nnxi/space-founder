import axios from "axios";
import { config } from "../config";
import { getConstellationId } from "../utils/constellation";
import { getSectorIndices } from "../utils/sector";
import type { PlanetInsertRow } from "../types/planet-row";
import { PlanetRepository } from "./planet-repository";
import { getSupabaseClient } from "./supabase";

const NASA_TAP_URL =
  "https://exoplanetarchive.ipac.caltech.edu/TAP/sync?query=select+pl_name,ra,dec,sy_dist,pl_rade+from+ps&format=json";

const MAX_POSITION_RADIUS = (config.sectorSize * config.sectorGridSize) / 2;
const MIN_POSITION_RADIUS = 2_000;
const VELOCITY_RANGE = 10;

interface NasaExoplanetRecord {
  pl_name: string;
  ra: number | null;
  dec: number | null;
  sy_dist: number | null;
  pl_rade: number | null;
}

interface CartesianPosition {
  x: number;
  y: number;
  z: number;
}

function degreesToRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

function toCartesian(
  raDegrees: number,
  decDegrees: number,
  distanceParsecs: number,
): CartesianPosition {
  const ra = degreesToRadians(raDegrees);
  const dec = degreesToRadians(decDegrees);

  return {
    x: distanceParsecs * Math.cos(dec) * Math.cos(ra),
    y: distanceParsecs * Math.cos(dec) * Math.sin(ra),
    z: distanceParsecs * Math.sin(dec),
  };
}

function magnitude(position: CartesianPosition): number {
  return Math.hypot(position.x, position.y, position.z);
}

function scalePosition(
  position: CartesianPosition,
  scale: number,
): CartesianPosition {
  return {
    x: position.x * scale,
    y: position.y * scale,
    z: position.z * scale,
  };
}

function randomVelocityComponent(): number {
  return Math.random() * VELOCITY_RANGE * 2 - VELOCITY_RANGE;
}

function isValidRecord(
  record: NasaExoplanetRecord,
): record is NasaExoplanetRecord & {
  pl_name: string;
  ra: number;
  dec: number;
  sy_dist: number;
} {
  return (
    typeof record.pl_name === "string" &&
    record.pl_name.length > 0 &&
    typeof record.ra === "number" &&
    Number.isFinite(record.ra) &&
    typeof record.dec === "number" &&
    Number.isFinite(record.dec) &&
    typeof record.sy_dist === "number" &&
    Number.isFinite(record.sy_dist) &&
    record.sy_dist > 0
  );
}

function dedupeByNearestDistance(
  records: NasaExoplanetRecord[],
): Array<NasaExoplanetRecord & { ra: number; dec: number; sy_dist: number }> {
  const byName = new Map<
    string,
    NasaExoplanetRecord & { ra: number; dec: number; sy_dist: number }
  >();

  for (const record of records) {
    if (!isValidRecord(record)) {
      continue;
    }

    const existing = byName.get(record.pl_name);
    if (!existing || record.sy_dist < existing.sy_dist) {
      byName.set(record.pl_name, record);
    }
  }

  return [...byName.values()].sort((a, b) => a.sy_dist - b.sy_dist);
}

function buildPlanetRows(records: NasaExoplanetRecord[]): PlanetInsertRow[] {
  const uniqueRecords = dedupeByNearestDistance(records).slice(0, config.maxPlanets);

  if (uniqueRecords.length === 0) {
    throw new Error("No valid NASA exoplanet records found after filtering.");
  }

  const rawPositions = uniqueRecords.map((record) =>
    toCartesian(record.ra, record.dec, record.sy_dist),
  );

  const maxMagnitude = Math.max(...rawPositions.map(magnitude));
  const scale = MAX_POSITION_RADIUS / maxMagnitude;
  const updatedAt = new Date().toISOString();

  return uniqueRecords.map((record, index) => {
    const scaled = scalePosition(rawPositions[index], scale);
    const radius = magnitude(scaled);
    const normalized =
      radius < MIN_POSITION_RADIUS
        ? scalePosition(scaled, MIN_POSITION_RADIUS / radius)
        : scaled;

    const position = {
      x: normalized.x,
      y: normalized.y,
      z: normalized.z,
    };
    const homeSector = getSectorIndices(position);

    return {
      id: index + 1,
      name: record.pl_name,
      x: position.x,
      y: position.y,
      z: position.z,
      vx: randomVelocityComponent(),
      vy: randomVelocityComponent(),
      vz: randomVelocityComponent(),
      warp_authorized: false,
      home_sector_x: homeSector.x,
      home_sector_y: homeSector.y,
      home_sector_z: homeSector.z,
      constellation_id: getConstellationId(homeSector),
      updated_at: updatedAt,
    };
  });
}

async function fetchNasaExoplanets(): Promise<NasaExoplanetRecord[]> {
  const response = await axios.get<NasaExoplanetRecord[]>(NASA_TAP_URL, {
    timeout: 120_000,
    headers: {
      Accept: "application/json",
    },
  });

  if (!Array.isArray(response.data)) {
    throw new Error("Unexpected NASA TAP response: expected a JSON array.");
  }

  return response.data;
}

async function main(): Promise<void> {
  console.log("[seed:nasa] Fetching exoplanet data from NASA Exoplanet Archive...");
  const records = await fetchNasaExoplanets();
  console.log(`[seed:nasa] Received ${records.length} raw records.`);

  const rows = buildPlanetRows(records);
  console.log(
    `[seed:nasa] Prepared ${rows.length} planets (scaled within ${MAX_POSITION_RADIUS.toFixed(0)} unit tether).`,
  );

  const repository = new PlanetRepository(getSupabaseClient());

  console.log("[seed:nasa] Clearing existing planets...");
  await repository.clearAll();

  console.log("[seed:nasa] Bulk upserting NASA planets...");
  await repository.bulkUpsert(rows);

  console.log("[seed:nasa] Done.");
}

main().catch((error: unknown) => {
  console.error("[seed:nasa] Failed:", error);
  process.exitCode = 1;
});
