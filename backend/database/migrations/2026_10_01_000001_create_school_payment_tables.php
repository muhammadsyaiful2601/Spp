<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('school_profiles', function (Blueprint $table) {
            $table->id();
            $table->string('school_name');
            $table->string('foundation_name')->nullable();
            $table->text('address');
            $table->string('phone', 50)->nullable();
            $table->string('email')->nullable();
            $table->string('website')->nullable();
            $table->string('logo_path')->nullable();
            $table->string('stamp_path')->nullable();
            $table->text('receipt_note')->nullable();
            $table->string('receipt_template')->default('standard');
            $table->timestamps();
        });

        Schema::create('academic_years', function (Blueprint $table) {
            $table->id();
            $table->string('name', 20)->unique();
            $table->unsignedSmallInteger('start_year');
            $table->unsignedSmallInteger('end_year');
            $table->boolean('is_active')->default(false);
            $table->timestamps();
        });

        Schema::create('class_levels', function (Blueprint $table) {
            $table->id();
            $table->string('name', 50)->unique();
            $table->unsignedTinyInteger('sort_order')->unique();
            $table->timestamps();
        });

        Schema::create('students', function (Blueprint $table) {
            $table->id();
            $table->string('nisn', 20)->unique();
            $table->string('student_number', 30)->unique();
            $table->string('full_name');
            $table->foreignId('class_level_id')->constrained('class_levels')->restrictOnDelete();
            $table->boolean('is_active')->default(true);
            $table->timestamps();
            $table->index(['class_level_id', 'full_name']);
        });

        Schema::create('spp_periods', function (Blueprint $table) {
            $table->id();
            $table->foreignId('academic_year_id')->constrained()->cascadeOnDelete();
            $table->foreignId('class_level_id')->constrained()->cascadeOnDelete();
            $table->string('name', 100);
            $table->unsignedTinyInteger('month_start');
            $table->unsignedTinyInteger('month_end');
            $table->decimal('monthly_amount', 12, 2);
            $table->timestamps();
            $table->unique(['academic_year_id', 'class_level_id', 'month_start', 'month_end'], 'spp_period_class_month_unique');
        });

        Schema::create('payment_positions', function (Blueprint $table) {
            $table->id();
            $table->string('name', 100)->unique();
            $table->enum('type', ['sekali_bayar', 'tahunan', 'cicilan'])->default('sekali_bayar');
            $table->boolean('is_active')->default(true);
            $table->timestamps();
        });

        Schema::create('position_rates', function (Blueprint $table) {
            $table->id();
            $table->foreignId('payment_position_id')->constrained()->cascadeOnDelete();
            $table->foreignId('academic_year_id')->constrained()->cascadeOnDelete();
            $table->foreignId('class_level_id')->constrained()->cascadeOnDelete();
            $table->decimal('amount', 12, 2);
            $table->timestamps();
            $table->unique(['payment_position_id', 'academic_year_id', 'class_level_id'], 'position_rate_scope_unique');
        });

        Schema::create('spp_bills', function (Blueprint $table) {
            $table->id();
            $table->foreignId('student_id')->constrained()->cascadeOnDelete();
            $table->foreignId('academic_year_id')->constrained()->cascadeOnDelete();
            $table->unsignedTinyInteger('month');
            $table->unsignedSmallInteger('calendar_year');
            $table->decimal('amount', 12, 2);
            $table->enum('status', ['belum_bayar', 'lunas'])->default('belum_bayar');
            $table->timestamp('paid_at')->nullable();
            $table->timestamps();
            $table->unique(['student_id', 'academic_year_id', 'month'], 'spp_bill_period_unique');
        });

        Schema::create('non_spp_bills', function (Blueprint $table) {
            $table->id();
            $table->foreignId('student_id')->constrained()->cascadeOnDelete();
            $table->foreignId('position_rate_id')->constrained()->restrictOnDelete();
            $table->decimal('amount_due', 12, 2);
            $table->decimal('amount_paid', 12, 2)->default(0);
            $table->enum('status', ['belum_bayar', 'sebagian', 'lunas'])->default('belum_bayar');
            $table->timestamps();
            $table->unique(['student_id', 'position_rate_id'], 'non_spp_student_rate_unique');
        });

        Schema::create('payment_transactions', function (Blueprint $table) {
            $table->id();
            $table->string('transaction_number', 100)->unique();
            $table->foreignId('student_id')->constrained()->restrictOnDelete();
            $table->foreignId('user_id')->constrained()->restrictOnDelete();
            $table->enum('type', ['spp', 'non_spp']);
            $table->unsignedBigInteger('reference_id')->nullable();
            $table->json('details')->nullable();
            $table->decimal('amount', 12, 2);
            $table->timestamp('paid_at')->useCurrent();
            $table->timestamps();
            $table->index(['student_id', 'paid_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('payment_transactions');
        Schema::dropIfExists('non_spp_bills');
        Schema::dropIfExists('spp_bills');
        Schema::dropIfExists('position_rates');
        Schema::dropIfExists('payment_positions');
        Schema::dropIfExists('spp_periods');
        Schema::dropIfExists('students');
        Schema::dropIfExists('class_levels');
        Schema::dropIfExists('academic_years');
        Schema::dropIfExists('school_profiles');
    }
};
