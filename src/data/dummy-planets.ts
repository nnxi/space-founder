import { getConstellationId } from "../utils/constellation";
import { getSectorIndices } from "../utils/sector";
import type { Planet } from "../types/planet";

export const DUMMY_PLANET_TEMPLATES: Array<{
  position: Planet["position"];
  velocity: Planet["velocity"];
}> = [
  {
    position: { x: 1200, y: 300, z: -450 },
    velocity: { x: 0.8, y: 0.15, z: -0.3 },
  },
  {
    position: { x: -980, y: 720, z: 1100 },
    velocity: { x: -0.4, y: -0.2, z: 0.6 },
  },
  {
    position: { x: 2500, y: -600, z: 800 },
    velocity: { x: -0.6, y: 0.25, z: -0.1 },
  },
  {
    position: { x: -1500, y: -900, z: -200 },
    velocity: { x: 0.3, y: 0.5, z: 0.4 },
  },
  {
    position: { x: 600, y: 1800, z: 300 },
    velocity: { x: -0.2, y: -0.35, z: 0.55 },
  },
  {
    position: { x: -2200, y: 400, z: -1600 },
    velocity: { x: 0.45, y: -0.1, z: 0.2 },
  },
  {
    position: { x: 800, y: -1200, z: 950 },
    velocity: { x: 0.1, y: 0.4, z: -0.5 },
  },
  {
    position: { x: -400, y: 500, z: 2200 },
    velocity: { x: -0.55, y: 0.05, z: -0.25 },
  },
];

export function buildDummyPlanetRows() {
  return DUMMY_PLANET_TEMPLATES.map((planet, index) => {
    const homeSector = getSectorIndices(planet.position);

    return {
      id: index + 1,
      name: `planet-${index + 1}`,
      x: planet.position.x,
      y: planet.position.y,
      z: planet.position.z,
      vx: planet.velocity.x,
      vy: planet.velocity.y,
      vz: planet.velocity.z,
      warp_authorized: false,
      home_sector_x: homeSector.x,
      home_sector_y: homeSector.y,
      home_sector_z: homeSector.z,
      constellation_id: getConstellationId(homeSector),
    };
  });
}

export function buildDummyPlanets(): Planet[] {
  return DUMMY_PLANET_TEMPLATES.map((template, index) => {
    const id = `planet-${index + 1}`;
    const homeSector = getSectorIndices(template.position);

    return {
      id,
      position: { ...template.position },
      velocity: { ...template.velocity },
      warpAuthorized: false,
      homeSector,
      constellationId: getConstellationId(homeSector),
    };
  });
}
