import type { Planet } from "../types/planet";
import {
  getWorldPacketByteLength,
  WORLD_PACKET_HEADER_BYTES,
  WORLD_PACKET_PLANET_BYTES,
  WORLD_PACKET_PLANET_ID_OFFSET,
  WORLD_PACKET_CHUNK_X_OFFSET,
  WORLD_PACKET_CHUNK_Y_OFFSET,
  WORLD_PACKET_CHUNK_Z_OFFSET,
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
  chunkIndex: { x: number; y: number; z: number };
  localPosition: { x: number; y: number; z: number };
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

  buffer.writeDoubleLE(timestamp || 0, WORLD_PACKET_TIMESTAMP_OFFSET);

  let offset = WORLD_PACKET_HEADER_BYTES;

  for (const planet of planets) {
    const numericId = resolveNumericId(planet.id) || 0;
    
    // 16비트 부호 없는 정수
    buffer.writeUInt16LE(numericId, offset + WORLD_PACKET_PLANET_ID_OFFSET);
    
    // 청크 인덱스: 32비트 부호 있는 정수
    buffer.writeInt32LE(planet.chunkIndex?.x || 0, offset + WORLD_PACKET_CHUNK_X_OFFSET);
    buffer.writeInt32LE(planet.chunkIndex?.y || 0, offset + WORLD_PACKET_CHUNK_Y_OFFSET);
    buffer.writeInt32LE(planet.chunkIndex?.z || 0, offset + WORLD_PACKET_CHUNK_Z_OFFSET);

    // 로컬 좌표: 32비트 실수
    buffer.writeFloatLE(planet.localPosition?.x || 0, offset + WORLD_PACKET_POSITION_X_OFFSET);
    buffer.writeFloatLE(planet.localPosition?.y || 0, offset + WORLD_PACKET_POSITION_Y_OFFSET);
    buffer.writeFloatLE(planet.localPosition?.z || 0, offset + WORLD_PACKET_POSITION_Z_OFFSET);
    
    // 속도 벡터: 32비트 실수
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

  for (
    let offset = WORLD_PACKET_HEADER_BYTES;
    offset < buffer.length;
    offset += WORLD_PACKET_PLANET_BYTES
  ) {
    planets.push({
      id: buffer.readUInt16LE(offset + WORLD_PACKET_PLANET_ID_OFFSET),
      chunkIndex: {
        x: buffer.readInt32LE(offset + WORLD_PACKET_CHUNK_X_OFFSET),
        y: buffer.readInt32LE(offset + WORLD_PACKET_CHUNK_Y_OFFSET),
        z: buffer.readInt32LE(offset + WORLD_PACKET_CHUNK_Z_OFFSET),
      },
      localPosition: {
        x: buffer.readFloatLE(offset + WORLD_PACKET_POSITION_X_OFFSET),
        y: buffer.readFloatLE(offset + WORLD_PACKET_POSITION_Y_OFFSET),
        z: buffer.readFloatLE(offset + WORLD_PACKET_POSITION_Z_OFFSET),
      },
      velocity: {
        x: buffer.readFloatLE(offset + WORLD_PACKET_VELOCITY_X_OFFSET),
        y: buffer.readFloatLE(offset + WORLD_PACKET_VELOCITY_Y_OFFSET),
        z: buffer.readFloatLE(offset + WORLD_PACKET_VELOCITY_Z_OFFSET),
      }
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