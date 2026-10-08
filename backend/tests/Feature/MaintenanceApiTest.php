<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class MaintenanceApiTest extends TestCase
{
    use RefreshDatabase;

    public function seed($class = 'Database\\Seeders\\DatabaseSeeder')
    {
        parent::seed($class);
        DB::table('users')->update(['email_verified_at' => now()]);

        return $this;
    }

    private function tokenFor(string $username): string
    {
        $token = $this->postJson('/api/v1/auth/login', [
            'username' => $username,
            'password' => 'password',
        ])->assertOk()->json('data.token');

        DB::table('users')->where('username', $username)->update(['email_verified_at' => now()]);

        return $token;
    }

    public function test_maintenance_endpoints_are_forbidden_for_non_leadership_accounts(): void
    {
        $this->seed();
        $token = $this->tokenFor('admin');

        $this->withToken($token)
            ->getJson('/api/v1/pimpinan/backup-database')
            ->assertForbidden();

        $this->withToken($token)
            ->postJson('/api/v1/pimpinan/bersihkan-cache')
            ->assertForbidden();
    }

    public function test_sqlite_backup_is_not_available(): void
    {
        $this->seed();
        $token = $this->tokenFor('pimpinan');

        $this->withToken($token)
            ->getJson('/api/v1/pimpinan/backup-database')
            ->assertStatus(422)
            ->assertJsonPath('message', 'Backup database hanya mendukung MySQL dan MariaDB.');
    }

    public function test_only_pimpinan_can_clear_application_cache(): void
    {
        $this->seed();
        $token = $this->tokenFor('pimpinan');
        Cache::shouldReceive('flush')->once()->andReturn(true);

        $this->withToken($token)
            ->postJson('/api/v1/pimpinan/bersihkan-cache')
            ->assertOk()
            ->assertJsonPath('message', 'Cache aplikasi berhasil dibersihkan.');

        $this->assertDatabaseHas('activity_logs', [
            'action' => 'pemeliharaan.cache_dibersihkan',
            'actor_username' => 'pimpinan',
            'category' => 'sistem',
        ]);
    }

    public function test_unverified_pimpinan_cannot_download_a_backup(): void
    {
        DB::table('users')->insert([
            'name' => 'Pimpinan Baru',
            'username' => 'pimpinan_baru',
            'email' => 'pimpinan.baru@example.test',
            'password' => Hash::make('password'),
            'role' => 'pimpinan',
            'is_active' => true,
            'email_verified_at' => null,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $token = $this->postJson('/api/v1/auth/login', [
            'username' => 'pimpinan_baru',
            'password' => 'password',
        ])->assertOk()->json('data.token');

        $this->withToken($token)
            ->getJson('/api/v1/pimpinan/backup-database')
            ->assertForbidden()
            ->assertJsonPath('code', 'email_unverified');
    }
}
