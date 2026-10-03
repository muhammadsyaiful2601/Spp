<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Lets every signed-in user manage their own profile photo.
 *
 * The file lives in the `public` disk under `avatars/`, served through the
 * existing `/storage` symlink, so the same path can be rendered everywhere the
 * profile appears (topbar, sidebar, account hero, treasurer list).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->string('photo_path')->nullable()->after('email');
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn('photo_path');
        });
    }
};