<?php

namespace App\Notifications;

use Carbon\Carbon;
use Carbon\CarbonInterface;
use Illuminate\Bus\Queueable;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;
use Illuminate\Support\Facades\URL;
use Illuminate\Support\Str;

/**
 * "Was this you?" notice sent after every successful sign-in.
 *
 * Deliberately sent synchronously and best-effort from the login path: the
 * deployment runs without a queue worker, so a queued notification would sit
 * in the jobs table forever, and an SMTP outage must never turn working
 * credentials into a failed sign-in.
 *
 * The sign-out action is a *two-step* signed link. A plain GET that revoked
 * sessions would be fired by email scanners and link prefetchers on their own,
 * signing real users out of a perfectly legitimate login just for opening
 * their inbox — so GET only renders a confirmation page and the revocation
 * happens on the POST from that page.
 */
class LoginAlertNotification extends Notification
{
    use Queueable;

    public function __construct(
        private readonly string $ipAddress,
        private readonly string $userAgent,
        private readonly CarbonInterface $loggedInAt,
    ) {}

    /** @return array<int, string> */
    public function via(object $notifiable): array
    {
        return ['mail'];
    }

    public function toMail(object $notifiable): MailMessage
    {
        $ttlHours = max(1, (int) config('auth.login_alert.link_ttl_hours', 24));
        $signOutUrl = URL::temporarySignedRoute(
            'security.signout.show',
            now()->addHours($ttlHours),
            ['user' => $notifiable->getKey()],
        );
        $recoveryUrl = $this->recoveryUrl();

        return (new MailMessage)
            ->subject('Konfirmasi keamanan: apakah Anda baru masuk ke portal?')
            ->greeting('Assalamu\'alaikum '.$notifiable->name)
            ->line('Kami mendeteksi aktivitas masuk ke akun Anda di portal keuangan sekolah:')
            ->line('Waktu: '.$this->formattedTime())
            ->line('Alamat IP: '.$this->ipAddress)
            ->line('Perangkat: '.$this->deviceLabel())
            ->line('Jika Anda sendiri yang baru masuk, abaikan email ini — tidak perlu tindakan apa pun.')
            ->action('Bukan saya — akhiri seluruh sesi', $signOutUrl)
            ->line('Jika Anda tidak mengenali aktivitas di atas, tekan tombol di atas untuk mengeluarkan seluruh sesi akun Anda, lalu segera ubah kata sandi melalui [halaman atur ulang kata sandi]('.$recoveryUrl.').')
            ->line('Tautan keamanan berlaku '.$ttlHours.' jam sejak email ini dikirim.');
    }

    /**
     * The server clock runs UTC, but the reader is in WIB — a security notice
     * only works if the time can be matched against what the reader remembers,
     * so the email states it explicitly in WIB.
     */
    private function formattedTime(): string
    {
        $time = Carbon::instance($this->loggedInAt)->setTimezone('Asia/Jakarta');

        return $time->locale('id')->isoFormat('dddd, D MMMM YYYY, HH.mm').' WIB';
    }

    /**
     * Friendly label from the raw user agent, so the reader sees
     * "Google Chrome di Windows" instead of a 150-character UA string.
     * Order matters: every browser below (except Firefox) also claims to be
     * Safari, and Edge/Opera also claim Chrome.
     */
    private function deviceLabel(): string
    {
        $ua = $this->userAgent;

        $browser = match (true) {
            str_contains($ua, 'Edg/') => 'Microsoft Edge',
            str_contains($ua, 'OPR/') => 'Opera',
            str_contains($ua, 'Chrome/') => 'Google Chrome',
            str_contains($ua, 'Firefox/') => 'Firefox',
            str_contains($ua, 'Safari/') => 'Safari',
            default => null,
        };

        $os = match (true) {
            str_contains($ua, 'Windows') => 'Windows',
            str_contains($ua, 'Android') => 'Android',
            str_contains($ua, 'iPhone') || str_contains($ua, 'iPad') => 'iOS',
            str_contains($ua, 'Mac OS') || str_contains($ua, 'Macintosh') => 'macOS',
            str_contains($ua, 'Linux') => 'Linux',
            default => null,
        };

        return match (true) {
            $browser !== null && $os !== null => "{$browser} di {$os}",
            $browser !== null => $browser,
            $os !== null => $os,
            $ua === '' => 'Perangkat tidak diketahui',
            default => Str::limit($ua, 60),
        };
    }

    /**
     * The SPA runs on its own origin (5173 in development), so the backend
     * needs to be told where it lives to link into the recovery flow.
     */
    private function recoveryUrl(): string
    {
        return rtrim((string) config('app.frontend_url'), '/').'/?lupa=1';
    }
}
