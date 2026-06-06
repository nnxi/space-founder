import type { FastifyInstance } from "fastify";
import type { WorldEngine } from "../engine/world";
import type { WarpRequest, WorldEvent } from "../types/planet";
import { isValidSectorIndex } from "../utils/sector-geometry";

interface WarpApiBody {
  planetId: number;
}

interface WarpSocketBody {
  planetId?: unknown;
  targetSectorX?: unknown;
  targetSectorY?: unknown;
  targetSectorZ?: unknown;
}

const warpBodySchema = {
  type: "object",
  required: ["planetId"],
  properties: {
    planetId: { type: "integer", minimum: 1 },
  },
} as const;

export function registerWarpRoutes(
  app: FastifyInstance,
  world: WorldEngine,
  onWarp?: (event: WorldEvent) => void,
): void {
  app.post<{ Body: WarpApiBody }>(
    "/api/warp",
    { schema: { body: warpBodySchema } },
    async (request, reply) => {
      const { planetId } = request.body;

      try {
        const event = world.summonPlanetByNumericId(planetId);
        onWarp?.(event);

        return reply.status(200).send({
          ok: true,
          event,
        });
      } catch (error: unknown) {
        const message =
          error instanceof Error ? error.message : "Warp transaction failed";

        return reply.status(404).send({ error: message });
      }
    },
  );
}

function parseWarpRequest(body: WarpSocketBody): WarpRequest | null {
  if (typeof body.planetId !== "string") {
    return null;
  }

  if (
    !isValidSectorIndex(body.targetSectorX) ||
    !isValidSectorIndex(body.targetSectorY) ||
    !isValidSectorIndex(body.targetSectorZ)
  ) {
    return null;
  }

  return {
    planetId: body.planetId,
    targetSectorX: body.targetSectorX,
    targetSectorY: body.targetSectorY,
    targetSectorZ: body.targetSectorZ,
  };
}

function isNumericPlanetId(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 1;
}

export function parseWarpPayload(
  payload: unknown,
): WarpRequest | number | null {
  if (typeof payload !== "object" || payload === null) {
    return null;
  }

  const body = payload as WarpSocketBody;

  if (isNumericPlanetId(body.planetId)) {
    return body.planetId;
  }

  return parseWarpRequest(body);
}

export function executeWarp(
  world: WorldEngine,
  payload: unknown,
): { ok: true; event: WorldEvent } | { ok: false; error: string } {
  const parsed = parseWarpPayload(payload);

  if (parsed === null) {
    return { ok: false, error: "Invalid warp payload" };
  }

  try {
    const event =
      typeof parsed === "number"
        ? world.warpPlanetByNumericId(parsed)
        : world.warpPlanet(parsed);

    return { ok: true, event };
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Warp transaction failed";

    return { ok: false, error: message };
  }
}
