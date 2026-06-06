import { config } from "../config";
import type { PlanetRepository } from "./planet-repository";
import type { WorldEngine } from "../engine/world";

export class SnapshotScheduler {
  private timer: ReturnType<typeof setInterval> | null = null;
  private inFlight = false;

  constructor(
    private readonly repository: PlanetRepository,
    private readonly world: WorldEngine,
  ) {}

  start(): void {
    if (this.timer) return;

    this.timer = setInterval(() => {
      this.enqueueSnapshot();
    }, config.snapshotIntervalMs);
  }

  stop(): void {
    if (!this.timer) return;

    clearInterval(this.timer);
    this.timer = null;
  }

  private enqueueSnapshot(): void {
    if (this.inFlight) {
      return;
    }

    this.inFlight = true;

    void this.repository
      .saveSnapshot(
        this.world.getPlanets(),
        (planetId) => this.world.getNumericPlanetId(planetId),
      )
      .catch((error: unknown) => {
        console.error("[SnapshotScheduler] Snapshot write failed:", error);
      })
      .finally(() => {
        this.inFlight = false;
      });
  }
}
