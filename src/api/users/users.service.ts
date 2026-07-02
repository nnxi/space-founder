import { getSupabaseClient } from "../../db/supabase";
import * as bcrypt from "bcrypt";
import { randomUUID } from "crypto";

export interface SignupDTO {
  email: string;
  password: string;
  username: string;
}

export class UserService {
  // 기존 getMe 로직 유지하기
  static async getMyProfile(token: string) {
    const supabase = getSupabaseClient();
    
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      throw new Error("UNAUTHORIZED");
    }

    const { data: profile, error: dbError } = await supabase
      .from("profiles")
      .select("id, email, username, has_planet, satellite_count")
      .eq("id", user.id)
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
    
    // Bcrypt 해싱 (Salt Rounds: 10)
    const saltRounds = 10;
    const hashedPw = await bcrypt.hash(data.password, saltRounds);
    
    // 고유 식별자 생성
    const newUserId = randomUUID();

    // profiles 테이블에 직접 Insert
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
      throw new Error(dbError.message);
    }

    return newUser;
  }
}