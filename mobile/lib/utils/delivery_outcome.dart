/// Agent status outcomes that PATCH /api/orders/:id/status accepts
/// after a delivery has started. Mirrors backend OrderStatusSchema.
class DeliveryOutcome {
  static const delivered = 'delivered';
  static const failed = 'failed';
  static const postponed = 'postponed';

  static const inTransitOptions = [delivered, failed, postponed];
  static const pendingOptions = [postponed];

  static bool needsReason(String status) =>
      status == failed || status == postponed;

  static String? validate({required String status, String? reason}) {
    if (needsReason(status) && (reason == null || reason.trim().isEmpty)) {
      return status == postponed
          ? 'A reason is required to postpone.'
          : 'A reason is required when delivery fails.';
    }
    return null;
  }

  static String label(String status) {
    switch (status) {
      case delivered:
        return 'Delivered';
      case failed:
        return 'Failed';
      case postponed:
        return 'Postponed';
      default:
        return status;
    }
  }
}
