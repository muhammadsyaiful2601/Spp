<?php

use App\Models\User;

return [

    'defaults' => [
        'guard' => env('AUTH_GUARD', 'web'),
        'passwords' => env('AUTH_PASSWORD_BROKER', 'users'),
    ],

    'guards' => [
        'web' => [
            'driver' => 'session',
            'provider' => 'users',
        ],
    ],

    'providers' => [
        'users' => [
            'driver' => 'eloquent',
            'model' => env('AUTH_MODEL', User::class),
        ],

        // 'users' => [
        //     'driver' => 'database',
        //     'table' => 'users',
        // ],
    ],

    'verification' => [
        'code_ttl_minutes' => (int) env('EMAIL_VERIFICATION_TTL', 30),
        'resend_cooldown_minutes' => (int) env('EMAIL_VERIFICATION_RESEND_COOLDOWN', 2),

        // Echo the emailed code back in the API response so the flow can be
        // tested without an inbox. Off by default in every environment: on a
        // reachable server this hands out the code that verifies the account,
        // so it must be enabled deliberately, never inherited by accident.
        'expose_codes_in_response' => (bool) env('EMAIL_VERIFICATION_EXPOSE_CODE', false),
    ],

    'login_alert' => [
        'link_ttl_hours' => (int) env('LOGIN_ALERT_LINK_TTL_HOURS', 24),
    ],

    'passwords' => [
        'users' => [
            'provider' => 'users',
            'table' => env('AUTH_PASSWORD_RESET_TOKEN_TABLE', 'password_reset_tokens'),
            'expire' => 60,
            'throttle' => 60,
        ],
    ],

    'password_timeout' => env('AUTH_PASSWORD_TIMEOUT', 10800),

];
