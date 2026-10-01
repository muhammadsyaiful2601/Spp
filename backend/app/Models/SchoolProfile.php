<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class SchoolProfile extends Model
{
    protected $fillable = [
        'school_name', 'foundation_name', 'address', 'phone', 'email', 'website',
        'logo_path', 'favicon_path', 'stamp_path', 'receipt_note', 'receipt_template',
    ];
}
