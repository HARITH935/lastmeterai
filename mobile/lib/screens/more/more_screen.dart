import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../state/auth_controller.dart';
import '../../state/inbox_controller.dart';
import '../../theme/app_theme.dart';
import '../agents/agents_screen.dart';
import '../analytics/analytics_screen.dart';
import '../analytics/power_bi_screen.dart';
import '../earnings/earnings_screen.dart';
import '../insights/area_intelligence_screen.dart';
import '../insights/customer_insights_screen.dart';
import '../notifications/notifications_screen.dart';
import '../profile/profile_screen.dart';
import '../reports/reports_screen.dart';
import '../settings/settings_screen.dart';

class MoreScreen extends ConsumerWidget {
  const MoreScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final user = ref.watch(authControllerProvider).user;
    final unread = ref.watch(inboxControllerProvider).unread;
    final manager = user?.isManager == true;

    final items = <_Item>[
      if (!manager) const _Item('Earnings', Icons.payments_outlined, EarningsScreen()),
      if (manager) const _Item('Agents', Icons.groups_outlined, AgentsScreen()),
      if (manager) const _Item('Reports', Icons.description_outlined, ReportsScreen()),
      if (manager) const _Item('Analytics', Icons.insights_outlined, AnalyticsScreen()),
      if (manager) const _Item('Power BI', Icons.bar_chart_outlined, PowerBiScreen()),
      if (manager) const _Item('Customer Insights', Icons.person_search_outlined, CustomerInsightsScreen()),
      if (manager) const _Item('Area Intelligence', Icons.radar_outlined, AreaIntelligenceScreen()),
      _Item('Notifications', Icons.notifications_outlined, const NotificationsScreen(), badge: unread),
      const _Item('Profile', Icons.person_outline, ProfileScreen()),
      const _Item('Settings', Icons.settings_outlined, SettingsScreen()),
    ];

    return Scaffold(
      appBar: AppBar(title: const Text('More')),
      body: ListView.separated(
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 32),
        itemCount: items.length,
        separatorBuilder: (_, _) => const SizedBox(height: 8),
        itemBuilder: (context, i) {
          final item = items[i];
          return ListTile(
            tileColor: AppColors.surface,
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(14),
              side: const BorderSide(color: AppColors.line),
            ),
            leading: Icon(item.icon, color: AppColors.amberSoft),
            title: Text(item.label),
            trailing: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                if (item.badge > 0)
                  Padding(
                    padding: const EdgeInsets.only(right: 8),
                    child: CircleAvatar(
                      radius: 11,
                      backgroundColor: AppColors.nogo,
                      child: Text(
                        item.badge > 9 ? '9+' : '${item.badge}',
                        style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w700),
                      ),
                    ),
                  ),
                const Icon(Icons.chevron_right, color: AppColors.inkDim),
              ],
            ),
            onTap: () => Navigator.of(context).push(
              MaterialPageRoute<void>(builder: (_) => item.page),
            ),
          );
        },
      ),
    );
  }
}

class _Item {
  const _Item(this.label, this.icon, this.page, {this.badge = 0});
  final String label;
  final IconData icon;
  final Widget page;
  final int badge;
}
