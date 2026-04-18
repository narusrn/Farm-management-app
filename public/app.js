// ==========================================
// RiceFit - LINE LIFF Farm Management App
// ==========================================

// Configuration
const CONFIG = {
  LIFF_ID: 'YOUR_LIFF_ID', // Replace with your LIFF ID
  API_BASE_URL: 'https://your-api.com', // Replace with your API URL
  DEFAULT_CENTER: [15.8700, 100.9925], // Thailand center
  DEFAULT_ZOOM: 6,
  FARM_ZOOM: 15
};

// State Management
const state = {
  userId: null,
  userProfile: null,
  farms: [],
  currentFarm: null,
  drawnPolygon: null,
  isEditing: false,
  editingFarmId: null
};

// Map instances
let drawMap = null;
let previewMap = null;
let drawnItems = null;
let drawControl = null;

// ==========================================
// LIFF Initialization
// ==========================================

async function initializeLiff() {
  try {
    await liff.init({ liffId: CONFIG.LIFF_ID });
    
    if (!liff.isLoggedIn()) {
      // For development/testing, use mock data
      if (window.location.hostname === 'localhost' || CONFIG.LIFF_ID === 'YOUR_LIFF_ID') {
        console.log('[DEV] Using mock user data');
        state.userId = 'mock_user_123';
        state.userProfile = { displayName: 'ผู้ใช้ทดสอบ' };
        hideLoading();
        await loadFarms();
        navigateTo('farms');
        return;
      }
      liff.login();
      return;
    }
    
    const profile = await liff.getProfile();
    state.userId = profile.userId;
    state.userProfile = profile;
    
    hideLoading();
    await loadFarms();
    navigateTo('farms');
    
  } catch (error) {
    console.error('LIFF init error:', error);
    // Fallback for development
    state.userId = 'mock_user_123';
    state.userProfile = { displayName: 'ผู้ใช้ทดสอบ' };
    hideLoading();
    await loadFarms();
    navigateTo('farms');
  }
}

// ==========================================
// API Functions
// ==========================================

async function loadFarms() {
  try {
    showLoading();
    
    // Mock data for development
    if (CONFIG.API_BASE_URL === 'https://your-api.com') {
      // Simulate API delay
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Load from localStorage for persistence during development
      const savedFarms = localStorage.getItem('ricefit_farms');
      state.farms = savedFarms ? JSON.parse(savedFarms) : [];
      
      hideLoading();
      renderFarmsList();
      return;
    }
    
    const response = await fetch(`${CONFIG.API_BASE_URL}/farm?user_id=${state.userId}`);
    if (!response.ok) throw new Error('Failed to fetch farms');
    
    const data = await response.json();
    state.farms = data.farms || [];
    
    hideLoading();
    renderFarmsList();
    
  } catch (error) {
    console.error('Load farms error:', error);
    hideLoading();
    showToast('ไม่สามารถโหลดข้อมูลได้');
    state.farms = [];
    renderFarmsList();
  }
}

async function saveFarmToAPI(farmData) {
  try {
    showLoading();
    
    // Mock save for development
    if (CONFIG.API_BASE_URL === 'https://your-api.com') {
      await new Promise(resolve => setTimeout(resolve, 500));
      
      if (state.isEditing && state.editingFarmId) {
        // Update existing farm
        const index = state.farms.findIndex(f => f.id === state.editingFarmId);
        if (index !== -1) {
          state.farms[index] = { ...state.farms[index], ...farmData };
        }
      } else {
        // Create new farm
        const newFarm = {
          id: 'farm_' + Date.now(),
          ...farmData,
          created_at: new Date().toISOString()
        };
        state.farms.push(newFarm);
      }
      
      // Handle default farm logic
      if (farmData.is_default) {
        state.farms = state.farms.map(f => ({
          ...f,
          is_default: f.id === (state.editingFarmId || state.farms[state.farms.length - 1].id)
        }));
      }
      
      // Save to localStorage
      localStorage.setItem('ricefit_farms', JSON.stringify(state.farms));
      
      hideLoading();
      showToast('บันทึกสำเร็จ');
      resetFormState();
      await loadFarms();
      navigateTo('farms');
      return;
    }
    
    const url = state.isEditing 
      ? `${CONFIG.API_BASE_URL}/farm/${state.editingFarmId}`
      : `${CONFIG.API_BASE_URL}/farm`;
    
    const method = state.isEditing ? 'PUT' : 'POST';
    
    const response = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(farmData)
    });
    
    if (!response.ok) throw new Error('Failed to save farm');
    
    hideLoading();
    showToast('บันทึกสำเร็จ');
    resetFormState();
    await loadFarms();
    navigateTo('farms');
    
  } catch (error) {
    console.error('Save farm error:', error);
    hideLoading();
    showToast('ไม่สามารถบันทึกได้');
  }
}

