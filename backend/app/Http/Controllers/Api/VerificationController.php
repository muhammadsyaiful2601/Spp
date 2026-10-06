<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\User;
use App\Notifications\ResetPasswordNotification;
use App\Notifications\VerifyEmailNotification;
use App\Support\ActivityLogger;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

/**
 * Email verification and forgotten-password recovery.
 *
 * Both flows answer the same way whether or not the account exists, so these
 * endpoints cannot be used to discover which emails are registered.
 */
class VerificationController extends Controller
{
    /**
     * Send a six-digit code to the signed-in account.
     *
     * Re-sending rotates the token, which invalidates any code issued earlier.
     */
    public function sendCode(Request $request): JsonResponse
    {
        $user = $request->user();

        if ($user->email_verified_at) {
            return response()->json([
                'message' => 'Alamat email Anda sudah terverifikasi.',
                'data' => ['verified' => true],
            ]);
        }

        $ttl = (int) config('auth.verification.code_ttl_minutes', 30);
        $cooldown = (int) config('auth.verification.resend_cooldown_minutes', 2);

        // Throttle resends so this cannot be used to mail-bomb an address. The
        // wait is the cooldown, not the lifetime: reusing the TTL here locked
        // people out of the resend button for 30 minutes, so a code that had
        // been mis-delivered could not be replaced while the clock was fresh.
        $sentAt = $user->email_verification_sent_at;
        if ($sentAt && $sentAt->gt(now()->subMinutes($cooldown))) {
            $wait = (int) ceil($sentAt->diffInMinutes(now(), true));
            return response()->json([
                'message' => "Kode baru belum dapat diminta. Coba lagi dalam {$wait} menit.",
                'data' => ['cooldown' => true, 'retry_after_seconds' => $wait * 60],
            ], 429);
        }

        $code = $this->numericCode();

        $user->forceFill([
            'email_verification_token' => hash('sha256', $code),
            'email_verification_sent_at' => now(),
        ])->save();

        Notification::send($user, new VerifyEmailNotification($code));

        ActivityLogger::record(
            'akun.verifikasi_kirim',
            'akun',
            "Meminta kode verifikasi email. Kode dikirim ke {$user->email}.",
        );

        return response()->json([
            'message' => "Kode verifikasi telah dikirim ke {$user->email}.",
            'data' => ['dev_code' => $this->devHint($code)],
        ]);
    }

    /** Exchange the emailed code for a verified account. */
    public function verifyCode(Request $request): JsonResponse
    {
        $user = $request->user();

        $data = $request->validate([
            'code' => ['required', 'string', 'size:6'],
        ]);

        if ($user->email_verified_at) {
            return response()->json([
                'message' => 'Alamat email Anda sudah terverifikasi.',
                'data' => ['verified' => true],
            ]);
        }

        if (! $user->email_verification_token) {
            throw ValidationException::withMessages([
                'code' => ['Belum ada kode verifikasi. Minta kode baru terlebih dahulu.'],
            ]);
        }

        $ttl = (int) config('auth.verification.code_ttl_minutes', 30);
        $sentAt = $user->email_verification_sent_at;

        if (! $sentAt || $sentAt->lt(now()->subMinutes($ttl))) {
            throw ValidationException::withMessages([
                'code' => ['Kode verifikasi sudah kedaluwarsa. Minta kode baru.'],
            ]);
        }

        if (! hash_equals($user->email_verification_token, hash('sha256', $data['code']))) {
            throw ValidationException::withMessages(['code' => ['Kode verifikasi salah.']]);
        }

        $user->forceFill([
            'email_verified_at' => now(),
            'email_verification_token' => null,
            'email_verification_sent_at' => null,
        ])->save();

        ActivityLogger::record(
            'akun.verifikasi',
            'akun',
            "Alamat email {$user->email} berhasil diverifikasi.",
        );

        return response()->json([
            'message' => 'Email terverifikasi. Seluruh fitur portal kini aktif.',
            'data' => ['verified' => true],
        ]);
    }

