<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Confine an unverified account to the screens it needs.
 *
 * Signing in still works, otherwise nobody could reach the form that verifies
 * the address, but every data endpoint is refused until `email_verified_at` is
 * set.
 *
 * Route families and individual routes are deliberately kept in two lists. A
 * prefix silently widens to everything beneath it, which is how an unverified
 * account once came to rewrite the bank account printed on every receipt. A
 * family that is genuinely reachable goes in the prefixes; anything narrower is
 * named by method, so allowing a GET can never imply allowing a POST.
 */
class EnsureEmailVerified
{
    /** Whole route families: `auth` is the account screen, `public` is public. */
    private const ALLOWED_PREFIXES = [
        'api/v1/auth/',
        'api/v1/public/',
    ];

    /**
     * Individual routes as `METHOD path`, read only.
     *
     * Also declared outside the gate in routes/api.php, so it survives the read
     * being moved back inside `verified`.
     */
    private const ALLOWED_ROUTES = [
        'GET api/v1/pimpinan/sekolah-profile',
    ];

    public function handle(Request $request, Closure $next, string ...$roles): Response
    {
        $user = $request->user();

        abort_if(! $user, 401, 'Silakan masuk terlebih dahulu.');

        if ($user->email_verified_at) {
            return $next($request);
        }

        if ($this->isAllowed($request)) {
            return $next($request);
        }

        // 403 with a machine-readable code so the SPA can redirect to the profile
        // screen instead of showing a generic "forbidden" message.
        return response()->json([
            'message' => 'Verifikasi alamat email Anda untuk menggunakan seluruh fitur portal.',
            'code' => 'email_unverified',
        ], 403);
    }

    /** True when this exact request is one an unverified account may still make. */
    private function isAllowed(Request $request): bool
    {
        $path = $request->path();

        foreach (self::ALLOWED_PREFIXES as $prefix) {
            if (str_starts_with($path, $prefix)) {
                return true;
            }
        }

        return in_array($request->method().' '.$path, self::ALLOWED_ROUTES, true);
    }
}