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
  const res = await fetch(`/api/farm/${userId}`);
  if (!res.ok) throw new Error("fetch farms failed");
  const data = await res.json();
  if (Array.isArray(data)) return data;
  return data.result ?? data.farms ?? data.data ?? [];
};

// POST /farm/{user_id}
export const createFarm = async (userId: string, payload: FarmPayload): Promise<void> => {
  const res = await fetch(`/api/farm/${userId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error("create farm failed");
};

// PATCH /farm/{user_id}/{farm_id}
export const updateFarm = async (userId: string, farmId: string, payload: FarmPayload): Promise<void> => {
  const res = await fetch(`/api/farm/${userId}/${farmId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error("update farm failed");
};

// DELETE /farm/{user_id}/{farm_id}
export const deleteFarm = async (userId: string, farmId: string): Promise<void> => {
  const res = await fetch(`/api/farm/${userId}/${farmId}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error("delete farm failed");
};
