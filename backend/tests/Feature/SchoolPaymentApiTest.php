<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class SchoolPaymentApiTest extends TestCase
{
    use RefreshDatabase;

    public function test_admin_can_pay_multiple_spp_months_and_retrieve_receipt(): void
    {
        $this->seed();
        $login = $this->postJson('/api/v1/auth/login', [
            'username' => 'admin',
            'password' => 'password',
        ])->assertOk();
        $token = $login->json('data.token');
        $studentId = DB::table('students')->value('id');
        $yearId = DB::table('academic_years')->where('is_active', true)->value('id');

        $payment = $this->withToken($token)->postJson('/api/v1/admin/pembayaran/spp', [
            'student_id' => $studentId,
            'academic_year_id' => $yearId,
            'months' => [7, 8],
        ])->assertCreated();

        $this->assertSame(2, DB::table('spp_bills')->where('student_id', $studentId)->where('status', 'lunas')->count());
        $this->assertDatabaseHas('payment_transactions', [
            'transaction_number' => $payment->json('data.transaction_number'),
            'student_id' => $studentId,
            'type' => 'spp',
        ]);

        $this->withToken($token)->getJson('/api/v1/admin/transaksi/'.$payment->json('data.transaction_number').'/cetak-kuitansi')
            ->assertOk()
            ->assertJsonPath('data.transaction.type', 'spp');
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
        $student = DB::table('students')->first();
        $rate = DB::table('position_rates')
            ->join('payment_positions', 'payment_positions.id', '=', 'position_rates.payment_position_id')
            ->where('payment_positions.name', 'Uang Pembangunan')
            ->where('position_rates.class_level_id', $student->class_level_id)
            ->value('position_rates.id');

        $this->withToken($token)->postJson('/api/v1/admin/pembayaran/non-spp', [
            'student_id' => $student->id,
            'position_rate_id' => $rate,
            'amount' => 400000,
        ])->assertCreated();

        $bill = DB::table('non_spp_bills')->where('student_id', $student->id)->where('position_rate_id', $rate)->first();
        $this->assertSame('sebagian', $bill->status);
        $this->assertSame(400000.0, (float) $bill->amount_paid);

        $this->withToken($token)->postJson('/api/v1/admin/pembayaran/non-spp', [
            'student_id' => $student->id,
            'position_rate_id' => $rate,
            'amount' => 1100001,
        ])->assertUnprocessable();

        $this->withToken($token)->postJson('/api/v1/admin/pembayaran/non-spp', [
            'student_id' => $student->id,
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
