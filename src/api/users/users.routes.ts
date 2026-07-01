import type { FastifyInstance } from "fastify";
import { UserController } from "./users.controller";

export function registerUserRoutes(app: FastifyInstance): void {
  app.get("/api/users/me", UserController.getMe);
  app.post("/api/users/signup", UserController.signup);
}