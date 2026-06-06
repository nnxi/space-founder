export interface PlanetRow {
  id: number;
  name: string;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  warp_authorized: boolean;
  home_sector_x: number;
  home_sector_y: number;
  home_sector_z: number;
  constellation_id: number;
  updated_at: string;
}

export interface PlanetInsertRow {
  id: number;
  name: string;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  warp_authorized: boolean;
  home_sector_x: number;
  home_sector_y: number;
  home_sector_z: number;
  constellation_id: number;
  updated_at?: string;
}
