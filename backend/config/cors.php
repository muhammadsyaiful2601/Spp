<?php

return [

    'paths' => ['api/*', 'sanctum/csrf-cookie'],

    'allowed_methods' => ['*'],

    'allowed_origins' => array_values(array_filter(array_map(
        'trim',
        explode(',', (string) env('CORS_ALLOWED_ORIGINS', '')),
    ))),

    // Patterns would let a configurable regex re-open the wildcard `*` this file
    // exists to close, so the list above stays the only way in.
    'allowed_origins_patterns' => [],

    'allowed_headers' => ['*'],

    'exposed_headers' => [],

    'max_age' => 0,

    // Must stay false: the token travels in a header, not a cookie, and cookie
    // credentials plus a wildcard origin is a combination browsers rightly reject.
    'supports_credentials' => false,

];
