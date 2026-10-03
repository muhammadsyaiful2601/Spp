<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Lets `pimpinan` suspend a treasurer account.
 *
 * Suspending is preferred over deleting: the account owns the audit trail of the
 * payments it recorded, so removing the row would orphan that history. Login and
 * bearer tokens are checked against this flag in AuthController.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->boolean('is_active')->default(true)->after('role');
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn('is_active');
        });
    }
};