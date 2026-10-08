const WEB_APP_URL = "https://script.google.com/macros/s/AKfycbwCJfGjSYidRhkHcD9fNRZ8jYHCPgWZzECcbcN5i4kyd_DIrNlqTBplJE0leecpL5LX/exec"; 

let watchId = null;
let lastPosition = null;
let lastUpdateTime = 0;
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

// Inicializar base de datos local
if (!localStorage.getItem('gps_tracks')) {
    localStorage.setItem('gps_tracks', '[]');
}

updatePendingCount();
renderTablaDesdeStorage();

startBtn.addEventListener('click', () => {
    const name = workerNameInput.value.trim();
    if (!name) return alert("Por favor, introduce el nombre del trabajador.");

    // --- PASO CLAVE: Forzamos una consulta rápida para despertar el cuadro de permisos de Android ---
    navigator.geolocation.getCurrentPosition(
        (pos) => {
            // Si el usuario acepta, arrancamos el rastreador continuo de fondo
            console.log("Permiso GPS concedido.");
            
            workerNameInput.disabled = true;
            startBtn.disabled = true;
            stopBtn.disabled = false;
            statusText.textContent = "Rastreando en segundo plano nativo...";
            statusText.style.color = "#38a169";
            countdownText.textContent = "Modo App Activo";

            lastUpdateTime = Date.now();

            watchId = navigator.geolocation.watchPosition(
                processLocationUpdate,
                err => console.error("Error GPS Nativo:", err),
                { 
                    enableHighAccuracy: true, 
                    timeout: 10000, 
                    maximumAge: 0 
                }
            );
        },
        (err) => {
            // Si el teléfono lo bloquea o el usuario dice que no
            console.error("El permiso de ubicación fue denegado:", err);
            alert("Para que la aplicación funcione, debes aceptar los permisos de ubicación en la pantalla.");
        },
        { enableHighAccuracy: true, timeout: 5000 }
    );
});

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

    if (distanceMeters < 10) distanceMeters = 0;

    const timeElapsedHours = (currentTime - lastUpdateTime) / 1000 / 3600;
    const distanceKm = distanceMeters / 1000;
    const speedKmh = distanceMeters > 0 ? (distanceKm / timeElapsedHours) : (currentCoords.speed * 3.6 || 0);

    const timestamp = new Date().toLocaleTimeString();
    
    saveRecordLocally(currentTime.toString(), workerNameInput.value.trim(), timestamp, distanceMeters, speedKmh);
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
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) + Math.cos(p1) * Math.cos(p2) * Math.sin(dLon/2) * Math.sin(dLon/2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function saveRecordLocally(id, worker, hora, dist, vel) {
    const localData = JSON.parse(localStorage.getItem('gps_tracks') || '[]');
    localData.push({ id, worker, hora, dist: dist.toFixed(1), vel: vel.toFixed(2), synced: false });
    localStorage.setItem('gps_tracks', JSON.stringify(localData));
    renderTablaDesdeStorage();
    updatePendingCount();
}

function renderTablaDesdeStorage() {
    logTableBody.innerHTML = '';
    const localData = JSON.parse(localStorage.getItem('gps_tracks') || '[]');
    localData.forEach(record => {
        const row = document.createElement('tr');
        row.id = `row-${record.id}`;
        row.innerHTML = `<td>${record.hora}</td><td>${record.dist}</td><td>${record.vel}</td><td class="sync-status ${record.synced ? 'sync-ok' : 'sync-pending'}">${record.synced ? '☁️ OK' : '⌛ Local'}</td>`;
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
        
        fetch(urlConParametros, { method: "POST", mode: "no-cors" })
        .then(() => {
            let currentData = JSON.parse(localStorage.getItem('gps_tracks') || '[]');
            const index = currentData.findIndex(r => r.id === record.id);
            if(index !== -1) currentData[index].synced = true;
            localStorage.setItem('gps_tracks', JSON.stringify(currentData));
            renderTablaDesdeStorage();
            updatePendingCount();
        })
        .catch(err => console.error(err));
    });
}

stopBtn.addEventListener('click', () => {
    if (watchId) navigator.geolocation.clearWatch(watchId);
    workerNameInput.disabled = false;
    startBtn.disabled = false;
    stopBtn.disabled = true;
    statusText.textContent = "Inactivo";
    statusText.style.color = "#1a202c";
    lastPosition = null;
});
