<?php

use Laravel\Sanctum\Sanctum;

return [

    'stateful' => explode(',', env('SANCTUM_STATEFUL_DOMAINS', sprintf(
        '%s%s',
        'localhost,localhost:3000,127.0.0.1,127.0.0.1:8000,::1',
        Sanctum::currentApplicationUrlWithPort(),
    ))),

    // Without this, Sanctum's default of `null` means a token never expires. The
    // portal keeps its token in localStorage and its idle sign-out is client-side
    // only, so a leaked token would stay valid indefinitely. Enforced against
    // `created_at`, so existing tokens age out too.
    'expiration' => (int) env('SANCTUM_TOKEN_EXPIRATION_MINUTES', 60 * 24 * 7),

    'token_prefix' => env('SANCTUM_TOKEN_PREFIX', ''),

];
