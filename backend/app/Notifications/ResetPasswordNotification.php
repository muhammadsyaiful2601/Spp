<?php

namespace App\Notifications;

use Illuminate\Bus\Queueable;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

/**
 * Password reset token.
 *
 * The raw token only ever appears here; the database stores a hash of it, so a
 * leaked table cannot be replayed against the reset endpoint. The mail carries
 * both a direct link (for readers who want one click) and the printed code
 * (for clients that do not render links).
 */
class ResetPasswordNotification extends Notification
{
    use Queueable;

    public function __construct(private readonly string $token) {}

    /** @return array<int, string> */
    public function via(object $notifiable): array
    {
        return ['mail'];
    }

    public function toMail(object $notifiable): MailMessage
    {
        $minutes = config('auth.passwords.users.expire', 60);

        return (new MailMessage)
            ->subject('Atur ulang kata sandi portal keuangan')
            ->greeting('Assalamu\'alaikum '.$notifiable->name)
            ->line('Gunakan kode berikut untuk mengatur ulang kata sandi Anda:')
            ->line($this->token)
            ->line('Kode berlaku selama '.$minutes.' menit.')
            ->action('Buka halaman atur ulang', $this->resetUrl())
            ->line('Jika Anda tidak meminta ini, abaikan email ini. Kata sandi Anda tidak berubah.');
    }

    /**
     * The emailed button opens the recovery screen straight on the reset step
     * with the code already filled in. The frontend consumes `kode` once and
     * strips it from the address bar immediately, so the token does not linger
     * in the URL, browser history, or referrer headers.
     */
    private function resetUrl(): string
    {
        return rtrim((string) config('app.frontend_url'), '/').'/?kode='.$this->token;
    }
}
