<?php

namespace Tests\Feature;

use App\Models\ActivityLog;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

/**
 * Read access to the audit trail.
 *
 * Every row is written as a side effect of an ordinary mutation, so the tests
 * below assert both halves of the feature: the write landed with a usable
 * actor/subject, and the read exposes it behind the right gates.
 */
class ActivityLogApiTest extends TestCase
{
    use RefreshDatabase;

    /** Seeded accounts start unverified; the suite confirms them here. */
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

    public function test_log_is_forbidden_for_accounts_that_are_not_leadership(): void
    {
        $this->seed();

        $this->withToken($this->tokenFor('admin'))
            ->getJson('/api/v1/pimpinan/log-aktivitas')
            ->assertForbidden();
    }

    public function test_log_is_blocked_until_the_address_is_verified(): void
    {
        // Deliberately *not* `seed()`: the fixture verifies everything, and this
        // test is about the gate catching an unverified `pimpinan` first.
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

        // The role is right, so verification is what refuses the request — with
        // the machine-readable code the frontend keys its screen on.
        $this->withToken($token)->getJson('/api/v1/pimpinan/log-aktivitas')
            ->assertForbidden()
            ->assertJsonPath('code', 'email_unverified');
    }

    public function test_pimpinan_reads_the_log_in_the_documented_shape(): void
    {
        $this->seed();
        $token = $this->tokenFor('pimpinan');

        // The sign-in that produced this token is itself an audited action.
        $response = $this->withToken($token)
            ->getJson('/api/v1/pimpinan/log-aktivitas')
            ->assertOk();

        $response->assertJsonStructure([
            'data' => [[
                'id', 'action', 'category', 'category_label', 'description',
                'actor' => ['id', 'name', 'username', 'role', 'role_label'],
                'subject', 'details', 'ip_address', 'created_at',
            ]],
            'meta' => ['page', 'per_page', 'total', 'last_page'],
            'summary' => ['total', 'today', 'actors', 'filtered', 'by_category'],
            'categories' => [['value', 'label']],
        ]);

        $this->assertSame('akun.masuk', $response->json('data.0.action'));
        $this->assertSame('Akun & keamanan', $response->json('data.0.category_label'));
        $this->assertSame('Pimpinan', $response->json('data.0.actor.role_label'));
        $this->assertSame('Pimpinan Sekolah', $response->json('data.0.actor.name'));

        // Canonical filter options are always offered, even with one row of data.
        $akun = collect($response->json('categories'))->firstWhere('value', 'akun');
        $this->assertNotNull($akun);
        $this->assertSame('Akun & keamanan', $akun['label']);

        // Headline figures describe the whole table, so they match the raw count.
        $this->assertSame(ActivityLog::query()->count(), $response->json('summary.total'));
        $this->assertGreaterThanOrEqual(1, $response->json('meta.total'));
    }

    public function test_a_mutation_is_recorded_and_readable_back(): void
    {
        $this->seed();
        $token = $this->tokenFor('pimpinan');

        $this->withToken($token)->postJson('/api/v1/pimpinan/bendahara', [
            'name' => 'Bendahara Baru',
            'username' => 'bendahara2',
            'email' => 'bendahara2@example.test',
            'password' => 'rahasia123',
            'password_confirmation' => 'rahasia123',
        ])->assertCreated();

        // The row carries a snapshotted actor rather than a join, so it survives
        // the account being renamed or deleted later.
        $this->assertDatabaseHas('activity_logs', [
            'action' => 'bendahara.tambah',
            'category' => 'bendahara',
            'actor_username' => 'pimpinan',
            'subject_type' => 'user',
            'subject_label' => 'Bendahara Baru',
        ]);

        $response = $this->withToken($token)
            ->getJson('/api/v1/pimpinan/log-aktivitas?category=bendahara')
            ->assertOk();

        $this->assertSame('bendahara.tambah', $response->json('data.0.action'));
        $this->assertSame('Kelola bendahara', $response->json('data.0.category_label'));
        $this->assertSame('Bendahara Baru', $response->json('data.0.subject.label'));
        $this->assertSame('bendahara2', $response->json('data.0.details.username'));
        $this->assertSame(1, $response->json('summary.filtered'));

        // The facet is counted *without* the category filter, so every other
        // option keeps its number while this one is selected.
        $byCategory = $response->json('summary.by_category');
        $this->assertSame(1, (int) ($byCategory['bendahara'] ?? 0));
        $this->assertSame(1, (int) ($byCategory['akun'] ?? 0));
    }

    public function test_search_and_date_filters_narrow_the_list_without_moving_the_headlines(): void
    {
        $this->seed();

        // A rejected sign-in has no actor to attribute, but it is exactly the
        // kind of event an audit screen exists to surface.
        $this->postJson('/api/v1/auth/login', [
            'username' => 'pimpinan',
            'password' => 'sandi-salah',
        ])->assertStatus(422);

        $token = $this->tokenFor('pimpinan');

        $search = $this->withToken($token)
            ->getJson('/api/v1/pimpinan/log-aktivitas?search=gagal')
            ->assertOk();
        $this->assertSame(1, $search->json('meta.total'));
        $this->assertSame('akun.masuk_gagal', $search->json('data.0.action'));
        // The anonymous row reads as the system, not as a missing person.
        $this->assertNull($search->json('data.0.actor.id'));
        $this->assertSame('Sistem', $search->json('data.0.actor.role_label'));

        // A range that excludes today empties the list but must not touch the
        // whole-table headline, which answers a different question.
        $outside = $this->withToken($token)
            ->getJson('/api/v1/pimpinan/log-aktivitas?from='.now()->addDay()->toDateString())
            ->assertOk();
        $this->assertSame(0, $outside->json('meta.total'));
        $this->assertSame(0, $outside->json('summary.filtered'));
        $this->assertSame(2, $outside->json('summary.total'));
        $this->assertGreaterThanOrEqual(2, $outside->json('summary.today'));
    }

    public function test_the_log_has_no_write_or_delete_route(): void
    {
        $this->seed();
        $token = $this->tokenFor('pimpinan');
        $before = ActivityLog::query()->count();

        foreach (['postJson', 'putJson', 'deleteJson'] as $method) {
            $this->{$method}('/api/v1/pimpinan/log-aktivitas', [])->assertStatus(405);
        }

        $this->assertSame($before, ActivityLog::query()->count());
    }
}

