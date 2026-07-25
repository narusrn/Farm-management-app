import { NextRequest, NextResponse } from "next/server";

const BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ userId: string; farmId: string }> }
) {
  const { userId, farmId } = await params;
  try {
    const body = await req.json();
    const res = await fetch(`${BASE_URL}/farm/${userId}/${farmId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", accept: "application/json" },
      body: JSON.stringify(body),
    });
    if (!(res.headers.get("content-type") ?? "").includes("application/json")) {
      return NextResponse.json({ error: "upstream rejected the request" }, { status: 502 });
    }
    const data = await res.json().catch(() => null);
    if (!res.ok || data?.success === false) {
      return NextResponse.json(data ?? { error: "update farm failed" }, { status: res.ok ? 502 : res.status });
    }
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json({ error: "failed to update farm" }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ userId: string; farmId: string }> }
) {
  const { userId, farmId } = await params;
  try {
    const res = await fetch(`${BASE_URL}/farm/${userId}/${farmId}`, {
      method: "DELETE",
      headers: { accept: "application/json" },
    });
    if (!(res.headers.get("content-type") ?? "").includes("application/json")) {
      return NextResponse.json({ error: "upstream rejected the request" }, { status: 502 });
    }
    const data = await res.json().catch(() => null);
    if (!res.ok || data?.success === false) {
      return NextResponse.json(data ?? { error: "delete farm failed" }, { status: res.ok ? 502 : res.status });
    }
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json({ error: "failed to delete farm" }, { status: 500 });
  }
}
