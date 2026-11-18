<?php

return [

    'paths' => ['api/*', 'sanctum/csrf-cookie'],

    'allowed_methods' => ['*'],

    'allowed_origins' => array_values(array_filter(array_map(
        'trim',
        explode(',', (string) env('CORS_ALLOWED_ORIGINS', '')),
    ))),

    // Patterns would let a configurable regex re-open the wildcard `*` this file
    // exists to close, so the list above stays the only configurable way in.
    //
    // The single exception is hardcoded, not configurable, and only exists for
    // local development. Vite falls back to the next free port whenever 5173 is
    // already taken, so the SPA can end up served from 5174 while this list still
    // says 5173. The backend then answers the login with a perfectly good 200 and
    // no `Access-Control-Allow-Origin`, the browser discards it as an
    // unauthenticated cross-origin response, and axios reports
    // `Server tidak dapat dihubungi` — while the server sits right there in the
    // log having done exactly what it was asked.
    //
    // Safe to hardcode because it cannot match a remote host: `localhost`,
    // `127.0.0.1` and `[::1]` only ever resolve to the machine running the
    // browser, so a page an attacker controls cannot use it to reach this API.
    // Gated on `app.debug` so that in production the origin list above remains the
    // entire policy and nothing widens it at runtime.
    'allowed_origins_patterns' => config('app.debug')
        ? ['#^http://(localhost|127\.0\.0\.1|\[::1\])(:\d{1,5})?$#']
        : [],

    'allowed_headers' => ['*'],

    'exposed_headers' => [],

    'max_age' => 0,

    // Must stay false: the token travels in a header, not a cookie, and cookie
    // credentials plus a wildcard origin is a combination browsers rightly reject.
    'supports_credentials' => false,

];
