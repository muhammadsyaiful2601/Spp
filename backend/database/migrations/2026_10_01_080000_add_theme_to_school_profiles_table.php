<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * School-selectable brand colours. The leadership picks a primary and an accent
 * colour; the SPA derives every shade from them. Defaults are green + gold.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('school_profiles', function (Blueprint $table) {
            $table->string('theme_primary', 7)->default('#24634e')->after('favicon_path');
            $table->string('theme_accent', 7)->default('#c88942')->after('theme_primary');
        });

        // Existing rows pick up the defaults explicitly so the SPA always has a
        // usable value even if the column default is ever changed.
        DB::table('school_profiles')->whereNull('theme_primary')->update(['theme_primary' => '#24634e']);
        DB::table('school_profiles')->whereNull('theme_accent')->update(['theme_accent' => '#c88942']);
    }

    public function down(): void
    {
        Schema::table('school_profiles', function (Blueprint $table) {
            $table->dropColumn(['theme_primary', 'theme_accent']);
        });
    }
};