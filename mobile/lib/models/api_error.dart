class ApiError implements Exception {
  const ApiError({
    required this.code,
    required this.message,
    this.details = const {},
    this.statusCode,
  });

  final String code;
  final String message;
  final Map<String, dynamic> details;
  final int? statusCode;

  factory ApiError.fromBody(Map<String, dynamic> body, {int? statusCode}) {
    final detailsRaw = body['details'];
    return ApiError(
      code: (body['error'] as String?) ?? 'UNKNOWN',
      message: (body['message'] as String?) ?? 'Something went wrong.',
      details: detailsRaw is Map<String, dynamic> ? detailsRaw : const {},
      statusCode: statusCode,
    );
  }

  factory ApiError.network() => const ApiError(
        code: 'NO_INTERNET',
        message: 'No internet connection. Check your network and try again.',
      );

  factory ApiError.webPreview() => const ApiError(
        code: 'WEB_PREVIEW',
        message:
            'This browser preview cannot reach the live API. Install LastMeterAI-agent.apk on your Android phone to sign in.',
      );

  factory ApiError.timeout() => const ApiError(
        code: 'TIMEOUT',
        message:
            'The cloud server is waking up. Wait a few seconds and tap Sign in again.',
      );

  factory ApiError.unknown([String? message]) => ApiError(
        code: 'UNKNOWN',
        message: message ?? 'Something went wrong. Please try again.',
      );

  String get userMessage {
    switch (code) {
      case 'INVALID_CREDENTIALS':
        return 'Wrong username or password.';
      case 'ACCOUNT_DISABLED':
        return 'This account is disabled. Contact your manager.';
      case 'TOKEN_EXPIRED':
      case 'TOKEN_INVALID':
      case 'TOKEN_REVOKED':
      case 'UNAUTHORIZED':
        return 'Your session expired. Please sign in again.';
      case 'RATE_LIMIT_EXCEEDED':
        return 'Too many attempts. Wait a minute and try again.';
      case 'FORBIDDEN':
        return 'You do not have access to that.';
      default:
        return message;
    }
  }

  @override
  String toString() => 'ApiError($code, $statusCode): $message';
}
