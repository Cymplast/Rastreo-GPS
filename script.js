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

    // Si aún no han pasado los 2 minutos, solo actualizamos la última coordenada conocida
    if (currentTime - lastUpdateTime < INTERVAL_TIME) {
        lastPosition = currentCoords;
        return;
    }

    // Calculamos distancia (si no hay posición previa o estás quieto, será 0)
    let distanceMeters = 0;
    if (lastPosition) {
        distanceMeters = calculateHaversine(
            lastPosition.latitude, lastPosition.longitude,
            currentCoords.latitude, currentCoords.longitude
        );
    }

    const timeElapsedHours = (currentTime - lastUpdateTime) / 1000 / 3600;
    const distanceKm = distanceMeters / 1000;
    
    // Si te moviste usamos la velocidad calculada; si no, la que reporta el GPS (o 0)
    const speedKmh = distanceMeters > 0 ? (distanceKm / timeElapsedHours) : (currentCoords.speed * 3.6 || 0);

    speedText.textContent = speedKmh.toFixed(2);
    distanceText.textContent = distanceMeters.toFixed(2);
    
    const timestamp = new Date().toLocaleTimeString();
    const recordId = currentTime.toString();

    // Guardamos y disparamos la sincronización pase lo que pase
    saveRecordLocally(recordId, workerNameInput.value.trim(), timestamp, distanceMeters, speedKmh);
    agregarFilaTabla(recordId, timestamp, distanceMeters, speedKmh);
    syncData();

    // Actualizamos los controles de tiempo y posición para el próximo ciclo
    lastPosition = currentCoords;
    lastUpdateTime = currentTime;
}

// 2. REEMPLAZA POR COMPLETO TU FUNCIÓN syncData (Cambia la forma de enviar los datos)
function syncData() {
    if (WEB_APP_URL === ""https://script.google.com/macros/s/AKfycbwCJfGjSYidRhkHcD9fNRZ8jYHCPgWZzECcbcN5i4kyd_DIrNlqTBplJE0leecpL5LX/exec"" || !navigator.onLine) return;

    let localData = JSON.parse(localStorage.getItem('gps_tracks') || '[]');
    
    localData.forEach(record => {
        if (record.synced) return;

        // CAMBIO CRUCIAL: Enviamos los parámetros limpios en la URL para evitar fallos de lectura en Google
        const urlConParametros = `${WEB_APP_URL}?trabajador=${encodeURIComponent(record.worker)}&hora=${encodeURIComponent(record.hora)}&distancia=${encodeURIComponent(record.dist)}&velocidad=${encodeURIComponent(record.vel)}`;

        console.log("Enviando datos en la URL a Google Sheets...");

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
            
            const updatedData = JSON.parse(localStorage.getItem('gps_tracks') || '[]');
            const index = updatedData.findIndex(r => r.id === record.id);
            if(index !== -1) updatedData[index].synced = true;
            localStorage.setItem('gps_tracks', JSON.stringify(updatedData));
            
            updatePendingCount();
        })
        .catch(err => console.error("Error enviando registro diferido:", err));
    });
}

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