async function deleteFarmFromAPI(farmId) {
  if (!confirm('ต้องการลบแปลงนี้หรือไม่?')) return;
  
  try {
    showLoading();
    
    // Mock delete for development
    if (CONFIG.API_BASE_URL === 'https://your-api.com') {
      await new Promise(resolve => setTimeout(resolve, 500));
      state.farms = state.farms.filter(f => f.id !== farmId);
      localStorage.setItem('ricefit_farms', JSON.stringify(state.farms));
      
      hideLoading();
      showToast('ลบแปลงสำเร็จ');
      resetFormState();
      await loadFarms();
      navigateTo('farms');
      return;
    }
    
    const response = await fetch(`${CONFIG.API_BASE_URL}/farm/${farmId}`, {
      method: 'DELETE'
    });
    
    if (!response.ok) throw new Error('Failed to delete farm');
    
    hideLoading();
    showToast('ลบแปลงสำเร็จ');
    resetFormState();
    await loadFarms();
    navigateTo('farms');
    
  } catch (error) {
    console.error('Delete farm error:', error);
    hideLoading();
    showToast('ไม่สามารถลบได้');
  }
}

// ==========================================
// Navigation
// ==========================================

function navigateTo(screen) {
  // Hide all screens
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  
  // Show target screen
  const targetScreen = document.getElementById(`screen-${screen}`);
  if (targetScreen) {
    targetScreen.classList.add('active');
    targetScreen.classList.add('fade-in');
  }
  
  // Screen-specific initialization
  switch (screen) {
    case 'farms':
      updateUserInfo();
      break;
    case 'draw':
      setTimeout(() => initDrawMap(), 100);
      break;
    case 'form':
      updateFormTitle();
      break;
    case 'preview':
      setTimeout(() => initPreviewMap(), 100);
      break;
  }
}

// ==========================================
// Farms List
// ==========================================

function renderFarmsList() {
  const listContainer = document.getElementById('farms-list');
  const emptyState = document.getElementById('empty-state');
  const footer = document.querySelector('#screen-farms footer');
  
  if (state.farms.length === 0) {
    listContainer.innerHTML = '';
    emptyState.classList.remove('hidden');
    emptyState.classList.add('flex');
    footer.classList.add('hidden');
    return;
  }
  
  emptyState.classList.add('hidden');
  emptyState.classList.remove('flex');
  footer.classList.remove('hidden');
  
  listContainer.innerHTML = state.farms.map(farm => `
    <div class="bg-white rounded-2xl p-4 shadow-sm fade-in">
      <div class="flex items-start justify-between mb-3">
        <div>
          <div class="flex items-center gap-2">
            <h3 class="font-semibold text-gray-900">${escapeHtml(farm.name)}</h3>
            ${farm.is_default ? '<span class="text-yellow-500 text-sm">&#9733;</span>' : ''}
          </div>
          <p class="text-sm text-gray-500 mt-1">${getRiceTypeName(farm.rice_type)}</p>
        </div>
        <span class="text-xs text-gray-400">${formatDate(farm.planting_date)}</span>
      </div>
      <div class="flex gap-2">
        <button onclick="viewFarm('${farm.id}')" class="flex-1 bg-gray-100 text-gray-700 py-2.5 rounded-xl text-sm font-medium active:bg-gray-200 transition-colors">
          ดูแผนที่
        </button>
        <button onclick="editFarm('${farm.id}')" class="flex-1 bg-green-50 text-green-700 py-2.5 rounded-xl text-sm font-medium active:bg-green-100 transition-colors">
          แก้ไข
        </button>
      </div>
    </div>
  `).join('');
}

