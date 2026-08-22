import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

/// Visual identity aligned with the LastMeter web login (navy + amber).
class AppColors {
  static const Color ground = Color(0xFF0E2038);
  static const Color groundSoft = Color(0xFF16304F);
  static const Color surface = Color(0xFF1A2F4D);
  static const Color ink = Color(0xFFF3ECDA);
  static const Color inkMuted = Color(0xFFB9C2D2);
  static const Color inkDim = Color(0xFF8290A3);
  static const Color amber = Color(0xFFD9A54B);
  static const Color amberSoft = Color(0xFFF3D999);
  static const Color amberDeep = Color(0xFFA9772A);
  static const Color go = Color(0xFF33D17E);
  static const Color nogo = Color(0xFFE0685A);
  static const Color urgent = Color(0xFFFF7A59);
  static const Color line = Color(0x21F3ECDA);
}

class AppTheme {
  static ThemeData dark() {
    final base = ThemeData(
      useMaterial3: true,
      brightness: Brightness.dark,
      scaffoldBackgroundColor: AppColors.ground,
      colorScheme: const ColorScheme.dark(
        primary: AppColors.amber,
        onPrimary: AppColors.ground,
        secondary: AppColors.amberSoft,
        surface: AppColors.surface,
        onSurface: AppColors.ink,
        error: AppColors.nogo,
      ),
    );

    final textTheme = GoogleFonts.ibmPlexSansTextTheme(base.textTheme).apply(
      bodyColor: AppColors.ink,
      displayColor: AppColors.ink,
    );

    return base.copyWith(
      textTheme: textTheme,
      appBarTheme: AppBarTheme(
        backgroundColor: AppColors.ground,
        foregroundColor: AppColors.ink,
        elevation: 0,
        centerTitle: false,
        titleTextStyle: textTheme.titleLarge?.copyWith(
          fontWeight: FontWeight.w600,
          color: AppColors.ink,
        ),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: AppColors.groundSoft,
        hintStyle: const TextStyle(color: AppColors.inkDim),
        labelStyle: const TextStyle(color: AppColors.inkMuted),
        contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: const BorderSide(color: AppColors.line),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: const BorderSide(color: AppColors.line),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: const BorderSide(color: AppColors.amber, width: 1.5),
        ),
        errorBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: const BorderSide(color: AppColors.nogo),
        ),
      ),
      filledButtonTheme: FilledButtonThemeData(
        style: FilledButton.styleFrom(
          backgroundColor: AppColors.amber,
          foregroundColor: AppColors.ground,
          minimumSize: const Size.fromHeight(52),
          textStyle: const TextStyle(fontSize: 16, fontWeight: FontWeight.w600),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
        ),
      ),
      snackBarTheme: SnackBarThemeData(
        backgroundColor: AppColors.surface,
        contentTextStyle: textTheme.bodyMedium,
        behavior: SnackBarBehavior.floating,
      ),
    );
  }
}
