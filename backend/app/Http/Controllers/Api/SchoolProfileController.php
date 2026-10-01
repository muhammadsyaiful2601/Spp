<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\SchoolProfile;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;

class SchoolProfileController extends Controller
{
    public function publicProfile(): JsonResponse
    {
        return response()->json(['data' => $this->profile()->only([
            'school_name', 'logo_path', 'favicon_path', 'address', 'phone', 'email', 'website',
        ])]);
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

        return response()->json(['data' => $profile->fresh()]);
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
