<?php

use App\Http\Controllers\Api\AcademicYearController;
use App\Http\Controllers\Api\ActivityLogController;
use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\DashboardController;
use App\Http\Controllers\Api\PaymentController;
use App\Http\Controllers\Api\PricingController;
use App\Http\Controllers\Api\ReportController;
use App\Http\Controllers\Api\SchoolProfileController;
use App\Http\Controllers\Api\StudentController;
use App\Http\Controllers\Api\TreasurerController;
use Illuminate\Support\Facades\Route;

use App\Http\Controllers\Api\VerificationController;

Route::prefix('v1')->group(function () {
    Route::get('/public/sekolah-profile', [SchoolProfileController::class, 'publicProfile']);
    // Brute-force guard: 10 attempts per minute per IP. High enough that a real
    // user mistyping a few times never notices, low enough that password
    // guessing becomes useless. Applies per IP (not per username) so an
    // attacker cannot dodge it by rotating usernames.
    Route::post('/auth/login', [AuthController::class, 'login'])->middleware('throttle:10,1');

    // Password recovery is reachable without a session, so a locked-out user can
    // get back in. The response never reveals whether the account exists.
    Route::post('/auth/forgot-password', [VerificationController::class, 'forgotPassword']);
    Route::post('/auth/reset-password', [VerificationController::class, 'resetPassword']);

    Route::middleware('auth:sanctum')->group(function () {
        Route::post('/auth/logout', [AuthController::class, 'logout']);
        Route::get('/auth/me', [AuthController::class, 'me']);
        Route::post('/auth/profile', [AuthController::class, 'updateProfile']);
        Route::post('/auth/photo', [AuthController::class, 'updatePhoto']);
        Route::delete('/auth/photo', [AuthController::class, 'deletePhoto']);
        Route::post('/auth/password', [AuthController::class, 'changePassword']);
        Route::post('/auth/verification/send', [VerificationController::class, 'sendCode']);
        Route::post('/auth/verification/verify', [VerificationController::class, 'verifyCode']);

        // Everything below needs a verified address. The middleware keeps the
        // account/profile/verification endpoints above reachable.
        Route::middleware('verified')->group(function () {
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
                Route::get('/tarif-spp', [PricingController::class, 'sppIndex']);
                Route::post('/tarif-spp', [PricingController::class, 'saveSppRates']);
                Route::get('/tarif-non-spp', [PricingController::class, 'positionRates']);
                Route::post('/tarif-non-spp', [PricingController::class, 'savePositionRates']);
                Route::post('/pos-biaya', [PricingController::class, 'storePosition']);
                Route::post('/tahun-ajaran', [AcademicYearController::class, 'store']);
                Route::post('/tahun-ajaran/{year}/aktifkan', [AcademicYearController::class, 'activate']);
                Route::get('/bendahara', [TreasurerController::class, 'index']);
                Route::post('/bendahara', [TreasurerController::class, 'store']);
                // Bind on `id` only: an unresolvable id must 404, not hit the model.
                Route::put('/bendahara/{treasurer}', [TreasurerController::class, 'update'])->whereNumber('treasurer');
                Route::post('/bendahara/{treasurer}/password', [TreasurerController::class, 'resetPassword'])->whereNumber('treasurer');
                Route::post('/bendahara/{treasurer}/status', [TreasurerController::class, 'setActive'])->whereNumber('treasurer');
                // Audit trail. Read-only by design: the log has no write route.
                Route::get('/log-aktivitas', [ActivityLogController::class, 'index']);
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
                Route::get('/tahun-ajaran', [AcademicYearController::class, 'index']);
            });
        });
        });
});
