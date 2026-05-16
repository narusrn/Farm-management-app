"use client";

import { useEffect, useRef, useState } from "react";
import Script from "next/script";
import { getUser } from "@/app/api/routes/user";
import {
  getFarms as apiFetchFarms,
  createFarm as apiCreateFarm,
  updateFarm as apiUpdateFarm,
  deleteFarm as apiDeleteFarm,
  Farm,
  FarmPayload,
  DiseaseKey,
} from "@/app/api/routes/farm";

const CONFIG = {
  LIFF_ID: process.env.NEXT_PUBLIC_LIFF_ID ?? "",
  DEFAULT_CENTER: [15.87, 100.9925] as [number, number],
  DEFAULT_ZOOM: 6,
  FARM_ZOOM: 15,
};

interface RiceVariety {
  rice_variety: string;
  rice_type: string;
}

interface UserProfile {
  displayName: string;
  userId?: string;
}

type Screen = "farms" | "draw" | "form" | "preview";

const FALLBACK_RICE_VARIETIES: RiceVariety[] = [
  { rice_variety: "ข้าวหอมมะลิ 105", rice_type: "ข้าวเจ้า" },
  { rice_variety: "กข6", rice_type: "ข้าวเหนียว" },
  { rice_variety: "กข15", rice_type: "ข้าวเจ้า" },
  { rice_variety: "กข21", rice_type: "ข้าวเจ้า" },
  { rice_variety: "กข41", rice_type: "ข้าวเจ้า" },
  { rice_variety: "กข47", rice_type: "ข้าวเจ้า" },
  { rice_variety: "กข49", rice_type: "ข้าวเจ้า" },
  { rice_variety: "ชัยนาท 1", rice_type: "ข้าวเจ้า" },
  { rice_variety: "สุพรรณบุรี 1", rice_type: "ข้าวเจ้า" },
  { rice_variety: "อื่นๆ", rice_type: "" },
];

