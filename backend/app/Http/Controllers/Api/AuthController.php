<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\User;
use App\Support\ActivityLogger;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;
use Laravel\Sanctum\PersonalAccessToken;

class AuthController extends Controller
{
    public function login(Request $request): JsonResponse
    {
        $credentials = $request->validate([
            'username' => ['required', 'string'],
            'password' => ['required', 'string'],
        ]);

        if (! Auth::attempt($credentials)) {
            // A rejected sign-in is exactly what an audit screen is for, so it is
            // recorded even though there is no account to attribute it to.
            ActivityLogger::record(
                'akun.masuk_gagal',
                'akun',
                "Percobaan masuk gagal untuk username \"{$credentials['username']}\".",
            );

            throw ValidationException::withMessages(['username' => ['Username atau kata sandi tidak sesuai.']]);
        }

        $user = $request->user();

        // A suspended account must not get a token even with the right password.
        // Logging out first keeps the session clean for the next attempt.
        if (! $user->is_active) {
            Auth::logout();

            ActivityLogger::record(
                'akun.masuk_ditolak',
                'akun',
                'Percobaan masuk ditolak karena akun dinonaktifkan.',
                ['actor' => $user],
            );

            throw ValidationException::withMessages([
                'username' => ['Akun ini telah dinonaktifkan. Hubungi pimpinan sekolah.'],
            ]);
        }

        $token = $user->createToken('school-portal')->plainTextToken;

        ActivityLogger::record('akun.masuk', 'akun', 'Masuk ke portal.');

        return response()->json(['data' => ['user' => $user, 'token' => $token, 'token_type' => 'Bearer']]);
    }

    public function logout(Request $request): JsonResponse
    {
        $user = $request->user();
        $user->currentAccessToken()?->delete();

        // The actor is passed explicitly: the token was just dropped, so nothing
        // should depend on the guard still resolving the user.
        ActivityLogger::record('akun.keluar', 'akun', 'Keluar dari portal.', ['actor' => $user]);

        return response()->json(['message' => 'Berhasil keluar.']);
    }

    /** Current account details for the signed-in user. */
    public function me(Request $request): JsonResponse
    {
        return response()->json(['data' => $this->present($request->user())]);
    }

