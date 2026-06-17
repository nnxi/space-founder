import axios from "axios";
import { config } from "../config";
import { getConstellationId } from "../utils/constellation";
import { getSectorIndices } from "../utils/sector";
import { getSupabaseClient } from "./supabase";

const NASA_TAP_URL =
  "https://exoplanetarchive.ipac.caltech.edu/TAP/sync?query=select+pl_name,ra,dec,sy_dist,pl_rade+from+ps&format=json";

const MAX_POSITION_RADIUS = (config.sectorSize * config.sectorGridSize) / 2;
const MIN_POSITION_RADIUS = 2_000;

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

// 문자열을 결정론적 숫자로 변환하는 해시 함수
function getStringHash(str: string): number {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 33) ^ str.charCodeAt(i);
  }
  return Math.abs(hash);
}

// HSL 색상을 HEX 문자열로 변환하는 유틸리티 함수
function hslToHex(h: number, s: number, l: number): string {
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  
  const f = (t: number) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  
  const toHex = (x: number) => Math.round(x * 255).toString(16).padStart(2, '0');
  return `#${toHex(f(h + 1 / 3))}${toHex(f(h))}${toHex(f(h - 1 / 3))}`;
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

function buildPlanetRows(records: NasaExoplanetRecord[]): any[] {
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

    // 행성 이름 기반 해시 추출
    const nameHash = getStringHash(record.pl_name);

    // 좌표와 이름 해시를 믹싱하여 고유 공간 난수 생성
    const spaceDot = Math.sin(
      position.x * 12.9898 + 
      position.y * 78.233 + 
      position.z * 37.719 + 
      (nameHash * 0.01)
    );
    const pseudoRandom = Math.abs(spaceDot * 43758.5453) % 1.0;

    // 공간 난수를 활용한 행성 타입 결정
    let planetType = "rocky";
    if (record.pl_rade) {
      if (record.pl_rade < 1.7) planetType = "rocky";
      else if (record.pl_rade < 4.0) planetType = "icy";
      else planetType = "gaseous";
    } else {
      if (pseudoRandom < 0.4) {
        planetType = "rocky";
      } else if (pseudoRandom < 0.7) {
        planetType = "icy";
      } else {
        planetType = "gaseous";
      }
    }

    // 공간 난수를 기반으로 무작위 색상 산출
    const hue = (pseudoRandom * 1.618033) % 1.0; 
    const saturation = 0.45 + ((pseudoRandom * 2.3) % 0.35); 
    const lightness = 0.35 + ((pseudoRandom * 3.7) % 0.35);  
    const colorHex = hslToHex(hue, saturation, lightness);

    // 노이즈 시드 생성
    const seedId = Math.floor(pseudoRandom * 50000) + 1;

    return {
      id: index + 1,
      name: record.pl_name,
      earth_radius: record.pl_rade || null,
      x: position.x,
      y: position.y,
      z: position.z,
      vx: 0,
      vy: 0,
      vz: 0,
      warp_authorized: false,
      home_sector_x: homeSector.x,
      home_sector_y: homeSector.y,
      home_sector_z: homeSector.z,
      constellation_id: seedId, 
      planet_type: planetType,
      color_hex: colorHex,
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

  const supabase = getSupabaseClient();

  console.log("[seed:nasa] Clearing existing nasa_planets...");
  const { error: deleteError } = await supabase
    .from("nasa_planets")
    .delete()
    .neq("id", 0);

  if (deleteError) {
    throw new Error(`Failed to clear nasa_planets: ${deleteError.message}`);
  }

  console.log("[seed:nasa] Bulk upserting NASA planets...");
  const { error: insertError } = await supabase
    .from("nasa_planets")
    .upsert(rows);

  if (insertError) {
    throw new Error(`Failed to upsert nasa_planets: ${insertError.message}`);
  }

  console.log("[seed:nasa] Done.");
}

main().catch((error: unknown) => {
  console.error("[seed:nasa] Failed:", error);
  process.exitCode = 1;
});