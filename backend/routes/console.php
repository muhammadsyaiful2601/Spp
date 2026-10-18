<?php

use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Schedule;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

/*
|--------------------------------------------------------------------------
| Scheduled maintenance
|--------------------------------------------------------------------------
|
| These jobs all delete rows that nothing else ever will.
|
| `personal_access_tokens` is the one that matters most for security: a browser
| closed without logging out leaves a bearer token that stays valid until it is
| removed, and `changePassword` / logout / password reset each clear only the
| paths they know about. `password_reset_tokens` accumulates the same way, and
| the queue tables grow until they are the biggest thing in the database.
|
| The operator cron (`php artisan schedule:run`, every minute) is what runs
| this file. See DEPLOY.md.
|
*/

Schedule::command('sanctum:prune-expired')
    ->dailyAt('02:05')
    ->withoutOverlapping();

Schedule::command('auth:clear-resets')
    ->dailyAt('02:10')
    ->withoutOverlapping();

Schedule::command('queue:prune-failed --hours=168')
    ->dailyAt('02:20')
    ->withoutOverlapping();

/*
 * The audit trail. Runs last and on the hour because it is the only job that
 * can discard business records, and doing it after the others means a day's
 * worth of sign-ins is still present while the token prune runs.
 */
Schedule::command('activity-logs:prune')
    ->dailyAt('02:30')
    ->withoutOverlapping();

Schedule::command('queue:prune-completed --hours=24')
    ->dailyAt('02:40')
    ->withoutOverlapping();