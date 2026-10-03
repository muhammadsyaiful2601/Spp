<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\Mail;
use Throwable;

/**
 * Prove that outgoing mail actually leaves the server.
 *
 * Verifying an address by hand means waiting for a code that may never come,
 * with no way to tell a DNS problem from a rejected password. This sends a
 * plain message and reports what the transport complained about.
 */
class TestMailDelivery extends Command
{
    protected $signature = 'mail:test {email : alamat email tujuan}';

    protected $description = 'Kirim email uji untuk memastikan konfigurasi SMTP sudah benar';

    public function handle(): int
    {
        $email = (string) $this->argument('email');

        if (! filter_var($email, FILTER_VALIDATE_EMAIL)) {
            $this->error("'{$email}' bukan alamat email yang valid.");

            return self::FAILURE;
        }

        $this->reportConfiguration();

        // `log` is not a delivery attempt, so a success here would be a lie.
        if (config('mail.default') === 'log') {
            $this->error('MAIL_MAILER masih "log" — email hanya ditulis ke laravel.log, tidak pernah terkirim.');
            $this->line('  Isi .env dengan kredensial SMTP lalu ulangi perintah ini.');

            return self::FAILURE;
        }

        try {
            // The sender hostname is included because mail providers list it as
            // the connecting host when they reject a connection.
            Mail::raw(
                "Halo,\n\n"
                ."Email ini dikirim dari Portal Keuangan Sekolah untuk memeriksa konfigurasi SMTP.\n\n"
                ."Waktu    : ".now()->toDateTimeString()."\n"
                ."Hostname : ".gethostname()."\n"
                ."Mailer   : ".config('mail.default')."\n",
                fn ($message) => $message->to($email)->subject('Tes konfigurasi email')
            );
        } catch (Throwable $e) {
            $this->reportFailure($e);

            return self::FAILURE;
        }

        $this->info("Email uji berhasil dikirim ke {$email}.");
        $this->line('  Periksa inbox (dan folder spam) sebelum menganggap konfigurasi selesai.');

        return self::SUCCESS;
    }

    /** Turn the Symfony scheme into the mode a human can act on. */
    private function describeEncryption(): string
    {
        $scheme = config('mail.mailers.smtp.scheme') ?: 'smtp';

        return match ($scheme) {
            'smtps' => 'TLS langsung (smtps, biasanya port 465)',
            default => 'STARTTLS (smtp, biasanya port 587)',
        };
    }

    /** Echo the settings that decide whether delivery can work at all. */
    private function reportConfiguration(): void
    {
        $this->line('<options=bold>Konfigurasi aktif</>');
        $this->line('  Mailer          : '.config('mail.default'));
        $this->line('  Host            : '.config('mail.mailers.smtp.host'));
        $this->line('  Port            : '.config('mail.mailers.smtp.port'));
        $this->line('  Enkripsi        : '.$this->describeEncryption());
        $this->line('  Pengirim        : '.config('mail.from.address'));

        $username = config('mail.mailers.smtp.username');
        $this->line('  Username        : '.($username ?: '<fg=red>kosong</>'));

        if ($username && ! config('mail.mailers.smtp.password')) {
            $this->warn('  MAIL_PASSWORD kosong — autentikasi akan gagal.');
        }
    }

    /**
     * Turn a transport exception into something actionable.
     *
     * The raw message ("Connection could not be established") does not say which
     * value to edit, so the common causes are called out by name.
     */
    private function reportFailure(Throwable $e): void
    {
        $this->error('Pengiriman gagal: '.$e->getMessage());
        $this->line('');
        $this->line('<options=bold>Kemungkinan penyebab</>');

        $message = mb_strtolower($e->getMessage());

        $hints = match (true) {
            str_contains($message, 'authentication') || str_contains($message, '535')
                => ['Username atau password salah.',
                    'Gmail wajib memakai App Password, bukan password akun biasa.',
                    'Aktifkan 2FA dulu: https://myaccount.google.com/apppasswords'],
            str_contains($message, 'connection refused'), str_contains($message, 'timed out'),
            str_contains($message, 'could not resolve')
                => ['Host atau port salah, atau diblokir firewall.',
                    'Coba: telnet {host} {port} dari server.'],
            str_contains($message, 'certificate') || str_contains($message, 'ssl')
                => ['Masalah enkripsi/TLS.',
                    'Coba MAIL_SCHEME=tls (port 587) atau MAIL_SCHEME=null (port 465).'],
            str_contains($message, 'from address') || str_contains($message, 'sender')
                => ['MAIL_FROM_ADDRESS ditolak oleh penyedia.',
                    'Wajib memakai alamat yang sudah diverifikasi di akun SMTP tersebut.'],
            str_contains($message, '550'), str_contains($message, '553')
                => ['Penyedia menolak email.',
                    'Umumnya domain pengirim belum diverifikasi (SPF/DKIM) atau kuota habis.'],
            default => ['Periksa log lengkap: tail -f storage/logs/laravel.log'],
        };

        foreach ($hints as $hint) {
            $this->line('  - '.$hint);
        }
    }
}