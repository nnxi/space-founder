export interface PlanetRow {
  id: number;
  name: string;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  constellation_id: number;
  planet_type: string;
  color_hex: string;
  updated_at: string;
  role: string;
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
  constellation_id: number;
  planet_type: string;
  color_hex: string;
  updated_at?: string;
  role: string;
}