    /**
     * Start password recovery via email only.
     *
     * The response never reveals whether the email matched an account.
     */
    public function forgotPassword(Request $request): JsonResponse
    {
        $data = $request->validate([
            'email' => ['required', 'email', 'max:255'],
        ]);

        $user = User::query()
            ->where('email', $data['email'])
            ->first();

        $token = null;

        if ($user) {
            $token = Str::random(64);

            // Hashed at rest: the plaintext exists only in the emailed message.
            DB::table('password_reset_tokens')->updateOrInsert(
                ['email' => $user->email],
                ['token' => hash('sha256', $token), 'created_at' => now()]
            );

            Notification::send($user, new ResetPasswordNotification($token));

            // The requester is anonymous, so the account is passed explicitly:
            // attributing the attempt to the address being recovered is what
            // makes a password-recovery sweep visible on the audit screen.
            ActivityLogger::record(
                'akun.lupa_kata_sandi',
                'akun',
                'Meminta kode atur ulang kata sandi melalui email.',
                ['actor' => $user],
            );
        }

        return response()->json([
            'message' => 'Jika data tersebut terdaftar, tautan atur ulang telah dikirim ke email.',
            'data' => ['dev_code' => $token ? $this->devHint($token) : null],
        ]);
    }

    /** Complete recovery with the emailed code and a new password. */
    public function resetPassword(Request $request): JsonResponse
    {
        $data = $request->validate([
            'token' => ['required', 'string', 'size:64'],
            'password' => ['required', 'string', 'min:8', 'confirmed'],
        ], [
            'password.min' => 'Kata sandi minimal 8 karakter.',
            'password.confirmed' => 'Konfirmasi kata sandi tidak sama.',
        ]);

        $row = DB::table('password_reset_tokens')
            ->where('token', hash('sha256', $data['token']))
            ->first();

        $expireMinutes = (int) config('auth.passwords.users.expire', 60);
        // The query builder hands back raw values, so `created_at` is a string
        // here — it must be parsed before it can be compared.
        $expired = ! $row
            || now()->gt(Carbon::parse($row->created_at)->addMinutes($expireMinutes));

        if ($expired) {
            throw ValidationException::withMessages([
                'token' => ['Kode atur ulang tidak berlaku atau sudah kedaluwarsa.'],
            ]);
        }

        $user = User::where('email', $row->email)->firstOrFail();
        $user->forceFill(['password' => Hash::make($data['password'])])->save();
        DB::table('password_reset_tokens')->where('email', $user->email)->delete();

        // Resetting a password must sign every device out, including active ones.
        DB::table('personal_access_tokens')
            ->where('tokenable_id', $user->id)
            ->where('tokenable_type', $user->getMorphClass())
            ->delete();

        ActivityLogger::record(
            'akun.atur_ulang_kata_sandi',
            'akun',
            'Mengatur ulang kata sandi melalui kode email. Seluruh sesi dikeluarkan.',
            ['actor' => $user],
        );

        return response()->json([
            'message' => 'Kata sandi berhasil diubah. Silakan masuk kembali.',
        ]);
    }

    /** Cryptographically random six-digit code, zero-padded. */
    private function numericCode(): string
    {
        return str_pad((string) random_int(0, 999999), 6, '0', STR_PAD_LEFT);
    }

    /**
     * Echo the code back so the flow is testable without an inbox.
     *
     * Controlled by EMAIL_VERIFICATION_EXPOSE_CODE and off by default. It used
     * to be "anything but production", which meant a staging or preview server
     * quietly handed out the code that proves ownership of the account to
     * anyone who asked for it. The gate is now a value somebody has to set on
     * purpose, so a deployment cannot inherit it by accident.
     */
    private function devHint(string $value): ?string
    {
        if ($value === '') {
            return null;
        }

        return config('auth.verification.expose_codes_in_response', false) ? $value : null;
    }
}
