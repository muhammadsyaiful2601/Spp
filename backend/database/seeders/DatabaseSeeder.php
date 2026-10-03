<?php

namespace Database\Seeders;

use App\Models\User;
use Illuminate\Database\Console\Seeds\WithoutModelEvents;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;

/**
 * Seeds login accounts only.
 *
 * No sample students, bills or transactions are created. Class levels, academic
 * years, positions and SPP periods are inserted by migration
 * `2026_10_01_070000_seed_school_reference_data` because the portal cannot
 * function without them.
 */
class DatabaseSeeder extends Seeder
{
    use WithoutModelEvents;

    public function run(): void
    {
        // Deliberately left unverified (`email_verified_at` stays NULL).
        //
        // Seeded accounts carry a placeholder address like `admin@example.test`,
        // which cannot receive mail. Marking them verified would hand out a
        // ready-to-use session on an address nobody proved they own, which is
        // exactly what the verification gate exists to prevent. Instead the first
        // sign-in has to redirect to the profile screen and confirm a real inbox.
        $account = [
            'name' => 'Admin Keuangan',
            'email' => 'admin@example.test',
            'password' => Hash::make('password'),
            'role' => 'admin',
        ];

        $this->seedUser('admin', $account);

        $this->seedUser('pimpinan', [
            ...$account,
            'name' => 'Pimpinan Sekolah',
            'email' => 'pimpinan@example.test',
            'role' => 'pimpinan',
        ]);
    }

    /**
     * Create or refresh one seeded account and force it back to unverified.
     *
     * `updateOrCreate()` only writes fillable attributes, so an existing row
     * would silently keep a stale `email_verified_at`. The explicit
     * `forceFill()` is what makes re-seeding reliably reset the gate.
     */
    private function seedUser(string $username, array $attributes): void
    {
        $user = User::updateOrCreate(['username' => $username], $attributes);

        $user->forceFill([
            'email_verified_at' => null,
            'email_verification_token' => null,
            'email_verification_sent_at' => null,
        ])->save();
    }
}
