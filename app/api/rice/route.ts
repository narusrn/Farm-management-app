import { NextResponse } from "next/server";

const NECTEC_URL = `${process.env.NEXT_PUBLIC_API_BASE_URL}/rice/phenotype`;
const API_KEY = process.env.NECTEC_API_KEY ?? "";

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
