/**
 * Binary world:update packet encoder/decoder.
 *
 * Layout:
 * [Header: 8 bytes] Float64 timestamp (ms since epoch, little-endian)
 * [Body: N * 58 bytes] per planet:
 * UInt16  id
 * Float32 x, y, z
 * Float32 vx, vy, vz
 * String  name (32 bytes, utf8, null-padded)
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
} from "./constants";

export interface DecodedPlanetSnapshot {
  id: number;
  name: string;
  position: { x: number; y: number; z: number };
  velocity: { x: number; y: number; z: number };
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
    const numericId = resolveNumericId(planet.id) || 0;
    
    buffer.writeUInt16LE(numericId, offset + WORLD_PACKET_PLANET_ID_OFFSET);
    buffer.writeFloatLE(planet.position?.x || 0, offset + WORLD_PACKET_POSITION_X_OFFSET);
    buffer.writeFloatLE(planet.position?.y || 0, offset + WORLD_PACKET_POSITION_Y_OFFSET);
    buffer.writeFloatLE(planet.position?.z || 0, offset + WORLD_PACKET_POSITION_Z_OFFSET);
    buffer.writeFloatLE(planet.velocity?.x || 0, offset + WORLD_PACKET_VELOCITY_X_OFFSET);
    buffer.writeFloatLE(planet.velocity?.y || 0, offset + WORLD_PACKET_VELOCITY_Y_OFFSET);
    buffer.writeFloatLE(planet.velocity?.z || 0, offset + WORLD_PACKET_VELOCITY_Z_OFFSET);
    
    // 행성 이름을 바이너리로 인코딩하여 추가
    const nameBuffer = Buffer.alloc(MAX_NAME_BYTES);
    const planetName = (planet as any).name || planet.id || `Planet-${numericId}`;
    
    nameBuffer.write(planetName, 0, MAX_NAME_BYTES, "utf8");
    nameBuffer.copy(buffer, offset + WORLD_PACKET_PLANET_NAME_OFFSET);
    
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
    // 32바이트 크기의 문자열 버퍼를 추출하고 널 바이트를 제거
    const nameBuffer = buffer.subarray(
      offset + WORLD_PACKET_PLANET_NAME_OFFSET,
      offset + WORLD_PACKET_PLANET_NAME_OFFSET + MAX_NAME_BYTES
    );
    const decodedName = nameBuffer.toString("utf8").replace(/\0/g, "");

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