<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Tambah indeks performa pada kolom yang sering difilter / diurutkan.
 *
 * Tanpa indeks ini, query laporan dan dashboard melakukan full table scan
 * pada payment_transactions, spp_bills, dan activity_logs — yang semakin
 * lambat seiring bertambahnya riwayat pembayaran.
 */
return new class extends Migration
{
    public function up(): void
    {
        // payment_transactions: difilter oleh type, diurutkan paid_at, dijoin student_id/user_id
        Schema::table('payment_transactions', function (Blueprint $table) {
            $table->index('type', 'payments_type_index');
            $table->index('paid_at', 'payments_paid_at_index');
            $table->index(['student_id', 'paid_at'], 'payments_student_paid_at_index');
            $table->index('user_id', 'payments_user_id_index');
        });

        // spp_bills: difilter oleh status, academic_year_id, month
        Schema::table('spp_bills', function (Blueprint $table) {
            $table->index('status', 'spp_bills_status_index');
            $table->index(['academic_year_id', 'student_id'], 'spp_bills_year_student_index');
            $table->index('month', 'spp_bills_month_index');
        });

        // non_spp_bills: difilter oleh status, dijoin position_rate_id
        Schema::table('non_spp_bills', function (Blueprint $table) {
            $table->index('status', 'non_spp_bills_status_index');
            $table->index('position_rate_id', 'non_spp_bills_position_rate_index');
        });

        // position_rates: difilter academic_year_id + class_level_id
        Schema::table('position_rates', function (Blueprint $table) {
            $table->index(['academic_year_id', 'class_level_id'], 'position_rates_year_level_index');
            $table->index('payment_position_id', 'position_rates_position_index');
        });

        // activity_logs: list selalu newest-first dan difilter category
        Schema::table('activity_logs', function (Blueprint $table) {
            $table->index(['category', 'created_at'], 'activity_logs_category_created_index');
        });

        // users: difilter role + is_active di hampir setiap endpoint admin/pimpinan
        Schema::table('users', function (Blueprint $table) {
            $table->index('role', 'users_role_index');
            $table->index('is_active', 'users_is_active_index');
        });

        // academic_years: is_active sering dikueri untuk menentukan tahun aktif
        Schema::table('academic_years', function (Blueprint $table) {
            $table->index('is_active', 'academic_years_is_active_index');
        });

        // students: is_active difilter di dashboard dan bills
        Schema::table('students', function (Blueprint $table) {
            $table->index('is_active', 'students_is_active_index');
        });
    }

    public function down(): void
    {
        Schema::table('payment_transactions', function (Blueprint $table) {
            $table->dropIndex('payments_type_index');
            $table->dropIndex('payments_paid_at_index');
            $table->dropIndex('payments_student_paid_at_index');
            $table->dropIndex('payments_user_id_index');
        });

        Schema::table('spp_bills', function (Blueprint $table) {
            $table->dropIndex('spp_bills_status_index');
            $table->dropIndex('spp_bills_year_student_index');
            $table->dropIndex('spp_bills_month_index');
        });

        Schema::table('non_spp_bills', function (Blueprint $table) {
            $table->dropIndex('non_spp_bills_status_index');
            $table->dropIndex('non_spp_bills_position_rate_index');
        });

        Schema::table('position_rates', function (Blueprint $table) {
            $table->dropIndex('position_rates_year_level_index');
            $table->dropIndex('position_rates_position_index');
        });

        Schema::table('activity_logs', function (Blueprint $table) {
            $table->dropIndex('activity_logs_category_created_index');
        });

        Schema::table('users', function (Blueprint $table) {
            $table->dropIndex('users_role_index');
            $table->dropIndex('users_is_active_index');
        });

        Schema::table('academic_years', function (Blueprint $table) {
            $table->dropIndex('academic_years_is_active_index');
        });

        Schema::table('students', function (Blueprint $table) {
            $table->dropIndex('students_is_active_index');
        });
    }
};
