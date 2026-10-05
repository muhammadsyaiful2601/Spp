<?php

use App\Http\Controllers\LoginAlertController;
use Illuminate\Support\Facades\Route;

Route::get('/', function () {
    return view('welcome');
});

// Destinations for the "bukan saya?" button in the login alert email. Both are
// gated by `signed`, not by a session: the recipient may be reading email on a
// device that is not signed in, and the signature is what proves the link came
// from us with an unexpired, untampered target account. GET stays side-effect
// free on purpose — see App\Http\Controllers\LoginAlertController.
Route::get('/keamanan/keluar-sesi', [LoginAlertController::class, 'show'])
    ->middleware('signed')
    ->name('security.signout.show');

Route::post('/keamanan/keluar-sesi', [LoginAlertController::class, 'revoke'])
    ->middleware('signed')
    ->name('security.signout.revoke');
