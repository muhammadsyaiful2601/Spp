<?php

namespace App\Models;

// use Illuminate\Contracts\Auth\MustVerifyEmail;
use Database\Factories\UserFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Attributes\Hidden;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Laravel\Sanctum\HasApiTokens;

// `role` is deliberately absent. It is the gate protecting bank details,
// treasurer management, the audit trail and the database backup, so no request
// may ever reach it through mass assignment. Seeders that need to set it use
// `forceFill()`, which is explicit by construction.
#[Fillable(['name', 'username', 'email', 'nip', 'password'])]
#[Hidden(['password', 'remember_token'])]
class User extends Authenticatable
{
    /** @use HasFactory<UserFactory> */
    use HasApiTokens, HasFactory, Notifiable;

    /**
     * Get the attributes that should be cast.
     *
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'email_verified_at' => 'datetime',
            // Without this the column arrives as a raw string and the resend
            // throttle calls `->gt()` on it, which is a fatal error on the
            // second request — the only path that reads the column at all.
            'email_verification_sent_at' => 'datetime',
            'password' => 'hashed',
        ];
    }
}
