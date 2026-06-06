/**
 * Binary world:update packet encoder.
 *
 * Layout:
 * [Header: 8 bytes] Float64 timestamp (ms since epoch, little-endian)
 * [Body: N * 26 bytes] per planet:
 * UInt16  id
 * Float32 x, y, z
 * Float32 vx, vy, vz
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
} from "./constants";

export interface DecodedPlanetSnapshot {
  id: number;
  position: { x: number; y: number; z: number };
  velocity: { x: number; y: number; z: number };
}

export interface DecodedWorldUpdatePacket {
  timestamp: number;
  planets: DecodedPlanetSnapshot[];
}

export function encodeWorldUpdatePacket(
  planets: Planet[],
  timestamp: number,
  resolveNumericId: (planetId: string) => number,
): Buffer {
  const buffer = Buffer.alloc(getWorldPacketByteLength(planets.length));

  // 타임스탬프 누락 시 기본값 할당
  buffer.writeDoubleLE(timestamp || 0, WORLD_PACKET_TIMESTAMP_OFFSET);

  let offset = WORLD_PACKET_HEADER_BYTES;

  for (const planet of planets) {
    // 숫자 변환 실패 및 좌표값 누락 시 0으로 폴백 처리하여 서버 크래시 방지
    const numericId = resolveNumericId(planet.id) || 0;
    
    buffer.writeUInt16LE(numericId, offset + WORLD_PACKET_PLANET_ID_OFFSET);
    buffer.writeFloatLE(planet.position?.x || 0, offset + WORLD_PACKET_POSITION_X_OFFSET);
    buffer.writeFloatLE(planet.position?.y || 0, offset + WORLD_PACKET_POSITION_Y_OFFSET);
    buffer.writeFloatLE(planet.position?.z || 0, offset + WORLD_PACKET_POSITION_Z_OFFSET);
    buffer.writeFloatLE(planet.velocity?.x || 0, offset + WORLD_PACKET_VELOCITY_X_OFFSET);
    buffer.writeFloatLE(planet.velocity?.y || 0, offset + WORLD_PACKET_VELOCITY_Y_OFFSET);
    buffer.writeFloatLE(planet.velocity?.z || 0, offset + WORLD_PACKET_VELOCITY_Z_OFFSET);
    
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

  // 정의된 바이트 규격에 맞춰 버퍼에서 행성 데이터를 추출
  for (
    let offset = WORLD_PACKET_HEADER_BYTES;
    offset < buffer.length;
    offset += WORLD_PACKET_PLANET_BYTES
  ) {
    planets.push({
      id: buffer.readUInt16LE(offset + WORLD_PACKET_PLANET_ID_OFFSET),
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