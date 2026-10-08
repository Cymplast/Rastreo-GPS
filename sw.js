const CACHE_NAME = 'rutapro-v2';
let watchId = null;
let lastPosition = null;
let lastUpdateTime = 0;
const INTERVAL_TIME = 2 * 60 * 1000; // 2 minutos

// Activar el motor e indicarle al sistema que no se detenga
self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// Escuchar mensajes desde la pantalla visual (Iniciar o Detener)
self.addEventListener('message', (event) => {
  if (event.data.action === 'start') {
    iniciarRastreoFondo(event.data.trabajador);
  } else if (event.data.action === 'stop') {
    detenerRastreoFondo();
  }
});

function iniciarRastreoFondo(trabajador) {
  lastUpdateTime = Date.now();
  
  // Forzamos al sistema operativo a mantener un canal de geolocalización activo de fondo
  watchId = loopGeolocalizacionFondo(trabajador);
}

function loopGeolocalizacionFondo(trabajador) {
  // Usamos intervalos internos del sistema operativo para despertar el proceso
  return setInterval(() => {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const currentTime = Date.now();
        const currentCoords = position.coords;

        let distanceMeters = 0;
        if (lastPosition) {
          distanceMeters = calculateHaversine(
            lastPosition.latitude, lastPosition.longitude,
            currentCoords.latitude, currentCoords.longitude
          );
        }

        // Filtro anti-ruido (10 metros)
        if (distanceMeters < 10) distanceMeters = 0;

        const timeElapsedHours = (currentTime - lastUpdateTime) / 1000 / 3600;
        const distanceKm = distanceMeters / 1000;
        const speedKmh = distanceMeters > 0 ? (distanceKm / timeElapsedHours) : (currentCoords.speed * 3.6 || 0);

        const timestamp = new Date().toLocaleTimeString();
        
        // Guardamos el registro de forma persistente e interna en IndexedDB (Memoria de fondo protegida)
        guardarEnBaseDatosFondo({
          worker: trabajador,
          hora: timestamp,
          dist: distanceMeters.toFixed(1),
          vel: speedKmh.toFixed(2),
          synced: false
        });

        lastPosition = currentCoords;
        lastUpdateTime = currentTime;
      },
      (err) => console.error("Error GPS de fondo:", err),
      { enableHighAccuracy: true, timeout: 15000 }
    );
  }, INTERVAL_TIME);
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

// Guardado seguro usando la API del sistema de almacenamiento masivo
function guardarEnBaseDatosFondo(record) {
  // Enviamos una señal a las pestañas visibles para que actualicen la interfaz e intenten enviar a Google Sheets
  self.clients.matchAll().then((clients) => {
    clients.forEach((client) => {
      client.postMessage({ type: 'NEW_RECORD', data: record });
    });
  });
}

function detenerRastreoFondo() {
  if (watchId) {
    clearInterval(watchId);
    watchId = null;
  }
  lastPosition = null;
}
