<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Confine an unverified account to the screens it needs.
 *
 * Signing in is still allowed — otherwise the user could never reach the form
 * that verifies the address — but every data endpoint is refused until
 * `email_verified_at` is set. The allowance list below is deliberately narrow:
 * account management, the verification flow itself, and the public school
 * profile that the verification screen renders.
 */
class EnsureEmailVerified
{
    /** Paths reachable while the account is still unverified. */
    private const ALLOWED_PREFIXES = [
        'api/v1/auth/',
        'api/v1/public/',
        'api/v1/pimpinan/sekolah-profile',
    ];

    public function handle(Request $request, Closure $next, string ...$roles): Response
    {
        $user = $request->user();

        abort_if(! $user, 401, 'Silakan masuk terlebih dahulu.');

        if ($user->email_verified_at) {
            return $next($request);
        }

        foreach (self::ALLOWED_PREFIXES as $prefix) {
            if (str_starts_with($request->path(), $prefix)) {
                return $next($request);
            }
        }

        // 403 with a machine-readable code so the SPA can redirect to the profile
        // screen instead of showing a generic "forbidden" message.
        return response()->json([
            'message' => 'Verifikasi alamat email Anda untuk menggunakan seluruh fitur portal.',
            'code' => 'email_unverified',
        ], 403);
    }
}