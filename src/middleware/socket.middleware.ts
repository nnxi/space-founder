import type { Socket } from "socket.io";
import * as jwt from "jsonwebtoken";
import { config } from "../config";

interface JwtPayload {
  userId: string;
  email: string;
}

export function verifySocketToken(socket: Socket, next: (err?: Error) => void) {
  try {
    // handshake.auth 또는 일반 headers에서 토큰 추출
    const authHeader = socket.handshake.auth.token || socket.handshake.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return next(new Error("Authentication error: Missing or invalid token"));
    }

    const token = authHeader.split(" ")[1];

    // 자체 JWT 복호화 검증
    const decoded = jwt.verify(token, config.jwtSecretKey!) as JwtPayload;

    // 소켓 세션 내부에 안전하게 유저 ID 바인딩
    socket.data.userId = decoded.userId;
    
    next();
  } catch (error) {
    next(new Error("Authentication error: Unauthorized or expired token"));
  }
}