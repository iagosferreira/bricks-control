// sw.js - Service Worker básico
self.addEventListener('install', (e) => {
  console.log('Service Worker instalado!');
});

self.addEventListener('fetch', (e) => {
  // Necessário para ser instalável
});