declare global {
  interface Window {
    liff: {
      init: (config: { liffId: string }) => Promise<void>;
      isLoggedIn: () => boolean;
      login: () => void;
      getProfile: () => Promise<{ userId: string; displayName: string }>;
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    L: any;
  }
}

export default function RiceFitApp() {
  const [currentScreen, setCurrentScreen] = useState<Screen>("farms");
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<string | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [farms, setFarms] = useState<Farm[]>([]);
  const [currentFarm, setCurrentFarm] = useState<Farm | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editingFarmId, setEditingFarmId] = useState<string | null>(null);
  const [markerLocation, setMarkerLocation] = useState<[number, number] | null>(null);
  const [scriptsLoaded, setScriptsLoaded] = useState(false);
  const [leafletLoaded, setLeafletLoaded] = useState(false);
  const [riceVarieties, setRiceVarieties] = useState<RiceVariety[]>(FALLBACK_RICE_VARIETIES);

  // Form state
  const [farmName, setFarmName] = useState("");
  const [riceType, setRiceType] = useState("");
  const [plantingDate, setPlantingDate] = useState("");
  const [notifyBacterialBlight, setNotifyBacterialBlight] = useState(false);
  const [notifyBlast, setNotifyBlast] = useState(false);

  // Map refs — typed as any because Leaflet is loaded via CDN, not npm
  const drawMapRef = useRef<any>(null);
  const previewMapRef = useRef<any>(null);
  const mapMarkerRef = useRef<any>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const previewMapContainerRef = useRef<HTMLDivElement>(null);

  const showToast = (message: string) => {
    setToast(message);
    setTimeout(() => setToast(null), 2500);
  };

  const formatDate = (dateString: string) => {
    if (!dateString) return "-";
    return new Date(dateString).toLocaleDateString("th-TH", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  // Fetch rice varieties via Next.js proxy route (avoids CORS)
  useEffect(() => {
    const fetchRiceVarieties = async () => {
      try {
        const res = await fetch("/api/rice");
        const data = await res.json();
        if (Array.isArray(data.result) && data.result.length > 0) {
          setRiceVarieties(data.result);
        }
      } catch {
        // keep FALLBACK_RICE_VARIETIES (already set as default state)
      }
    };
    fetchRiceVarieties();
  }, []);

  const loadFarms = async (uid?: string) => {
    try {
      const data = await apiFetchFarms(uid || userId || "");
      setFarms(data);
    } catch {
      showToast("ไม่สามารถโหลดข้อมูลได้");
      setFarms([]);
    }
  };

  const saveFarm = async () => {
    if (!farmName.trim()) { showToast("กรุณากรอกชื่อแปลง"); return; }
    if (!riceType) { showToast("กรุณาเลือกพันธุ์ข้าว"); return; }
    if (!plantingDate) { showToast("กรุณาเลือกวันที่เพาะปลูก"); return; }
    if (!markerLocation) { showToast("กรุณาปักหมุดตำแหน่งแปลง"); return; }

    try {
      setLoading(true);
      const diseases: DiseaseKey[] = [];
      if (notifyBacterialBlight) diseases.push("blight");
      if (notifyBlast) diseases.push("blast");

      const payload: FarmPayload = {
        farm_name: farmName,
        latitude: markerLocation[0],
        longitude: markerLocation[1],
        rice_variety: riceType,
        planting_date: plantingDate,
        notification_diseases: diseases,
      };

      if (isEditing && editingFarmId) {
        await apiUpdateFarm(userId || "", editingFarmId, payload);
      } else {
        await apiCreateFarm(userId || "", payload);
      }

      setFarms(await apiFetchFarms(userId || ""));
      showToast("บันทึกสำเร็จ");
      resetForm();
      setCurrentScreen("farms");
    } catch {
      showToast("ไม่สามารถบันทึกได้");
    } finally {
      setLoading(false);
    }
  };

  const deleteFarm = async (farmId: string) => {
    if (!confirm("ต้องการลบแปลงนี้หรือไม่?")) return;
    try {
      setLoading(true);
      await apiDeleteFarm(userId || "", farmId);
      setFarms(await apiFetchFarms(userId || ""));
      showToast("ลบแปลงสำเร็จ");
      resetForm();
      setCurrentScreen("farms");
    } catch {
      showToast("ไม่สามารถลบได้");
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setIsEditing(false);
    setEditingFarmId(null);
    setCurrentFarm(null);
    setMarkerLocation(null);
    setFarmName("");
    setRiceType("");
    setPlantingDate("");
    setNotifyBacterialBlight(false);
    setNotifyBlast(false);
  };

  const viewFarm = (farmId: string) => {
    const farm = farms.find((f) => f.id === farmId);
    if (farm) { setCurrentFarm(farm); setCurrentScreen("preview"); }
  };

  const editFarm = (farmId: string) => {
    const farm = farms.find((f) => f.id === farmId);
    if (farm) {
      setIsEditing(true);
      setEditingFarmId(farmId);
      setCurrentFarm(farm);
      setMarkerLocation([farm.latitude, farm.longitude]);
      setFarmName(farm.farm_name);
      setRiceType(farm.rice_variety);
      setPlantingDate(farm.planting_date);
      setNotifyBacterialBlight(farm.notification_diseases.includes("blight"));
      setNotifyBlast(farm.notification_diseases.includes("blast"));
      setCurrentScreen("draw");
    }
  };

  // Initialize LIFF
  useEffect(() => {
    if (!scriptsLoaded) return;
    const initLiff = async () => {
      try {
        if (window.liff) {
          await window.liff.init({ liffId: CONFIG.LIFF_ID });
          if (!window.liff.isLoggedIn()) {
            if (window.location.hostname === "localhost") {
              const profile = await getUser("mock_user_123");
              setUserId("mock_user_123");
              setUserProfile({ ...profile, displayName: "ผู้ใช้ทดสอบ" });
              await loadFarms("mock_user_123");
              setLoading(false);
              return;
            }
            window.liff.login();
            return;
          }
          const liffProfile = await window.liff.getProfile();
          console.log("[LIFF] userId:", liffProfile.userId);
          const apiProfile = await getUser(liffProfile.userId);
          setUserId(liffProfile.userId);
          setUserProfile({ ...apiProfile, displayName: liffProfile.displayName });
          await loadFarms(liffProfile.userId);
        } else {
          const profile = await getUser("mock_user_123");
          setUserId("mock_user_123");
          setUserProfile({ ...profile, displayName: "ผู้ใช้ทดสอบ" });
          await loadFarms("mock_user_123");
        }
      } catch {
        setUserId("mock_user_123");
        setUserProfile({ displayName: "ผู้ใช้ทดสอบ" });
        await loadFarms("mock_user_123");
      }
      setLoading(false);
    };
    initLiff();
  }, [scriptsLoaded]);

  // Initialize draw map — click to place marker
  useEffect(() => {
    if (currentScreen !== "draw" || !leafletLoaded) return;
    if (!mapContainerRef.current) return;
    const L = window.L;
    if (!L) return;

    if (drawMapRef.current) { drawMapRef.current.remove(); drawMapRef.current = null; }
    mapMarkerRef.current = null;

    const initMap = () => {
      if (!mapContainerRef.current) return;
      const rect = mapContainerRef.current.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) { setTimeout(initMap, 100); return; }

      try {
        const map = L.map(mapContainerRef.current, {
          center: CONFIG.DEFAULT_CENTER,
          zoom: CONFIG.DEFAULT_ZOOM,
          zoomControl: true,
        });

        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          attribution: "© OpenStreetMap",
          maxZoom: 19,
        }).addTo(map);

        const placeMarker = (lat: number, lng: number) => {
          if (mapMarkerRef.current) mapMarkerRef.current.remove();
          mapMarkerRef.current = L.marker([lat, lng]).addTo(map);
          setMarkerLocation([lat, lng]);
        };

        map.on("click", (e: any) => placeMarker(e.latlng.lat, e.latlng.lng));

        if (isEditing && currentFarm) {
          placeMarker(currentFarm.latitude, currentFarm.longitude);
          map.setView([currentFarm.latitude, currentFarm.longitude], CONFIG.FARM_ZOOM);
        } else if (navigator.geolocation) {
          navigator.geolocation.getCurrentPosition(
            (pos) => map.setView([pos.coords.latitude, pos.coords.longitude], CONFIG.FARM_ZOOM),
            () => {},
            { enableHighAccuracy: true }
          );
        }

        drawMapRef.current = map;
        setTimeout(() => map.invalidateSize(), 100);
        setTimeout(() => map.invalidateSize(), 500);
      } catch (err) {
        console.error("[v0] Error creating map:", err);
      }
    };

    setTimeout(initMap, 200);

    return () => {
      if (drawMapRef.current) { drawMapRef.current.remove(); drawMapRef.current = null; }
      mapMarkerRef.current = null;
    };
  }, [currentScreen, leafletLoaded, isEditing, currentFarm]);

  // Initialize preview map
  useEffect(() => {
    if (currentScreen !== "preview" || !leafletLoaded) return;
    if (!previewMapContainerRef.current || !currentFarm) return;
    const L = window.L;
    if (!L) return;

    if (previewMapRef.current) { previewMapRef.current.remove(); previewMapRef.current = null; }

    const initMap = () => {
      if (!previewMapContainerRef.current) return;
      const rect = previewMapContainerRef.current.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) { setTimeout(initMap, 100); return; }

      try {
        const map = L.map(previewMapContainerRef.current, {
          center: CONFIG.DEFAULT_CENTER,
          zoom: CONFIG.DEFAULT_ZOOM,
          zoomControl: true,
        });

        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          attribution: "© OpenStreetMap",
          maxZoom: 19,
        }).addTo(map);

        if (currentFarm.latitude && currentFarm.longitude) {
          const pos: [number, number] = [currentFarm.latitude, currentFarm.longitude];
          L.marker(pos).addTo(map);
          map.setView(pos, CONFIG.FARM_ZOOM);
        }

        previewMapRef.current = map;
        setTimeout(() => map.invalidateSize(), 100);
      } catch (err) {
        console.error("[v0] Error creating preview map:", err);
      }
    };

    setTimeout(initMap, 200);

    return () => {
      if (previewMapRef.current) { previewMapRef.current.remove(); previewMapRef.current = null; }
    };
  }, [currentScreen, leafletLoaded, currentFarm]);

  const clearMarker = () => {
    if (mapMarkerRef.current) { mapMarkerRef.current.remove(); mapMarkerRef.current = null; }
    setMarkerLocation(null);
  };

  const getMyLocation = () => {
    if (!navigator.geolocation) { showToast("เบราว์เซอร์ไม่รองรับ GPS"); return; }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        if (drawMapRef.current) drawMapRef.current.setView([pos.coords.latitude, pos.coords.longitude], CONFIG.FARM_ZOOM);
      },
      () => showToast("ไม่สามารถระบุตำแหน่งได้"),
      { enableHighAccuracy: true }
    );
  };

  const proceedToForm = () => {
    if (!markerLocation) { showToast("กรุณาปักหมุดตำแหน่งแปลง"); return; }
    setCurrentScreen("form");
  };

  return (
    <>
      <Script src="https://static.line-scdn.net/liff/edge/2/sdk.js" onLoad={() => setScriptsLoaded(true)} />
      <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
      <Script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js" onLoad={() => setLeafletLoaded(true)} />

      <style jsx global>{`
        * { -webkit-tap-highlight-color: transparent; }
        body { font-family: "Sarabun", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; overscroll-behavior: none; }
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      {loading && (
        <div className="fixed inset-0 bg-white/90 flex items-center justify-center z-[9999]">
          <div className="text-center">
            <div className="w-12 h-12 border-4 border-gray-200 border-t-green-500 rounded-full animate-spin mx-auto mb-4" />
            <p className="text-gray-600">กำลังโหลด...</p>
          </div>
        </div>
      )}

      {toast && (
        <div
          className="fixed bottom-24 left-4 right-4 bg-gray-900 text-white px-4 py-3 rounded-xl shadow-lg z-[9999] text-center"
          style={{ animation: "slideUp 0.3s ease-out" }}
        >
          {toast}
        </div>
      )}

      {/* Screen: Farms List */}
      {currentScreen === "farms" && (
        <div className="min-h-dvh flex flex-col bg-gray-50">
          <header className="bg-white border-b border-gray-200 px-4 py-4 sticky top-0 z-10">
            <h1 className="text-xl font-bold text-gray-900">แปลงของฉัน</h1>
            {userProfile && <p className="text-sm text-gray-500 mt-1">สวัสดี, {userProfile.displayName}</p>}
          </header>

          <main className="flex-1 overflow-auto p-4 pb-24">
            {farms.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center text-center py-20">
                <div className="w-24 h-24 bg-green-100 rounded-full flex items-center justify-center mb-6">
                  <svg className="w-12 h-12 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
                  </svg>
                </div>
                <h2 className="text-xl font-semibold text-gray-900 mb-2">ยังไม่มีแปลงเพาะปลูก</h2>
                <p className="text-gray-500 mb-6">เพิ่มแปลงเพื่อเริ่มใช้งาน</p>
                <button
                  onClick={() => { resetForm(); setCurrentScreen("draw"); }}
                  className="bg-green-600 text-white px-6 py-3 rounded-xl font-medium shadow-lg shadow-green-600/30 active:scale-95 transition-transform"
                >
                  + เพิ่มแปลงแรก
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {farms.map((farm) => (
                  <div key={farm.id} className="bg-white rounded-2xl p-4 shadow-sm">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold text-gray-900">{farm.farm_name}</h3>
                        </div>
                        <p className="text-sm text-gray-500 mt-1">{farm.rice_variety}</p>
                        {farm.notification_diseases.length > 0 && (
                          <div className="flex gap-1 mt-1.5 flex-wrap">
                            {farm.notification_diseases.includes("blight") && (
                              <span className="text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full">โรคขอบใบแห้ง</span>
                            )}
                            {farm.notification_diseases.includes("blast") && (
                              <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full">โรคไหม้</span>
                            )}
                          </div>
                        )}
                      </div>
                      <span className="text-xs text-gray-400 ml-2 shrink-0">{formatDate(farm.planting_date)}</span>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => viewFarm(farm.id)}
                        className="flex-1 bg-gray-100 text-gray-700 py-2.5 rounded-xl text-sm font-medium active:bg-gray-200 transition-colors"
                      >
                        ดูแผนที่
                      </button>
                      <button
                        onClick={() => editFarm(farm.id)}
                        className="flex-1 bg-green-50 text-green-700 py-2.5 rounded-xl text-sm font-medium active:bg-green-100 transition-colors"
                      >
                        แก้ไข
                      </button>
                      <button
                        onClick={() => deleteFarm(farm.id)}
                        className="bg-red-50 text-red-600 px-4 py-2.5 rounded-xl text-sm font-medium active:bg-red-100 transition-colors"
                      >
                        ลบ
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </main>

          {farms.length > 0 && (
            <footer className="fixed bottom-0 left-0 right-0 p-4 bg-white border-t border-gray-200">
              <button
                onClick={() => { resetForm(); setCurrentScreen("draw"); }}
                className="w-full bg-green-600 text-white py-4 rounded-xl font-medium shadow-lg shadow-green-600/30 active:scale-95 transition-transform"
              >
                + เพิ่มแปลงใหม่
              </button>
            </footer>
          )}
        </div>
      )}

      {/* Screen: Draw Map — click to place marker */}
      {currentScreen === "draw" && (
        <div className="h-dvh flex flex-col">
          <header className="bg-white border-b border-gray-200 px-4 py-4 flex items-center gap-3 z-20">
            <button
              onClick={() => { resetForm(); setCurrentScreen("farms"); }}
              className="p-2 -ml-2 rounded-lg hover:bg-gray-100 active:bg-gray-200"
            >
              <svg className="w-6 h-6 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <h1 className="text-lg font-bold text-gray-900">ปักหมุดตำแหน่งแปลง</h1>
          </header>

          <div className="flex-1 relative" style={{ minHeight: 0 }}>
            <div ref={mapContainerRef} className="absolute inset-0" style={{ zIndex: 1 }} />

            <div className="absolute top-4 right-4 z-[1000] flex flex-col gap-2">
              <button
                onClick={clearMarker}
                className="bg-white p-3 rounded-xl shadow-lg active:bg-gray-100 transition-colors"
                title="ลบหมุด"
              >
                <svg className="w-5 h-5 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
              <button
                onClick={getMyLocation}
                className="bg-white p-3 rounded-xl shadow-lg active:bg-gray-100 transition-colors"
                title="ตำแหน่งปัจจุบัน"
              >
                <svg className="w-5 h-5 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </button>
            </div>

            {!markerLocation ? (
              <div className="absolute bottom-24 left-4 right-4 z-[1000] bg-white/95 backdrop-blur rounded-xl p-4 shadow-lg text-center">
                <p className="text-gray-700 font-medium">กดบนแผนที่เพื่อปักหมุดตำแหน่งแปลง</p>
                <p className="text-gray-500 text-sm mt-1">หรือกดปุ่ม GPS เพื่อนำทางไปยังตำแหน่งปัจจุบัน</p>
              </div>
            ) : (
              <div className="absolute bottom-24 left-4 right-4 z-[1000] bg-green-50/95 backdrop-blur rounded-xl p-3 shadow-lg text-center">
                <p className="text-green-700 text-sm font-medium">ปักหมุดแล้ว</p>
                <p className="text-green-600 text-xs mt-0.5">
                  {markerLocation[0].toFixed(5)}, {markerLocation[1].toFixed(5)}
                </p>
              </div>
            )}
          </div>

          <footer className="p-4 bg-white border-t border-gray-200 z-20">
            <button
              onClick={proceedToForm}
              disabled={!markerLocation}
              className={`w-full py-4 rounded-xl font-medium transition-all ${
                markerLocation
                  ? "bg-green-600 text-white shadow-lg shadow-green-600/30 active:scale-95"
                  : "bg-gray-300 text-gray-500 cursor-not-allowed"
              }`}
            >
              ต่อไป
            </button>
          </footer>
        </div>
      )}

      {/* Screen: Farm Form */}
      {currentScreen === "form" && (
        <div className="min-h-dvh flex flex-col bg-gray-50">
          <header className="bg-white border-b border-gray-200 px-4 py-4 flex items-center gap-3">
            <button
              onClick={() => setCurrentScreen("draw")}
              className="p-2 -ml-2 rounded-lg hover:bg-gray-100 active:bg-gray-200"
            >
              <svg className="w-6 h-6 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <h1 className="text-lg font-bold text-gray-900">{isEditing ? "แก้ไขแปลง" : "เพิ่มแปลงใหม่"}</h1>
          </header>

          <main className="flex-1 overflow-auto p-4 pb-32">
            <div className="space-y-4">
              {/* Farm Name */}
              <div className="bg-white rounded-2xl p-4 shadow-sm">
                <label className="block text-sm font-medium text-gray-700 mb-2">ชื่อแปลง</label>
                <input
                  type="text"
                  value={farmName}
                  onChange={(e) => setFarmName(e.target.value)}
                  placeholder="เช่น แปลงหลังบ้าน"
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none transition-all"
                />
              </div>

              {/* Rice Type */}
              <div className="bg-white rounded-2xl p-4 shadow-sm">
                <label className="block text-sm font-medium text-gray-700 mb-2">พันธุ์ข้าว</label>
                <select
                  value={riceType}
                  onChange={(e) => setRiceType(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none transition-all appearance-none bg-white"
                >
                  <option value="">เลือกพันธุ์ข้าว</option>
                  {riceVarieties.map((v) => (
                    <option key={v.rice_variety} value={v.rice_variety}>
                      {v.rice_variety}
                    </option>
                  ))}
                </select>
              </div>

              {/* Planting Date */}
              <div className="bg-white rounded-2xl p-4 shadow-sm">
                <label className="block text-sm font-medium text-gray-700 mb-2">วันที่เพาะปลูก</label>
                <input
                  type="date"
                  value={plantingDate}
                  onChange={(e) => setPlantingDate(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none transition-all"
                />
              </div>

              {/* Disease Notifications */}
              <div className="bg-white rounded-2xl p-4 shadow-sm">
                <h3 className="text-sm font-medium text-gray-700 mb-3">การแจ้งเตือนโรคข้าว</h3>
                <div className="space-y-3">
                  <label className="flex items-start gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={notifyBacterialBlight}
                      onChange={(e) => setNotifyBacterialBlight(e.target.checked)}
                      className="mt-0.5 w-5 h-5 text-green-600 border-gray-300 rounded focus:ring-green-500"
                    />
                    <div>
                      <p className="text-gray-800 font-medium leading-tight">โรคขอบใบแห้ง</p>
                      <p className="text-xs text-gray-400 mt-0.5">Bacterial Leaf Blight</p>
                    </div>
                  </label>
                  <label className="flex items-start gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={notifyBlast}
                      onChange={(e) => setNotifyBlast(e.target.checked)}
                      className="mt-0.5 w-5 h-5 text-green-600 border-gray-300 rounded focus:ring-green-500"
                    />
                    <div>
                      <p className="text-gray-800 font-medium leading-tight">โรคไหม้</p>
                      <p className="text-xs text-gray-400 mt-0.5">Blast</p>
                    </div>
                  </label>
                </div>
              </div>

              {/* Marker coordinates summary */}
              {markerLocation && (
                <div className="bg-green-50 rounded-2xl p-4 text-center">
                  <p className="text-sm text-green-700">ตำแหน่งแปลง</p>
                  <p className="text-sm font-semibold text-green-800 mt-1">
                    {markerLocation[0].toFixed(5)}, {markerLocation[1].toFixed(5)}
                  </p>
                </div>
              )}
            </div>
          </main>

          <footer className="fixed bottom-0 left-0 right-0 p-4 bg-white border-t border-gray-200 space-y-2">
            <button
              onClick={saveFarm}
              disabled={loading}
              className={`w-full py-4 rounded-xl font-medium shadow-lg transition-all active:scale-95 ${
                loading ? "bg-gray-400 text-gray-200 cursor-wait" : "bg-green-600 text-white shadow-green-600/30"
              }`}
            >
              {loading ? "กำลังบันทึก..." : "บันทึก"}
            </button>
            {isEditing && (
              <button
                onClick={() => deleteFarm(editingFarmId!)}
                className="w-full bg-red-50 text-red-600 py-4 rounded-xl font-medium active:bg-red-100 transition-colors"
              >
                ลบแปลง
              </button>
            )}
          </footer>
        </div>
      )}

      {/* Screen: Preview */}
      {currentScreen === "preview" && currentFarm && (
        <div className="h-dvh flex flex-col">
          <header className="bg-white border-b border-gray-200 px-4 py-4 flex items-center gap-3 z-20">
            <button
              onClick={() => setCurrentScreen("farms")}
              className="p-2 -ml-2 rounded-lg hover:bg-gray-100 active:bg-gray-200"
            >
              <svg className="w-6 h-6 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <h1 className="text-lg font-bold text-gray-900">{currentFarm.farm_name}</h1>
          </header>

          <div className="flex-1 relative" style={{ minHeight: 0 }}>
            <div ref={previewMapContainerRef} className="absolute inset-0" style={{ zIndex: 1 }} />

            <div className="absolute bottom-4 left-4 right-4 z-[1000] bg-white/95 backdrop-blur rounded-2xl p-4 shadow-lg">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm text-gray-500">พันธุ์ข้าว</p>
                  <p className="font-semibold text-gray-900">{currentFarm.rice_variety}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm text-gray-500">วันที่เพาะปลูก</p>
                  <p className="font-semibold text-gray-900">{formatDate(currentFarm.planting_date)}</p>
                </div>
              </div>
              {currentFarm.notification_diseases.length > 0 && (
                <div className="mt-3 pt-3 border-t border-gray-200">
                  <p className="text-sm text-gray-500 mb-1.5">การแจ้งเตือน</p>
                  <div className="flex gap-2 flex-wrap">
                    {currentFarm.notification_diseases.includes("blight") && (
                      <span className="text-xs bg-orange-100 text-orange-700 px-2 py-1 rounded-full">โรคขอบใบแห้ง</span>
                    )}
                    {currentFarm.notification_diseases.includes("blast") && (
                      <span className="text-xs bg-red-100 text-red-700 px-2 py-1 rounded-full">โรคไหม้</span>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          <footer className="p-4 bg-white border-t border-gray-200 z-20">
            <button
              onClick={() => editFarm(currentFarm.id)}
              className="w-full bg-green-600 text-white py-4 rounded-xl font-medium shadow-lg shadow-green-600/30 active:scale-95 transition-transform"
            >
              แก้ไข
            </button>
          </footer>
        </div>
      )}
    </>
  );
}
