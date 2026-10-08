const WEB_APP_URL = "https://script.google.com/macros/s/AKfycbwCJfGjSYidRhkHcD9fNRZ8jYHCPgWZzECcbcN5i4kyd_DIrNlqTBplJE0leecpL5LX/exec"; 

const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const workerNameInput = document.getElementById('workerName');
const statusText = document.getElementById('status');
const countdownText = document.getElementById('countdown');
const speedText = document.getElementById('speed');
const distanceText = document.getElementById('distance');
const pendingCountText = document.getElementById('pendingCount');
const logTableBody = document.querySelector('#logTable tbody');

// Registrar el Service Worker del motor de fondo obligatoriamente
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js')
    .then(reg => console.log("Motor de fondo (Service Worker) listo para la batalla."))
    .catch(err => console.error("Fallo al inyectar el motor:", err));

    // Escuchar los reportes que genera el motor de fondo desde el bolsillo
    navigator.serviceWorker.addEventListener('message', (event) => {
        if (event.data.type === 'NEW_RECORD') {
            const record = event.data.data;
            saveRecordLocally(Date.now().toString(), record.worker, record.hora, parseFloat(record.dist), parseFloat(record.vel));
            syncData();
        }
    });
}

startBtn.addEventListener('click', () => {
    const name = workerNameInput.value.trim();
    if (!name) return alert("Por favor, introduce el nombre del trabajador.");

    workerNameInput.disabled = true;
    startBtn.disabled = true;
    stopBtn.disabled = false;
    statusText.textContent = "Motor de fondo activo de forma permanente...";
    statusText.style.color = "#38a169";
    countdownText.textContent = "Bolsillo Seguro Protegido";

    // LE DECIMOS AL MOTOR DE FONDO QUE EMPIECE A CONTAR CADA 2 MINUTOS
    if (navigator.serviceWorker.controller) {
        navigator.serviceWorker.controller.postMessage({ action: 'start', trabajador: name });
    }
});

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

document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
        renderTablaDesdeStorage();
        updatePendingCount();
        syncData();
    }
});

stopBtn.addEventListener('click', () => {
    if (navigator.serviceWorker.controller) {
        navigator.serviceWorker.controller.postMessage({ action: 'stop' });
    }
    workerNameInput.disabled = false;
    startBtn.disabled = false;
    stopBtn.disabled = true;
    statusText.textContent = "Inactivo";
    statusText.style.color = "#1a202c";
});
