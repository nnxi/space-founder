import type { FastifyInstance } from "fastify";
import { UserController } from "./users.controller";
import { verifyHttpToken } from "../../middleware/auth.middleware";

export function registerUserRoutes(app: FastifyInstance): void {
  app.get("/api/users/me", { preHandler: [verifyHttpToken] }, UserController.getMe);
  
  app.post("/api/users/signup", UserController.signup);
  app.post("/api/users/login", UserController.login);
}