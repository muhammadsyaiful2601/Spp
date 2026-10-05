<!DOCTYPE html>
<html lang="id">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="robots" content="noindex, nofollow">
    <title>Sesi dikeluarkan · {{ config('app.name') }}</title>
    <style>
        * { box-sizing: border-box; }
        body {
            margin: 0;
            min-height: 100vh;
            display: grid;
            place-items: center;
            padding: 24px;
            background: #f4f6f3;
            color: #183d33;
            font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
        }
        .card {
            width: 100%;
            max-width: 440px;
            background: #fff;
            border: 1px solid #e3e8e4;
            border-radius: 14px;
            padding: 36px 32px;
            box-shadow: 0 14px 36px rgba(24, 61, 51, 0.08);
        }
        .mark {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            width: 42px;
            height: 42px;
            margin-bottom: 18px;
            border-radius: 50%;
            background: #eaf1ee;
            color: #24634e;
            font-size: 20px;
        }
        h1 { margin: 0 0 10px; font-size: 21px; line-height: 1.3; }
        p { margin: 0 0 16px; font-size: 14px; line-height: 1.65; color: #4c6157; }
        .advice {
            background: #fdf6e9;
            border: 1px solid #f0e2c4;
            border-radius: 10px;
            padding: 14px 15px;
            margin-bottom: 20px;
        }
        .advice strong { display: block; margin-bottom: 4px; font-size: 14px; color: #7a5a17; }
        .advice p { margin: 0; font-size: 13.5px; color: #6d5a33; }
        a.button {
            display: block;
            text-align: center;
            border-radius: 9px;
            padding: 13px 16px;
            background: #24634e;
            color: #fff;
            font-size: 14px;
            font-weight: 600;
            text-decoration: none;
        }
        a.button:hover { background: #1b4c3c; }
        .back {
            display: block;
            margin-top: 16px;
            text-align: center;
            font-size: 13px;
            color: #6d8177;
            text-decoration: none;
        }
        .back:hover { text-decoration: underline; }
    </style>
</head>
<body>
    <main class="card">
        <div class="mark" aria-hidden="true">&#10003;</div>

        @if ($revoked > 0)
            <h1>Sesi telah dikeluarkan</h1>
            <p>{{ $revoked }} sesi akun <strong>{{ $user->name }}</strong> telah dikeluarkan dari portal. Semua perangkat harus masuk kembali untuk melanjutkan.</p>
        @else
            <h1>Tidak ada sesi aktif</h1>
            <p>Sesi akun <strong>{{ $user->name }}</strong> sudah berakhir sebelumnya — tidak ada yang perlu dikeluarkan lagi.</p>
        @endif

        <div class="advice">
            <strong>Segera ubah kata sandi Anda</strong>
            <p>Jika Anda tidak mengenali aktivitas masuk tersebut, jangan tunda: atur ulang kata sandi Anda, lalu periksa kembali email dan profil akun.</p>
        </div>

        <a class="button" href="{{ $frontendUrl }}/?lupa=1">Atur ulang kata sandi sekarang</a>
        <a class="back" href="{{ $frontendUrl }}/">Kembali ke halaman masuk</a>
    </main>
</body>
</html>
