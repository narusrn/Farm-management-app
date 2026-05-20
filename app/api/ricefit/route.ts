import { NextRequest, NextResponse } from "next/server";

const BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "";
const API_KEY  = process.env.NECTEC_API_KEY ?? "";

const VALID_FACTORS = [
  "ดินเปรี้ยว", "ดินเค็ม", "แล้ง", "น้ำท่วมฉับพลัน",
  "โรคขอบใบแห้ง", "โรคใบไหม้", "ระยะข้าว", "อุณหภูมิสูง", "อุณหภูมิต่ำ",
] as const;

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;

  const lat          = searchParams.get("lat");
  const lon          = searchParams.get("lon");
  const rice_variety = searchParams.get("rice_variety");
  const sensitivity  = searchParams.get("sensitivity");
  const month        = searchParams.get("month");
  const start_date   = searchParams.get("start_date");

  if (!lat || !lon || !rice_variety || !sensitivity || !month || !start_date) {
    return NextResponse.json({ error: "missing required params" }, { status: 400 });
  }

  const upstream = new URL(`${BASE_URL}/ricefit`);
  VALID_FACTORS.forEach((f) => upstream.searchParams.append("factors", f));
  upstream.searchParams.set("lat", lat);
  upstream.searchParams.set("lon", lon);
  upstream.searchParams.set("rice_variety", rice_variety);
  upstream.searchParams.set("sensitivity", sensitivity);
  upstream.searchParams.set("month", month);
  upstream.searchParams.set("start_date", start_date);

  try {
    const res = await fetch(upstream.toString(), {
      headers: { accept: "application/json", apikey: API_KEY },
    });
    const data = await res.json().catch(() => ({}));
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json({ error: "failed to fetch ricefit" }, { status: 500 });
  }
}
