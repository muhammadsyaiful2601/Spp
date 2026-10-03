<?php

namespace App\Notifications;

use Illuminate\Bus\Queueable;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

/**
 * Six-digit code proving the address belongs to the account holder.
 *
 * `MAIL_MAILER=log` in local development, so the code lands in
 * `storage/logs/laravel.log` instead of an inbox.
 */
class VerifyEmailNotification extends Notification
{
    use Queueable;

    public function __construct(private readonly string $code) {}

    /** @return array<int, string> */
    public function via(object $notifiable): array
    {
        return ['mail'];
    }

    public function toMail(object $notifiable): MailMessage
    {
        return (new MailMessage)
            ->subject('Verifikasi alamat email akun Anda')
            ->greeting('Assalamu\'alaikum '.$notifiable->name)
            ->line('Masukkan kode berikut pada halaman Profil sekolah untuk mengaktifkan seluruh fitur portal:')
            ->line($this->code)
            ->line('Kode berlaku selama '.config('auth.verification.code_ttl_minutes', 30).' menit.')
            ->line('Jika Anda tidak meminta kode ini, abaikan email ini.');
    }
}