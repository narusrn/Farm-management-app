import { NextResponse } from "next/server";

const NECTEC_URL = "https://www.nectec.or.th/innovation/innovation-service/digital-agri-api/rice/phenotype";
const API_KEY = "1ewhHdLWm7aTTFD5LKl5F1sIjECT91oshrOD0StnmW4=";

export async function GET() {
  try {
    const res = await fetch(NECTEC_URL, {
      headers: { accept: "application/json", apikey: API_KEY },
      next: { revalidate: 3600 },
    });

    if (!res.ok) {
      return NextResponse.json({ error: "upstream error", status: res.status }, { status: res.status });
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json({ error: "failed to fetch rice data" }, { status: 500 });
  }
}
