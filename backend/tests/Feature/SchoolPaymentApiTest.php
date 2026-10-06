<?php

namespace Tests\Feature;

use App\Models\User;
use App\Notifications\ResetPasswordNotification;
use App\Notifications\VerifyEmailNotification;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class SchoolPaymentApiTest extends TestCase
{
    use RefreshDatabase;

    /**
     * Seed, then mark the accounts verified.
     *
     * Seeded accounts start unverified on purpose (see DatabaseSeeder), so the
     * suite confirms them here instead of repeating the step in every test.
     * The verification gate has its own tests that call `parent::seed()` or undo
     * this, so they still observe the real starting state.
     */
    public function seed($class = 'Database\\Seeders\\DatabaseSeeder')
    {
        parent::seed($class);

        DB::table('users')->update(['email_verified_at' => now()]);

        return $this;
    }

    /**
     * Sign in as the given seeded account and return its bearer token.
     *
     * Seeded accounts now start unverified on purpose, so the fixture marks them
     * verified before authenticating. The verification gate has its own dedicated
     * tests that deliberately skip this step.
     */
    private function tokenFor(string $username): string
    {
        $token = $this->postJson('/api/v1/auth/login', [
            'username' => $username,
            'password' => 'password',
        ])->assertOk()->json('data.token');

        DB::table('users')->where('username', $username)->update(['email_verified_at' => now()]);

        return $token;
    }

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
            'username' => 'admin',
            'email' => 'baru@example.test',
        ])->assertOk()
            ->assertJsonPath('data.name', 'Admin Keuangan Baru')
            ->assertJsonPath('data.email', 'baru@example.test');

        // The role is never writable, but the username is now self-service.
        $this->assertDatabaseHas('users', [
            'username' => 'admin',
            'name' => 'Admin Keuangan Baru',
            'role' => 'admin',
        ]);

        $this->withToken($token)->postJson('/api/v1/auth/profile', [
            'name' => 'X',
            'username' => 'admin',
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

    public function test_leadership_can_update_school_identity_and_it_is_public(): void
    {
        $this->seed();
        $token = $this->postJson('/api/v1/auth/login', [
            'username' => 'pimpinan',
            'password' => 'password',
        ])->assertOk()->json('data.token');

        $this->withToken($token)->postJson('/api/v1/pimpinan/sekolah-profile', [
            'school_name' => 'SDIT Al-Falah',
            'foundation_name' => 'Yayasan Al-Falah',
            'address' => 'Jl. Pendidikan No. 1, Bogor',
            'phone' => '081234567890',
            'email' => 'sekolah@alfalah.sch.id',
            'receipt_note' => 'Terima kasih atas pembayarannya.',
            'receipt_template' => 'termal',
        ])->assertOk()
            ->assertJsonPath('data.school_name', 'SDIT Al-Falah')
            ->assertJsonPath('data.receipt_template', 'termal');

        $this->assertDatabaseHas('school_profiles', [
            'school_name' => 'SDIT Al-Falah',
            'foundation_name' => 'Yayasan Al-Falah',
            'receipt_note' => 'Terima kasih atas pembayarannya.',
        ]);

        // Every client reads branding through the public endpoint, so the saved
        // identity must travel there — otherwise other devices stay stale.
        $this->getJson('/api/v1/public/sekolah-profile')->assertOk()
            ->assertJsonPath('data.school_name', 'SDIT Al-Falah')
            ->assertJsonPath('data.foundation_name', 'Yayasan Al-Falah')
            ->assertJsonPath('data.address', 'Jl. Pendidikan No. 1, Bogor')
            ->assertJsonPath('data.phone', '081234567890')
            ->assertJsonPath('data.receipt_note', 'Terima kasih atas pembayarannya.');

        // An identity change must leave an audit row behind.
        $this->assertDatabaseHas('activity_logs', [
            'action' => 'profil_sekolah.ubah',
            'category' => 'profil_sekolah',
        ]);
    }

    public function test_identity_update_requires_a_name_and_an_address(): void
    {
        $this->seed();
        $token = $this->postJson('/api/v1/auth/login', [
            'username' => 'pimpinan',
            'password' => 'password',
        ])->assertOk()->json('data.token');

        $this->withToken($token)->postJson('/api/v1/pimpinan/sekolah-profile', [
            'address' => 'Jl. Tanpa Nama',
            'receipt_template' => 'standard',
        ])->assertUnprocessable()->assertJsonValidationErrors('school_name');

        $this->withToken($token)->postJson('/api/v1/pimpinan/sekolah-profile', [
            'school_name' => 'Tanpa Alamat',
            'receipt_template' => 'standard',
        ])->assertUnprocessable()->assertJsonValidationErrors('address');
    }

    public function test_admin_cannot_update_school_identity(): void
    {
        $this->seed();
        $token = $this->postJson('/api/v1/auth/login', [
            'username' => 'admin',
            'password' => 'password',
        ])->assertOk()->json('data.token');

        $this->withToken($token)->postJson('/api/v1/pimpinan/sekolah-profile', [
            'school_name' => 'Sekolah Terverifikasi',
            'address' => 'Jl. Admin',
            'receipt_template' => 'standard',
        ])->assertForbidden();

        $this->assertDatabaseMissing('school_profiles', ['school_name' => 'Sekolah Terverifikasi']);
    }

    public function test_leadership_can_upload_a_logo_and_it_is_public(): void
    {
        Storage::fake('public');
        $this->seed();
        $token = $this->postJson('/api/v1/auth/login', [
            'username' => 'pimpinan',
            'password' => 'password',
        ])->assertOk()->json('data.token');

        $first = $this->withToken($token)
            ->post('/api/v1/pimpinan/sekolah-profile/upload-logo', [
                'logo' => UploadedFile::fake()->image('logo.png', 120, 120),
            ], ['Accept' => 'application/json'])
            ->assertOk()
            ->json('data.logo_path');

        $this->assertNotNull($first);
        Storage::disk('public')->assertExists($first);
        $this->assertDatabaseHas('school_profiles', ['logo_path' => $first]);
        $this->getJson('/api/v1/public/sekolah-profile')
            ->assertOk()
            ->assertJsonPath('data.logo_path', $first);

        // Replacing the logo must not leave the old file behind.
        $second = $this->withToken($token)
            ->post('/api/v1/pimpinan/sekolah-profile/upload-logo', [
                'logo' => UploadedFile::fake()->image('logo-2.png', 120, 120),
            ], ['Accept' => 'application/json'])
            ->assertOk()
            ->json('data.logo_path');

        $this->assertNotSame($first, $second);
        Storage::disk('public')->assertMissing($first);
        Storage::disk('public')->assertExists($second);
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

    public function test_admin_cannot_upload_or_remove_school_branding_files(): void
    {
        Storage::fake('public');
        $this->seed();
        $token = $this->postJson('/api/v1/auth/login', [
            'username' => 'admin',
            'password' => 'password',
        ])->assertOk()->json('data.token');

        $this->withToken($token)
            ->post('/api/v1/pimpinan/sekolah-profile/upload-logo', [
                'logo' => UploadedFile::fake()->image('logo.png', 120, 120),
            ], ['Accept' => 'application/json'])
            ->assertForbidden();

        $this->withToken($token)
            ->post('/api/v1/pimpinan/sekolah-profile/upload-favicon', [
                'favicon' => UploadedFile::fake()->image('favicon.png', 32, 32),
            ], ['Accept' => 'application/json'])
            ->assertForbidden();

        $this->withToken($token)
            ->deleteJson('/api/v1/pimpinan/sekolah-profile/favicon')
            ->assertForbidden();

        $this->assertDatabaseMissing('school_profiles', ['logo_path' => 'logo.png']);
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

    public function test_academic_years_are_listed_with_useful_context(): void
    {
        $this->seed();
        $token = $this->tokenFor('admin');

        $years = $this->withToken($token)->getJson('/api/v1/data/tahun-ajaran')->assertOk()->json('data');

        $this->assertCount(1, $years);
        $this->assertSame('2026/2027', $years[0]['name']);
        $this->assertTrue($years[0]['is_active']);
        // The seeded year always carries SPP periods, so it must be flagged usable.
        $this->assertTrue($years[0]['has_tariffs']);
    }

    public function test_academic_years_listing_requires_authentication(): void
    {
        $this->seed();

        $this->getJson('/api/v1/data/tahun-ajaran')->assertUnauthorized();
    }

    public function test_leadership_can_create_an_academic_year_and_copy_tariffs(): void
    {
        $this->seed();
        $token = $this->tokenFor('pimpinan');
        $sourceId = (int) DB::table('academic_years')->where('is_active', true)->value('id');

        $sourceSpp = DB::table('spp_periods')->where('academic_year_id', $sourceId)->count();
        $sourcePosition = DB::table('position_rates')->where('academic_year_id', $sourceId)->count();

        $response = $this->withToken($token)->postJson('/api/v1/pimpinan/tahun-ajaran', [
            'start_year' => 2027,
            'end_year' => 2028,
            'copy_from' => $sourceId,
        ])->assertCreated();

        $newId = (int) $response->json('data.id');
        $this->assertSame('2027/2028', $response->json('data.name'));

        // Copying tariffs is what makes the new year immediately usable.
        $this->assertSame($sourceSpp, DB::table('spp_periods')->where('academic_year_id', $newId)->count());
        $this->assertSame($sourcePosition, DB::table('position_rates')->where('academic_year_id', $newId)->count());
        // The source year keeps its own tariffs untouched.
        $this->assertSame($sourceSpp, DB::table('spp_periods')->where('academic_year_id', $sourceId)->count());
        // A new year is not active unless it was asked for.
        $this->assertFalse((bool) DB::table('academic_years')->where('id', $newId)->value('is_active'));
    }

    public function test_academic_year_rejects_invalid_or_duplicate_input(): void
    {
        $this->seed();
        $token = $this->tokenFor('pimpinan');

        // end_year must be exactly one year after start_year.
        $this->withToken($token)->postJson('/api/v1/pimpinan/tahun-ajaran', [
            'start_year' => 2027, 'end_year' => 2029,
        ])->assertStatus(422)->assertJsonValidationErrors('end_year');

        // The seeded 2026/2027 already exists.
        $this->withToken($token)->postJson('/api/v1/pimpinan/tahun-ajaran', [
            'start_year' => 2026, 'end_year' => 2027,
        ])->assertStatus(422)->assertJsonValidationErrors('name');

        $this->assertSame(1, DB::table('academic_years')->count());
    }

    public function test_activating_a_year_demotes_the_previous_one(): void
    {
        $this->seed();
        $token = $this->tokenFor('pimpinan');
        $oldId = (int) DB::table('academic_years')->where('is_active', true)->value('id');

        $newId = (int) $this->withToken($token)->postJson('/api/v1/pimpinan/tahun-ajaran', [
            'start_year' => 2027, 'end_year' => 2028,
        ])->assertCreated()->json('data.id');

        $this->withToken($token)->postJson("/api/v1/pimpinan/tahun-ajaran/{$newId}/aktifkan")->assertOk();

        // Exactly one year may be active, otherwise the portal default is ambiguous.
        $this->assertSame(1, DB::table('academic_years')->where('is_active', true)->count());
        $this->assertTrue((bool) DB::table('academic_years')->where('id', $newId)->value('is_active'));
        $this->assertFalse((bool) DB::table('academic_years')->where('id', $oldId)->value('is_active'));
    }

    public function test_admin_cannot_manage_academic_years(): void
    {
        $this->seed();
        $token = $this->tokenFor('admin');

        $this->withToken($token)->postJson('/api/v1/pimpinan/tahun-ajaran', [
            'start_year' => 2027, 'end_year' => 2028,
        ])->assertForbidden();

        $this->withToken($token)->postJson('/api/v1/pimpinan/tahun-ajaran/1/aktifkan')->assertForbidden();
    }

    public function test_portal_can_be_scoped_to_a_specific_academic_year(): void
    {
        $this->seed();
        $admin = $this->tokenFor('admin');
        $sourceId = (int) DB::table('academic_years')->where('is_active', true)->value('id');

        // `pimpinan` is the only role allowed to create years.
        $leaderToken = $this->tokenFor('pimpinan');
        $targetId = (int) $this->withToken($leaderToken)->postJson('/api/v1/pimpinan/tahun-ajaran', [
            'start_year' => 2027,
            'end_year' => 2028,
            'copy_from' => $sourceId,
        ])->assertCreated()->json('data.id');

        $this->makeStudent('2401001', '0128456731', 1, 8);

        // With no explicit id the portal falls back to the active year.
        $this->withToken($admin)->getJson('/api/v1/data/portal')
            ->assertOk()
            ->assertJsonPath('data.academic_year.id', $sourceId);
        $this->assertSame(
            range(0, 7),
            $this->withToken($admin)->getJson('/api/v1/data/portal')->json('data.students.0.paid_months'),
        );

        // Asking for the other year switches scope: the bills belong to 2026/2027,
        // so the 2027/2028 view must come back empty rather than leaking them.
        $scoped = $this->withToken($admin)
            ->getJson("/api/v1/data/portal?academic_year_id={$targetId}")
            ->assertOk();
        $this->assertSame($targetId, $scoped->json('data.academic_year.id'));
        $this->assertSame('2027/2028', $scoped->json('data.academic_year.name'));
        $this->assertSame([], $scoped->json('data.students.0.paid_months'));
        $this->assertSame(0.0, (float) $scoped->json('data.summary.total_received'));
        // Copied tariffs mean the new year still prices SPP instead of reading Rp 0.
        $this->assertCount(6, $scoped->json('data.spp_rates'));

        // A bogus id must be rejected rather than silently returning empty data.
        $this->withToken($admin)
            ->getJson('/api/v1/data/portal?academic_year_id=999999')
            ->assertStatus(422);
    }

    // --- Treasurer management -------------------------------------------------

    /** Create a treasurer directly, bypassing HTTP so setup stays terse. */
    private function makeTreasurer(string $username): int
    {
        return (int) DB::table('users')->insertGetId([
            'name' => "Bendahara {$username}",
            'username' => $username,
            'email' => "{$username}@example.test",
            'password' => Hash::make('password'),
            'role' => 'admin',
            'is_active' => true,
            'created_at' => now(),
            'updated_at' => now(),
        ]);
    }

    public function test_leadership_can_list_only_treasurer_accounts(): void
    {
        $this->seed();
        $token = $this->tokenFor('pimpinan');

        $rows = $this->withToken($token)->getJson('/api/v1/pimpinan/bendahara')->assertOk()->json('data');

        // The seeded `admin` is a treasurer; the leadership account must not appear.
        $this->assertCount(1, $rows);
        $this->assertSame('admin', $rows[0]['username']);
        $this->assertSame('admin', $rows[0]['role']);
        $this->assertTrue($rows[0]['is_active']);
        // The password hash must never be serialised.
        $this->assertArrayNotHasKey('password', $rows[0]);
    }

    public function test_leadership_can_create_a_treasurer(): void
    {
        $this->seed();
        $token = $this->tokenFor('pimpinan');

        $this->withToken($token)->postJson('/api/v1/pimpinan/bendahara', [
            'name' => 'Bendahara Baru',
            'username' => 'bendahara2',
            'email' => 'bendahara2@example.test',
            'password' => 'rahasia123',
            'password_confirmation' => 'rahasia123',
        ])->assertCreated()->assertJsonPath('data.username', 'bendahara2');

        $this->assertDatabaseHas('users', [
            'username' => 'bendahara2',
            'role' => 'admin',
            'is_active' => true,
        ]);
        // The stored value must be hashed, never the plaintext.
        $this->assertTrue(Hash::check('rahasia123', User::where('username', 'bendahara2')->value('password')));
    }

    public function test_a_newly_created_treasurer_can_log_in(): void
    {
        // Kept separate from the create test: calling the login endpoint twice in
        // one test swaps the session guard and breaks the second attempt.
        $this->seed();
        $id = $this->makeTreasurer('bendahara2');
        User::where('id', $id)->update(['password' => Hash::make('rahasia123')]);

        $this->postJson('/api/v1/auth/login', [
            'username' => 'bendahara2',
            'password' => 'rahasia123',
        ])->assertOk()->assertJsonPath('data.user.role', 'admin');
    }

    public function test_treasurer_creation_validates_and_rejects_duplicates(): void
    {
        $this->seed();
        $token = $this->tokenFor('pimpinan');

        // Password must be confirmed and long enough.
        $this->withToken($token)->postJson('/api/v1/pimpinan/bendahara', [
            'name' => 'X', 'username' => 'x1', 'email' => 'x1@example.test',
            'password' => 'short', 'password_confirmation' => 'short',
        ])->assertStatus(422)->assertJsonValidationErrors('password');

        // Username must be unique.
        $this->withToken($token)->postJson('/api/v1/pimpinan/bendahara', [
            'name' => 'X', 'username' => 'admin', 'email' => 'x2@example.test',
            'password' => 'rahasia123', 'password_confirmation' => 'rahasia123',
        ])->assertStatus(422)->assertJsonValidationErrors('username');

        $this->assertSame(2, DB::table('users')->count());
    }

    public function test_leadership_can_update_and_reset_a_treasurer_password(): void
    {
        $this->seed();
        $token = $this->tokenFor('pimpinan');
        $id = $this->makeTreasurer('bendahara3');

        $this->withToken($token)->putJson("/api/v1/pimpinan/bendahara/{$id}", [
            'name' => 'Nama Baru', 'username' => 'bendahara3', 'email' => 'baru@example.test',
        ])->assertOk()->assertJsonPath('data.name', 'Nama Baru');

        // A password reset must not require the old password.
        $this->withToken($token)->postJson("/api/v1/pimpinan/bendahara/{$id}/password", [
            'password' => 'katasandi1', 'password_confirmation' => 'katasandi1',
        ])->assertOk();

        // Verified against the hash rather than a second login, because calling the
        // login endpoint again inside one test swaps the session guard.
        $stored = (string) User::where('id', $id)->value('password');
        $this->assertTrue(Hash::check('katasandi1', $stored));
        $this->assertFalse(Hash::check('password', $stored));
    }

    public function test_password_reset_requires_a_confirmed_password(): void
    {
        $this->seed();
        $token = $this->tokenFor('pimpinan');
        $id = $this->makeTreasurer('bendahara3');

        $this->withToken($token)->postJson("/api/v1/pimpinan/bendahara/{$id}/password", [
            'password' => 'pendek',
            'password_confirmation' => 'pendek',
        ])->assertStatus(422)->assertJsonValidationErrors('password');

        $this->withToken($token)->postJson("/api/v1/pimpinan/bendahara/{$id}/password", [
            'password' => 'katasandi1',
            'password_confirmation' => 'berbeda1',
        ])->assertStatus(422)->assertJsonValidationErrors('password');
    }

    public function test_suspending_a_treasurer_revokes_their_existing_tokens(): void
    {
        $this->seed();
        $id = $this->makeTreasurer('bendahara4');
        $treasurer = User::where('id', $id)->firstOrFail();

        // Mint a token for the treasurer, then sign in as leadership through
        // Sanctum so no session guard is left behind to shadow the bearer token.
        $treasurerToken = $treasurer->createToken('test')->plainTextToken;
        $tokenHash = explode('|', $treasurerToken, 2)[1];
        $this->assertSame(1, DB::table('personal_access_tokens')->where('tokenable_id', $id)->count());

        Sanctum::actingAs(User::where('username', 'pimpinan')->firstOrFail());
        $this->postJson("/api/v1/pimpinan/bendahara/{$id}/status", [
            'is_active' => false,
        ])->assertOk();

        $this->assertFalse((bool) DB::table('users')->where('id', $id)->value('is_active'));
        // Suspension must drop the token row itself, so an already-open tab loses
        // access on its next request instead of at token expiry.
        $this->assertSame(0, DB::table('personal_access_tokens')
            ->where('tokenable_id', $id)->where('token', $tokenHash)->count());

        // Restoring the account is allowed again.
        $this->postJson("/api/v1/pimpinan/bendahara/{$id}/status", [
            'is_active' => true,
        ])->assertOk();
        $this->assertTrue((bool) DB::table('users')->where('id', $id)->value('is_active'));
    }

    public function test_a_reactivated_treasurer_can_log_in_again(): void
    {
        // Separate test: `Sanctum::actingAs` swaps the guard for the whole test, so
        // the login endpoint must be exercised in a test that never calls it.
        $this->seed();
        $id = (int) DB::table('users')->where('username', 'admin')->value('id');
        DB::table('users')->where('id', $id)->update(['is_active' => false]);

        $this->postJson('/api/v1/auth/login', ['username' => 'admin', 'password' => 'password'])
            ->assertStatus(422);

        DB::table('users')->where('id', $id)->update(['is_active' => true]);
        $this->postJson('/api/v1/auth/login', ['username' => 'admin', 'password' => 'password'])
            ->assertOk();
    }

    public function test_a_suspended_treasurer_cannot_log_in(): void
    {
        // Separate test so the login endpoint is only called once in this scope.
        $this->seed();
        $id = (int) DB::table('users')->where('username', 'admin')->value('id');
        DB::table('users')->where('id', $id)->update(['is_active' => false]);

        $this->postJson('/api/v1/auth/login', ['username' => 'admin', 'password' => 'password'])
            ->assertStatus(422)
            ->assertJsonValidationErrors('username');

        // No token may be issued for a suspended account.
        $this->assertSame(0, DB::table('personal_access_tokens')->count());
    }

    public function test_the_last_active_treasurer_cannot_be_suspended(): void
    {
        $this->seed();
        $token = $this->tokenFor('pimpinan');
        $soleId = (int) DB::table('users')->where('username', 'admin')->value('id');

        // With only one treasurer, payments could not be recorded without them.
        $this->withToken($token)->postJson("/api/v1/pimpinan/bendahara/{$soleId}/status", [
            'is_active' => false,
        ])->assertStatus(422)->assertJsonValidationErrors('is_active');

        $this->assertTrue((bool) DB::table('users')->where('id', $soleId)->value('is_active'));

        // Adding a second treasurer makes suspension allowed again.
        $second = $this->makeTreasurer('bendahara6');
        $this->withToken($token)->postJson("/api/v1/pimpinan/bendahara/{$soleId}/status", [
            'is_active' => false,
        ])->assertOk();
        $this->assertFalse((bool) DB::table('users')->where('id', $soleId)->value('is_active'));

        // Now the remaining one is protected instead.
        $this->withToken($token)->postJson("/api/v1/pimpinan/bendahara/{$second}/status", [
            'is_active' => false,
        ])->assertStatus(422);
    }

    public function test_treasurer_management_is_restricted_to_leadership(): void
    {
        $this->seed();
        $adminToken = $this->tokenFor('admin');
        $id = $this->makeTreasurer('bendahara5');

        $this->withToken($adminToken)->getJson('/api/v1/pimpinan/bendahara')->assertForbidden();
        $this->withToken($adminToken)->postJson('/api/v1/pimpinan/bendahara', [
            'name' => 'X', 'username' => 'x9', 'email' => 'x9@example.test',
            'password' => 'rahasia123', 'password_confirmation' => 'rahasia123',
        ])->assertForbidden();
        $this->withToken($adminToken)->postJson("/api/v1/pimpinan/bendahara/{$id}/status", [
            'is_active' => false,
        ])->assertForbidden();

        // Nothing changed.
        $this->assertTrue((bool) DB::table('users')->where('id', $id)->value('is_active'));
        $this->assertSame(3, DB::table('users')->count());
    }

    public function test_leadership_account_cannot_be_managed_as_a_treasurer(): void
    {
        $this->seed();
        $token = $this->tokenFor('pimpinan');
        $leaderId = (int) DB::table('users')->where('username', 'pimpinan')->value('id');

        // Route model binding happily resolves a `pimpinan` user, so the controller
        // guard must reject it — otherwise leadership could disable itself here.
        $this->withToken($token)->postJson("/api/v1/pimpinan/bendahara/{$leaderId}/status", [
            'is_active' => false,
        ])->assertNotFound();

        $this->withToken($token)->putJson("/api/v1/pimpinan/bendahara/{$leaderId}", [
            'name' => 'Diretas', 'username' => 'pimpinan', 'email' => 'pimpinan@example.test',
        ])->assertNotFound();

        $this->assertSame('Pimpinan Sekolah', DB::table('users')->where('id', $leaderId)->value('name'));
        $this->assertTrue((bool) DB::table('users')->where('id', $leaderId)->value('is_active'));
    }

    public function test_treasurer_management_requires_authentication(): void
    {
        $this->seed();

        $this->getJson('/api/v1/pimpinan/bendahara')->assertUnauthorized();
        $this->postJson('/api/v1/pimpinan/bendahara', [])->assertUnauthorized();
    }

    // --- Tariff settings ------------------------------------------------------

    public function test_leadership_can_save_every_spp_rate_in_one_request(): void
    {
        $this->seed();
        $token = $this->tokenFor('pimpinan');
        $yearId = (int) DB::table('academic_years')->where('is_active', true)->value('id');
        $levels = DB::table('class_levels')->orderBy('sort_order')->pluck('id')->all();

        $rates = [];
        foreach ($levels as $index => $levelId) {
            $rates[] = ['class_level_id' => $levelId, 'monthly_amount' => 400000 + ($index * 25000)];
        }

        $this->withToken($token)
            ->postJson('/api/v1/pimpinan/tarif-spp', ['academic_year_id' => $yearId, 'rates' => $rates])
            ->assertOk();

        // Both semesters of every class must carry the new nominal, not just one.
        foreach ($levels as $index => $levelId) {
            $this->assertSame(
                400000 + ($index * 25000),
                DB::table('spp_periods')->where('academic_year_id', $yearId)
                    ->where('class_level_id', $levelId)->value('monthly_amount'),
            );
            $this->assertSame(2, DB::table('spp_periods')->where('academic_year_id', $yearId)
                ->where('class_level_id', $levelId)->count());
        }

        // The change must be visible through the portal the UI actually reads.
        $portal = $this->withToken($token)->getJson('/api/v1/data/portal')->assertOk();
        $this->assertSame(400000, (int) $portal->json('data.spp_rates')[0]);
    }

    public function test_saving_spp_creates_standard_semesters_for_a_new_class(): void
    {
        $this->seed();
        $token = $this->tokenFor('pimpinan');
        $yearId = (int) DB::table('academic_years')->where('is_active', true)->value('id');

        // A class with no SPP rows yet must not silently stay at Rp 0.
        $levelId = (int) DB::table('class_levels')->insertGetId([
            'name' => 'Kelas VII', 'sort_order' => 7, 'created_at' => now(), 'updated_at' => now(),
        ]);

        $this->withToken($token)->postJson('/api/v1/pimpinan/tarif-spp', [
            'academic_year_id' => $yearId,
            'rates' => [['class_level_id' => $levelId, 'monthly_amount' => 500000]],
        ])->assertOk();

        $rows = DB::table('spp_periods')->where('academic_year_id', $yearId)
            ->where('class_level_id', $levelId)->get();
        $this->assertCount(2, $rows);
        $this->assertSame([1, 7], $rows->pluck('month_start')->sort()->values()->all());
        $this->assertSame([500000, 500000], $rows->pluck('monthly_amount')->all());
    }

    public function test_spp_tariff_save_is_validated(): void
    {
        $this->seed();
        $token = $this->tokenFor('pimpinan');

        $this->withToken($token)->postJson('/api/v1/pimpinan/tarif-spp', [
            'academic_year_id' => 999999,
            'rates' => [['class_level_id' => 1, 'monthly_amount' => 350000]],
        ])->assertStatus(422)->assertJsonValidationErrors('academic_year_id');

        // A negative tariff would make arrears nonsense.
        $yearId = (int) DB::table('academic_years')->value('id');
        $levelId = (int) DB::table('class_levels')->value('id');
        $this->withToken($token)->postJson('/api/v1/pimpinan/tarif-spp', [
            'academic_year_id' => $yearId,
            'rates' => [['class_level_id' => $levelId, 'monthly_amount' => -1]],
        ])->assertStatus(422)->assertJsonValidationErrors('rates.0.monthly_amount');
    }

    public function test_leadership_can_save_position_rates_and_toggle_active(): void
    {
        $this->seed();
        $token = $this->tokenFor('pimpinan');
        $yearId = (int) DB::table('academic_years')->where('is_active', true)->value('id');
        $levelId = (int) DB::table('class_levels')->where('sort_order', 1)->value('id');
        $positionId = (int) DB::table('payment_positions')->where('name', 'Uang Kegiatan')->value('id');

        $this->withToken($token)->postJson('/api/v1/pimpinan/tarif-non-spp', [
            'academic_year_id' => $yearId,
            'class_level_id' => $levelId,
            'positions' => [
                ['payment_position_id' => $positionId, 'amount' => 275000, 'is_active' => false],
            ],
        ])->assertOk();

        // assertEquals, not assertSame: SQLite hands back an int while MySQL
        // returns a float for DECIMAL columns, and both are equally correct.
        $this->assertEquals(
            275000,
            DB::table('position_rates')->where('payment_position_id', $positionId)
                ->where('academic_year_id', $yearId)->where('class_level_id', $levelId)->value('amount'),
        );
        $this->assertFalse((bool) DB::table('payment_positions')->where('id', $positionId)->value('is_active'));

        // A deactivated position disappears from the portal payment options.
        $portal = $this->withToken($token)->getJson('/api/v1/data/portal')->assertOk();
        $names = collect($portal->json('data.position_rates'))->pluck('position');
        $this->assertFalse($names->contains('Uang Kegiatan'));

        // Re-enabling brings it back.
        $this->withToken($token)->postJson('/api/v1/pimpinan/tarif-non-spp', [
            'academic_year_id' => $yearId,
            'class_level_id' => $levelId,
            'positions' => [['payment_position_id' => $positionId, 'amount' => 275000, 'is_active' => true]],
        ])->assertOk();
        $this->assertTrue((bool) DB::table('payment_positions')->where('id', $positionId)->value('is_active'));
    }

    public function test_leadership_can_add_a_new_cost_position_priced_for_every_class(): void
    {
        $this->seed();
        $token = $this->tokenFor('pimpinan');
        $yearId = (int) DB::table('academic_years')->where('is_active', true)->value('id');
        $classCount = DB::table('class_levels')->count();

        $response = $this->withToken($token)->postJson('/api/v1/pimpinan/pos-biaya', [
            'name' => 'Uang Ekstrakurikuler',
            'type' => 'tahunan',
            'amount' => 750000,
            'academic_year_id' => $yearId,
        ])->assertCreated();

        $positionId = (int) $response->json('data.id');
        $this->assertSame('Uang Ekstrakurikuler', $response->json('data.name'));

        // Priced per class so the new item can be charged immediately.
        $this->assertSame($classCount, DB::table('position_rates')
            ->where('payment_position_id', $positionId)
            ->where('academic_year_id', $yearId)->count());

        // Names are unique, so a duplicate must be rejected.
        $this->withToken($token)->postJson('/api/v1/pimpinan/pos-biaya', [
            'name' => 'Uang Ekstrakurikuler', 'type' => 'tahunan',
            'amount' => 750000, 'academic_year_id' => $yearId,
        ])->assertStatus(422)->assertJsonValidationErrors('name');

        // Only an allowed type is accepted.
        $this->withToken($token)->postJson('/api/v1/pimpinan/pos-biaya', [
            'name' => 'Pos Ngawur', 'type' => 'entah',
            'amount' => 1000, 'academic_year_id' => $yearId,
        ])->assertStatus(422)->assertJsonValidationErrors('type');
    }

    public function test_admin_cannot_change_tariffs(): void
    {
        $this->seed();
        $token = $this->tokenFor('admin');
        $yearId = (int) DB::table('academic_years')->value('id');
        $levelId = (int) DB::table('class_levels')->value('id');

        $this->withToken($token)->postJson('/api/v1/pimpinan/tarif-spp', [
            'academic_year_id' => $yearId,
            'rates' => [['class_level_id' => $levelId, 'monthly_amount' => 999000]],
        ])->assertForbidden();

        $this->withToken($token)->postJson('/api/v1/pimpinan/pos-biaya', [
            'name' => 'X', 'type' => 'tahunan', 'amount' => 1000, 'academic_year_id' => $yearId,
        ])->assertForbidden();

        $this->assertDatabaseMissing('payment_positions', ['name' => 'X']);
    }

    public function test_tariff_saving_requires_authentication(): void
    {
        $this->seed();

        $this->postJson('/api/v1/pimpinan/tarif-spp', [])->assertUnauthorized();
        $this->postJson('/api/v1/pimpinan/tarif-non-spp', [])->assertUnauthorized();
    }

    // --- Self-service username and photo ---------------------------------------

    public function test_every_account_can_edit_its_own_username(): void
    {
        $this->seed();

        // `admin` is the treasurer role; self-service must work for it too.
        $token = $this->tokenFor('admin');
        $response = $this->withToken($token)->postJson('/api/v1/auth/profile', [
            'name' => 'Admin Keuangan',
            'username' => 'bendahara_baru',
            'email' => 'admin@example.test',
        ])->assertOk();

        $this->assertSame('bendahara_baru', $response->json('data.username'));
        $this->assertDatabaseHas('users', ['username' => 'bendahara_baru']);
    }

    public function test_a_changed_username_is_the_one_used_to_log_in(): void
    {
        // Separate test: the login endpoint is called twice here, and calling it
        // twice inside one test swaps the session guard.
        $this->seed();
        $id = (int) DB::table('users')->where('username', 'admin')->value('id');
        DB::table('users')->where('id', $id)->update(['username' => 'bendahara_baru']);

        $this->postJson('/api/v1/auth/login', [
            'username' => 'bendahara_baru', 'password' => 'password',
        ])->assertOk()->assertJsonPath('data.user.username', 'bendahara_baru');
    }

    public function test_username_must_stay_unique_and_valid(): void
    {
        $this->seed();
        $token = $this->tokenFor('admin');

        // Another account's username is taken.
        $this->withToken($token)->postJson('/api/v1/auth/profile', [
            'name' => 'Admin', 'username' => 'pimpinan', 'email' => 'admin@example.test',
        ])->assertStatus(422)->assertJsonValidationErrors('username');

        // Too short and contains spaces.
        $this->withToken($token)->postJson('/api/v1/auth/profile', [
            'name' => 'Admin', 'username' => 'ab', 'email' => 'admin@example.test',
        ])->assertStatus(422)->assertJsonValidationErrors('username');

        $this->withToken($token)->postJson('/api/v1/auth/profile', [
            'name' => 'Admin', 'username' => 'ada ruang', 'email' => 'admin@example.test',
        ])->assertStatus(422)->assertJsonValidationErrors('username');

        // Keeping your own username is not a conflict.
        $this->withToken($token)->postJson('/api/v1/auth/profile', [
            'name' => 'Admin Keuangan', 'username' => 'admin', 'email' => 'admin@example.test',
        ])->assertOk();
    }

    public function test_any_account_can_upload_and_replace_a_profile_photo(): void
    {
        $this->seed();
        $token = $this->tokenFor('admin');

        $first = $this->withToken($token)->post('/api/v1/auth/photo', [
            'photo' => UploadedFile::fake()->image('saya.png', 240, 240),
        ], ['Accept' => 'application/json'])->assertOk();

        $path = $first->json('data.photo_path');
        $this->assertNotNull($path);
        Storage::disk('public')->assertExists($path);

        // Replacing must remove the previous file instead of orphaning it.
        $second = $this->withToken($token)->post('/api/v1/auth/photo', [
            'photo' => UploadedFile::fake()->image('baru.jpg', 240, 240),
        ], ['Accept' => 'application/json'])->assertOk();

        $newPath = $second->json('data.photo_path');
        $this->assertNotSame($path, $newPath);
        Storage::disk('public')->assertMissing($path);
        Storage::disk('public')->assertExists($newPath);

        // Deleting clears the column and the file, so initials take over again.
        $this->withToken($token)->deleteJson('/api/v1/auth/photo')
            ->assertOk()
            ->assertJsonPath('data.photo_path', null);
        Storage::disk('public')->assertMissing($newPath);
    }

    public function test_profile_photo_upload_rejects_non_images(): void
    {
        $this->seed();
        $token = $this->tokenFor('pimpinan');

        $this->withToken($token)->post('/api/v1/auth/photo', [
            'photo' => UploadedFile::fake()->create('dokumen.pdf', 40, 'application/pdf'),
        ], ['Accept' => 'application/json'])->assertStatus(422);

        $this->withToken($token)->post('/api/v1/auth/photo', [
            'photo' => UploadedFile::fake()->create('besar.png', 4096, 'image/png'),
        ], ['Accept' => 'application/json'])->assertStatus(422);
    }

    public function test_photo_endpoints_require_authentication(): void
    {
        $this->seed();

        $this->post('/api/v1/auth/photo', [], ['Accept' => 'application/json'])->assertUnauthorized();
        $this->deleteJson('/api/v1/auth/photo')->assertUnauthorized();
    }

    public function test_me_returns_the_photo_path_for_the_signed_in_user(): void
    {
        $this->seed();
        $token = $this->tokenFor('pimpinan');

        $this->withToken($token)->post('/api/v1/auth/photo', [
            'photo' => UploadedFile::fake()->image('avatar.png', 200, 200),
        ], ['Accept' => 'application/json'])->assertOk();

        $me = $this->withToken($token)->getJson('/api/v1/auth/me')->assertOk();
        $this->assertNotNull($me->json('data.photo_path'));
        // The hash must never leak through any of these responses.
        $this->assertArrayNotHasKey('password', $me->json('data'));
    }

    // --- Email verification gate ----------------------------------------------

    /** Create an account that still has to verify its address. */
    private function unverifiedUser(string $username = 'baru'): array
    {
        $id = (int) DB::table('users')->insertGetId([
            'name' => 'Pengguna Baru',
            'username' => $username,
            'email' => $username.'@example.test',
            'password' => Hash::make('password'),
            'role' => 'admin',
            'email_verified_at' => null,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        return [$id, $this->postJson('/api/v1/auth/login', [
            'username' => $username, 'password' => 'password',
        ])->assertOk()->json('data.token')];
    }

    public function test_seeded_accounts_start_unverified(): void
    {
        $this->seed();

        // The suite-wide fixture verifies seeded accounts; this test is about the
        // seeder's own output, so undo that to observe the real starting state.
        DB::table('users')->update(['email_verified_at' => null]);
        $this->assertSame(2, DB::table('users')->whereNull('email_verified_at')->count());

        $token = $this->postJson('/api/v1/auth/login', [
            'username' => 'admin', 'password' => 'password',
        ])->assertOk()->json('data.token');

        // Signing in works, but the gate is closed until the address is confirmed.
        $this->withToken($token)->getJson('/api/v1/auth/me')->assertOk()
            ->assertJsonPath('data.email_verified', false);
        $this->withToken($token)->getJson('/api/v1/data/portal')
            ->assertForbidden()
            ->assertJsonPath('code', 'email_unverified');

        // Confirming the address opens the gate back up. Done against the row
        // rather than a second login, because calling the login endpoint twice in
        // one test swaps the session guard.
        DB::table('users')->where('username', 'admin')->update(['email_verified_at' => now()]);
        // The guard memoises the User model for the whole test case, so it has to
        // be cleared before the next request re-reads the row.
        $this->app['auth']->forgetGuards();
        $this->withToken($token)->getJson('/api/v1/data/portal')->assertOk();
    }

    public function test_unverified_account_is_confined_to_the_profile_screen(): void
    {
        $this->seed();
        [, $token] = $this->unverifiedUser();

        // The profile screen must still work, or the user could never verify.
        $this->withToken($token)->getJson('/api/v1/public/sekolah-profile')->assertOk();
        $this->withToken($token)->getJson('/api/v1/auth/me')->assertOk()
            ->assertJsonPath('data.email_verified', false);

        // Every other feature is refused with the machine-readable code.
        foreach ([
            '/api/v1/data/portal',
            '/api/v1/data/tahun-ajaran',
            '/api/v1/admin/siswa',
            '/api/v1/reports/spp',
            '/api/v1/pimpinan/bendahara',
            '/api/v1/pimpinan/tarif-spp',
            '/api/v1/pimpinan/log-aktivitas',
        ] as $path) {
            $this->withToken($token)->getJson($path)
                ->assertForbidden()
                ->assertJsonPath('code', 'email_unverified');
        }

        $this->withToken($token)->postJson('/api/v1/admin/pembayaran/spp', [])
            ->assertForbidden()
            ->assertJsonPath('code', 'email_unverified');
    }

    public function test_account_can_request_and_confirm_the_verification_code(): void
    {
        $this->seed();
        Notification::fake();
        [, $token] = $this->unverifiedUser('verifikasi');

        $send = $this->withToken($token)->postJson('/api/v1/auth/verification/send')->assertOk();
        $this->assertSame(6, strlen($send->json('data.dev_code')));

        Notification::assertSentTo(
            User::where('username', 'verifikasi')->first(),
            VerifyEmailNotification::class,
        );

        // A wrong code must not verify anything.
        $this->withToken($token)->postJson('/api/v1/auth/verification/verify', [
            'code' => '000000',
        ])->assertStatus(422)->assertJsonValidationErrors('code');
        $this->assertNull(
            DB::table('users')->where('username', 'verifikasi')->value('email_verified_at'),
        );

        $this->withToken($token)->postJson('/api/v1/auth/verification/verify', [
            'code' => $send->json('data.dev_code'),
        ])->assertOk();

        $this->assertNotNull(
            DB::table('users')->where('username', 'verifikasi')->value('email_verified_at'),
        );

        // The gate lifts immediately.
        $this->withToken($token)->getJson('/api/v1/data/portal')->assertOk();
    }

    public function test_verification_token_is_hashed_and_cleared_after_use(): void
    {
        $this->seed();
        [, $token] = $this->unverifiedUser('hashcheck');

        $send = $this->withToken($token)->postJson('/api/v1/auth/verification/send')->assertOk();
        $code = $send->json('data.dev_code');
        $stored = DB::table('users')->where('username', 'hashcheck')->value('email_verification_token');

        // A database dump must not contain the usable code.
        $this->assertNotSame($code, $stored);
        $this->assertSame(hash('sha256', $code), $stored);

        $this->withToken($token)->postJson('/api/v1/auth/verification/verify', ['code' => $code])
            ->assertOk();
        // Single-use: the token is wiped once it has been spent.
        $this->assertNull(
            DB::table('users')->where('username', 'hashcheck')->value('email_verification_token'),
        );
    }

    public function test_resending_a_code_is_throttled(): void
    {
        $this->seed();
        Notification::fake();
        [, $token] = $this->unverifiedUser('spam');

        $this->withToken($token)->postJson('/api/v1/auth/verification/send')->assertOk();
        // A second request inside the cooldown is refused, which blocks mail-bombing.
        $this->withToken($token)->postJson('/api/v1/auth/verification/send')->assertStatus(429);
        Notification::assertSentTimes(VerifyEmailNotification::class, 1);
    }

    /**
     * The emailed proof is only six digits, so guessing must be as capped as
     * password guessing: ten wrong codes are answered normally (422), the
     * eleventh trips the route throttle (429) long before the 10^6 space is
     * swept — and the throttle answers with JSON, never an HTML error page.
     */
    public function test_verification_code_guessing_is_rate_limited(): void
    {
        $this->seed();
        Notification::fake();
        [, $token] = $this->unverifiedUser('tebakkode');

        $this->withToken($token)->postJson('/api/v1/auth/verification/send')->assertOk();

        for ($attempt = 0; $attempt < 10; $attempt++) {
            $this->withToken($token)->postJson('/api/v1/auth/verification/verify', [
                'code' => str_pad((string) $attempt, 6, '0', STR_PAD_LEFT),
            ])->assertStatus(422)->assertJsonValidationErrors('code');
        }

        $this->withToken($token)->postJson('/api/v1/auth/verification/verify', [
            'code' => '999999',
        ])
            ->assertStatus(429)
            ->assertJsonPath('message', fn (string $message) => $message !== '');

        // The gate is still closed — throttling never verifies anything.
        $this->assertNull(
            DB::table('users')->where('username', 'tebakkode')->value('email_verified_at'),
        );
    }

    // --- Forgot password -------------------------------------------------------

    public function test_user_can_recover_a_lost_password(): void
    {
        $this->seed();
        Notification::fake();

        $send = $this->postJson('/api/v1/auth/forgot-password', ['identifier' => 'admin'])
            ->assertOk();
        $token = $send->json('data.dev_code');
        $this->assertSame(64, strlen($token));

        Notification::assertSentTo(
            User::where('username', 'admin')->first(),
            ResetPasswordNotification::class,
        );

        $this->postJson('/api/v1/auth/reset-password', [
            'token' => $token,
            'password' => 'katabaru123',
            'password_confirmation' => 'katabaru123',
        ])->assertOk();

        $this->assertTrue(Hash::check('katabaru123', User::where('username', 'admin')->value('password')));
        $this->postJson('/api/v1/auth/login', ['username' => 'admin', 'password' => 'katabaru123'])
            ->assertOk();
    }

    public function test_password_reset_signs_every_device_out(): void
    {
        $this->seed();

        // Mint the token from the model: the login endpoint calls Auth::attempt(),
        // which would leave a session guard shadowing the bearer token.
        $admin = User::where('username', 'admin')->firstOrFail();
        $activeToken = $admin->createToken('test')->plainTextToken;
        $this->withToken($activeToken)->getJson('/api/v1/auth/me')->assertOk();

        $send = $this->postJson('/api/v1/auth/forgot-password', ['identifier' => 'admin'])->assertOk();
        $this->postJson('/api/v1/auth/reset-password', [
            'token' => $send->json('data.dev_code'),
            'password' => 'katabaru123',
            'password_confirmation' => 'katabaru123',
        ])->assertOk();

        // The old session must die with the old password.
        $this->assertSame(0, DB::table('personal_access_tokens')->count());
        // Sanctum memoises the resolved user for the life of the test case, so the
        // guard has to be cleared before the next request re-authenticates.
        $this->app['auth']->forgetGuards();
        $this->withToken($activeToken)->getJson('/api/v1/auth/me')->assertUnauthorized();
    }

    public function test_reset_rejects_an_unknown_or_expired_token(): void
    {
        $this->seed();
        $this->postJson('/api/v1/auth/forgot-password', ['identifier' => 'admin'])->assertOk();

        // Unknown token.
        $this->postJson('/api/v1/auth/reset-password', [
            'token' => str_repeat('a', 64),
            'password' => 'katabaru123',
            'password_confirmation' => 'katabaru123',
        ])->assertStatus(422)->assertJsonValidationErrors('token');

        // Expired token: age the stored row past the 60 minute window.
        DB::table('password_reset_tokens')->where('email', 'admin@example.test')
            ->update(['created_at' => now()->subHours(3)]);

        $this->postJson('/api/v1/auth/reset-password', [
            'token' => str_repeat('b', 64),
            'password' => 'katabaru123',
            'password_confirmation' => 'katabaru123',
        ])->assertStatus(422)->assertJsonValidationErrors('token');
        // The original password still works.
        $this->postJson('/api/v1/auth/login', ['username' => 'admin', 'password' => 'password'])
            ->assertOk();
    }

    public function test_forgot_password_does_not_reveal_whether_an_account_exists(): void
    {
        $this->seed();
        Notification::fake();

        $known = $this->postJson('/api/v1/auth/forgot-password', ['identifier' => 'admin'])
            ->assertOk();
        $unknown = $this->postJson('/api/v1/auth/forgot-password', ['identifier' => 'tidak-ada'])
            ->assertOk();

        // Identical wording and status, so the form cannot enumerate accounts.
        $this->assertSame($known->json('message'), $unknown->json('message'));
        $this->assertNull($unknown->json('data.dev_code'));
        // Exactly one mail went out — the real account. The unknown one sent nothing.
        Notification::assertSentTimes(ResetPasswordNotification::class, 1);
        Notification::assertNotSentTo(new User(['email' => 'tidak-ada']), ResetPasswordNotification::class);
    }

    /**
     * Recovery is anonymous, so it is the easiest endpoint to abuse: each hit
     * sends a real email and rotates the stored token (killing the victim's
     * legitimate code). Five per minute get through; the sixth is refused
     * before it can send anything.
     */
    public function test_forgot_password_requests_are_rate_limited(): void
    {
        $this->seed();
        Notification::fake();

        for ($attempt = 0; $attempt < 5; $attempt++) {
            $this->postJson('/api/v1/auth/forgot-password', ['identifier' => 'admin'])
                ->assertOk();
        }

        $blocked = $this->postJson('/api/v1/auth/forgot-password', ['identifier' => 'admin']);
        $blocked
            ->assertStatus(429)
            ->assertJsonPath('message', fn (string $message) => $message !== '');

        // Exactly five mails left the building — the sixth was cut off upstream.
        Notification::assertSentTimes(ResetPasswordNotification::class, 5);
    }

    /**
     * Defence in depth on the reset exchange: the token is 64 random
     * characters, so guessing was never practical — but the endpoint still
     * gets the same hard stop as the rest of the auth surface.
     */
    public function test_reset_password_attempts_are_rate_limited(): void
    {
        $this->seed();

        for ($attempt = 0; $attempt < 10; $attempt++) {
            $this->postJson('/api/v1/auth/reset-password', [
                'token' => str_repeat('a', 64),
                'password' => 'katabaru123',
                'password_confirmation' => 'katabaru123',
            ])->assertStatus(422)->assertJsonValidationErrors('token');
        }

        $this->postJson('/api/v1/auth/reset-password', [
            'token' => str_repeat('a', 64),
            'password' => 'katabaru123',
            'password_confirmation' => 'katabaru123',
        ])->assertStatus(429);

        // Nothing was ever reset.
        $this->assertTrue(Hash::check('password', User::where('username', 'admin')->value('password')));
    }

    public function test_resending_is_throttled_briefly_and_then_allowed_again(): void
    {
        $this->seed();
        [, $token] = $this->unverifiedUser('resend');

        $this->withToken($token)->postJson('/api/v1/auth/verification/send')->assertOk();

        // The throttle must answer, not crash. `email_verification_sent_at` was
        // never cast to a datetime, so `->gt()` on it threw and the resend
        // button produced a 500 instead of a 429.
        $blocked = $this->withToken($token)->postJson('/api/v1/auth/verification/send');
        $this->assertSame(429, $blocked->status());
        $this->assertTrue($blocked->json('data.cooldown'));

        // The wait is the cooldown, not the 30 minute lifetime: a code that
        // went to the wrong inbox must be replaceable straight away.
        DB::table('users')->where('username', 'resend')
            ->update(['email_verification_sent_at' => now()->subMinutes(3)]);
        $this->app['auth']->forgetGuards();

        $this->withToken($token)->postJson('/api/v1/auth/verification/send')->assertOk();
    }

    public function test_a_resend_rotates_the_code_so_the_previous_one_stops_working(): void
    {
        $this->seed();
        [, $token] = $this->unverifiedUser('rotate');

        $first = $this->withToken($token)->postJson('/api/v1/auth/verification/send')
            ->assertOk()->json('data.dev_code');

        DB::table('users')->where('username', 'rotate')
            ->update(['email_verification_sent_at' => now()->subMinutes(3)]);
        $this->app['auth']->forgetGuards();

        $second = $this->withToken($token)->postJson('/api/v1/auth/verification/send')
            ->assertOk()->json('data.dev_code');

        $this->assertNotSame($first, $second);

        // The code from the earlier email is dead. Accepting it would let
        // someone who reads an old message verify an account whose address
        // has since moved on.
        $this->withToken($token)->postJson('/api/v1/auth/verification/verify', [
            'code' => $first,
        ])->assertStatus(422)->assertJsonValidationErrors('code');

        $this->withToken($token)->postJson('/api/v1/auth/verification/verify', [
            'code' => $second,
        ])->assertOk();
    }

    public function test_mail_test_command_refuses_to_claim_success_with_the_log_mailer(): void
    {
        // `log` writes to the application log and delivers nothing. Reporting
        // success here is what lets a broken deployment look configured.
        config(['mail.default' => 'log']);

        $this->artisan('mail:test', ['email' => 'sekolah@example.test'])
            ->expectsOutputToContain('MAIL_MAILER masih "log"')
            ->assertExitCode(1);
    }

    public function test_mail_test_command_rejects_a_malformed_address(): void
    {
        config(['mail.default' => 'smtp']);

        $this->artisan('mail:test', ['email' => 'bukan-email'])
            ->expectsOutputToContain('bukan alamat email yang valid')
            ->assertExitCode(1);
    }

    // --- Codes must not leak from a reachable server ---------------------------

    public function test_codes_are_never_returned_when_exposure_is_disabled(): void
    {
        config(['auth.verification.expose_codes_in_response' => false]);

        $this->seed();
        [, $token] = $this->unverifiedUser('rahasia');

        $send = $this->withToken($token)
            ->postJson('/api/v1/auth/verification/send')
            ->assertOk();

        // The request still succeeds — the code was emailed, it is simply no
        // longer handed back to the caller.
        $this->assertNull($send->json('data.dev_code'));

        // ...and the account can still be verified, proving the code reached the
        // database rather than the flow breaking silently.
        $stored = DB::table('users')->where('username', 'rahasia')->value('email_verification_token');
        $this->assertSame(64, strlen($stored));

        $this->withToken($token)->postJson('/api/v1/auth/verification/verify', [
            'code' => '000000',
        ])->assertStatus(422);
    }

    public function test_password_reset_code_is_not_returned_when_exposure_is_disabled(): void
    {
        config(['auth.verification.expose_codes_in_response' => false]);

        $this->seed();

        $response = $this->postJson('/api/v1/auth/forgot-password', ['identifier' => 'admin'])
            ->assertOk();

        $this->assertNull($response->json('data.dev_code'));
        // A token row still exists, so recovery is genuinely available by email.
        $this->assertSame(1, DB::table('password_reset_tokens')->count());
    }

    // --- Changing the address revokes verification ----------------------------

    public function test_changing_the_email_revokes_an_existing_verification(): void
    {
        $this->seed();
        $token = $this->tokenFor('pimpinan');
        $this->assertNotNull(DB::table('users')->where('username', 'pimpinan')->value('email_verified_at'));

        $this->withToken($token)->postJson('/api/v1/auth/profile', [
            'name' => 'Pimpinan Sekolah',
            'username' => 'pimpinan',
            'email' => 'pimpinan.baru@sekolah.sch.id',
        ])->assertOk()->assertJsonPath('data.email_verified', false);

        // Without this reset, anyone could claim ownership of an arbitrary address.
        $this->assertNull(
            DB::table('users')->where('username', 'pimpinan')->value('email_verified_at'),
        );

        // The gate closes again until the new address is confirmed.
        $this->withToken($token)->getJson('/api/v1/data/portal')
            ->assertForbidden()
            ->assertJsonPath('code', 'email_unverified');
    }

    public function test_keeping_the_same_email_preserves_verification(): void
    {
        $this->seed();
        $token = $this->tokenFor('pimpinan');

        // Editing only the name must not force a re-verification.
        $this->withToken($token)->postJson('/api/v1/auth/profile', [
            'name' => 'Pimpinan Baru',
            'username' => 'pimpinan',
            'email' => 'pimpinan@example.test',
        ])->assertOk()->assertJsonPath('data.email_verified', true);

        $this->assertNotNull(
            DB::table('users')->where('username', 'pimpinan')->value('email_verified_at'),
        );
        $this->withToken($token)->getJson('/api/v1/data/portal')->assertOk();
    }

    public function test_an_unverified_account_can_change_its_own_email(): void
    {
        $this->seed();
        [, $token] = $this->unverifiedUser('bawaan');

        // The seeded address is a placeholder that cannot receive mail, so the
        // account must be able to point itself at a real inbox.
        $response = $this->withToken($token)->postJson('/api/v1/auth/profile', [
            'name' => 'Pengguna Baru',
            'username' => 'bawaan',
            'email' => 'bawaan.baru@sekolah.sch.id',
        ])->assertOk();

        $this->assertSame('bawaan.baru@sekolah.sch.id', $response->json('data.email'));
        $this->assertFalse($response->json('data.email_verified'));
        $this->assertDatabaseHas('users', ['username' => 'bawaan', 'email' => 'bawaan.baru@sekolah.sch.id']);

        // The code must now be deliverable to the new address.
        $send = $this->withToken($token)->postJson('/api/v1/auth/verification/send')->assertOk();
        $this->withToken($token)->postJson('/api/v1/auth/verification/verify', [
            'code' => $send->json('data.dev_code'),
        ])->assertOk();
        $this->withToken($token)->getJson('/api/v1/data/portal')->assertOk();
    }

    public function test_changing_the_email_still_enforces_uniqueness(): void
    {
        $this->seed();
        [, $token] = $this->unverifiedUser('bawaan');

        // Otherwise one account could hijack another's address.
        $this->withToken($token)->postJson('/api/v1/auth/profile', [
            'name' => 'Pengguna Baru',
            'username' => 'bawaan',
            'email' => 'pimpinan@example.test',
        ])->assertStatus(422)->assertJsonValidationErrors('email');

        $this->assertSame('bawaan@example.test', DB::table('users')->where('username', 'bawaan')->value('email'));
    }
}
