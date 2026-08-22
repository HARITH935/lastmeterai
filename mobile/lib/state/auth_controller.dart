import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../models/api_error.dart';
import '../models/user.dart';
import '../services/api_service.dart';
import '../services/auth_service.dart';
import '../services/storage_service.dart';

final storageServiceProvider = Provider<StorageService>((ref) {
  return StorageService();
});

final apiServiceProvider = Provider<ApiService>((ref) {
  return ApiService(storage: ref.watch(storageServiceProvider));
});

final authServiceProvider = Provider<AuthService>((ref) {
  return AuthService(
    api: ref.watch(apiServiceProvider),
    storage: ref.watch(storageServiceProvider),
  );
});

enum AuthStatus { unknown, unauthenticated, authenticated }

class AuthState {
  const AuthState({
    this.status = AuthStatus.unknown,
    this.user,
    this.error,
  });

  final AuthStatus status;
  final User? user;
  final String? error;

  AuthState copyWith({
    AuthStatus? status,
    User? user,
    String? error,
    bool clearError = false,
    bool clearUser = false,
  }) {
    return AuthState(
      status: status ?? this.status,
      user: clearUser ? null : (user ?? this.user),
      error: clearError ? null : (error ?? this.error),
    );
  }
}

class AuthController extends Notifier<AuthState> {
  @override
  AuthState build() => const AuthState();

  AuthService get _auth => ref.read(authServiceProvider);
  StorageService get _storage => ref.read(storageServiceProvider);

  Future<void> restoreSession() async {
    final token = await _storage.accessToken;
    if (token == null || token.isEmpty) {
      state = const AuthState(status: AuthStatus.unauthenticated);
      return;
    }

    try {
      final user = await _auth.me();
      await _storage.saveSession(
        accessToken: (await _storage.accessToken)!,
        refreshToken: (await _storage.refreshToken) ?? '',
        user: user,
      );
      state = AuthState(status: AuthStatus.authenticated, user: user);
    } on ApiError catch (e) {
      if (e.code == 'NO_INTERNET' || e.code == 'TIMEOUT') {
        final cached = await _storage.user;
        if (cached != null) {
          state = AuthState(status: AuthStatus.authenticated, user: cached);
          return;
        }
      }
      await _storage.clear();
      state = const AuthState(status: AuthStatus.unauthenticated);
    } catch (_) {
      await _storage.clear();
      state = const AuthState(status: AuthStatus.unauthenticated);
    }
  }

  Future<bool> login(String username, String password) async {
    state = state.copyWith(clearError: true);
    try {
      final result = await _auth.login(username, password);
      state = AuthState(
        status: AuthStatus.authenticated,
        user: result.user,
      );
      return true;
    } on ApiError catch (e) {
      state = AuthState(
        status: AuthStatus.unauthenticated,
        error: e.userMessage,
      );
      return false;
    } catch (_) {
      state = const AuthState(
        status: AuthStatus.unauthenticated,
        error: 'Something went wrong. Please try again.',
      );
      return false;
    }
  }

  Future<void> logout() async {
    await _auth.logout();
    state = const AuthState(status: AuthStatus.unauthenticated);
  }

  Future<String?> updateProfile({
    String? name,
    String? phone,
    bool clearPhone = false,
    NotificationPrefs? prefs,
  }) async {
    try {
      final user = await _auth.updateProfile(
        name: name,
        phone: phone,
        clearPhone: clearPhone,
        prefs: prefs,
      );
      await _storage.saveUser(user);
      state = state.copyWith(user: user);
      return null;
    } on ApiError catch (e) {
      return e.userMessage;
    } catch (_) {
      return 'Could not save profile. Try again.';
    }
  }

  Future<String?> changePassword({
    required String currentPassword,
    required String newPassword,
    required String confirmPassword,
  }) async {
    try {
      await _auth.changePassword(
        currentPassword: currentPassword,
        newPassword: newPassword,
        confirmPassword: confirmPassword,
      );
      await logout();
      return null;
    } on ApiError catch (e) {
      return e.userMessage;
    } catch (_) {
      return 'Could not change password. Try again.';
    }
  }
}

final authControllerProvider =
    NotifierProvider<AuthController, AuthState>(AuthController.new);