function updateUserInfo() {
  const userInfoEl = document.getElementById('user-info');
  if (state.userProfile) {
    userInfoEl.textContent = `สวัสดี, ${state.userProfile.displayName}`;
  }
}

// ==========================================
// Map Drawing
// ==========================================

function initDrawMap() {
  console.log('[v0] initDrawMap called');
  
  const mapContainer = document.getElementById('map');
  console.log('[v0] Map container:', mapContainer);
  console.log('[v0] Map container size:', mapContainer?.offsetWidth, 'x', mapContainer?.offsetHeight);
  
  if (drawMap) {
    console.log('[v0] Removing existing map');
    drawMap.remove();
    drawMap = null;
  }
  
  try {
    drawMap = L.map('map', {
      center: CONFIG.DEFAULT_CENTER,
      zoom: CONFIG.DEFAULT_ZOOM,
      zoomControl: true
    });
    console.log('[v0] Map created successfully');
    
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors',
      maxZoom: 19
    }).addTo(drawMap);
    console.log('[v0] Tile layer added');
  
  // Initialize drawn items layer
  drawnItems = new L.FeatureGroup();
  drawMap.addLayer(drawnItems);
  
  // Add draw control
  drawControl = new L.Control.Draw({
    draw: {
      polygon: {
        allowIntersection: false,
        showArea: true,
        shapeOptions: {
          color: '#22c55e',
          fillColor: '#22c55e',
          fillOpacity: 0.3
        }
      },
      polyline: false,
      rectangle: false,
      circle: false,
      marker: false,
      circlemarker: false
    },
    edit: {
      featureGroup: drawnItems,
      remove: false
    }
  });
  drawMap.addControl(drawControl);
  console.log('[v0] Draw control added');
  
  // Handle draw events
  drawMap.on(L.Draw.Event.CREATED, function(e) {
    drawnItems.clearLayers();
    drawnItems.addLayer(e.layer);
    state.drawnPolygon = e.layer.getLatLngs()[0].map(ll => [ll.lat, ll.lng]);
    updateNextButton();
    document.getElementById('draw-hint').classList.add('hidden');
  });
  
  drawMap.on(L.Draw.Event.EDITED, function(e) {
    const layers = e.layers;
    layers.eachLayer(function(layer) {
      state.drawnPolygon = layer.getLatLngs()[0].map(ll => [ll.lat, ll.lng]);
    });
  });
  
  // If editing, show existing polygon
  if (state.isEditing && state.currentFarm && state.currentFarm.polygon) {
    const polygon = L.polygon(state.currentFarm.polygon, {
      color: '#22c55e',
      fillColor: '#22c55e',
      fillOpacity: 0.3
    });
    drawnItems.addLayer(polygon);
    state.drawnPolygon = state.currentFarm.polygon;
    drawMap.fitBounds(polygon.getBounds(), { padding: [50, 50] });
    updateNextButton();
    document.getElementById('draw-hint').classList.add('hidden');
  } else {
    document.getElementById('draw-hint').classList.remove('hidden');
    getMyLocation();
  }
  
  // Invalidate size multiple times to ensure proper rendering
  setTimeout(() => {
    if (drawMap) {
      drawMap.invalidateSize();
      console.log('[v0] Map size invalidated (100ms)');
    }
  }, 100);
  
  setTimeout(() => {
    if (drawMap) {
      drawMap.invalidateSize();
      console.log('[v0] Map size invalidated (500ms)');
    }
  }, 500);
  
  } catch (error) {
    console.error('[v0] Error initializing map:', error);
  }
}

function clearPolygon() {
  if (drawnItems) {
    drawnItems.clearLayers();
  }
  state.drawnPolygon = null;
  updateNextButton();
  document.getElementById('draw-hint').classList.remove('hidden');
}

