import 'package:flutter/material.dart';

import '../theme/app_theme.dart';

class AgentBottomNav extends StatelessWidget {
  const AgentBottomNav({
    super.key,
    required this.index,
    required this.onChanged,
    this.unread = 0,
  });

  final int index;
  final ValueChanged<int> onChanged;
  final int unread;

  @override
  Widget build(BuildContext context) {
    return NavigationBar(
      selectedIndex: index,
      onDestinationSelected: onChanged,
      backgroundColor: AppColors.groundSoft,
      indicatorColor: AppColors.amber.withValues(alpha: 0.18),
      height: 68,
      destinations: [
        const NavigationDestination(
          icon: Icon(Icons.home_outlined),
          selectedIcon: Icon(Icons.home),
          label: 'Home',
        ),
        const NavigationDestination(
          icon: Icon(Icons.inventory_2_outlined),
          selectedIcon: Icon(Icons.inventory_2),
          label: 'Orders',
        ),
        const NavigationDestination(
          icon: Icon(Icons.map_outlined),
          selectedIcon: Icon(Icons.map),
          label: 'Map',
        ),
        const NavigationDestination(
          icon: Icon(Icons.chat_bubble_outline),
          selectedIcon: Icon(Icons.chat_bubble),
          label: 'Chat',
        ),
        NavigationDestination(
          icon: Badge(
            isLabelVisible: unread > 0,
            label: Text(unread > 9 ? '9+' : '$unread'),
            child: const Icon(Icons.more_horiz),
          ),
          selectedIcon: Badge(
            isLabelVisible: unread > 0,
            label: Text(unread > 9 ? '9+' : '$unread'),
            child: const Icon(Icons.more_horiz),
          ),
          label: 'More',
        ),
      ],
    );
  }
}
