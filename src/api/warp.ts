import type { FastifyInstance } from "fastify";
import type { WorldEngine } from "../engine/world";
import type { WarpRequest, WorldEvent } from "../types/planet";
import { isValidSectorIndex } from "../utils/sector-geometry";

interface WarpBody {
  planetId?: unknown;
  targetSectorX?: unknown;
  targetSectorY?: unknown;
  targetSectorZ?: unknown;
}

export function registerWarpRoutes(
  app: FastifyInstance,
  world: WorldEngine,
  onWarp?: (event: WorldEvent) => void,
): void {
  app.post<{ Body: WarpBody }>("/api/warp", async (request, reply) => {
    const warpRequest = parseWarpRequest(request.body);

    if (!warpRequest) {
      return reply.status(400).send({
        error: "Invalid warp payload",
      });
    }

    try {
      const event = world.warpPlanet(warpRequest);
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
  });
}

function parseWarpRequest(body: WarpBody): WarpRequest | null {
  if (
    typeof body.planetId !== "string" ||
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

export function parseWarpPayload(payload: unknown): WarpRequest | null {
  if (typeof payload !== "object" || payload === null) {
    return null;
  }

  return parseWarpRequest(payload as WarpBody);
}
