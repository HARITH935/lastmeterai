String greetingForNow(DateTime now) {
  final h = now.hour;
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

String formatInr(num value) {
  return '₹${value.toStringAsFixed(0)}';
}

String formatInr2(num value) {
  return '₹${value.toStringAsFixed(2)}';
}

String percent1(double ratio) => '${((ratio * 1000).round() / 10).toStringAsFixed(1)}%';

String formatTime(String iso) {
  final d = DateTime.tryParse(iso)?.toLocal();
  if (d == null) return iso;
  final h = d.hour % 12 == 0 ? 12 : d.hour % 12;
  final m = d.minute.toString().padLeft(2, '0');
  final ap = d.hour >= 12 ? 'PM' : 'AM';
  return '$h:$m $ap';
}

String formatDay(DateTime d) {
  const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return '${days[d.weekday - 1]}, ${d.day} ${months[d.month - 1]} ${d.year}';
}

String statusLabel(String status) {
  switch (status) {
    case 'in_transit':
      return 'In transit';
    case 'delivered':
      return 'Completed';
    default:
      return status.replaceAll('_', ' ');
  }
}

String percent(double ratio) => '${(ratio * 100).round()}%';

String formatNotifTime(String? iso) {
  final d = DateTime.tryParse(iso ?? '')?.toLocal();
  if (d == null) return '';
  return '${d.day} ${_month(d.month)}, ${d.hour.toString().padLeft(2, '0')}:${d.minute.toString().padLeft(2, '0')}';
}

String _month(int m) {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return months[m - 1];
}

