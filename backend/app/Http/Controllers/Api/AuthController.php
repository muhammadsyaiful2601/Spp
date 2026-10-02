<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
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
            throw ValidationException::withMessages(['username' => ['Username atau kata sandi tidak sesuai.']]);
        }

        $user = $request->user();
        $token = $user->createToken('school-portal')->plainTextToken;

        return response()->json(['data' => ['user' => $user, 'token' => $token, 'token_type' => 'Bearer']]);
    }

    public function logout(Request $request): JsonResponse
    {
        $request->user()->currentAccessToken()?->delete();

        return response()->json(['message' => 'Berhasil keluar.']);
    }

    /** Current account details for the signed-in user. */
    public function me(Request $request): JsonResponse
    {
        $user = $request->user();

        return response()->json(['data' => [
            'id' => $user->id,
            'username' => $user->username,
            'name' => $user->name,
            'email' => $user->email,
            'role' => $user->role,
            'created_at' => $user->created_at,
        ]]);
    }

    /** Update the signed-in user's own name and email. */
    public function updateProfile(Request $request): JsonResponse
    {
        $user = $request->user();
        $data = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'email' => ['required', 'string', 'email', 'max:255', Rule::unique('users', 'email')->ignore($user->id)],
        ]);

        $user->fill($data)->save();

        return response()->json([
            'data' => [
                'id' => $user->id,
                'username' => $user->username,
                'name' => $user->name,
                'email' => $user->email,
                'role' => $user->role,
                'created_at' => $user->created_at,
            ],
        ]);
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

        return response()->json([
            'message' => 'Kata sandi berhasil diubah. Sesi lain telah dikeluarkan.',
        ]);
    }
}
