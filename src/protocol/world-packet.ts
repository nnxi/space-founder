/**
 * Binary world:update packet encoder.
 *
 * Layout:
 *   [Header: 8 bytes] Float64 timestamp (ms since epoch, little-endian)
 *   [Body: N × 26 bytes] per planet:
 *     UInt16  id
 *     Float32 x, y, z
 *     Float32 vx, vy, vz
 *
 * Client decode example (browser):
 *
 * ```js
 * const HEADER_BYTES = 8;
 * const PLANET_BYTES = 26;
 *
 * function decodeWorldUpdatePacket(arrayBuffer) {
 *   const view = new DataView(arrayBuffer);
 *   const timestamp = view.getFloat64(0, true);
 *   const planets = [];
 *
 *   for (let offset = HEADER_BYTES; offset < arrayBuffer.byteLength; offset += PLANET_BYTES) {
 *     planets.push({
 *       id: view.getUint16(offset, true),
 *       position: {
 *         x: view.getFloat32(offset + 2, true),
 *         y: view.getFloat32(offset + 6, true),
 *         z: view.getFloat32(offset + 10, true),
 *       },
 *       velocity: {
 *         x: view.getFloat32(offset + 14, true),
 *         y: view.getFloat32(offset + 18, true),
 *         z: view.getFloat32(offset + 22, true),
 *       },
 *     });
 *   }
 *
 *   return { timestamp, planets };
 * }
 *
 * socket.on("world:update", (payload) => {
 *   const buffer = payload instanceof ArrayBuffer
 *     ? payload
 *     : payload.buffer.slice(payload.byteOffset, payload.byteOffset + payload.byteLength);
 *   const { timestamp, planets } = decodeWorldUpdatePacket(buffer);
 * });
 * ```
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

  buffer.writeDoubleLE(timestamp, WORLD_PACKET_TIMESTAMP_OFFSET);

  let offset = WORLD_PACKET_HEADER_BYTES;

  for (const planet of planets) {
    buffer.writeUInt16LE(resolveNumericId(planet.id), offset + WORLD_PACKET_PLANET_ID_OFFSET);
    buffer.writeFloatLE(planet.position.x, offset + WORLD_PACKET_POSITION_X_OFFSET);
    buffer.writeFloatLE(planet.position.y, offset + WORLD_PACKET_POSITION_Y_OFFSET);
    buffer.writeFloatLE(planet.position.z, offset + WORLD_PACKET_POSITION_Z_OFFSET);
    buffer.writeFloatLE(planet.velocity.x, offset + WORLD_PACKET_VELOCITY_X_OFFSET);
    buffer.writeFloatLE(planet.velocity.y, offset + WORLD_PACKET_VELOCITY_Y_OFFSET);
    buffer.writeFloatLE(planet.velocity.z, offset + WORLD_PACKET_VELOCITY_Z_OFFSET);
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
