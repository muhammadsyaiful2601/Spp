<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class SchoolProfile extends Model
{
    /**
     * Brand colour defaults live on the model as well as in the migration so a
     * freshly created profile is correct regardless of database engine defaults.
     */
    protected $attributes = [
        'theme_primary' => '#24634e',
        'theme_accent' => '#c88942',
    ];

    protected $fillable = [
        'school_name', 'foundation_name', 'address', 'phone', 'email', 'website',
        'logo_path', 'favicon_path', 'stamp_path', 'receipt_note', 'receipt_template',
        'theme_primary', 'theme_accent',
    ];
}
