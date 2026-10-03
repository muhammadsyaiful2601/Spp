<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Email verification and password reset support.
 *
 * `email_verified_at` already exists on `users`; this adds the token used to
 * prove ownership of the address. Accounts with a NULL `email_verified_at` may
 * sign in but are confined to the profile screen by EnsureEmailVerified.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            // Plain SHA-256 of the emailed code; never the code itself.
            $table->string('email_verification_token', 64)->nullable()->unique()->after('email_verified_at');
            $table->timestamp('email_verification_sent_at')->nullable()->after('email_verification_token');
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropUnique(['email_verification_token']);
            $table->dropColumn(['email_verification_token', 'email_verification_sent_at']);
        });
    }
};