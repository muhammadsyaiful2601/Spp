<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\User;
use App\Support\ActivityLogger;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

/**
 * Treasurer ("bendahara", stored as the `admin` role) account management.
 *
 * Every action is `pimpinan` only. Deliberate guards:
 *  - `pimpinan` accounts are never touched here, so leadership cannot lock
 *    itself out of the portal.
 *  - The last active treasurer cannot be suspended, otherwise nobody could
 *    record a payment.
 *  - Suspension revokes issued tokens so an old session stops working at once.
 */
class TreasurerController extends Controller
{
    /** List treasurer accounts with enough context to judge their access. */
    public function index(): JsonResponse
    {
        $treasurers = User::query()
            ->where('role', 'admin')
            ->orderByDesc('is_active')
            ->orderBy('name')
            ->get()
            ->map(fn (User $user) => $this->present($user) + [
                'last_login_at' => DB::table('personal_access_tokens')
                    ->where('tokenable_id', $user->id)
                    ->where('tokenable_type', $user->getMorphClass())
                    ->max('last_used_at'),
            ]);

        return response()->json(['data' => $treasurers]);
    }

    /** Create a treasurer account with an initial password. */
    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'username' => ['required', 'string', 'min:3', 'max:100', 'alpha_dash', 'unique:users,username'],
            'email' => ['required', 'string', 'email', 'max:255', 'unique:users,email'],
            'password' => ['required', 'string', 'min:8', 'confirmed'],
        ], [
            'username.alpha_dash' => 'Username hanya boleh huruf, angka, tanda hubung, dan garis bawah.',
            'password.min' => 'Kata sandi minimal 8 karakter.',
            'password.confirmed' => 'Konfirmasi kata sandi tidak sama.',
        ]);

        $treasurer = User::create([
            'name' => $data['name'],
            'username' => $data['username'],
            'email' => $data['email'],
            // The `hashed` cast on the model handles hashing.
            'password' => $data['password'],
            'role' => 'admin',
            'is_active' => true,
        ]);

        ActivityLogger::record(
            'bendahara.tambah',
            'bendahara',
            "Membuat akun bendahara {$treasurer->name} ({$treasurer->username}).",
            [
                'subject_type' => 'user',
                'subject_id' => $treasurer->id,
                'subject_label' => $treasurer->name,
                'meta' => ['username' => $treasurer->username, 'email' => $treasurer->email],
            ],
        );

        return response()->json([
            'data' => $this->present($treasurer),
            'message' => "Akun bendahara {$treasurer->name} berhasil dibuat.",
        ], 201);
    }

    /** Update a treasurer's identity. Role and status are handled separately. */
    public function update(Request $request, User $treasurer): JsonResponse
    {
        $this->guardEditable($treasurer);

        $data = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'username' => ['required', 'string', 'min:3', 'max:100', 'alpha_dash', Rule::unique('users', 'username')->ignore($treasurer->id)],
            'email' => ['required', 'string', 'email', 'max:255', Rule::unique('users', 'email')->ignore($treasurer->id)],
        ], [
            'username.alpha_dash' => 'Username hanya boleh huruf, angka, tanda hubung, dan garis bawah.',
        ]);

        $treasurer->fill($data)->save();

        ActivityLogger::record(
            'bendahara.ubah',
            'bendahara',
            "Memperbarui data bendahara {$treasurer->name} ({$treasurer->username}).",
            [
                'subject_type' => 'user',
                'subject_id' => $treasurer->id,
                'subject_label' => $treasurer->name,
                'meta' => ['username' => $treasurer->username, 'email' => $treasurer->email],
            ],
        );

        return response()->json([
            'data' => $this->present($treasurer),
            'message' => 'Data bendahara berhasil diperbarui.',
        ]);
    }

    /**
     * Set a new password chosen by `pimpinan`.
     *
     * This is the recovery path when a treasurer is locked out, so it does not
     * require the old password. Every existing token is revoked so the new
     * password is the only way back in.
     */
    public function resetPassword(Request $request, User $treasurer): JsonResponse
    {
        $this->guardEditable($treasurer);

        $data = $request->validate([
            'password' => ['required', 'string', 'min:8', 'confirmed'],
        ], [
            'password.min' => 'Kata sandi minimal 8 karakter.',
            'password.confirmed' => 'Konfirmasi kata sandi tidak sama.',
        ]);

        $treasurer->password = $data['password'];
        $treasurer->save();
        $this->revokeTokens($treasurer);

        ActivityLogger::record(
            'bendahara.kata_sandi',
            'bendahara',
            "Mengatur ulang kata sandi bendahara {$treasurer->name}. Sesi bendahara dikeluarkan.",
            [
                'subject_type' => 'user',
                'subject_id' => $treasurer->id,
                'subject_label' => $treasurer->name,
            ],
        );

        return response()->json([
            'message' => "Kata sandi {$treasurer->name} berhasil diperbarui. Sesi bendahara dikeluarkan.",
        ]);
    }

    /** Suspend or restore a treasurer account. */
    public function setActive(Request $request, User $treasurer): JsonResponse
    {
        $this->guardEditable($treasurer);

        $data = $request->validate([
            'is_active' => ['required', 'boolean'],
        ]);

        $active = (bool) $data['is_active'];

        if (! $active) {
            $remaining = User::query()
                ->where('role', 'admin')
                ->where('is_active', true)
                ->where('id', '!=', $treasurer->id)
                ->count();

            // With no active treasurer left, payments could not be recorded at all.
            if ($remaining === 0) {
                throw ValidationException::withMessages([
                    'is_active' => ['Minimal harus ada satu bendahara aktif.'],
                ]);
            }
        }

        $treasurer->is_active = $active;
        $treasurer->save();

        // A suspended account must lose access immediately, not at token expiry.
        if (! $active) {
            $this->revokeTokens($treasurer);
        }

        ActivityLogger::record(
            $active ? 'bendahara.aktifkan' : 'bendahara.nonaktifkan',
            'bendahara',
            $active
                ? "Mengaktifkan kembali akun bendahara {$treasurer->name}."
                : "Menonaktifkan akun bendahara {$treasurer->name} dan mengeluarkan sesinya.",
            [
                'subject_type' => 'user',
                'subject_id' => $treasurer->id,
                'subject_label' => $treasurer->name,
            ],
        );

        return response()->json([
            'data' => $this->present($treasurer->fresh()),
            'message' => $active
                ? "Akun {$treasurer->name} diaktifkan kembali."
                : "Akun {$treasurer->name} dinonaktifkan.",
        ]);
    }

    /**
     * Reject anything that is not a treasurer. Route model binding would happily
     * resolve a `pimpinan` user, which must never be editable from this screen.
     */
    private function guardEditable(User $treasurer): void
    {
        abort_if($treasurer->role !== 'admin', 404, 'Akun bendahara tidak ditemukan.');
    }

    /** Drop every bearer token so the account must sign in again. */
    private function revokeTokens(User $user): void
    {
        DB::table('personal_access_tokens')
            ->where('tokenable_id', $user->id)
            ->where('tokenable_type', $user->getMorphClass())
            ->delete();
    }

    /** Shape a user for the API response, never leaking the password hash. */
    private function present(User $user): array
    {
        return [
            'id' => $user->id,
            'name' => $user->name,
            'username' => $user->username,
            'email' => $user->email,
            'role' => $user->role,
            'is_active' => (bool) $user->is_active,
            'created_at' => $user->created_at?->toDateTimeString(),
            // Avatars are rendered in the treasurer list, so the path travels here.
            'photo_path' => $user->photo_path,
        ];
    }
}
