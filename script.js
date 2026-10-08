const WEB_APP_URL = "https://script.google.com/macros/s/AKfycbwCJfGjSYidRhkHcD9fNRZ8jYHCPgWZzECcbcN5i4kyd_DIrNlqTBplJE0leecpL5LX/exec"; 

let watchId = null;
let lastPosition = null;
let lastUpdateTime = 0;
const INTERVAL_TIME = 2 * 60 * 1000; // 2 minutos en milisegundos

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

// Inicializar contador seguro al cargar la página
updatePendingCount();

startBtn.addEventListener('click', startTracking);
stopBtn.addEventListener('click', stopTracking);

function startTracking() {
    const name = workerNameInput.value.trim();
    if (!name) return alert("Por favor, introduce el nombre del trabajador.");
    if (!navigator.geolocation) return alert("El GPS no está disponible en este dispositivo.");

    workerNameInput.disabled = true;
    startBtn.disabled = true;
    stopBtn.disabled = false;
    statusText.textContent = "Rastreando en segundo plano...";
    statusText.style.color = "#38a169";
    countdownText.textContent = "Pantalla segura";

    // --- TRUCO DEL AUDIO FANTASMA ACTIVADO ---
    const audio = document.getElementById('audioFantasma');
    if (audio) {
        audio.muted = false; 
        audio.volume = 0.01; 
        audio.play().catch(err => console.log("El navegador bloqueó el auto-play de audio:", err));
    }

    lastUpdateTime = Date.now();

    watchId = navigator.geolocation.watchPosition(
        processLocationUpdate,
        err => console.error("Error de lectura GPS:", err),
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

    // Si aún no pasan los 2 minutos, guardamos la ubicación actual pero no mandamos reporte
    if (currentTime - lastUpdateTime < INTERVAL_TIME) {
        lastPosition = currentCoords;
        return;
    }

    // Calculamos la distancia recorrida en este tramo
    let distanceMeters = 0;
    if (lastPosition) {
        distanceMeters = calculateHaversine(
            lastPosition.latitude, lastPosition.longitude,
            currentCoords.latitude, currentCoords.longitude
        );
    }

    // --- FILTRO ANTI-RUIDO GPS OPTIMIZADO A 10 METROS ---
    const UMBRAL_MOVIMIENTO_METROS = 15; 
    if (distanceMeters < UMBRAL_MOVIMIENTO_METROS) {
        distanceMeters = 0;
    }

    const timeElapsedHours = (currentTime - lastUpdateTime) / 1000 / 3600;
    const distanceKm = distanceMeters / 1000;
    
    // Si la distancia se filtró a 0, la velocidad en este tramo es automáticamente 0
    const speedKmh = distanceMeters > 0 ? (distanceKm / timeElapsedHours) : 0;

    speedText.textContent = speedKmh.toFixed(2);
    distanceText.textContent = distanceMeters.toFixed(2);
    
    const timestamp = new Date().toLocaleTimeString();
    const recordId = currentTime.toString();

    // Guardar registro de forma local en el teléfono
    saveRecordLocally(recordId, workerNameInput.value.trim(), timestamp, distanceMeters, speedKmh);
    agregarFilaTabla(recordId, timestamp, distanceMeters, speedKmh);
    
    // Intentar subir los datos a Google Sheets
    syncData();

    // Resetear variables para el siguiente ciclo de 2 minutos
    lastPosition = currentCoords;
    lastUpdateTime = currentTime;
}

function calculateHaversine(lat1, lon1, lat2, lon2) {
    const R = 6371e3; // Radio de la Tierra en metros
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

// Corrección total usando inicializador de corchetes '[]'
function updatePendingCount() {
    const localData = JSON.parse(localStorage.getItem('gps_tracks') || '[]');
    const pending = localData.filter(r => !r.synced).length;
    pendingCountText.textContent = pending;
}

function syncData() {
    if (!navigator.onLine) return;

    // Corrección total usando inicializador de corchetes '[]'
    let localData = JSON.parse(localStorage.getItem('gps_tracks') || '[]');
    
    localData.forEach(record => {
        if (record.synced) return;

        // Construcción limpia de parámetros en la URL
        const urlConParametros = `${WEB_APP_URL}?trabajador=${encodeURIComponent(record.worker)}&hora=${encodeURIComponent(record.hora)}&distancia=${encodeURIComponent(record.dist)}&velocidad=${encodeURIComponent(record.vel)}`;

        console.log("Sincronizando con Google Sheets...");

        fetch(urlConParametros, { 
            method: "POST", 
            mode: "no-cors" 
        })
        .then(() => {
            record.synced = true;
            const cell = document.querySelector(`#row-${record.id} .sync-status`);
            if (cell) {
                cell.textContent = "☁️ OK";
                cell.className = "sync-status sync-ok";
            }
            
            // Corrección total usando inicializador de corchetes '[]'
            const updatedData = JSON.parse(localStorage.getItem('gps_tracks') || '[]');
            const index = updatedData.findIndex(r => r.id === record.id);
            if(index !== -1) updatedData[index].synced = true;
            localStorage.setItem('gps_tracks', JSON.stringify(updatedData));
            
            updatePendingCount();
        })
        .catch(err => console.error("Fallo de red al enviar:", err));
    });
}

window.addEventListener('online', syncData);

function stopTracking() {
    if (watchId) {
        navigator.geolocation.clearWatch(watchId);
        watchId = null;
    }

    const audio = document.getElementById('audioFantasma');
    if (audio) {
        audio.pause();
    }

    workerNameInput.disabled = false;
    startBtn.disabled = false;
    stopBtn.disabled = true;
    statusText.textContent = "Inactivo";
    statusText.style.color = "#1a202c";
    lastPosition = null;
}
// Registrar el Service Worker local de forma nativa
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js')
        .then(() => console.log("Service Worker registrado con éxito"))
        .catch(err => console.error("Error al registrar el Service Worker:", err));
    });
}
