export const WORLD_PACKET_HEADER_BYTES = 8;
// id(4) + chunk(12) + localPos(12) + vel(12) = 40 bytes
export const WORLD_PACKET_PLANET_BYTES = 40; 

export const WORLD_PACKET_TIMESTAMP_OFFSET = 0;

export const WORLD_PACKET_PLANET_ID_OFFSET = 0;
// id가 4바이트(Int32)가 되면서 이후 오프셋들이 2바이트씩 뒤로 밀립니다.
export const WORLD_PACKET_CHUNK_X_OFFSET = 4;
export const WORLD_PACKET_CHUNK_Y_OFFSET = 8;
export const WORLD_PACKET_CHUNK_Z_OFFSET = 12;
export const WORLD_PACKET_POSITION_X_OFFSET = 16;
export const WORLD_PACKET_POSITION_Y_OFFSET = 20;
export const WORLD_PACKET_POSITION_Z_OFFSET = 24;
export const WORLD_PACKET_VELOCITY_X_OFFSET = 28;
export const WORLD_PACKET_VELOCITY_Y_OFFSET = 32;
export const WORLD_PACKET_VELOCITY_Z_OFFSET = 36;

export function getWorldPacketByteLength(planetCount: number): number {
  return WORLD_PACKET_HEADER_BYTES + planetCount * WORLD_PACKET_PLANET_BYTES;
}