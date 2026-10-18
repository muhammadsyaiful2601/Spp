<?php

use App\Http\Middleware\EnsureEmailVerified;
use App\Http\Middleware\EnsureRole;
use Dotenv\Dotenv;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Request;
use Illuminate\Support\Env;

$app = Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        api: __DIR__.'/../routes/api.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware): void {
        // Every guarded route in this application is an API route, and there is
        // no `login` route here: the SPA owns that screen. Left at its default,
        // the framework redirects guests to `route('login')`, which throws
        // RouteNotFoundException — so a request with no token answered 500
        // instead of the 401 the frontend relies on to send the user back to
        // the login form. Returning null keeps the authentication exception
        // intact, and it renders as JSON because every path is under api/*.
        $middleware->redirectGuestsTo(fn (Request $request) => null);

        $middleware->alias([
            'role' => EnsureRole::class,
            'verified' => EnsureEmailVerified::class,
        ]);
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        $exceptions->shouldRenderJsonWhen(
            fn (Request $request) => $request->is('api/*') || $request->expectsJson(),
        );
    })->create();

/*
|--------------------------------------------------------------------------
| Two environment files, split by sensitivity
|--------------------------------------------------------------------------
|
| `.env` at the repository root holds only the addresses that tie the SPA to this
| API — no secrets, so it is committed and cloned. `backend/.env` holds APP_KEY,
| the database password and the SMTP key, and stays out of version control.
|
| Loaded here, before the framework's own loader, so both files are in place
| before the first `env()` call.
|
| Order decides precedence, and it is the opposite of what the immutable
| Dotenv repository suggests: this file loads first, then the framework's
| `LoadEnvironmentVariables` bootstrapper loads `backend/.env` on top. In
| phpdotenv 5.7 `Dotenv::create()` builds a writer-less `Loader`, which
| overwrites rather than respecting the repository's immutable writer, so for
| any key present in BOTH files the value in `backend/.env` is the one that
| survives.
|
| That matters because `backend/.env.example` already defines `APP_URL` and
| `FRONTEND_URL`: editing those two keys in the root `.env` alone changes
| nothing. They belong in `backend/.env`. The root file is authoritative only
| for keys `backend/.env` does not mention — in practice `CORS_ALLOWED_ORIGINS`
| and the `VITE_*` values that Vite reads at build time.
|
| Must run before bootstrapping.
*/

$projectRoot = dirname(__DIR__, 2);
$rootEnvFile = $projectRoot.DIRECTORY_SEPARATOR.'.env';

if (is_file($rootEnvFile)) {
    Dotenv::create(Env::getRepository(), $projectRoot, '.env')->safeLoad();
}

return $app;