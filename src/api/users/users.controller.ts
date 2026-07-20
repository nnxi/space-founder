import type { FastifyRequest, FastifyReply } from "fastify";
import { UserService, type SignupDTO, type LoginDTO } from "./users.service";

export class UserController {
  static async getMe(request: FastifyRequest, reply: FastifyReply) {
    try {
      // 미들웨어가 주입한 userId 추출
      const userId = request.userId;
      
      if (!userId) {
        return reply.status(401).send({ error: "Unauthorized" });
      }
      
      // token 대신 userId 전달
      const profile = await UserService.getMyProfile(userId);
      
      return reply.send(profile);
    } catch (error: any) {
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

  static async login(request: FastifyRequest, reply: FastifyReply) {
    try {
      const data = request.body as LoginDTO;

      if (!data.email || !data.password) {
        return reply.status(400).send({ error: "Missing email or password" });
      }

      const result = await UserService.login(data);
      
      return reply.status(200).send({ 
        success: true, 
        token: result.token,
        user: result.user
      });

    } catch (error: any) {
      // 비밀번호 불일치 또는 유저 없음
      if (error.message === "INVALID_CREDENTIALS") {
        return reply.status(401).send({ error: "Invalid email or password" });
      }
      return reply.status(500).send({ error: error.message || "Internal server error" });
    }
  }
}