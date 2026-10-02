<?php

use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\DashboardController;
use App\Http\Controllers\Api\PaymentController;
use App\Http\Controllers\Api\PricingController;
use App\Http\Controllers\Api\ReportController;
use App\Http\Controllers\Api\SchoolProfileController;
use App\Http\Controllers\Api\StudentController;
use Illuminate\Support\Facades\Route;

Route::prefix('v1')->group(function () {
    Route::get('/public/sekolah-profile', [SchoolProfileController::class, 'publicProfile']);
    Route::post('/auth/login', [AuthController::class, 'login']);

    Route::middleware('auth:sanctum')->group(function () {
        Route::post('/auth/logout', [AuthController::class, 'logout']);
        Route::get('/auth/me', [AuthController::class, 'me']);
        Route::post('/auth/profile', [AuthController::class, 'updateProfile']);
        Route::post('/auth/password', [AuthController::class, 'changePassword']);

        Route::prefix('pimpinan')->middleware('role:pimpinan')->group(function () {
            Route::get('/sekolah-profile', [SchoolProfileController::class, 'show']);
            Route::post('/sekolah-profile', [SchoolProfileController::class, 'update']);
            Route::post('/sekolah-profile/upload-logo', [SchoolProfileController::class, 'uploadLogo']);
            Route::post('/sekolah-profile/upload-stempel', [SchoolProfileController::class, 'uploadStamp']);
            Route::post('/sekolah-profile/upload-favicon', [SchoolProfileController::class, 'uploadFavicon']);
            Route::post('/sekolah-profile/theme', [SchoolProfileController::class, 'updateTheme']);
            Route::delete('/sekolah-profile/favicon', [SchoolProfileController::class, 'deleteFavicon']);
            Route::get('/spp-periode', [PricingController::class, 'sppIndex']);
            Route::post('/spp-periode', [PricingController::class, 'saveSppPeriod']);
            Route::get('/tarif-non-spp', [PricingController::class, 'positionRates']);
            Route::post('/tarif-non-spp', [PricingController::class, 'savePositionRate']);
        });

        Route::prefix('admin')->middleware('role:admin')->group(function () {
            Route::get('/siswa', [StudentController::class, 'index']);
            Route::post('/siswa', [StudentController::class, 'store']);
            Route::get('/siswa/{student}/tagihan', [StudentController::class, 'bills']);
            Route::post('/pembayaran/spp', [PaymentController::class, 'paySpp']);
            Route::post('/pembayaran/non-spp', [PaymentController::class, 'payNonSpp']);
            Route::get('/transaksi/{transactionNumber}/cetak-kuitansi', [PaymentController::class, 'receipt']);
        });

        Route::prefix('reports')->middleware('role:pimpinan,admin')->group(function () {
            Route::get('/spp', [ReportController::class, 'spp']);
            Route::get('/non-spp', [ReportController::class, 'nonSpp']);
            Route::get('/dashboard-stats', [ReportController::class, 'dashboard']);
        });

        Route::prefix('data')->middleware('role:pimpinan,admin')->group(function () {
            Route::get('/portal', [DashboardController::class, 'portal']);
        });
    });
});
