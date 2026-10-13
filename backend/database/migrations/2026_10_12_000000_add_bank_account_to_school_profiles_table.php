<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Payment account shown on every receipt and report.
 *
 * The portal settles fees through a real, fixed bank account rather than a
 * per-student virtual account, so the three fields travel together as one
 * identity: which bank, which number, and whose name it is registered under
 * (A.N.). The number is kept as a string so leading zeros survive the round
 * trip — dropping them would print a wrong account on the document.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('school_profiles', function (Blueprint $table) {
            $table->string('bank_name', 100)->nullable()->after('receipt_note');
            $table->string('bank_account_number', 50)->nullable()->after('bank_name');
            $table->string('bank_account_holder', 150)->nullable()->after('bank_account_number');
        });
    }

    public function down(): void
    {
        Schema::table('school_profiles', function (Blueprint $table) {
            $table->dropColumn(['bank_name', 'bank_account_number', 'bank_account_holder']);
        });
    }
};