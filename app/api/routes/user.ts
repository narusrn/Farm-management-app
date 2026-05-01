const BASE_URL = "https://www.nectec.or.th/innovation/innovation-service/digital-agri-api";

export interface UserProfile {
  displayName: string;
  userId: string;
}

// GET /user/:lineUserId
export const getUser = async (lineUserId: string): Promise<UserProfile> => {
  // ── REPLACE THIS BLOCK when API is ready ──────────────────────────────────
  // const res = await fetch(`${BASE_URL}/user/${lineUserId}`);
  // if (!res.ok) throw new Error("fetch user failed");
  // return res.json();
  // ─────────────────────────────────────────────────────────────────────────
  await new Promise((r) => setTimeout(r, 100));
  return { displayName: "ผู้ใช้ทดสอบ", userId: lineUserId };
};
