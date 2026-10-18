<?php

namespace App\Notifications;

use Illuminate\Bus\Queueable;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

/**
 * Password reset token.
 *
 * The raw token only ever appears inside this link; the database stores a hash
 * of it, so a leaked table cannot be replayed against the reset endpoint.
 *
 * The mail deliberately does not also print the code as body text. There is no
 * field to type it into any more, and a bare token sitting in the message body
 * is exactly the copy that mail previews, search indexes, forwarded threads and
 * shared inboxes all keep long after the 60 minutes are up — none of them are
 * as careful with it as the reset endpoint is.
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
            ->line('Klik tombol di bawah untuk mengatur ulang kata sandi Anda.')
            ->action('Buka halaman atur ulang', $this->resetUrl($minutes))
            ->line('Kode pada tautan berlaku selama '.$minutes.' menit.')
            ->line('Jika Anda tidak meminta ini, abaikan email ini. Kata sandi Anda tidak berubah.');
    }

    /**
     * The emailed button opens the recovery screen straight on the reset step,
     * already authorised to set a new password. The frontend consumes `kode`
     * once and strips it from the address bar immediately, so the token does not
     * linger in the URL, browser history, or referrer headers.
     *
     * `s` is the instant the token stops being accepted, so the screen can count
     * the window down instead of letting the user discover the deadline only by
     * failing. It is a display aid and nothing more: the browser could rewrite
     * it at will, and `VerificationController::resetPassword` re-derives the
     * real expiry from `password_reset_tokens.created_at` no matter what
     * arrives here.
     */
    private function resetUrl(int $minutes): string
    {
        $expiresAt = now()->addMinutes($minutes)->timestamp;

        return rtrim((string) config('app.frontend_url'), '/')
            .'/?kode='.$this->token
            .'&s='.$expiresAt;
    }
}
