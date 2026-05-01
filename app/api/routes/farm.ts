const BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "";
const STORAGE_KEY = "ricefit_farms";

export interface Farm {
  id: string;
  name: string;
  location: [number, number];
  rice_type: string;
  planting_date: string;
  is_default: boolean;
  notify_bacterial_blight: boolean;
  notify_blast: boolean;
  created_at?: string;
}

export interface FarmPayload {
  user_id: string;
  name: string;
  location: [number, number];
  rice_type: string;
  planting_date: string;
  is_default: boolean;
  notify_bacterial_blight: boolean;
  notify_blast: boolean;
}

// GET /farm?user_id=...
export const getFarms = async (userId: string): Promise<Farm[]> => {
  // ── REPLACE THIS BLOCK when API is ready ──────────────────────────────────
  // const res = await fetch(`${BASE_URL}/farm?user_id=${userId}`);
  // if (!res.ok) throw new Error("fetch farms failed");
  // const data = await res.json();
  // return data.farms ?? [];
  // ─────────────────────────────────────────────────────────────────────────
  void userId;
  const saved = localStorage.getItem(STORAGE_KEY);
  return saved ? (JSON.parse(saved) as Farm[]) : [];
};

// POST /farm
export const createFarm = async (payload: FarmPayload): Promise<void> => {
  // ── REPLACE THIS BLOCK when API is ready ──────────────────────────────────
  // const res = await fetch(`${BASE_URL}/farm`, {
  //   method: "POST",
  //   headers: { "Content-Type": "application/json" },
  //   body: JSON.stringify(payload),
  // });
  // if (!res.ok) throw new Error("create farm failed");
  // ─────────────────────────────────────────────────────────────────────────
  await new Promise((r) => setTimeout(r, 300));
  const current = await getFarms(payload.user_id);
  const newFarm: Farm = {
    ...payload,
    id: "farm_" + Date.now(),
    created_at: new Date().toISOString(),
  };
  let updated = [...current, newFarm];
  if (payload.is_default) {
    updated = updated.map((f) => ({ ...f, is_default: f.id === newFarm.id }));
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
};

// PUT /farm/:farmId
export const updateFarm = async (farmId: string, payload: FarmPayload): Promise<void> => {
  // ── REPLACE THIS BLOCK when API is ready ──────────────────────────────────
  // const res = await fetch(`${BASE_URL}/farm/${farmId}`, {
  //   method: "PUT",
  //   headers: { "Content-Type": "application/json" },
  //   body: JSON.stringify(payload),
  // });
  // if (!res.ok) throw new Error("update farm failed");
  // ─────────────────────────────────────────────────────────────────────────
  await new Promise((r) => setTimeout(r, 300));
  const current = await getFarms(payload.user_id);
  let updated = current.map((f) => (f.id === farmId ? { ...f, ...payload } : f));
  if (payload.is_default) {
    updated = updated.map((f) => ({ ...f, is_default: f.id === farmId }));
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
};

// DELETE /farm/:farmId
export const deleteFarm = async (farmId: string, userId: string): Promise<void> => {
  // ── REPLACE THIS BLOCK when API is ready ──────────────────────────────────
  // const res = await fetch(`${BASE_URL}/farm/${farmId}`, {
  //   method: "DELETE",
  // });
  // if (!res.ok) throw new Error("delete farm failed");
  // ─────────────────────────────────────────────────────────────────────────
  void userId;
  await new Promise((r) => setTimeout(r, 300));
  const current = await getFarms(userId);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(current.filter((f) => f.id !== farmId)));
};
