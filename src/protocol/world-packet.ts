/**
 * Binary world:update packet encoder/decoder.
 *
 * Layout:
 * [Header: 8 bytes] Float64 timestamp (ms since epoch, little-endian)
 * [Body: N * 67 bytes] per planet:
 * UInt16  id
 * Float32 x, y, z
 * Float32 vx, vy, vz
 * String  name (32 bytes, utf8, null-padded)
 * UInt32  constellationId
 * UInt32  colorHex (e.g., 0x2a823e)
 * UInt8   planetType (0=rocky, 1=gaseous, 2=icy)
 */

import type { Planet } from "../types/planet";
import {
  getWorldPacketByteLength,
  WORLD_PACKET_HEADER_BYTES,
  WORLD_PACKET_PLANET_BYTES,
  WORLD_PACKET_PLANET_ID_OFFSET,
  WORLD_PACKET_POSITION_X_OFFSET,
  WORLD_PACKET_POSITION_Y_OFFSET,
  WORLD_PACKET_POSITION_Z_OFFSET,
  WORLD_PACKET_TIMESTAMP_OFFSET,
  WORLD_PACKET_VELOCITY_X_OFFSET,
  WORLD_PACKET_VELOCITY_Y_OFFSET,
  WORLD_PACKET_VELOCITY_Z_OFFSET,
  WORLD_PACKET_PLANET_NAME_OFFSET,
  WORLD_PACKET_CONSTELLATION_ID_OFFSET,
  WORLD_PACKET_COLOR_HEX_OFFSET,
  WORLD_PACKET_PLANET_TYPE_OFFSET,
} from "./constants";

export interface DecodedPlanetSnapshot {
  id: number;
  name: string;
  position: { x: number; y: number; z: number };
  velocity: { x: number; y: number; z: number };
  constellationId: number;
  planetType: "rocky" | "gaseous" | "icy";
  colorHex: string;
}

export interface DecodedWorldUpdatePacket {
  timestamp: number;
  planets: DecodedPlanetSnapshot[];
}

const MAX_NAME_BYTES = 32;

export function encodeWorldUpdatePacket(
  planets: Planet[],
  timestamp: number,
  resolveNumericId: (planetId: string) => number,
): Buffer {
  const buffer = Buffer.alloc(getWorldPacketByteLength(planets.length));

  buffer.writeDoubleLE(timestamp || 0, WORLD_PACKET_TIMESTAMP_OFFSET);

  let offset = WORLD_PACKET_HEADER_BYTES;

  for (const planet of planets) {
    const p = planet as any;
    const numericId = resolveNumericId(planet.id) || 0;
    
    buffer.writeUInt16LE(numericId, offset + WORLD_PACKET_PLANET_ID_OFFSET);
    buffer.writeFloatLE(planet.position?.x || 0, offset + WORLD_PACKET_POSITION_X_OFFSET);
    buffer.writeFloatLE(planet.position?.y || 0, offset + WORLD_PACKET_POSITION_Y_OFFSET);
    buffer.writeFloatLE(planet.position?.z || 0, offset + WORLD_PACKET_POSITION_Z_OFFSET);
    buffer.writeFloatLE(planet.velocity?.x || 0, offset + WORLD_PACKET_VELOCITY_X_OFFSET);
    buffer.writeFloatLE(planet.velocity?.y || 0, offset + WORLD_PACKET_VELOCITY_Y_OFFSET);
    buffer.writeFloatLE(planet.velocity?.z || 0, offset + WORLD_PACKET_VELOCITY_Z_OFFSET);
    
    // 행성 이름 인코딩
    const nameBuffer = Buffer.alloc(MAX_NAME_BYTES);
    const planetName = p.name || planet.id || `Planet-${numericId}`;
    nameBuffer.write(planetName, 0, MAX_NAME_BYTES, "utf8");
    nameBuffer.copy(buffer, offset + WORLD_PACKET_PLANET_NAME_OFFSET);

    // 디자인 메타데이터 바이너리 변환 및 인코딩
    const constellationId = Number(p.constellationId) || numericId;
    const colorHexInt = p.colorHex ? parseInt(p.colorHex.replace("#", ""), 16) : 0xffffff;
    
    let typeInt = 0; // 기본값: rocky
    if (p.planetType === "gaseous") typeInt = 1;
    else if (p.planetType === "icy") typeInt = 2;

    buffer.writeUInt32LE(constellationId, offset + WORLD_PACKET_CONSTELLATION_ID_OFFSET);
    buffer.writeUInt32LE(colorHexInt, offset + WORLD_PACKET_COLOR_HEX_OFFSET);
    buffer.writeUInt8(typeInt, offset + WORLD_PACKET_PLANET_TYPE_OFFSET);
    
    offset += WORLD_PACKET_PLANET_BYTES;
  }

  return buffer;
}

export function decodeWorldUpdatePacket(
  source: Buffer | ArrayBuffer | Uint8Array,
): DecodedWorldUpdatePacket {
  const buffer = toBuffer(source);
  const timestamp = buffer.readDoubleLE(WORLD_PACKET_TIMESTAMP_OFFSET);
  const planets: DecodedPlanetSnapshot[] = [];

  for (
    let offset = WORLD_PACKET_HEADER_BYTES;
    offset < buffer.length;
    offset += WORLD_PACKET_PLANET_BYTES
  ) {
    const nameBuffer = buffer.subarray(
      offset + WORLD_PACKET_PLANET_NAME_OFFSET,
      offset + WORLD_PACKET_PLANET_NAME_OFFSET + MAX_NAME_BYTES
    );
    const decodedName = nameBuffer.toString("utf8").replace(/\0/g, "");

    // 디자인 메타데이터 디코딩 및 복원
    const constellationId = buffer.readUInt32LE(offset + WORLD_PACKET_CONSTELLATION_ID_OFFSET);
    const colorHexInt = buffer.readUInt32LE(offset + WORLD_PACKET_COLOR_HEX_OFFSET);
    const typeInt = buffer.readUInt8(offset + WORLD_PACKET_PLANET_TYPE_OFFSET);

    const colorHex = "#" + colorHexInt.toString(16).padStart(6, "0");
    const planetType = typeInt === 1 ? "gaseous" : typeInt === 2 ? "icy" : "rocky";

    planets.push({
      id: buffer.readUInt16LE(offset + WORLD_PACKET_PLANET_ID_OFFSET),
      name: decodedName,
      position: {
        x: buffer.readFloatLE(offset + WORLD_PACKET_POSITION_X_OFFSET),
        y: buffer.readFloatLE(offset + WORLD_PACKET_POSITION_Y_OFFSET),
        z: buffer.readFloatLE(offset + WORLD_PACKET_POSITION_Z_OFFSET),
      },
      velocity: {
        x: buffer.readFloatLE(offset + WORLD_PACKET_VELOCITY_X_OFFSET),
        y: buffer.readFloatLE(offset + WORLD_PACKET_VELOCITY_Y_OFFSET),
        z: buffer.readFloatLE(offset + WORLD_PACKET_VELOCITY_Z_OFFSET),
      },
      constellationId,
      planetType,
      colorHex
    });
  }

  return { timestamp, planets };
}

function toBuffer(source: Buffer | ArrayBuffer | Uint8Array): Buffer {
  if (Buffer.isBuffer(source)) {
    return source;
  }
  
  if (source instanceof ArrayBuffer) {
    return Buffer.from(source);
  }
  
  return Buffer.from(source.buffer, source.byteOffset, source.byteLength);
}