class Validators {
  static String? username(String? value) {
    final v = (value ?? '').trim();
    if (v.isEmpty) return 'Username is required.';
    if (v.contains(' ')) return 'Username cannot contain spaces.';
    if (v.length > 80) return 'Username is too long.';
    return null;
  }

  static String? password(String? value) {
    final v = value ?? '';
    if (v.isEmpty) return 'Password is required.';
    if (v.length < 6) return 'Password must be at least 6 characters.';
    return null;
  }

  static String? newPassword(String? value) {
    final v = value ?? '';
    if (v.isEmpty) return 'New password is required.';
    if (v.length < 8) return 'New password must be at least 8 characters.';
    return null;
  }

  static String? phone(String? value) {
    final v = (value ?? '').trim();
    if (v.isEmpty) return null;
    if (!RegExp(r'^\d+$').hasMatch(v)) return 'Phone must contain digits only.';
    if (v.length < 10 || v.length > 15) return 'Phone must be 10–15 digits.';
    return null;
  }
}
