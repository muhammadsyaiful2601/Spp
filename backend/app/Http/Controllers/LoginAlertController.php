<?php

namespace App\Http\Controllers;

use App\Models\User;
use App\Support\ActivityLogger;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\View\View;

/**
 * Landing pages behind the "bukan saya?" button inside the login alert email.
 *
 * The flow is deliberately two-step:
 *
 *  - GET only renders a confirmation page and never touches a session, because
 *    email scanners and link prefetchers fire GET requests on their own. A GET
 *    that revoked sessions would sign real users out of a legitimate login just
 *    for opening their inbox.
 *  - POST performs the revocation. The `signed` middleware proves the request
 *    came from our own email with an unexpired, untampered target account, so
 *    no session is required to open the link — the recipient may be reading
 *    email on a device that is not signed in at all.
 */
class LoginAlertController extends Controller
{
    /** Confirmation page: stateless, safe to prefetch. */
    public function show(Request $request): View
    {
        return view('login-alert.show', [
            'user' => $this->resolveUser($request),
            'frontendUrl' => $this->frontendUrl(),
        ]);
    }

    /** Revoke every session of the signed account, then advise a password change. */
    public function revoke(Request $request): View
    {
        $user = $this->resolveUser($request);

        // All tokens, not just the one from the reported sign-in: a stolen
        // password means every session is suspect, and the reader may not know
        // how many devices the attacker signed in on. Mirrors resetPassword.
        $revoked = DB::table('personal_access_tokens')
            ->where('tokenable_id', $user->getKey())
            ->where('tokenable_type', $user->getMorphClass())
            ->delete();

        // A repeat click after the sessions are gone changes nothing, and a
        // no-op delete is not an event worth an audit row.
        if ($revoked > 0) {
            ActivityLogger::record(
                'akun.keluar_email',
                'akun',
                'Mengeluarkan seluruh sesi portal melalui tautan konfirmasi email masuk.',
                // Explicit actor: this request carries no session of its own,
                // exactly like the forgot/reset password flows.
                ['actor' => $user, 'meta' => ['revoked_tokens' => $revoked]],
            );
        }

        return view('login-alert.revoked', [
            'user' => $user,
            'revoked' => $revoked,
            'frontendUrl' => $this->frontendUrl(),
        ]);
    }

    /**
     * The signature vouches for the id, but the account may be gone by the time
     * the link is clicked — a deleted account is a 404, not a 500.
     */
    private function resolveUser(Request $request): User
    {
        return User::findOrFail($request->query('user'));
    }

    private function frontendUrl(): string
    {
        return rtrim((string) config('app.frontend_url'), '/');
    }
}
