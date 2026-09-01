import type { FastifyRequest, FastifyReply } from "fastify";
import * as jwt from "jsonwebtoken";
import { config } from "../config";

// FastifyRequest에 userId 속성을 추가하기 위한 타입 확장
declare module "fastify" {
  interface FastifyRequest {
    userId?: string;
  }
}

interface JwtPayload {
  userId: string;
  email: string;
}

export async function verifyHttpToken(
  request: FastifyRequest,
  reply: FastifyReply
) {
  try {
    const authHeader = request.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return reply.status(401).send({ error: "Missing or invalid token" });
    }

    const token = authHeader.split(" ")[1];

    // 자체 JWT 검증 로직
    const decoded = jwt.verify(token, config.jwtSecretKey!) as JwtPayload;

    // 검증된 유저 ID를 request 객체에 주입
    request.userId = decoded.userId;
    
  } catch (error) {
    // 토큰이 만료되었거나 변조된 경우 차단
    return reply.status(401).send({ error: "Unauthorized or expired token" });
  }
}