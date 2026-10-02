<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class SchoolPaymentApiTest extends TestCase
{
    use RefreshDatabase;

    /**
     * Create a student with the given number of leading academic months already
     * paid. The seeder only creates accounts, so each test builds its own data.
     * Academic order is Jul..Dec then Jan..Jun, matching the UI month grid.
     */
    private function makeStudent(string $number, string $nisn, int $classOrder, int $lunasMonths): int
    {
        $yearId = DB::table('academic_years')->where('is_active', true)->value('id');
        $levelId = DB::table('class_levels')->where('sort_order', $classOrder)->value('id');
        $studentId = DB::table('students')->insertGetId([
            'nisn' => $nisn, 'student_number' => $number, 'full_name' => "Siswa {$number}",
            'class_level_id' => $levelId, 'is_active' => true, 'created_at' => now(), 'updated_at' => now(),
        ]);

        $amount = (float) DB::table('spp_periods')->where('class_level_id', $levelId)
            ->where('academic_year_id', $yearId)->where('month_start', 7)->value('monthly_amount');

        foreach ([7, 8, 9, 10, 11, 12, 1, 2, 3, 4, 5, 6] as $position => $month) {
            $lunas = $position < $lunasMonths;
            DB::table('spp_bills')->insert([
                'student_id' => $studentId, 'academic_year_id' => $yearId, 'month' => $month,
                'calendar_year' => $month >= 7 ? 2026 : 2027, 'amount' => $amount,
                'status' => $lunas ? 'lunas' : 'belum_bayar',
                'paid_at' => $lunas ? now() : null, 'created_at' => now(), 'updated_at' => now(),
            ]);
        }

        return $studentId;
    }

    public function test_admin_can_pay_multiple_spp_months_and_retrieve_receipt(): void
    {
        $this->seed();
        $login = $this->postJson('/api/v1/auth/login', [
            'username' => 'admin',
            'password' => 'password',
        ])->assertOk();
        $token = $login->json('data.token');
        $yearId = DB::table('academic_years')->where('is_active', true)->value('id');
        // Only the first 8 academic months (Jul..Feb) are paid, so months 3 and 4
        // of the calendar year are still outstanding.
        $studentId = $this->makeStudent('2401001', '0128456731', 1, 8);
        $months = [3, 4];

        $payment = $this->withToken($token)->postJson('/api/v1/admin/pembayaran/spp', [
            'student_id' => $studentId,
            'academic_year_id' => $yearId,
            'months' => $months,
        ])->assertCreated();

        foreach ($months as $month) {
            $this->assertDatabaseHas('spp_bills', [
                'student_id' => $studentId,
                'academic_year_id' => $yearId,
                'month' => $month,
                'status' => 'lunas',
            ]);
        }
        $this->assertDatabaseHas('payment_transactions', [
            'transaction_number' => $payment->json('data.transaction_number'),
            'student_id' => $studentId,
            'type' => 'spp',
        ]);

        $this->withToken($token)->getJson('/api/v1/admin/transaksi/'.$payment->json('data.transaction_number').'/cetak-kuitansi')
            ->assertOk()
            ->assertJsonPath('data.transaction.type', 'spp');
    }

    public function test_portal_endpoint_starts_empty_and_maps_paid_months_to_academic_order(): void
    {
        $this->seed();
        $token = $this->postJson('/api/v1/auth/login', [
            'username' => 'admin',
            'password' => 'password',
        ])->assertOk()->json('data.token');

        // A fresh install must expose no sample students or transactions.
        $empty = $this->withToken($token)->getJson('/api/v1/data/portal')->assertOk();
        $this->assertSame([], $empty->json('data.students'));
        $this->assertSame([], $empty->json('data.transactions'));
        $this->assertSame(0.0, (float) $empty->json('data.summary.total_received'));

        // Reference data is still present so the portal remains usable.
        $this->assertCount(6, $empty->json('data.class_levels'));
        $this->assertCount(6, $empty->json('data.spp_rates'));
        $this->assertNotNull($empty->json('data.academic_year'));
        $this->assertCount(12, $empty->json('data.summary.monthly_revenue'));

        // 8 paid months must come back as academic indexes 0..7 (Jul..Feb).
        $this->makeStudent('2401001', '0128456731', 1, 8);
        $this->makeStudent('2203018', '0106234581', 3, 6);

        $response = $this->withToken($token)->getJson('/api/v1/data/portal')->assertOk();
        $students = $response->json('data.students');
        $this->assertCount(2, $students);

        $first = collect($students)->firstWhere('student_number', '2401001');
        $this->assertSame(range(0, 7), $first['paid_months']);
        $second = collect($students)->firstWhere('student_number', '2203018');
        $this->assertSame(range(0, 5), $second['paid_months']);

        // Figures must be derived from stored rows, not from placeholders.
        $this->assertSame(
            (float) DB::table('payment_transactions')->sum('amount'),
            (float) $response->json('data.summary.total_received'),
        );
        $this->assertSame(
            (float) DB::table('spp_bills')->where('status', 'belum_bayar')->sum('amount'),
            (float) $response->json('data.summary.spp_arrears'),
        );
    }

    public function test_portal_endpoint_requires_authentication(): void
    {
        $this->seed();

        $this->getJson('/api/v1/data/portal')->assertUnauthorized();
    }

    public function test_user_can_read_and_update_their_own_account(): void
    {
        $this->seed();
        $token = $this->postJson('/api/v1/auth/login', [
            'username' => 'admin',
            'password' => 'password',
        ])->assertOk()->json('data.token');

        $me = $this->withToken($token)->getJson('/api/v1/auth/me')->assertOk();
        $this->assertSame('admin', $me->json('data.username'));
        $this->assertSame('Admin Keuangan', $me->json('data.name'));
        $this->assertSame('admin', $me->json('data.role'));
        $this->assertArrayNotHasKey('password', $me->json('data'));

        $this->withToken($token)->postJson('/api/v1/auth/profile', [
            'name' => 'Admin Keuangan Baru',
            'email' => 'baru@example.test',
        ])->assertOk()
            ->assertJsonPath('data.name', 'Admin Keuangan Baru')
            ->assertJsonPath('data.email', 'baru@example.test');

        // Username and role are never writable from this endpoint.
        $this->assertDatabaseHas('users', [
            'username' => 'admin',
            'name' => 'Admin Keuangan Baru',
            'role' => 'admin',
        ]);

        $this->withToken($token)->postJson('/api/v1/auth/profile', [
            'name' => 'X',
            'email' => 'pimpinan@example.test',
        ])->assertUnprocessable();
    }

    public function test_user_can_change_their_own_password(): void
    {
        $this->seed();
        $token = $this->postJson('/api/v1/auth/login', [
            'username' => 'admin',
            'password' => 'password',
        ])->assertOk()->json('data.token');

        // A wrong current password must not change anything.
        $this->withToken($token)->postJson('/api/v1/auth/password', [
            'current_password' => 'salah-sekali',
            'password' => 'rahasia123',
            'password_confirmation' => 'rahasia123',
        ])->assertUnprocessable()
            ->assertJsonValidationErrors('current_password');
        $this->assertTrue(Hash::check('password', DB::table('users')->where('username', 'admin')->value('password')));

        // Too short, and mismatched confirmation, are rejected too.
        $this->withToken($token)->postJson('/api/v1/auth/password', [
            'current_password' => 'password',
            'password' => 'pendek',
            'password_confirmation' => 'pendek',
        ])->assertUnprocessable()
            ->assertJsonValidationErrors('password');

        $this->withToken($token)->postJson('/api/v1/auth/password', [
            'current_password' => 'password',
            'password' => 'rahasia123',
            'password_confirmation' => 'beda-sekali',
        ])->assertUnprocessable()
            ->assertJsonValidationErrors('password');

        $this->withToken($token)->postJson('/api/v1/auth/password', [
            'current_password' => 'password',
            'password' => 'rahasia123',
            'password_confirmation' => 'rahasia123',
        ])->assertOk();

        $this->assertTrue(Hash::check('rahasia123', DB::table('users')->where('username', 'admin')->value('password')));

        // Note: re-logging in inside the same test is avoided on purpose —
        // `Auth::attempt()` writes a session, and a second login within one test
        // swaps the guard to a RequestGuard that has no `attempt()`.
    }

    public function test_account_endpoints_require_authentication(): void
    {
        $this->seed();

        $this->getJson('/api/v1/auth/me')->assertUnauthorized();
        $this->postJson('/api/v1/auth/profile', ['name' => 'X', 'email' => 'x@y.test'])->assertUnauthorized();
        $this->postJson('/api/v1/auth/password', [])->assertUnauthorized();
    }

    public function test_leadership_can_save_theme_and_it_is_public(): void
    {
        $this->seed();
        $token = $this->postJson('/api/v1/auth/login', [
            'username' => 'pimpinan',
            'password' => 'password',
        ])->assertOk()->json('data.token');

        $this->withToken($token)->postJson('/api/v1/pimpinan/sekolah-profile/theme', [
            'theme_primary' => '#7D2C34',
            'theme_accent' => '#CFA14B',
        ])->assertOk()
            ->assertJsonPath('data.theme_primary', '#7d2c34')
            ->assertJsonPath('data.theme_accent', '#cfa14b');

        $this->assertDatabaseHas('school_profiles', [
            'theme_primary' => '#7d2c34',
            'theme_accent' => '#cfa14b',
        ]);

        // Every signed-in user, and the public endpoint, must see the new theme.
        $public = $this->getJson('/api/v1/public/sekolah-profile')->assertOk();
        $this->assertSame('#7d2c34', $public->json('data.theme_primary'));
        $this->assertSame('#cfa14b', $public->json('data.theme_accent'));
    }

    public function test_theme_rejects_invalid_colors(): void
    {
        $this->seed();
        $pimpinan = $this->postJson('/api/v1/auth/login', [
            'username' => 'pimpinan', 'password' => 'password',
        ])->assertOk()->json('data.token');

        // `Auth::attempt()` writes a session, so every assertion here must run
        // before a second login happens in the same test.
        $this->withToken($pimpinan)->postJson('/api/v1/pimpinan/sekolah-profile/theme', [
            'theme_primary' => 'hijau',
            'theme_accent' => '#c88942',
        ])->assertUnprocessable();

        $this->withToken($pimpinan)->postJson('/api/v1/pimpinan/sekolah-profile/theme', [
            'theme_primary' => '#12345',
            'theme_accent' => '#c88942',
        ])->assertUnprocessable();

        $this->withToken($pimpinan)->postJson('/api/v1/pimpinan/sekolah-profile/theme', [
            'theme_accent' => '#c88942',
        ])->assertUnprocessable();

        $this->assertDatabaseMissing('school_profiles', ['theme_primary' => 'hijau']);
    }

    public function test_admin_cannot_change_the_theme(): void
    {
        $this->seed();
        $admin = $this->postJson('/api/v1/auth/login', [
            'username' => 'admin', 'password' => 'password',
        ])->assertOk()->json('data.token');

        $this->withToken($admin)->postJson('/api/v1/pimpinan/sekolah-profile/theme', [
            'theme_primary' => '#123456', 'theme_accent' => '#abcdef',
        ])->assertForbidden();

        $this->assertDatabaseMissing('school_profiles', ['theme_primary' => '#123456']);
    }

    public function test_theme_defaults_to_green_and_gold_on_a_fresh_install(): void
    {
        $this->seed();

        $public = $this->getJson('/api/v1/public/sekolah-profile')->assertOk();

        $this->assertSame('#24634e', $public->json('data.theme_primary'));
        $this->assertSame('#c88942', $public->json('data.theme_accent'));
    }

    public function test_seeder_creates_only_accounts(): void
    {
        $this->seed();

        $this->assertSame(2, DB::table('users')->count());
        $this->assertSame(0, DB::table('students')->count());
        $this->assertSame(0, DB::table('spp_bills')->count());
        $this->assertSame(0, DB::table('payment_transactions')->count());
        $this->assertSame(0, DB::table('non_spp_bills')->count());
        $this->assertSame(0, DB::table('school_profiles')->count());
    }

    public function test_role_middleware_restricts_school_settings_to_leadership(): void
    {
        $this->seed();
        $token = $this->postJson('/api/v1/auth/login', [
            'username' => 'admin',
            'password' => 'password',
        ])->assertOk()->json('data.token');

        $this->withToken($token)->getJson('/api/v1/pimpinan/sekolah-profile')->assertForbidden();
        $this->withToken($token)->getJson('/api/v1/admin/siswa')->assertOk();
    }

    public function test_non_spp_installments_track_remaining_balance_and_reject_overpayment(): void
    {
        $this->seed();
        $token = $this->postJson('/api/v1/auth/login', [
            'username' => 'admin',
            'password' => 'password',
        ])->assertOk()->json('data.token');
        $studentId = $this->makeStudent('2401001', '0128456731', 1, 6);
        $levelId = DB::table('class_levels')->where('sort_order', 1)->value('id');
        $rate = DB::table('position_rates')
            ->join('payment_positions', 'payment_positions.id', '=', 'position_rates.payment_position_id')
            ->where('payment_positions.name', 'Uang Pembangunan')
            ->where('position_rates.class_level_id', $levelId)
            ->value('position_rates.id');

        $this->withToken($token)->postJson('/api/v1/admin/pembayaran/non-spp', [
            'student_id' => $studentId,
            'position_rate_id' => $rate,
            'amount' => 400000,
        ])->assertCreated();

        $bill = DB::table('non_spp_bills')->where('student_id', $studentId)->where('position_rate_id', $rate)->first();
        $this->assertSame('sebagian', $bill->status);
        $this->assertSame(400000.0, (float) $bill->amount_paid);

        $this->withToken($token)->postJson('/api/v1/admin/pembayaran/non-spp', [
            'student_id' => $studentId,
            'position_rate_id' => $rate,
            'amount' => 1100001,
        ])->assertUnprocessable();

        $this->withToken($token)->postJson('/api/v1/admin/pembayaran/non-spp', [
            'student_id' => $studentId,
            'position_rate_id' => $rate,
            'amount' => 1100000,
        ])->assertCreated();

        $this->assertDatabaseHas('non_spp_bills', [
            'id' => $bill->id,
            'amount_paid' => 1500000,
            'status' => 'lunas',
        ]);
    }

    public function test_spp_period_rejects_incomplete_semester_ranges_even_when_months_are_strings(): void
    {
        $this->seed();
        $token = $this->postJson('/api/v1/auth/login', [
            'username' => 'pimpinan',
            'password' => 'password',
        ])->assertOk()->json('data.token');

        $this->withToken($token)->postJson('/api/v1/pimpinan/spp-periode', [
            'academic_year_id' => DB::table('academic_years')->value('id'),
            'class_level_id' => DB::table('class_levels')->value('id'),
            'name' => 'Semester Ganjil',
            'month_start' => '7',
            'month_end' => '6',
            'monthly_amount' => 350000,
        ])->assertUnprocessable();
    }

    public function test_leadership_can_upload_replace_and_delete_the_school_favicon(): void
    {
        Storage::fake('public');
        $this->seed();
        $token = $this->postJson('/api/v1/auth/login', [
            'username' => 'pimpinan',
            'password' => 'password',
        ])->assertOk()->json('data.token');

        $first = $this->withToken($token)
            ->post('/api/v1/pimpinan/sekolah-profile/upload-favicon', [
                'favicon' => UploadedFile::fake()->image('favicon.png', 64, 64),
            ], ['Accept' => 'application/json'])
            ->assertOk()
            ->json('data.favicon_path');

        $this->assertNotNull($first);
        Storage::disk('public')->assertExists($first);
        $this->assertDatabaseHas('school_profiles', ['favicon_path' => $first]);

        $second = $this->withToken($token)
            ->post('/api/v1/pimpinan/sekolah-profile/upload-favicon', [
                'favicon' => UploadedFile::fake()->image('favicon-2.png', 64, 64),
            ], ['Accept' => 'application/json'])
            ->assertOk()
            ->json('data.favicon_path');

        $this->assertNotSame($first, $second);
        Storage::disk('public')->assertMissing($first);
        Storage::disk('public')->assertExists($second);
        $this->getJson('/api/v1/public/sekolah-profile')
            ->assertOk()
            ->assertJsonPath('data.favicon_path', $second);

        $this->withToken($token)
            ->deleteJson('/api/v1/pimpinan/sekolah-profile/favicon')
            ->assertOk()
            ->assertJsonPath('data.favicon_path', null);

        Storage::disk('public')->assertMissing($second);
        $this->assertDatabaseHas('school_profiles', ['favicon_path' => null]);
    }

    public function test_favicon_upload_rejects_non_image_files(): void
    {
        Storage::fake('public');
        $this->seed();
        $token = $this->postJson('/api/v1/auth/login', [
            'username' => 'pimpinan',
            'password' => 'password',
        ])->assertOk()->json('data.token');

        $this->withToken($token)
            ->post('/api/v1/pimpinan/sekolah-profile/upload-favicon', [
                'favicon' => UploadedFile::fake()->createWithContent('favicon.svg', '<svg xmlns="http://www.w3.org/2000/svg"></svg>'),
            ], ['Accept' => 'application/json'])
            ->assertUnprocessable();

        $this->withToken($token)
            ->post('/api/v1/pimpinan/sekolah-profile/upload-favicon', [
                'favicon' => UploadedFile::fake()->image('favicon.png', 64, 64),
            ], ['Accept' => 'application/json'])
            ->assertOk();

        $this->assertSame(1, DB::table('school_profiles')->whereNotNull('favicon_path')->count());
    }

    public function test_admin_cannot_manage_the_school_favicon(): void
    {
        Storage::fake('public');
        $this->seed();
        $token = $this->postJson('/api/v1/auth/login', [
            'username' => 'admin',
            'password' => 'password',
        ])->assertOk()->json('data.token');

        $this->withToken($token)
            ->post('/api/v1/pimpinan/sekolah-profile/upload-favicon', [
                'favicon' => UploadedFile::fake()->image('favicon.png', 64, 64),
            ], ['Accept' => 'application/json'])
            ->assertForbidden();

        $this->withToken($token)
            ->deleteJson('/api/v1/pimpinan/sekolah-profile/favicon')
            ->assertForbidden();

        $this->assertSame(0, DB::table('school_profiles')->whereNotNull('favicon_path')->count());
    }
}
