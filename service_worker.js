self.addEventListener('install', function(event) {
    event.waitUntil(
        caches.open('v1').then(function(cache) {
            return cache.addAll([
                'aswh.css',
                'aswh.js',
                'blank.png',
                'complete.wav',
                'index.html',
                'pipeBL.png',
                'pipeBR.png',
                'pipeEnd.png',
                'pipeLR.png',
                'pipeStart.png',
                'pipeTB.png',
                'pipeTL.png',
                'pipeTR.png',
                'rotate.wav'
            ]);
        })
    );
});

self.addEventListener('fetch', function (e) {
    e.respondWith(
        caches.match(e.request).then(
            function (response) {
                return response || fetch(e.request);
            }
        )
    );
});
