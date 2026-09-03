import { getSupabaseClient } from "../../db/supabase";
import * as bcrypt from "bcrypt";
import { randomUUID } from "crypto";
import * as jwt from "jsonwebtoken";
import { config } from "../../config"; 

export interface SignupDTO {
  email: string;
  password: string;
  username: string;
}

export interface LoginDTO {
  email: string;
  password: string;
}

export class UserService {
  
  // token 대신 userId를 직접 주입받습니다.
  static async getMyProfile(userId: string) {
    const supabase = getSupabaseClient();
    
    // 미들웨어에서 이미 검증했으므로, Supabase Auth 호출 로직 완전 삭제
    const { data: profile, error: dbError } = await supabase
      .from("profiles")
      .select("id, email, username, has_planet, satellite_count")
      .eq("id", userId)
      .maybeSingle();

    if (dbError) throw new Error(dbError.message);
    if (!profile) throw new Error("NOT_FOUND");

    return {
      id: profile.id,
      email: profile.email,
      username: profile.username,
      hasPlanet: profile.has_planet,
      satelliteCount: profile.satellite_count || 0
    };
  }

  static async signup(data: SignupDTO) {
    const supabase = getSupabaseClient();
    
    // Check for existing email and username concurrently
    const [emailCheck, usernameCheck] = await Promise.all([
      supabase.from("profiles").select("id").eq("email", data.email).maybeSingle(),
      supabase.from("profiles").select("id").eq("username", data.username).maybeSingle()
    ]);

    if (emailCheck.error) {
      throw new Error(`Email validation failed: ${emailCheck.error.message}`);
    }
    if (usernameCheck.error) {
      throw new Error(`Username validation failed: ${usernameCheck.error.message}`);
    }

    if (emailCheck.data) {
      throw new Error("Email is already in use. Please use a different email.");
    }
    if (usernameCheck.data) {
      throw new Error("Username is already taken. Please choose another username.");
    }

    const saltRounds = 10;
    const hashedPw = await bcrypt.hash(data.password, saltRounds);
    
    const newUserId = randomUUID();

    const { data: newUser, error: dbError } = await supabase
      .from("profiles")
      .insert({
        id: newUserId,
        email: data.email,
        username: data.username,
        hashed_pw: hashedPw,
        has_planet: false,
        satellite_count: 0
      })
      .select("id, email, username")
      .single();

    if (dbError) {
      throw new Error(`Database failed: ${dbError.message}`);
    }

    return newUser;
  }

  static async login(data: LoginDTO) {
    const supabase = getSupabaseClient();

    // 1. 유저 이메일로 정보 조회
    const { data: profile, error: dbError } = await supabase
      .from("profiles")
      .select("id, email, username, hashed_pw, last_login")
      .eq("email", data.email)
      .maybeSingle();

    if (dbError) throw new Error(dbError.message);
    if (!profile || !profile.hashed_pw) throw new Error("INVALID_CREDENTIALS");

    // 2. 비밀번호 검증
    const isValidPassword = await bcrypt.compare(data.password, profile.hashed_pw);
    if (!isValidPassword) throw new Error("INVALID_CREDENTIALS");

    // 3. 마지막 로그인 날짜 갱신 (스트릭 체크용)
    const today = new Date().toISOString().split("T")[0];

    const { error: updateError } = await supabase
      .from("profiles")
      .update({ last_login: today })
      .eq("id", profile.id);

    if (updateError) throw new Error(`Failed to update login date: ${updateError.message}`);

    // 4. 자체 JWT 토큰 발급
    const payload = { userId: profile.id, email: profile.email };
    const token = jwt.sign(payload, config.jwtSecretKey!, { expiresIn: "24h" });

    // 5. 토큰 및 유저 정보 반환
    return {
      token,
      user: {
        id: profile.id,
        email: profile.email,
        username: profile.username,
        lastLogin: today
      }
    };
  }
}