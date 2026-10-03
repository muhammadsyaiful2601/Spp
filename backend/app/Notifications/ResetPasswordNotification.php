<?php

namespace App\Notifications;

use Illuminate\Bus\Queueable;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

/**
 * Password reset token.
 *
 * The raw token only ever appears here; the database stores a hash of it, so a
 * leaked table cannot be replayed against the reset endpoint.
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
            ->line('Jika Anda tidak meminta ini, abaikan email ini. Kata sandi Anda tidak berubah.');
    }
}