const CACHE_NAME = 'ruta-pro-v1';

// Instalar el Service Worker
self.addEventListener('install', (e) => {
    self.skipWaiting();
});

// Activar el Service Worker
self.addEventListener('activate', (e) => {
    e.waitUntil(clients.claim());
});

// Interceptar peticiones para mantener la app activa
self.addEventListener('fetch', (e) => {
    // Mantiene el proceso despierto sin interferir con la red de Google
    return;
});