function getMyLocation() {
  if (!navigator.geolocation) {
    showToast('เบราว์เซอร์ไม่รองรับ GPS');
    return;
  }
  
  navigator.geolocation.getCurrentPosition(
    (position) => {
      const { latitude, longitude } = position.coords;
      if (drawMap) {
        drawMap.setView([latitude, longitude], CONFIG.FARM_ZOOM);
      }
    },
    (error) => {
      console.log('GPS error:', error);
    },
    { enableHighAccuracy: true }
  );
}

function updateNextButton() {
  const btn = document.getElementById('btn-next');
  if (state.drawnPolygon && state.drawnPolygon.length >= 3) {
    btn.disabled = false;
    btn.classList.remove('bg-gray-300', 'text-gray-500');
    btn.classList.add('bg-green-600', 'text-white', 'shadow-lg', 'shadow-green-600/30', 'active:scale-95');
  } else {
    btn.disabled = true;
    btn.classList.add('bg-gray-300', 'text-gray-500');
    btn.classList.remove('bg-green-600', 'text-white', 'shadow-lg', 'shadow-green-600/30', 'active:scale-95');
  }
}

function proceedToForm() {
  if (!state.drawnPolygon || state.drawnPolygon.length < 3) {
    showToast('กรุณาวาดขอบเขตแปลง');
    return;
  }
  
  // Calculate area
  const area = calculateArea(state.drawnPolygon);
  document.getElementById('area-display').textContent = formatArea(area);
  
  navigateTo('form');
}

// ==========================================
// Farm Form
// ==========================================

function updateFormTitle() {
  const title = document.getElementById('form-title');
  const deleteBtn = document.getElementById('btn-delete');
  
  if (state.isEditing) {
    title.textContent = 'แก้ไขแปลง';
    deleteBtn.classList.remove('hidden');
    
    // Pre-fill form
    if (state.currentFarm) {
      document.getElementById('farm-name').value = state.currentFarm.name || '';
      document.getElementById('rice-type').value = state.currentFarm.rice_type || '';
      document.getElementById('planting-date').value = state.currentFarm.planting_date || '';
      document.getElementById('is-default').checked = state.currentFarm.is_default || false;
      
      // Calculate and display area
      if (state.drawnPolygon) {
        const area = calculateArea(state.drawnPolygon);
        document.getElementById('area-display').textContent = formatArea(area);
      }
    }
  } else {
    title.textContent = 'เพิ่มแปลงใหม่';
    deleteBtn.classList.add('hidden');
    clearForm();
  }
}

function clearForm() {
  document.getElementById('farm-name').value = '';
  document.getElementById('rice-type').value = '';
  document.getElementById('planting-date').value = '';
  document.getElementById('is-default').checked = false;
}

function saveFarm() {
  const name = document.getElementById('farm-name').value.trim();
  const riceType = document.getElementById('rice-type').value;
  const plantingDate = document.getElementById('planting-date').value;
  const isDefault = document.getElementById('is-default').checked;
  
  if (!name) {
    showToast('กรุณากรอกชื่อแปลง');
    return;
  }
  
  if (!riceType) {
    showToast('กรุณาเลือกพันธุ์ข้าว');
    return;
  }
  
  if (!plantingDate) {
    showToast('กรุณาเลือกวันที่เพาะปลูก');
    return;
  }
  
  if (!state.drawnPolygon) {
    showToast('กรุณาวาดขอบเขตแปลง');
    return;
  }
  
  const farmData = {
    user_id: state.userId,
    name,
    polygon: state.drawnPolygon,
    rice_type: riceType,
    planting_date: plantingDate,
    is_default: isDefault
  };
  
  saveFarmToAPI(farmData);
}

function deleteFarm() {
  if (state.editingFarmId) {
    deleteFarmFromAPI(state.editingFarmId);
  }
}

function resetFormState() {
  state.isEditing = false;
  state.editingFarmId = null;
  state.currentFarm = null;
  state.drawnPolygon = null;
  clearForm();
}

// ==========================================
// View & Edit Farm
// ==========================================

function viewFarm(farmId) {
  const farm = state.farms.find(f => f.id === farmId);
  if (!farm) return;
  
  state.currentFarm = farm;
  
  // Update preview info
  document.getElementById('preview-title').textContent = farm.name;
  document.getElementById('preview-rice-type').textContent = getRiceTypeName(farm.rice_type);
  document.getElementById('preview-planting-date').textContent = formatDate(farm.planting_date);
  
  if (farm.polygon) {
    const area = calculateArea(farm.polygon);
    document.getElementById('preview-area').textContent = formatArea(area);
  }
  
  navigateTo('preview');
}

