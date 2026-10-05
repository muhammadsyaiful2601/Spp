<?php

namespace Tests\Feature;

use App\Models\User;
use App\Notifications\LoginAlertNotification;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\URL;
use Tests\TestCase;

/**
 * The "was this you?" email sent after a successful sign-in, plus the signed
 * two-step sign-out link it carries.
 *
 * The suite confirms seeded accounts up front (same convention as the audit
 * tests) so the happy path exercises the verified-address gate; each negative
 * test undoes exactly that flag instead of re-seeding.
 */
class LoginAlertEmailTest extends TestCase
{
    use RefreshDatabase;

    /** Seeded accounts start unverified; the suite confirms them here. */
    public function seed($class = 'Database\\Seeders\\DatabaseSeeder')
    {
        parent::seed($class);

        DB::table('users')->update(['email_verified_at' => now()]);

        return $this;
    }

    private function loginAs(string $username, string $password = 'password')
    {
        return $this->postJson('/api/v1/auth/login', [
            'username' => $username,
            'password' => $password,
        ]);
    }

    /** A signed confirmation URL exactly as the email builds it. */
    private function signOutUrlFor(User $user, ?\DateTimeInterface $expiration = null): string
    {
        return URL::temporarySignedRoute(
            'security.signout.show',
            $expiration ?? now()->addHours(24),
            ['user' => $user->getKey()],
        );
    }

    public function test_verified_account_receives_login_alert_on_sign_in(): void
    {
        $this->seed();
        Notification::fake();

        $this->loginAs('admin')->assertOk();

        Notification::assertSentTo(
            User::where('username', 'admin')->firstOrFail(),
            LoginAlertNotification::class,
        );
    }

    public function test_unverified_account_receives_no_login_alert(): void
    {
        $this->seed();
        DB::table('users')->where('username', 'admin')->update(['email_verified_at' => null]);
        Notification::fake();

        $this->loginAs('admin')->assertOk();

        Notification::assertNotSentTo(
            User::where('username', 'admin')->firstOrFail(),
            LoginAlertNotification::class,
        );
    }

    public function test_rejected_sign_in_sends_no_login_alert(): void
    {
        $this->seed();
        Notification::fake();

        $this->loginAs('admin', 'sandi-salah')->assertStatus(422);

        Notification::assertNothingSent();
    }

    public function test_suspended_account_sign_in_sends_no_login_alert(): void
    {
        $this->seed();
        DB::table('users')->where('username', 'admin')->update(['is_active' => false]);
        Notification::fake();

        $this->loginAs('admin')->assertStatus(422);

        Notification::assertNothingSent();
    }

    public function test_alert_email_explains_the_choice_and_carries_a_signed_link(): void
    {
        $this->seed();
        Notification::fake();

        $this->withHeader('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) '
            .'AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36')
            ->postJson('/api/v1/auth/login', [
                'username' => 'admin',
                'password' => 'password',
            ])->assertOk();

        $user = User::where('username', 'admin')->firstOrFail();

        Notification::assertSentTo($user, LoginAlertNotification::class, function (LoginAlertNotification $notification) use ($user) {
            $mail = $notification->toMail($user);

            // The button must point at the signed confirmation page — never at
            // an endpoint that revokes on GET, which prefetchers would fire.
            $this->assertStringContainsString('/keamanan/keluar-sesi', $mail->actionUrl);
            $this->assertStringContainsString('signature=', $mail->actionUrl);

            $body = implode("\n", array_merge($mail->introLines, $mail->outroLines));
            $this->assertStringContainsString('abaikan email ini', $body);
            $this->assertStringContainsString('ubah kata sandi', $body);
            $this->assertStringContainsString('/?lupa=1', $body);
            // WIB, not the server's UTC: the reader must be able to match the
            // time against their own memory of the login.
            $this->assertStringContainsString('WIB', $body);
            $this->assertStringContainsString('Google Chrome di Windows', $body);
            $this->assertStringContainsString('127.0.0.1', $body);

            return true;
        });
    }

    public function test_confirmation_page_renders_without_ending_any_session(): void
    {
        $this->seed();
        $user = User::where('username', 'admin')->firstOrFail();
        $user->createToken('school-portal');

        // Email scanners fire GETs unprompted; the page must be inert.
        $this->get($this->signOutUrlFor($user))
            ->assertOk()
            ->assertSee('Konfirmasi keamanan')
            ->assertSee($user->email);

        $this->assertDatabaseHas('personal_access_tokens', ['tokenable_id' => $user->id]);
    }

    public function test_confirming_ends_every_session_and_records_the_audit(): void
    {
        $this->seed();
        $user = User::where('username', 'admin')->firstOrFail();
        $user->createToken('device-a');
        $user->createToken('device-b');

        $this->post($this->signOutUrlFor($user))
            ->assertOk()
            ->assertSee('Sesi telah dikeluarkan')
            ->assertSee('ubah kata sandi');

        $this->assertDatabaseMissing('personal_access_tokens', ['tokenable_id' => $user->id]);
        $this->assertDatabaseHas('activity_logs', [
            'action' => 'akun.keluar_email',
            'category' => 'akun',
            'actor_username' => 'admin',
        ]);
    }

    public function test_repeating_the_confirmation_is_idempotent(): void
    {
        $this->seed();
        $user = User::where('username', 'admin')->firstOrFail();
        $user->createToken('school-portal');
        $url = $this->signOutUrlFor($user);

        $this->post($url)->assertOk();
        $audits = DB::table('activity_logs')->where('action', 'akun.keluar_email')->count();

        // The second click changes nothing, so it earns no second audit row.
        $this->post($url)->assertOk()->assertSee('Tidak ada sesi aktif');

        $this->assertSame($audits, DB::table('activity_logs')->where('action', 'akun.keluar_email')->count());
    }

    public function test_unsigned_and_tampered_links_are_rejected(): void
    {
        $this->seed();
        $user = User::where('username', 'admin')->firstOrFail();
        $user->createToken('school-portal');

        // No signature at all.
        $this->get('/keamanan/keluar-sesi?user='.$user->id)->assertForbidden();

        // Valid signature, different account id swapped in.
        $tampered = preg_replace('/user=\d+/', 'user='.($user->id + 999), $this->signOutUrlFor($user));
        $this->get($tampered)->assertForbidden();

        // Signature replaced with garbage.
        $forged = preg_replace('/signature=[^&]+/', 'signature=forged', $this->signOutUrlFor($user));
        $this->get($forged)->assertForbidden();

        $this->assertDatabaseHas('personal_access_tokens', ['tokenable_id' => $user->id]);
    }

    public function test_expired_sign_out_link_is_rejected(): void
    {
        $this->seed();
        $user = User::where('username', 'admin')->firstOrFail();
        $user->createToken('school-portal');

        $this->get($this->signOutUrlFor($user, now()->subMinute()))->assertForbidden();

        $this->assertDatabaseHas('personal_access_tokens', ['tokenable_id' => $user->id]);
    }
}
