export const WORLD_PACKET_HEADER_BYTES = 8;
// id(2) + chunk(12) + localPos(12) + vel(12) = 38 bytes
export const WORLD_PACKET_PLANET_BYTES = 38; 

export const WORLD_PACKET_TIMESTAMP_OFFSET = 0;

export const WORLD_PACKET_PLANET_ID_OFFSET = 0;
export const WORLD_PACKET_CHUNK_X_OFFSET = 2;
export const WORLD_PACKET_CHUNK_Y_OFFSET = 6;
export const WORLD_PACKET_CHUNK_Z_OFFSET = 10;
export const WORLD_PACKET_POSITION_X_OFFSET = 14;
export const WORLD_PACKET_POSITION_Y_OFFSET = 18;
export const WORLD_PACKET_POSITION_Z_OFFSET = 22;
export const WORLD_PACKET_VELOCITY_X_OFFSET = 26;
export const WORLD_PACKET_VELOCITY_Y_OFFSET = 30;
export const WORLD_PACKET_VELOCITY_Z_OFFSET = 34;

export function getWorldPacketByteLength(planetCount: number): number {
  return WORLD_PACKET_HEADER_BYTES + planetCount * WORLD_PACKET_PLANET_BYTES;
}