function initPreviewMap() {
  if (previewMap) {
    previewMap.remove();
  }
  
  previewMap = L.map('preview-map').setView(CONFIG.DEFAULT_CENTER, CONFIG.DEFAULT_ZOOM);
  
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap contributors'
  }).addTo(previewMap);
  
  if (state.currentFarm && state.currentFarm.polygon) {
    const polygon = L.polygon(state.currentFarm.polygon, {
      color: '#22c55e',
      fillColor: '#22c55e',
      fillOpacity: 0.3
    }).addTo(previewMap);
    
    previewMap.fitBounds(polygon.getBounds(), { padding: [50, 50] });
  }
  
  setTimeout(() => previewMap.invalidateSize(), 100);
}

function editFarm(farmId) {
  const farm = state.farms.find(f => f.id === farmId);
  if (!farm) return;
  
  state.isEditing = true;
  state.editingFarmId = farmId;
  state.currentFarm = farm;
  state.drawnPolygon = farm.polygon;
  
  navigateTo('draw');
}

function editCurrentFarm() {
  if (state.currentFarm) {
    editFarm(state.currentFarm.id);
  }
}

// ==========================================
// Utility Functions
// ==========================================

function showLoading() {
  document.getElementById('loading-overlay').style.display = 'flex';
}

function hideLoading() {
  document.getElementById('loading-overlay').style.display = 'none';
}

function showToast(message) {
  const toast = document.getElementById('toast');
  const toastMessage = document.getElementById('toast-message');
  
  toastMessage.textContent = message;
  toast.classList.remove('translate-y-20', 'opacity-0');
  toast.classList.add('translate-y-0', 'opacity-100');
  
  setTimeout(() => {
    toast.classList.add('translate-y-20', 'opacity-0');
    toast.classList.remove('translate-y-0', 'opacity-100');
  }, 2500);
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function formatDate(dateString) {
  if (!dateString) return '-';
  const date = new Date(dateString);
  const options = { year: 'numeric', month: 'short', day: 'numeric' };
  return date.toLocaleDateString('th-TH', options);
}

function getRiceTypeName(type) {
  const types = {
    'KDML105': 'ข้าวหอมมะลิ 105',
    'RD6': 'กข6',
    'RD15': 'กข15',
    'RD21': 'กข21',
    'RD41': 'กข41',
    'RD47': 'กข47',
    'RD49': 'กข49',
    'CHAINAT1': 'ชัยนาท 1',
    'SUPHANBURI1': 'สุพรรณบุรี 1',
    'OTHER': 'อื่นๆ'
  };
  return types[type] || type || '-';
}

function calculateArea(polygon) {
  if (!polygon || polygon.length < 3) return 0;
  
  // Convert to coordinates for area calculation
  const coords = polygon.map(p => ({ lat: p[0], lng: p[1] }));
  
  // Shoelace formula with geodesic correction
  let area = 0;
  const n = coords.length;
  
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    area += coords[i].lng * coords[j].lat;
    area -= coords[j].lng * coords[i].lat;
  }
  
  area = Math.abs(area) / 2;
  
  // Convert to square meters (approximate for small areas)
  const lat = coords.reduce((sum, c) => sum + c.lat, 0) / n;
  const metersPerDegree = 111320 * Math.cos(lat * Math.PI / 180);
  const areaInSqMeters = area * metersPerDegree * metersPerDegree;
  
  return areaInSqMeters;
}

function formatArea(sqMeters) {
  // 1 rai = 1600 square meters
  const rai = sqMeters / 1600;
  
  if (rai >= 1) {
    return rai.toFixed(2) + ' ไร่';
  } else {
    const sqWa = sqMeters / 4; // 1 square wa = 4 square meters
    return sqWa.toFixed(0) + ' ตร.วา';
  }
}

// ==========================================
// Initialize App
// ==========================================

document.addEventListener('DOMContentLoaded', initializeLiff);
