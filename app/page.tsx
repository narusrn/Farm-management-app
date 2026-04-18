"use client";

import { useEffect, useRef, useState } from "react";
import Script from "next/script";

// Configuration
const CONFIG = {
  LIFF_ID: "YOUR_LIFF_ID",
  API_BASE_URL: "https://your-api.com",
  DEFAULT_CENTER: [15.87, 100.9925] as [number, number],
  DEFAULT_ZOOM: 6,
  FARM_ZOOM: 15,
};

interface Farm {
  id: string;
  name: string;
  polygon: [number, number][];
  rice_type: string;
  planting_date: string;
  is_default: boolean;
  created_at?: string;
}

interface UserProfile {
  displayName: string;
  userId?: string;
}

type Screen = "farms" | "draw" | "form" | "preview";

const RICE_TYPES: Record<string, string> = {
  KDML105: "ข้าวหอมมะลิ 105",
  RD6: "กข6",
  RD15: "กข15",
  RD21: "กข21",
  RD41: "กข41",
  RD47: "กข47",
  RD49: "กข49",
  CHAINAT1: "ชัยนาท 1",
  SUPHANBURI1: "สุพรรณบุรี 1",
  OTHER: "อื่นๆ",
};

declare global {
  interface Window {
    liff: {
      init: (config: { liffId: string }) => Promise<void>;
      isLoggedIn: () => boolean;
      login: () => void;
      getProfile: () => Promise<{ userId: string; displayName: string }>;
    };
    L: typeof import("leaflet");
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
  const [drawnPolygon, setDrawnPolygon] = useState<[number, number][] | null>(null);
  const [scriptsLoaded, setScriptsLoaded] = useState(false);
  const [leafletLoaded, setLeafletLoaded] = useState(false);
  const [leafletDrawLoaded, setLeafletDrawLoaded] = useState(false);

  // Form state
  const [farmName, setFarmName] = useState("");
  const [riceType, setRiceType] = useState("");
  const [plantingDate, setPlantingDate] = useState("");
  const [isDefault, setIsDefault] = useState(false);

  // Map refs
  const drawMapRef = useRef<L.Map | null>(null);
  const previewMapRef = useRef<L.Map | null>(null);
  const drawnItemsRef = useRef<L.FeatureGroup | null>(null);
  const drawControlRef = useRef<L.Control.Draw | null>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const previewMapContainerRef = useRef<HTMLDivElement>(null);

  // Show toast
  const showToast = (message: string) => {
    setToast(message);
    setTimeout(() => setToast(null), 2500);
  };

  // Format date
  const formatDate = (dateString: string) => {
    if (!dateString) return "-";
    const date = new Date(dateString);
    return date.toLocaleDateString("th-TH", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  // Calculate area
  const calculateArea = (polygon: [number, number][]) => {
    if (!polygon || polygon.length < 3) return 0;
    let area = 0;
    const n = polygon.length;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      area += polygon[i][1] * polygon[j][0];
      area -= polygon[j][1] * polygon[i][0];
    }
    area = Math.abs(area) / 2;
    const lat = polygon.reduce((sum, c) => sum + c[0], 0) / n;
    const metersPerDegree = 111320 * Math.cos((lat * Math.PI) / 180);
    return area * metersPerDegree * metersPerDegree;
  };

  // Format area
  const formatArea = (sqMeters: number) => {
    const rai = sqMeters / 1600;
    if (rai >= 1) {
      return rai.toFixed(2) + " ไร่";
    } else {
      const sqWa = sqMeters / 4;
      return sqWa.toFixed(0) + " ตร.วา";
    }
  };

  // Load farms
  const loadFarms = async () => {
    try {
      setLoading(true);
      if (CONFIG.API_BASE_URL === "https://your-api.com") {
        await new Promise((r) => setTimeout(r, 300));
        const saved = localStorage.getItem("ricefit_farms");
        setFarms(saved ? JSON.parse(saved) : []);
      } else {
        const res = await fetch(`${CONFIG.API_BASE_URL}/farm?user_id=${userId}`);
        const data = await res.json();
        setFarms(data.farms || []);
      }
    } catch {
      showToast("ไม่สามารถโหลดข้อมูลได้");
      setFarms([]);
    } finally {
      setLoading(false);
    }
  };

  // Save farm
  const saveFarm = async () => {
    console.log("[v0] saveFarm called");
    console.log("[v0] farmName:", farmName);
    console.log("[v0] riceType:", riceType);
    console.log("[v0] plantingDate:", plantingDate);
    console.log("[v0] drawnPolygon:", drawnPolygon);
    
    if (!farmName.trim()) {
      console.log("[v0] Missing farmName");
      showToast("กรุณากรอกชื่อแปลง");
      return;
    }
    if (!riceType) {
      console.log("[v0] Missing riceType");
      showToast("กรุณาเลือกพันธุ์ข้าว");
      return;
    }
    if (!plantingDate) {
      console.log("[v0] Missing plantingDate");
      showToast("กรุณาเลือกวันที่เพาะปลูก");
      return;
    }
    if (!drawnPolygon) {
      console.log("[v0] Missing drawnPolygon");
      showToast("กรุณาวาดขอบเขตแปลง");
      return;
    }

    try {
      setLoading(true);
      if (CONFIG.API_BASE_URL === "https://your-api.com") {
        await new Promise((r) => setTimeout(r, 300));
        let newFarms = [...farms];
        if (isEditing && editingFarmId) {
          const idx = newFarms.findIndex((f) => f.id === editingFarmId);
          if (idx !== -1) {
            newFarms[idx] = {
              ...newFarms[idx],
              name: farmName,
              polygon: drawnPolygon,
              rice_type: riceType,
              planting_date: plantingDate,
              is_default: isDefault,
            };
          }
        } else {
          const newFarm: Farm = {
            id: "farm_" + Date.now(),
            name: farmName,
            polygon: drawnPolygon,
            rice_type: riceType,
            planting_date: plantingDate,
            is_default: isDefault,
            created_at: new Date().toISOString(),
          };
          newFarms.push(newFarm);
        }
        if (isDefault) {
          const targetId = editingFarmId || newFarms[newFarms.length - 1].id;
          newFarms = newFarms.map((f) => ({ ...f, is_default: f.id === targetId }));
        }
        localStorage.setItem("ricefit_farms", JSON.stringify(newFarms));
        setFarms(newFarms);
        console.log("[v0] Saved to localStorage:", newFarms);
      }
      console.log("[v0] Save successful, navigating to farms");
      showToast("บันทึกสำเร็จ");
      resetForm();
      setCurrentScreen("farms");
    } catch {
      showToast("ไม่สามารถบันทึกได้");
    } finally {
      setLoading(false);
    }
  };

  // Delete farm
  const deleteFarm = async () => {
    if (!editingFarmId) return;
    if (!confirm("ต้องการลบแปลงนี้หรือไม่?")) return;

    try {
      setLoading(true);
      if (CONFIG.API_BASE_URL === "https://your-api.com") {
        await new Promise((r) => setTimeout(r, 300));
        const newFarms = farms.filter((f) => f.id !== editingFarmId);
        localStorage.setItem("ricefit_farms", JSON.stringify(newFarms));
        setFarms(newFarms);
      }
      showToast("ลบแปลงสำเร็จ");
      resetForm();
      setCurrentScreen("farms");
    } catch {
      showToast("ไม่สามารถลบได้");
    } finally {
      setLoading(false);
    }
  };

  // Reset form
  const resetForm = () => {
    setIsEditing(false);
    setEditingFarmId(null);
    setCurrentFarm(null);
    setDrawnPolygon(null);
    setFarmName("");
    setRiceType("");
    setPlantingDate("");
    setIsDefault(false);
  };

  // View farm
  const viewFarm = (farmId: string) => {
    const farm = farms.find((f) => f.id === farmId);
    if (farm) {
      setCurrentFarm(farm);
      setCurrentScreen("preview");
    }
  };

  // Edit farm
  const editFarm = (farmId: string) => {
    const farm = farms.find((f) => f.id === farmId);
    if (farm) {
      setIsEditing(true);
      setEditingFarmId(farmId);
      setCurrentFarm(farm);
      setDrawnPolygon(farm.polygon);
      setFarmName(farm.name);
      setRiceType(farm.rice_type);
      setPlantingDate(farm.planting_date);
      setIsDefault(farm.is_default);
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
            if (window.location.hostname === "localhost" || CONFIG.LIFF_ID === "YOUR_LIFF_ID") {
              setUserId("mock_user_123");
              setUserProfile({ displayName: "ผู้ใช้ทดสอบ" });
              setLoading(false);
              await loadFarms();
              return;
            }
            window.liff.login();
            return;
          }
          const profile = await window.liff.getProfile();
          setUserId(profile.userId);
          setUserProfile({ displayName: profile.displayName });
        } else {
          setUserId("mock_user_123");
          setUserProfile({ displayName: "ผู้ใช้ทดสอบ" });
        }
      } catch {
        setUserId("mock_user_123");
        setUserProfile({ displayName: "ผู้ใช้ทดสอบ" });
      }
      setLoading(false);
      loadFarms();
    };

    initLiff();
  }, [scriptsLoaded]);

  // Initialize draw map
  useEffect(() => {
    if (currentScreen !== "draw" || !leafletLoaded || !leafletDrawLoaded) return;
    if (!mapContainerRef.current) return;

    const L = window.L;
    if (!L) {
      console.log("[v0] Leaflet not loaded yet");
      return;
    }

    console.log("[v0] Initializing draw map");
    console.log("[v0] Container:", mapContainerRef.current);
    console.log("[v0] Container size:", mapContainerRef.current.offsetWidth, "x", mapContainerRef.current.offsetHeight);

    // Clean up existing map
    if (drawMapRef.current) {
      drawMapRef.current.remove();
      drawMapRef.current = null;
    }

    // Wait for container to be visible
    const initMap = () => {
      if (!mapContainerRef.current) return;
      
      const rect = mapContainerRef.current.getBoundingClientRect();
      console.log("[v0] Container rect:", rect);
      
      if (rect.width === 0 || rect.height === 0) {
        console.log("[v0] Container not visible yet, retrying...");
        setTimeout(initMap, 100);
        return;
      }

      try {
        const map = L.map(mapContainerRef.current, {
          center: CONFIG.DEFAULT_CENTER,
          zoom: CONFIG.DEFAULT_ZOOM,
          zoomControl: true,
        });
        console.log("[v0] Map created");

        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          attribution: "© OpenStreetMap",
          maxZoom: 19,
        }).addTo(map);
        console.log("[v0] Tile layer added");

        const drawnItems = new L.FeatureGroup();
        map.addLayer(drawnItems);
        drawnItemsRef.current = drawnItems;

        const drawControl = new L.Control.Draw({
          draw: {
            polygon: {
              allowIntersection: false,
              showArea: true,
              shapeOptions: {
                color: "#22c55e",
                fillColor: "#22c55e",
                fillOpacity: 0.3,
              },
            },
            polyline: false,
            rectangle: false,
            circle: false,
            marker: false,
            circlemarker: false,
          },
          edit: {
            featureGroup: drawnItems,
            remove: false,
          },
        });
        map.addControl(drawControl);
        drawControlRef.current = drawControl;
        console.log("[v0] Draw control added");

        map.on(L.Draw.Event.CREATED, (e: L.DrawEvents.Created) => {
          drawnItems.clearLayers();
          drawnItems.addLayer(e.layer);
          const latLngs = (e.layer as L.Polygon).getLatLngs()[0] as L.LatLng[];
          const polygon: [number, number][] = latLngs.map((ll) => [ll.lat, ll.lng]);
          setDrawnPolygon(polygon);
        });

        map.on(L.Draw.Event.EDITED, (e: L.DrawEvents.Edited) => {
          e.layers.eachLayer((layer) => {
            const latLngs = (layer as L.Polygon).getLatLngs()[0] as L.LatLng[];
            const polygon: [number, number][] = latLngs.map((ll) => [ll.lat, ll.lng]);
            setDrawnPolygon(polygon);
          });
        });

        // Show existing polygon if editing
        if (isEditing && currentFarm?.polygon) {
          const polygon = L.polygon(currentFarm.polygon, {
            color: "#22c55e",
            fillColor: "#22c55e",
            fillOpacity: 0.3,
          });
          drawnItems.addLayer(polygon);
          map.fitBounds(polygon.getBounds(), { padding: [50, 50] });
        } else {
          // Get user location
          if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
              (pos) => {
                map.setView([pos.coords.latitude, pos.coords.longitude], CONFIG.FARM_ZOOM);
              },
              () => {},
              { enableHighAccuracy: true }
            );
          }
        }

        drawMapRef.current = map;

        // Invalidate size after render
        setTimeout(() => map.invalidateSize(), 100);
        setTimeout(() => map.invalidateSize(), 500);
      } catch (err) {
        console.error("[v0] Error creating map:", err);
      }
    };

    setTimeout(initMap, 200);

    return () => {
      if (drawMapRef.current) {
        drawMapRef.current.remove();
        drawMapRef.current = null;
      }
    };
  }, [currentScreen, leafletLoaded, leafletDrawLoaded, isEditing, currentFarm]);

  // Initialize preview map
  useEffect(() => {
    if (currentScreen !== "preview" || !leafletLoaded) return;
    if (!previewMapContainerRef.current || !currentFarm) return;

    const L = window.L;
    if (!L) return;

    // Clean up existing map
    if (previewMapRef.current) {
      previewMapRef.current.remove();
      previewMapRef.current = null;
    }

    const initMap = () => {
      if (!previewMapContainerRef.current) return;

      const rect = previewMapContainerRef.current.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) {
        setTimeout(initMap, 100);
        return;
      }

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

        if (currentFarm.polygon) {
          const polygon = L.polygon(currentFarm.polygon, {
            color: "#22c55e",
            fillColor: "#22c55e",
            fillOpacity: 0.3,
          }).addTo(map);
          map.fitBounds(polygon.getBounds(), { padding: [50, 50] });
        }

        previewMapRef.current = map;
        setTimeout(() => map.invalidateSize(), 100);
      } catch (err) {
        console.error("[v0] Error creating preview map:", err);
      }
    };

    setTimeout(initMap, 200);

    return () => {
      if (previewMapRef.current) {
        previewMapRef.current.remove();
        previewMapRef.current = null;
      }
    };
  }, [currentScreen, leafletLoaded, currentFarm]);

  // Clear polygon
  const clearPolygon = () => {
    if (drawnItemsRef.current) {
      drawnItemsRef.current.clearLayers();
    }
    setDrawnPolygon(null);
  };

  // Get my location
  const getMyLocation = () => {
    if (!navigator.geolocation) {
      showToast("เบราว์เซอร์ไม่รองรับ GPS");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        if (drawMapRef.current) {
          drawMapRef.current.setView([pos.coords.latitude, pos.coords.longitude], CONFIG.FARM_ZOOM);
        }
      },
      () => {
        showToast("ไม่สามารถระบุตำแหน่งได้");
      },
      { enableHighAccuracy: true }
    );
  };

  // Proceed to form
  const proceedToForm = () => {
    if (!drawnPolygon || drawnPolygon.length < 3) {
      showToast("กรุณาวาดขอบเขตแปลง");
      return;
    }
    setCurrentScreen("form");
  };

  return (
    <>
      {/* External Scripts */}
      <Script
        src="https://static.line-scdn.net/liff/edge/2/sdk.js"
        onLoad={() => setScriptsLoaded(true)}
      />
      <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
      <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/leaflet.draw/1.0.4/leaflet.draw.css" />
      <Script
        src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"
        onLoad={() => setLeafletLoaded(true)}
      />
      <Script
        src="https://cdnjs.cloudflare.com/ajax/libs/leaflet.draw/1.0.4/leaflet.draw.js"
        onLoad={() => setLeafletDrawLoaded(true)}
      />

      <style jsx global>{`
        * {
          -webkit-tap-highlight-color: transparent;
        }
        body {
          font-family: "Sarabun", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
          overscroll-behavior: none;
        }
        .leaflet-draw-toolbar a {
          background-size: 24px 24px;
        }
        @keyframes slideUp {
          from {
            opacity: 0;
            transform: translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>

      {/* Loading Overlay */}
      {loading && (
        <div className="fixed inset-0 bg-white/90 flex items-center justify-center z-[9999]">
          <div className="text-center">
            <div className="w-12 h-12 border-4 border-gray-200 border-t-green-500 rounded-full animate-spin mx-auto mb-4" />
            <p className="text-gray-600">กำลังโหลด...</p>
          </div>
        </div>
      )}

      {/* Toast */}
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
            {userProfile && (
              <p className="text-sm text-gray-500 mt-1">สวัสดี, {userProfile.displayName}</p>
            )}
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
                  onClick={() => {
                    resetForm();
                    setCurrentScreen("draw");
                  }}
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
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold text-gray-900">{farm.name}</h3>
                          {farm.is_default && <span className="text-yellow-500 text-sm">&#9733;</span>}
                        </div>
                        <p className="text-sm text-gray-500 mt-1">{RICE_TYPES[farm.rice_type] || farm.rice_type}</p>
                      </div>
                      <span className="text-xs text-gray-400">{formatDate(farm.planting_date)}</span>
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
                    </div>
                  </div>
                ))}
              </div>
            )}
          </main>

          {farms.length > 0 && (
            <footer className="fixed bottom-0 left-0 right-0 p-4 bg-white border-t border-gray-200">
              <button
                onClick={() => {
                  resetForm();
                  setCurrentScreen("draw");
                }}
                className="w-full bg-green-600 text-white py-4 rounded-xl font-medium shadow-lg shadow-green-600/30 active:scale-95 transition-transform"
              >
                + เพิ่มแปลงใหม่
              </button>
            </footer>
          )}
        </div>
      )}

      {/* Screen: Draw Map */}
      {currentScreen === "draw" && (
        <div className="h-dvh flex flex-col">
          <header className="bg-white border-b border-gray-200 px-4 py-4 flex items-center gap-3 z-20">
            <button
              onClick={() => {
                resetForm();
                setCurrentScreen("farms");
              }}
              className="p-2 -ml-2 rounded-lg hover:bg-gray-100 active:bg-gray-200"
            >
              <svg className="w-6 h-6 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <h1 className="text-lg font-bold text-gray-900">วาดขอบเขตแปลง</h1>
          </header>

          <div className="flex-1 relative" style={{ minHeight: 0 }}>
            <div
              ref={mapContainerRef}
              className="absolute inset-0"
              style={{ zIndex: 1 }}
            />

            <div className="absolute top-4 right-4 z-[1000] flex flex-col gap-2">
              <button
                onClick={clearPolygon}
                className="bg-white p-3 rounded-xl shadow-lg active:bg-gray-100 transition-colors"
              >
                <svg className="w-5 h-5 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
              <button
                onClick={getMyLocation}
                className="bg-white p-3 rounded-xl shadow-lg active:bg-gray-100 transition-colors"
              >
                <svg className="w-5 h-5 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </button>
            </div>

            {!drawnPolygon && (
              <div className="absolute bottom-24 left-4 right-4 z-[1000] bg-white/95 backdrop-blur rounded-xl p-4 shadow-lg text-center">
                <p className="text-gray-700 font-medium">กดปุ่มรูปหลายเหลี่ยมเพื่อวาดขอบเขตแปลง</p>
                <p className="text-gray-500 text-sm mt-1">วาดอย่างน้อย 3 จุดเพื่อสร้างรูปหลายเหลี่ยม</p>
              </div>
            )}
          </div>

          <footer className="p-4 bg-white border-t border-gray-200 z-20">
            <button
              onClick={proceedToForm}
              disabled={!drawnPolygon || drawnPolygon.length < 3}
              className={`w-full py-4 rounded-xl font-medium transition-all ${
                drawnPolygon && drawnPolygon.length >= 3
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

              <div className="bg-white rounded-2xl p-4 shadow-sm">
                <label className="block text-sm font-medium text-gray-700 mb-2">พันธุ์ข้าว</label>
                <select
                  value={riceType}
                  onChange={(e) => setRiceType(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none transition-all appearance-none bg-white"
                >
                  <option value="">เลือกพันธุ์ข้าว</option>
                  {Object.entries(RICE_TYPES).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="bg-white rounded-2xl p-4 shadow-sm">
                <label className="block text-sm font-medium text-gray-700 mb-2">วันที่เพาะปลูก</label>
                <input
                  type="date"
                  value={plantingDate}
                  onChange={(e) => setPlantingDate(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none transition-all"
                />
              </div>

              <div className="bg-white rounded-2xl p-4 shadow-sm">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isDefault}
                    onChange={(e) => setIsDefault(e.target.checked)}
                    className="w-5 h-5 text-green-600 border-gray-300 rounded focus:ring-green-500"
                  />
                  <span className="text-gray-700 font-medium">ตั้งเป็นแปลงหลัก</span>
                </label>
              </div>

              {drawnPolygon && (
                <div className="bg-green-50 rounded-2xl p-4 text-center">
                  <p className="text-sm text-green-700">พื้นที่แปลง</p>
                  <p className="text-2xl font-bold text-green-800 mt-1">
                    {formatArea(calculateArea(drawnPolygon))}
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
                loading 
                  ? "bg-gray-400 text-gray-200 cursor-wait" 
                  : "bg-green-600 text-white shadow-green-600/30"
              }`}
            >
              {loading ? "กำลังบันทึก..." : "บันทึก"}
            </button>
            {isEditing && (
              <button
                onClick={deleteFarm}
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
            <h1 className="text-lg font-bold text-gray-900">{currentFarm.name}</h1>
          </header>

          <div className="flex-1 relative" style={{ minHeight: 0 }}>
            <div
              ref={previewMapContainerRef}
              className="absolute inset-0"
              style={{ zIndex: 1 }}
            />

            <div className="absolute bottom-4 left-4 right-4 z-[1000] bg-white/95 backdrop-blur rounded-2xl p-4 shadow-lg">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm text-gray-500">พันธุ์ข้าว</p>
                  <p className="font-semibold text-gray-900">{RICE_TYPES[currentFarm.rice_type] || currentFarm.rice_type}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm text-gray-500">วันที่เพาะปลูก</p>
                  <p className="font-semibold text-gray-900">{formatDate(currentFarm.planting_date)}</p>
                </div>
              </div>
              <div className="mt-3 pt-3 border-t border-gray-200">
                <p className="text-sm text-gray-500">พื้นที่</p>
                <p className="font-semibold text-green-600">
                  {currentFarm.polygon ? formatArea(calculateArea(currentFarm.polygon)) : "-"}
                </p>
              </div>
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
