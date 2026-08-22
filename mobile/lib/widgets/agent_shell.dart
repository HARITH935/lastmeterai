import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../screens/chat/chat_screen.dart';
import '../screens/dashboard/home_screen.dart';
import '../screens/dashboard/manager_home_screen.dart';
import '../screens/map/map_screen.dart';
import '../screens/more/more_screen.dart';
import '../screens/orders/orders_screen.dart';
import '../state/auth_controller.dart';
import '../state/inbox_controller.dart';
import '../state/orders_controller.dart';
import 'bottom_navigation.dart';

class AgentShell extends ConsumerWidget {
  const AgentShell({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final index = ref.watch(shellTabProvider);
    final inbox = ref.watch(inboxControllerProvider);
    final manager = ref.watch(authControllerProvider).user?.isManager == true;

    ref.listen<InboxState>(inboxControllerProvider, (prev, next) {
      final toast = next.toast;
      if (toast == null || toast.id == prev?.toast?.id) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            toast.message == null || toast.message!.isEmpty
                ? toast.title
                : '${toast.title}: ${toast.message}',
          ),
        ),
      );
    });

    return Scaffold(
      body: IndexedStack(
        index: index,
        children: [
          manager ? const ManagerHomeScreen() : const HomeScreen(),
          const OrdersScreen(),
          // Rebuild when selected. A hidden FlutterMap in IndexedStack often
          // stays grey and never loads tiles.
          index == 2 ? const MapScreen() : const SizedBox.expand(),
          const ChatScreen(),
          const MoreScreen(),
        ],
      ),
      bottomNavigationBar: AgentBottomNav(
        index: index,
        unread: inbox.unread,
        onChanged: (i) => ref.read(shellTabProvider.notifier).state = i,
      ),
    );
  }
}
