<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Employee number (NIP) for the staff who sign financial documents.
 *
 * Every receipt and report ends in a signature block that already reserved a
 * line for "NIP. ……" but had nothing to print. The number belongs to the
 * individual, not to the school, so it lives on the account rather than on the
 * school profile: a treasurer and the principal sign different documents with
 * different numbers.
 *
 * Kept nullable. A public-school teacher may not have one, and forcing an empty
 * string would print "NIP." with nothing after it. Blank simply falls back to
 * the dotted line that was always there.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->string('nip', 40)->nullable()->after('email');
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn('nip');
        });
    }
};