const WEB_APP_URL = "https://script.google.com/macros/s/AKfycbwCJfGjSYidRhkHcD9fNRZ8jYHCPgWZzECcbcN5i4kyd_DIrNlqTBplJE0leecpL5LX/exec"; 

let watchId = null;
let lastPosition = null;
let lastUpdateTime = 0;
let videoInterval = null;
const INTERVAL_TIME = 2 * 60 * 1000; // 2 minutos

const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const workerNameInput = document.getElementById('workerName');
const statusText = document.getElementById('status');
const countdownText = document.getElementById('countdown');
const speedText = document.getElementById('speed');
const distanceText = document.getElementById('distance');
const pendingCountText = document.getElementById('pendingCount');
const logTableBody = document.querySelector('#logTable tbody');

updatePendingCount();

startBtn.addEventListener('click', startTracking);
stopBtn.addEventListener('click', stopTracking);

function startTracking() {
    const name = workerNameInput.value.trim();
    if (!name) return alert("Por favor, introduce el nombre del trabajador.");
    if (!navigator.geolocation) return alert("El GPS no está disponible.");

    workerNameInput.disabled = true;
    startBtn.disabled = true;
    stopBtn.disabled = false;
    statusText.textContent = "Rastreando en tiempo real con GPS...";
    statusText.style.color = "#38a169";
    countdownText.textContent = "Modo Continuo Forzado Activo";

    // --- ACTIVAR TRUCO DE VIDEO FANTASMA ANTI-SUSPENSIÓN ---
    activarVideoFantasma();

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

// Genera una transmisión de video falsa para engañar al sistema operativo del teléfono
function activarVideoFantasma() {
    const video = document.getElementById('videoFantasma');
    const canvas = document.createElement('canvas');
    canvas.width = 10;
    canvas.height = 10;
    const ctx = canvas.getContext('2d');
    
    // Dibujamos un cuadro parpadeante invisible de forma infinita
    videoInterval = setInterval(() => {
        ctx.fillStyle = ctx.fillStyle === '#000000' ? '#ffffff' : '#000000';
        ctx.fillRect(0, 0, 10, 10);
    }, 1000);

    const stream = canvas.captureStream(10); // 10 cuadros por segundo
    video.srcObject = stream;
    video.play().catch(err => console.log("Bloqueo de reproducción automática evitado"));
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

    // Filtro anti-ruido a 10 metros
    const UMBRAL_MOVIMIENTO_METROS = 10; 
    if (distanceMeters < UMBRAL_MOVIMIENTO_METROS) {
        distanceMeters = 0;
    }

    const timeElapsedHours = (currentTime - lastUpdateTime) / 1000 / 3600;
    const distanceKm = distanceMeters / 1000;
    
    // Si hubo movimiento real calcula velocidad usando distancia, si no, usa la directa del chip GPS (o 0)
    const speedKmh = distanceMeters > 0 ? (distanceKm / timeElapsedHours) : (currentCoords.speed * 3.6 || 0);

    speedText.textContent = speedKmh.toFixed(2);
    distanceText.textContent = distanceMeters.toFixed(2);
    
    const timestamp = new Date().toLocaleTimeString();
    const recordId = currentTime.toString();

    saveRecordLocally(recordId, workerNameInput.value.trim(), timestamp, distanceMeters, speedKmh);
    agregarFilaTabla(recordId, timestamp, distanceMeters, speedKmh);
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
    updatePendingCount();
}

function agregarFilaTabla(id, hora, distancia, velocidad) {
    const row = document.createElement('tr');
    row.id = `row-${id}`;
    row.innerHTML = `
        <td>${hora}</td>
        <td>${distancia.toFixed(1)}</td>
        <td>${velocidad.toFixed(2)}</td>
        <td class="sync-status sync-pending">⌛ Local</td>
    `;
    logTableBody.appendChild(row);
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

        fetch(urlConParametros, { method: "POST", mode: "no-cors" })
        .then(() => {
            record.synced = true;
            const cell = document.querySelector(`#row-${record.id} .sync-status`);
            if (cell) {
                cell.textContent = "☁️ OK";
                cell.className = "sync-status sync-ok";
            }
            
            const updatedData = JSON.parse(localStorage.getItem('gps_tracks') || '[]');
            const index = updatedData.findIndex(r => r.id === record.id);
            if(index !== -1) updatedData[index].synced = true;
            localStorage.setItem('gps_tracks', JSON.stringify(updatedData));
            updatePendingCount();
        })
        .catch(err => console.error("Error al enviar:", err));
    });
}

window.addEventListener('online', syncData);

function stopTracking() {
    if (watchId) {
        navigator.geolocation.clearWatch(watchId);
        watchId = null;
    }
    if (videoInterval) {
        clearInterval(videoInterval);
    }
    const video = document.getElementById('videoFantasma');
    if (video) {
        video.srcObject = null;
    }
    workerNameInput.disabled = false;
    startBtn.disabled = false;
    stopBtn.disabled = true;
    statusText.textContent = "Inactivo";
    statusText.style.color = "#1a202c";
    lastPosition = null;
}
