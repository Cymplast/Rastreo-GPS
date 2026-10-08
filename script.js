const WEB_APP_URL = "https://script.google.com/macros/s/AKfycbwCJfGjSYidRhkHcD9fNRZ8jYHCPgWZzECcbcN5i4kyd_DIrNlqTBplJE0leecpL5LX/exec"; 

let watchId = null;
let lastPosition = null;
let lastUpdateTime = 0;
const INTERVAL_TIME = 2 * 60 * 1000; // 2 minutos

// Elementos del DOM
const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const workerNameInput = document.getElementById('workerName');
const statusText = document.getElementById('status');
const countdownText = document.getElementById('countdown');
const speedText = document.getElementById('speed');
const distanceText = document.getElementById('distance');
const pendingCountText = document.getElementById('pendingCount');
const logTableBody = document.querySelector('#logTable tbody');

// Cargar registros e intentar sincronizar al abrir la app
updatePendingCount();
renderTablaDesdeStorage();
syncData();

startBtn.addEventListener('click', startTracking);
stopBtn.addEventListener('click', stopTracking);

function startTracking() {
    const name = workerNameInput.value.trim();
    if (!name) return alert("Por favor, introduce el nombre del trabajador.");
    if (!navigator.geolocation) return alert("El GPS no está disponible.");

    workerNameInput.disabled = true;
    startBtn.disabled = true;
    stopBtn.disabled = false;
    statusText.textContent = "Rastreando en segundo plano (Guardado Local)...";
    statusText.style.color = "#38a169";
    countdownText.textContent = "Acumulando datos...";

    lastUpdateTime = Date.now();

    watchId = navigator.geolocation.watchPosition(
        processLocationUpdate,
        err => console.error("Error GPS:", err),
        {
            enableHighAccuracy: true,
            timeout: 10000,
            maximumAge: 0
        }
    );
}

function processLocationUpdate(position) {
    const currentTime = Date.now();
    const currentCoords = position.coords;

    if (currentTime - lastUpdateTime < INTERVAL_TIME) {
        lastPosition = currentCoords;
        return;
    }

    let distanceMeters = 0;
    if (lastPosition) {
        distanceMeters = calculateHaversine(
            lastPosition.latitude, lastPosition.longitude,
            currentCoords.latitude, currentCoords.longitude
        );
    }

    // Filtro anti-ruido (10 metros)
    const UMBRAL_MOVIMIENTO_METROS = 10; 
    if (distanceMeters < UMBRAL_MOVIMIENTO_METROS) {
        distanceMeters = 0;
    }

    const timeElapsedHours = (currentTime - lastUpdateTime) / 1000 / 3600;
    const distanceKm = distanceMeters / 1000;
    const speedKmh = distanceMeters > 0 ? (distanceKm / timeElapsedHours) : 0;

    speedText.textContent = speedKmh.toFixed(2);
    distanceText.textContent = distanceMeters.toFixed(2);
    
    const timestamp = new Date().toLocaleTimeString();
    const recordId = currentTime.toString();

    // Guardar siempre de forma local primero
    saveRecordLocally(recordId, workerNameInput.value.trim(), timestamp, distanceMeters, speedKmh);
    
    // Intentar enviar inmediatamente (solo funcionará si la pantalla sigue encendida)
    syncData();

    lastPosition = currentCoords;
    lastUpdateTime = currentTime;
}

function calculateHaversine(lat1, lon1, lat2, lon2) {
    const R = 6371e3;
    const p1 = lat1 * Math.PI / 180;
    const p2 = lat2 * Math.PI / 180;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(p1) * Math.cos(p2) *
              Math.sin(dLon/2) * Math.sin(dLon/2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function saveRecordLocally(id, worker, hora, dist, vel) {
    const localData = JSON.parse(localStorage.getItem('gps_tracks') || '[]');
    localData.push({ id, worker, hora, dist: dist.toFixed(1), vel: vel.toFixed(2), synced: false });
    localStorage.setItem('gps_tracks', JSON.stringify(localData));
    
    // Refrescar la interfaz visual
    renderTablaDesdeStorage();
    updatePendingCount();
}

function renderTablaDesdeStorage() {
    logTableBody.innerHTML = '';
    const localData = JSON.parse(localStorage.getItem('gps_tracks') || '[]');
    
    localData.forEach(record => {
        const row = document.createElement('tr');
        row.id = `row-${record.id}`;
        row.innerHTML = `
            <td>${record.hora}</td>
            <td>${record.dist}</td>
            <td>${record.vel}</td>
            <td class="sync-status ${record.synced ? 'sync-ok' : 'sync-pending'}">
                ${record.synced ? '☁️ OK' : '⌛ Local'}
            </td>
        `;
        logTableBody.appendChild(row);
    });
}

function updatePendingCount() {
    const localData = JSON.parse(localStorage.getItem('gps_tracks') || '[]');
    const pending = localData.filter(r => !r.synced).length;
    pendingCountText.textContent = pending;
}

function syncData() {
    if (!navigator.onLine) return;

    let localData = JSON.parse(localStorage.getItem('gps_tracks') || '[]');
    
    localData.forEach(record => {
        if (record.synced) return;

        const urlConParametros = `${WEB_APP_URL}?trabajador=${encodeURIComponent(record.worker)}&hora=${encodeURIComponent(record.hora)}&distancia=${encodeURIComponent(record.dist)}&velocidad=${encodeURIComponent(record.vel)}`;

        console.log("Enviando reporte pendiente a Google Sheets...");

        fetch(urlConParametros, { method: "POST", mode: "no-cors" })
        .then(() => {
            // Marcar como sincronizado en la memoria
            let currentData = JSON.parse(localStorage.getItem('gps_tracks') || '[]');
            const index = currentData.findIndex(r => r.id === record.id);
            if(index !== -1) currentData[index].synced = true;
            localStorage.setItem('gps_tracks', JSON.stringify(currentData));
            
            // Actualizar interfaz
            renderTablaDesdeStorage();
            updatePendingCount();
        })
        .catch(err => console.error("Error al sincronizar:", err));
    });
}

// --- DETECTOR MÁGICO: SE DISPARA AL ENCENDER LA PANTALLA O VOLVER A LA APP ---
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
        console.log("Pantalla encendida detectada. Forzando envío de datos pendientes...");
        syncData();
    }
});

// Forzar sincronización si el teléfono recupera internet repentinamente
window.addEventListener('online', syncData);

function stopTracking() {
    if (watchId) {
        navigator.geolocation.clearWatch(watchId);
        watchId = null;
    }
    workerNameInput.disabled = false;
    startBtn.disabled = false;
    stopBtn.disabled = true;
    statusText.textContent = "Inactivo";
    statusText.style.color = "#1a202c";
    lastPosition = null;
}
