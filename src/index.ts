import { PlanetRepository } from "./db/planet-repository";
import { SnapshotScheduler } from "./db/snapshot-scheduler";
import { getSupabaseClient } from "./db/supabase";
import { WorldEngine } from "./engine/world";
import { createServer } from "./server";

async function main(): Promise<void> {
  const world = new WorldEngine();
  const planetRepository = new PlanetRepository(getSupabaseClient());

  await planetRepository.bootstrapWorld(world);
  world.setPersistenceAdapter(planetRepository);

  const snapshotScheduler = new SnapshotScheduler(planetRepository, world);
  snapshotScheduler.start();

  const { app, io } = await createServer(world);

  const shutdown = async (signal: string): Promise<void> => {
    app.log.info(`Received ${signal}, shutting down`);
    snapshotScheduler.stop();
    world.stop();
    io.close();
    await app.close();
    process.exit(0);
  };

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

main().catch((error: unknown) => {
  console.error("Fatal error during startup:", error);
  process.exit(1);
});
