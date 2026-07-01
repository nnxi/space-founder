import type { FastifyRequest, FastifyReply } from "fastify";
import { UserService, type SignupDTO } from "./users.service";

export class UserController {
  static async getMe(request: FastifyRequest, reply: FastifyReply) {
    // 기존 getMe 로직 유지
    try {
      const authHeader = request.headers.authorization;
      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return reply.status(401).send({ error: "Missing or invalid token" });
      }
      
      const token = authHeader.split(" ")[1];
      const profile = await UserService.getMyProfile(token);
      
      return reply.send(profile);
    } catch (error: any) {
      if (error.message === "UNAUTHORIZED") {
        return reply.status(401).send({ error: "Unauthorized token" });
      }
      if (error.message === "NOT_FOUND") {
        return reply.status(404).send({ error: "User profile not found" });
      }
      return reply.status(500).send({ error: error.message || "Internal server error" });
    }
  }

  static async signup(request: FastifyRequest, reply: FastifyReply) {
    try {
      const data = request.body as SignupDTO;
      
      if (!data.email || !data.password || !data.username) {
        return reply.status(400).send({ error: "Missing required fields" });
      }

      const newUser = await UserService.signup(data);
      return reply.status(201).send({ success: true, user: newUser });
      
    } catch (error: any) {
      // 중복 이메일 등 DB 제약조건 위반 시 처리
      if (error.message.includes("duplicate key")) {
        return reply.status(409).send({ error: "Email already exists" });
      }
      return reply.status(500).send({ error: error.message || "Internal server error" });
    }
  }
}