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
        User::updateOrCreate(['username' => 'pimpinan'], [
            'name' => 'Pimpinan Sekolah',
            'email' => 'pimpinan@example.test',
            'password' => Hash::make('password'),
            'role' => 'pimpinan',
        ]);

        User::updateOrCreate(['username' => 'admin'], [
            'name' => 'Admin Keuangan',
            'email' => 'admin@example.test',
            'password' => Hash::make('password'),
            'role' => 'admin',
        ]);
    }
}