<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Support\ActivityLogger;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\File;
use RuntimeException;
use Symfony\Component\HttpFoundation\BinaryFileResponse;
use Throwable;

class MaintenanceController extends Controller
{
    public function backup(): BinaryFileResponse
    {
        $driver = DB::connection()->getDriverName();
        abort_unless(
            in_array($driver, ['mysql', 'mariadb'], true),
            422,
            'Backup database hanya mendukung MySQL dan MariaDB.',
        );

        $directory = storage_path('app/private');
        File::ensureDirectoryExists($directory);
        $path = tempnam($directory, 'database-backup-');

        if ($path === false) {
            throw new RuntimeException('File sementara untuk backup database tidak dapat dibuat.');
        }

        try {
            $handle = fopen($path, 'wb');

            if ($handle === false) {
                throw new RuntimeException('File sementara untuk backup database tidak dapat dibuka.');
            }

            try {
                $this->writeMysqlBackup($handle);
            } finally {
                fclose($handle);
            }
        } catch (Throwable $exception) {
            @unlink($path);
            throw $exception;
        }

        ActivityLogger::record(
            'pemeliharaan.backup',
            'sistem',
            'Mengunduh backup database.',
        );

        $filename = 'backup-database-'.now()->format('Ymd-His').'.sql';

        return response()->download($path, $filename, [
            'Content-Type' => 'application/sql; charset=UTF-8',
        ])->deleteFileAfterSend(true);
    }

    public function clearCache(): JsonResponse
    {
        if (! Cache::flush()) {
            throw new RuntimeException('Cache aplikasi tidak berhasil dibersihkan.');
        }

        ActivityLogger::record(
            'pemeliharaan.cache_dibersihkan',
            'sistem',
            'Membersihkan cache aplikasi.',
        );

        return response()->json([
            'message' => 'Cache aplikasi berhasil dibersihkan.',
        ]);
    }

    /** @param resource $handle */
    private function writeMysqlBackup($handle): void
    {
        $this->write($handle, '-- Database backup generated at '.now()->toIso8601String()."\n");
        $this->write($handle, "SET NAMES utf8mb4;\nSET FOREIGN_KEY_CHECKS=0;\nSTART TRANSACTION;\n\n");

        $connection = DB::connection();
        $connection->beginTransaction();

        try {
            $tables = DB::select("SHOW FULL TABLES WHERE Table_type = 'BASE TABLE'");

            foreach ($tables as $tableRow) {
                $tableColumn = array_key_first((array) $tableRow);

                if (! is_string($tableColumn)) {
                    throw new RuntimeException('Daftar tabel database tidak dapat dibaca.');
                }

                $tableName = (string) $tableRow->{$tableColumn};
                $quotedTable = $this->quoteMysqlIdentifier($tableName);
                $definition = DB::selectOne("SHOW CREATE TABLE {$quotedTable}");
                $createStatement = $definition->{'Create Table'} ?? null;

                if (! is_string($createStatement) || $createStatement === '') {
                    throw new RuntimeException("Struktur tabel {$tableName} tidak dapat dibaca.");
                }

                $this->write($handle, "DROP TABLE IF EXISTS {$quotedTable};\n{$createStatement};\n\n");
                $this->writeTableRows($handle, $tableName);
            }

            $connection->commit();
        } catch (Throwable $exception) {
            if ($connection->transactionLevel() > 0) {
                $connection->rollBack();
            }

            throw $exception;
        }

        $this->write($handle, "COMMIT;\nSET FOREIGN_KEY_CHECKS=1;\n");
    }

    /** @param resource $handle */
    private function writeTableRows($handle, string $table): void
    {
        $pdo = DB::connection()->getPdo();
        $quotedTable = $this->quoteMysqlIdentifier($table);

        foreach (DB::table($table)->cursor() as $row) {
            $values = (array) $row;
            $columns = array_map(
                fn (string $column): string => $this->quoteMysqlIdentifier($column),
                array_keys($values),
            );
            $literals = array_map(
                fn (mixed $value): string => $this->quoteValue($pdo, $value),
                array_values($values),
            );

            $this->write(
                $handle,
                "INSERT INTO {$quotedTable} (".implode(', ', $columns).') VALUES ('
                    .implode(', ', $literals).");\n",
            );
        }

        $this->write($handle, "\n");
    }

    private function quoteValue(\PDO $pdo, mixed $value): string
    {
        if ($value === null) {
            return 'NULL';
        }

        if (is_bool($value)) {
            return $value ? '1' : '0';
        }

        if (is_resource($value)) {
            $value = stream_get_contents($value);

            if ($value === false) {
                throw new RuntimeException('Nilai biner database tidak dapat dibaca.');
            }
        }

        $value = (string) $value;

        if (preg_match('//u', $value) !== 1) {
            return '0x'.bin2hex($value);
        }

        $quoted = $pdo->quote($value);

        if ($quoted === false) {
            throw new RuntimeException('Nilai database tidak dapat dikodekan ke file backup.');
        }

        return $quoted;
    }

    private function quoteMysqlIdentifier(string $identifier): string
    {
        return '`'.str_replace('`', '``', $identifier).'`';
    }

    /** @param resource $handle */
    private function write($handle, string $content): void
    {
        $length = strlen($content);
        $offset = 0;

        while ($offset < $length) {
            $written = fwrite($handle, substr($content, $offset));

            if ($written === false || $written === 0) {
                throw new RuntimeException('File backup database tidak dapat ditulis.');
            }

            $offset += $written;
        }
    }
}
