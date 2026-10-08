<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\SchoolProfile;
use App\Support\ActivityLogger;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;

class SchoolProfileController extends Controller
{
    public function publicProfile(): JsonResponse
    {
        // Branding only — every client (signed in or not) reads its identity,
        // colours, logo and favicon from here, so the whole white-label set
        // must travel together or another device stays stale.
        return response()->json(['data' => $this->profile()->only([
            'school_name', 'foundation_name', 'logo_path', 'favicon_path', 'address', 'phone', 'email', 'website',
            'receipt_note', 'theme_primary', 'theme_accent',
        ])]);
    }

    public function publicLogo()
    {
        $path = $this->profile()->logo_path;
        if (! $path || ! Storage::disk('public')->exists($path)) {
            return response()->noContent();
        }

        return Storage::disk('public')->response(
            $path,
            null,
            ['Cache-Control' => 'no-cache, no-store, must-revalidate'],
            'inline',
        );
    }

    public function show(): JsonResponse
    {
        return response()->json(['data' => $this->profile()]);
    }

    public function update(Request $request): JsonResponse
    {
        $data = $request->validate([
            'school_name' => ['required', 'string', 'max:255'],
            'foundation_name' => ['nullable', 'string', 'max:255'],
            'address' => ['required', 'string', 'max:5000'],
            'phone' => ['nullable', 'string', 'max:50'],
            'email' => ['nullable', 'email', 'max:255'],
            'website' => ['nullable', 'url', 'max:255'],
            'receipt_note' => ['nullable', 'string', 'max:2000'],
            'receipt_template' => ['required', 'in:ringkas,standard,termal'],
        ]);

        $profile = $this->profile();
        $profile->fill($data)->save();

        ActivityLogger::record(
            'profil_sekolah.ubah',
            'profil_sekolah',
            "Memperbarui identitas sekolah {$profile->school_name}.",
            ['meta' => ['school_name' => $profile->school_name, 'receipt_template' => $profile->receipt_template]],
        );

        return response()->json(['data' => $profile->fresh()]);
    }

    /**
     * Save the school brand colours. Only `pimpinan` may reach this route.
     * Accepts either a preset or free-form hex values.
     */
    public function updateTheme(Request $request): JsonResponse
    {
        $data = $request->validate([
            'theme_primary' => ['required', 'string', 'regex:/^#[0-9a-fA-F]{6}$/'],
            'theme_accent' => ['required', 'string', 'regex:/^#[0-9a-fA-F]{6}$/'],
        ], [
            'theme_primary.regex' => 'Warna utama harus berupa kode heksadesimal seperti #24634e.',
            'theme_accent.regex' => 'Warna aksen harus berupa kode heksadesimal seperti #c88942.',
        ]);

        $profile = $this->profile();
        $profile->fill([
            'theme_primary' => strtolower($data['theme_primary']),
            'theme_accent' => strtolower($data['theme_accent']),
        ])->save();

        ActivityLogger::record(
            'profil_sekolah.tema',
            'profil_sekolah',
            "Mengubah warna tema portal menjadi {$profile->theme_primary} / {$profile->theme_accent}.",
            ['meta' => [
                'theme_primary' => $profile->theme_primary,
                'theme_accent' => $profile->theme_accent,
            ]],
        );

        return response()->json(['data' => $profile->fresh()]);
    }

    public function uploadLogo(Request $request): JsonResponse
    {
        $request->validate(['logo' => ['required', 'image', 'mimes:png,jpg,jpeg,webp', 'max:2048']]);

        return $this->storeImage($request, 'logo', 'logo_path');
    }

    public function uploadStamp(Request $request): JsonResponse
    {
        $request->validate(['stamp' => ['required', 'image', 'mimes:png,jpg,jpeg,webp', 'max:2048']]);

        return $this->storeImage($request, 'stamp', 'stamp_path');
    }

    public function uploadFavicon(Request $request): JsonResponse
    {
        $request->validate([
            'favicon' => ['required', 'file', 'mimes:png,jpg,jpeg,webp,ico', 'max:512'],
        ]);

        return $this->storeImage($request, 'favicon', 'favicon_path');
    }

    public function deleteFavicon(): JsonResponse
    {
        $profile = $this->profile();
        if ($profile->favicon_path) {
            Storage::disk('public')->delete($profile->favicon_path);
            $profile->favicon_path = null;
            $profile->save();

            ActivityLogger::record(
                'profil_sekolah.favicon_hapus',
                'profil_sekolah',
                'Menghapus favicon portal.',
            );
        }

        return response()->json(['data' => $profile->fresh()]);
    }

    private function storeImage(Request $request, string $field, string $column): JsonResponse
    {
        $profile = $this->profile();
        if ($profile->{$column}) {
            Storage::disk('public')->delete($profile->{$column});
        }
        $profile->{$column} = $request->file($field)->store('school-profile', 'public');
        $profile->save();

        // The field name is the uploaded kind: logo, stamp or favicon.
        ActivityLogger::record(
            'profil_sekolah.berkas',
            'profil_sekolah',
            "Memperbarui berkas {$this->fileLabel($field)} profil sekolah.",
            ['meta' => ['field' => $field, 'path' => $profile->{$column}]],
        );

        return response()->json(['data' => $profile->fresh()]);
    }

    /** Indonesian name for an uploaded profile asset. */
    private function fileLabel(string $field): string
    {
        return match ($field) {
            'logo' => 'logo',
            'stamp' => 'stempel',
            'favicon' => 'favicon',
            default => $field,
        };
    }

    private function profile(): SchoolProfile
    {
        return SchoolProfile::query()->firstOrCreate([], [
            'school_name' => config('app.name', 'Sekolah'),
            'address' => '-',
            'receipt_template' => 'standard',
        ]);
    }
}
