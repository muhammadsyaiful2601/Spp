<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Audit trail behind the pimpinan "Log aktivitas" screen.
 *
 * Rows are written by App\Support\ActivityLogger as the final step of a
 * successful mutation, so the table is append-only: nothing here is ever
 * updated. The actor is snapshotted instead of joined, because the log has to
 * stay readable after an account is renamed or deleted.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('activity_logs', function (Blueprint $table) {
            $table->id();
            // Nullable on purpose: an anonymous forgot-password request and a
            // rejected sign-in have nobody to attribute the action to.
            $table->foreignId('user_id')->nullable()->constrained('users')->nullOnDelete();
            // Snapshot of who acted, kept even if the account changes its name.
            $table->string('actor_name')->nullable();
            $table->string('actor_username', 100)->nullable();
            $table->string('actor_role', 20)->nullable();
            // Machine key such as `pembayaran.spp`; `category` drives the filter.
            $table->string('action', 60);
            $table->string('category', 30);
            $table->string('description');
            // What the action was performed on, when it has a single target.
            $table->string('subject_type', 40)->nullable();
            $table->unsignedBigInteger('subject_id')->nullable();
            $table->string('subject_label')->nullable();
            $table->json('meta')->nullable();
            $table->string('ip_address', 45)->nullable();
            $table->string('user_agent')->nullable();
            $table->timestamp('created_at')->nullable();

            // The list is always newest-first and filtered by category, so both
            // columns earn an index; the composite covers the subject drill-down.
            $table->index('created_at');
            $table->index('category');
            $table->index(['subject_type', 'subject_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('activity_logs');
    }
};