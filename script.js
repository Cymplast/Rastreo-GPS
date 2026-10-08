const WEB_APP_URL = "https://google.com"; 

let watchId = null;
let intervalId = null;
let lastPosition = null;
let lastUpdateTime = 0;
const INTERVAL_TIME = 2 * 60 * 1000; // 2 minutos exactos

const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const workerNameInput = document.getElementById('workerName');
const statusText = document.getElementById('status');
const countdownText = document.getElementById('countdown');
const speedText = document.getElementById('speed');
const distanceText = document.getElementById('distance');
const pendingCountText = document.getElementById('pendingCount');
const logTableBody = document.querySelector('#logTable tbody');

if (!localStorage.getItem('gps_tracks')) {
    localStorage.setItem('gps_tracks', '[]');
}

updatePendingCount();
renderTablaDesdeStorage();

startBtn.addEventListener('click', () => {
    const name = workerNameInput.value.trim();
    if (!name) return alert("Por favor, introduce el nombre del trabajador.");

    workerNameInput.disabled = true;
    startBtn.disabled = true;
    stopBtn.disabled = false;
    statusText.textContent = "Rastreando ruta en tiempo real...";
    statusText.style.color = "#38a169";
    countdownText.textContent = "Módulo de Alta Precisión Activo";

    lastUpdateTime = Date.now();

    // Activar lectura continua del chip GPS
    watchId = navigator.geolocation.watchPosition(
        (position) => { lastPosition = position.coords; },
        err => console.error("Error lectura GPS:", err),
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );

    // Bucle de tiempo estándar para evaluar tramos cada 2 minutos
    intervalId = setInterval(procesarTramoDosMinutos, INTERVAL_TIME);
});

function procesarTramoDosMinutos() {
    if (!lastPosition) return console.log("Esperando señal GPS válida...");

    const currentTime = Date.now();
    
    // Obtener velocidad directa del chip GPS en km/h
    let velocidadActual = lastPosition.speed ? (lastPosition.speed * 3.6) : 0;
    if (isNaN(velocidadActual) || velocidadActual < 0) velocidadActual = 0;

    // Filtro para ignorar el rebote del GPS si está quieto
    const velocidadFiltrada = velocidadActual > 3 ? velocidadActual : 0;

    speedText.textContent = velocidadFiltrada.toFixed(2);
    distanceText.textContent = "---"; 
    
    const timestamp = new Date().toLocaleTimeString();
    
    // Guardar localmente en el bloque de memoria del teléfono
    saveRecordLocally(currentTime.toString(), workerNameInput.value.trim(), timestamp, 0, velocidadFiltrada);
    
    // Enviar a la hoja de Google Sheets
    syncData();

    lastUpdateTime = currentTime;
}

function saveRecordLocally(id, worker, hora, dist, vel) {
    let localData = JSON.parse(localStorage.getItem('gps_tracks') || '[]');
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
        row.innerHTML = `
            <td>${record.hora}</td>
            <td>${record.vel} km/h</td>
            <td>---</td>
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
        
        fetch(urlConParametros, { method: "POST", mode: "no-cors" })
        .then(() => {
            let currentData = JSON.parse(localStorage.getItem('gps_tracks') || '[]');
            const index = currentData.findIndex(r => r.id === record.id);
            if(index !== -1) currentData[index].synced = true;
            localStorage.setItem('gps_tracks', JSON.stringify(currentData));
            renderTablaDesdeStorage();
            updatePendingCount();
        })
        .catch(err => console.error("Error de conexión:", err));
    });
}

stopBtn.addEventListener('click', () => {
    if (watchId) navigator.geolocation.clearWatch(watchId);
    if (intervalId) clearInterval(intervalId);
    workerNameInput.disabled = false;
    startBtn.disabled = false;
    stopBtn.disabled = true;
    statusText.textContent = "Inactivo";
    statusText.style.color = "#1a202c";
    lastPosition = null;
});