    /**
     * Update the signed-in user's own name, username and email.
     *
     * Every account may change its own username, so this is deliberately open to
     * `admin` as well as `pimpinan`. Uniqueness is enforced with `ignore($id)` so
     * keeping your current username is not treated as a conflict.
     */
    public function updateProfile(Request $request): JsonResponse
    {
        $user = $request->user();
        $data = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'username' => ['required', 'string', 'min:3', 'max:100', 'alpha_dash', Rule::unique('users', 'username')->ignore($user->id)],
            'email' => ['required', 'string', 'email', 'max:255', Rule::unique('users', 'email')->ignore($user->id)],
        ], [
            'username.alpha_dash' => 'Username hanya boleh huruf, angka, tanda hubung, dan garis bawah.',
            'username.min' => 'Username minimal 3 karakter.',
        ]);

        // Compared before saving: `fill()` overwrites the attribute, so the old
        // value has to be captured first.
        $previousEmail = (string) $user->email;
        $user->fill($data);

        $emailChanged = ! hash_equals($previousEmail, (string) $user->email);

        // Changing the address must revoke the verification. The new address has
        // not proved it belongs to this person, so leaving `email_verified_at` set
        // would let anyone claim ownership of an arbitrary address.
        if ($emailChanged) {
            $user->forceFill([
                'email_verified_at' => null,
                'email_verification_token' => null,
                'email_verification_sent_at' => null,
            ]);
        }

        $user->save();

        ActivityLogger::record(
            'akun.profil',
            'akun',
            $emailChanged
                ? "Memperbarui profil dan mengganti alamat email menjadi {$user->email}."
                : 'Memperbarui profil akun.',
            ['meta' => [
                'name' => $user->name,
                'username' => $user->username,
                'email' => (string) $user->email,
                'email_changed' => $emailChanged,
            ]],
        );

        $message = $user->email_verified_at
            ? 'Profil berhasil diperbarui.'
            : 'Alamat email diperbarui. Verifikasi alamat baru untuk mengaktifkan portal.';

        return response()->json([
            'data' => $this->present($user->fresh()),
            'message' => $message,
        ]);
    }

    /**
     * Store or replace the signed-in user's avatar.
     *
     * The previous file is deleted first, otherwise every upload would leave an
     * orphan behind on disk.
     */
    public function updatePhoto(Request $request): JsonResponse
    {
        $user = $request->user();
        $request->validate([
            'photo' => ['required', 'image', 'mimes:png,jpg,jpeg,webp', 'max:2048'],
        ], [
            'photo.mimes' => 'Gunakan gambar PNG, JPG, atau WebP.',
            'photo.max' => 'Ukuran foto maksimal 2 MB.',
        ]);

        if ($user->photo_path) {
            Storage::disk('public')->delete($user->photo_path);
        }

        $user->photo_path = $request->file('photo')->store('avatars', 'public');
        $user->save();

        ActivityLogger::record('akun.foto', 'akun', 'Memperbarui foto profil.');

        return response()->json([
            'data' => $this->present($user->fresh()),
            'message' => 'Foto profil berhasil diperbarui.',
        ]);
    }

    /** Remove the avatar and fall back to initials everywhere. */
    public function deletePhoto(Request $request): JsonResponse
    {
        $user = $request->user();

        if ($user->photo_path) {
            Storage::disk('public')->delete($user->photo_path);
            $user->photo_path = null;
            $user->save();

            // Only a real removal is worth a row; a no-op delete is not an event.
            ActivityLogger::record('akun.foto_hapus', 'akun', 'Menghapus foto profil.');
        }

        return response()->json([
            'data' => $this->present($user->fresh()),
            'message' => 'Foto profil dihapus.',
        ]);
    }

    /** Shape a user for the API response, never exposing the password hash. */
    private function present(User $user): array
    {
        return [
            'id' => $user->id,
            'username' => $user->username,
            'name' => $user->name,
            'email' => $user->email,
            'role' => $user->role,
            'photo_path' => $user->photo_path,
            // Drives the frontend gate: unverified accounts stay on the profile screen.
            'email_verified_at' => $user->email_verified_at,
            'email_verified' => (bool) $user->email_verified_at,
            'created_at' => $user->created_at,
        ];
    }

    /**
     * Change the signed-in user's password. Other active sessions are revoked so
     * only this device stays signed in.
     */
    public function changePassword(Request $request): JsonResponse
    {
        $user = $request->user();
        $data = $request->validate([
            'current_password' => ['required', 'string'],
            'password' => ['required', 'string', 'min:8', 'confirmed'],
        ], [
            'current_password.required' => 'Kata sandi saat ini wajib diisi.',
            'password.min' => 'Kata sandi baru minimal 8 karakter.',
            'password.confirmed' => 'Konfirmasi kata sandi tidak sama.',
        ]);

        if (! Hash::check($data['current_password'], $user->password)) {
            throw ValidationException::withMessages([
                'current_password' => ['Kata sandi saat ini tidak sesuai.'],
            ]);
        }

        $user->password = $data['password'];
        $user->save();

        // Revoke the account's other device sessions, but never the one making
        // this request. When the caller authenticated by session cookie the guard
        // exposes a TransientToken with no id — in that case we cannot tell which
        // token is current, so skip revocation rather than risk signing the user
        // out of the device they are using.
        $currentToken = $user->currentAccessToken();
        if ($currentToken instanceof PersonalAccessToken) {
            DB::table('personal_access_tokens')
                ->where('tokenable_id', $user->getKey())
                ->where('tokenable_type', $user->getMorphClass())
                ->where('id', '!=', $currentToken->id)
                ->delete();
        }

        ActivityLogger::record(
            'akun.kata_sandi',
            'akun',
            'Mengganti kata sandi akun dan mengeluarkan sesi lain.',
        );

        return response()->json([
            'message' => 'Kata sandi berhasil diubah. Sesi lain telah dikeluarkan.',
        ]);
    }
}
