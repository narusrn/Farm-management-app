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
    const data = await res.json().catch(() => ({}));
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
    const data = await res.json().catch(() => ({}));
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json({ error: "failed to delete farm" }, { status: 500 });
  }
}
