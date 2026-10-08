const WEB_APP_URL = "https://google.com"; 

let watchId = null;
let alarmInterval = null;
let lastPosition = null;
let lastUpdateTime = 0;
const INTERVAL_TIME = 2 * 60 * 1000; // 2 minutos estrictos

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

    // Pedimos permiso de notificaciones (Truco para que Android deje ejecutar alertas de fondo)
    if (Notification.permission !== "granted") {
        Notification.requestPermission();
    }

    workerNameInput.disabled = true;
    startBtn.disabled = true;
    stopBtn.disabled = false;
    statusText.textContent = "Rastreando con Despertador de Fondo Activo...";
    statusText.style.color = "#38a169";
    countdownText.textContent = "Monitoreo de Velocidad Seguro";

    lastUpdateTime = Date.now();

    // Encendemos el GPS continuo
    watchId = navigator.geolocation.watchPosition(
        (position) => { lastPosition = position.coords; },
        err => console.error("Error GPS:", err),
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );

    // ACTIVAMOS EL DESPERTADOR AUTOMÁTICO CADA 2 MINUTOS
    // Este bucle fuerza al procesador a mantenerse alerta mediante micro-peticiones de sistema
    alarmInterval = setInterval(ejecutarDespertadorReporte, INTERVAL_TIME);
});

function ejecutarDespertadorReporte() {
    if (!lastPosition) {
        // Si el GPS no ha tomado lectura, forzamos una consulta rápida de emergencia
        navigator.geolocation.getCurrentPosition(
            (pos) => { lastPosition = pos.coords; procesarYEnviarDatos(); },
            (err) => console.error("Despertador sin GPS:", err),
            { enableHighAccuracy: true, timeout: 5000 }
        );
    } else {
        procesarYEnviarDatos();
    }
}

function procesarYEnviarDatos() {
    const currentTime = Date.now();
    
    // Obtenemos la velocidad directa que reporta el chip del GPS en km/h
    // Si el GPS no da velocidad (porque está quieto), marcamos 0.00
    let velocidadActual = lastPosition.speed * 3.6;
    if (isNaN(velocidadActual) || velocidadActual < 0) velocidadActual = 0;

    // Filtro anti-ruido: velocidades menores a 3 km/h se consideran quieto
    const velocidadFiltrada = velocidadActual > 3 ? velocidadActual : 0;

    speedText.textContent = velocidadFiltrada.toFixed(2);
    distanceText.textContent = "---"; // En modo ráfaga de velocidad priorizamos el velocímetro instantáneo
    
    const timestamp = new Date().toLocaleTimeString();
    
    // Guardamos localmente
    saveRecordLocally(currentTime.toString(), workerNameInput.value.trim(), timestamp, 0, velocidadFiltrada);
    
    // Transmitimos a Google Sheets
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
            <td>Vel: ${record.vel} km/h</td>
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
        .catch(err => console.error(err));
    });
}

stopBtn.addEventListener('click', () => {
    if (watchId) navigator.geolocation.clearWatch(watchId);
    if (alarmInterval) clearInterval(alarmInterval);
    workerNameInput.disabled = false;
    startBtn.disabled = false;
    stopBtn.disabled = true;
    statusText.textContent = "Inactivo";
    statusText.style.color = "#1a202c";
    lastPosition = null;
});
