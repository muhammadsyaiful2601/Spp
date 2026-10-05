<!DOCTYPE html>
<html lang="id">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="robots" content="noindex, nofollow">
    <title>Konfirmasi keamanan · {{ config('app.name') }}</title>
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
        .account {
            background: #f1f6f3;
            border: 1px solid #dde8e2;
            border-radius: 10px;
            padding: 13px 15px;
            margin-bottom: 18px;
        }
        .account strong { display: block; font-size: 15px; color: #183d33; }
        .account span { display: block; margin-top: 2px; font-size: 13px; color: #6d8177; }
        form { margin: 0; }
        button {
            width: 100%;
            border: 0;
            border-radius: 9px;
            padding: 13px 16px;
            background: #24634e;
            color: #fff;
            font-size: 14px;
            font-weight: 600;
            cursor: pointer;
        }
        button:hover { background: #1b4c3c; }
        .cancel {
            display: block;
            margin-top: 16px;
            text-align: center;
            font-size: 13px;
            color: #6d8177;
            text-decoration: none;
        }
        .cancel:hover { text-decoration: underline; }
    </style>
</head>
<body>
    <main class="card">
        <div class="mark" aria-hidden="true">&#9888;</div>
        <h1>Konfirmasi keamanan</h1>
        <p>Tautan ini berasal dari email peringatan aktivitas masuk. Melanjutkan akan <strong>mengeluarkan seluruh sesi</strong> akun berikut dari portal, di semua perangkat:</p>

        <div class="account">
            <strong>{{ $user->name }}</strong>
            <span>{{ $user->email }}</span>
        </div>

        <p>Jika Anda sendiri yang baru masuk dan tidak ada yang mencurigakan, tutup saja halaman ini — tidak ada sesi yang berakhir.</p>

        <form method="POST" action="{{ request()->fullUrl() }}">
            @csrf
            <button type="submit">Ya, keluarkan seluruh sesi</button>
        </form>

        <a class="cancel" href="{{ $frontendUrl }}/">Batal dan kembali ke portal</a>
    </main>
</body>
</html>
