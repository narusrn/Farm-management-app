const BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "";
const STORAGE_KEY = "ricefit_farms";

export type DiseaseKey = "blast" | "blight" | "brown_spot" | "tungro";

export interface Farm {
  id: string;
  farm_name: string;
  latitude: number;
  longitude: number;
  rice_variety: string;
  planting_date: string;
  notification_diseases: DiseaseKey[];
  province?: string;
  sensitivity?: string;
  created_at?: string;
}

export interface FarmPayload {
  farm_name: string;
  latitude: number;
  longitude: number;
  rice_variety: string;
  planting_date: string;
  notification_diseases: DiseaseKey[];
  province?: string;
  sensitivity?: string;
}

// GET /farm/{user_id}
export const getFarms = async (userId: string): Promise<Farm[]> => {
  // ── REPLACE THIS BLOCK when API is ready ──────────────────────────────────
  // const res = await fetch(`${BASE_URL}/farm/${userId}`, {
  //   headers: { accept: "application/json" },
  // });
  // if (!res.ok) throw new Error("fetch farms failed");
  // const data = await res.json();
  // return data.result ?? [];
  // ─────────────────────────────────────────────────────────────────────────
  void userId;
  const saved = localStorage.getItem(STORAGE_KEY);
  return saved ? (JSON.parse(saved) as Farm[]) : [];
};

// POST /farm/{user_id}
export const createFarm = async (userId: string, payload: FarmPayload): Promise<void> => {
  // ── REPLACE THIS BLOCK when API is ready ──────────────────────────────────
  // const res = await fetch(`${BASE_URL}/farm/${userId}`, {
  //   method: "POST",
  //   headers: { "Content-Type": "application/json", accept: "application/json" },
  //   body: JSON.stringify(payload),
  // });
  // if (!res.ok) throw new Error("create farm failed");
  // ─────────────────────────────────────────────────────────────────────────
  await new Promise((r) => setTimeout(r, 300));
  const current = await getFarms(userId);
  const newFarm: Farm = {
    ...payload,
    id: "farm_" + Date.now(),
    created_at: new Date().toISOString(),
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify([...current, newFarm]));
};

// PATCH /farm/{user_id}/{farm_id}
export const updateFarm = async (userId: string, farmId: string, payload: FarmPayload): Promise<void> => {
  // ── REPLACE THIS BLOCK when API is ready ──────────────────────────────────
  // const res = await fetch(`${BASE_URL}/farm/${userId}/${farmId}`, {
  //   method: "PATCH",
  //   headers: { "Content-Type": "application/json", accept: "application/json" },
  //   body: JSON.stringify(payload),
  // });
  // if (!res.ok) throw new Error("update farm failed");
  // ─────────────────────────────────────────────────────────────────────────
  await new Promise((r) => setTimeout(r, 300));
  const current = await getFarms(userId);
  const updated = current.map((f) => (f.id === farmId ? { ...f, ...payload } : f));
  localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
};

// DELETE /farm/{user_id}/{farm_id}
export const deleteFarm = async (userId: string, farmId: string): Promise<void> => {
  // ── REPLACE THIS BLOCK when API is ready ──────────────────────────────────
  // const res = await fetch(`${BASE_URL}/farm/${userId}/${farmId}`, {
  //   method: "DELETE",
  //   headers: { accept: "application/json" },
  // });
  // if (!res.ok) throw new Error("delete farm failed");
  // ─────────────────────────────────────────────────────────────────────────
  await new Promise((r) => setTimeout(r, 300));
  const current = await getFarms(userId);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(current.filter((f) => f.id !== farmId)));
};
