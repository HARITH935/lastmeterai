import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../models/order.dart';
import '../state/tracking_controller.dart';
import '../theme/app_theme.dart';
import '../utils/delivery_outcome.dart';

Future<bool> showCompleteDeliverySheet({
  required BuildContext context,
  required Order order,
  List<String> allowed = DeliveryOutcome.inTransitOptions,
}) async {
  final result = await showModalBottomSheet<bool>(
    context: context,
    isScrollControlled: true,
    backgroundColor: AppColors.surface,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
    ),
    builder: (ctx) {
      return Padding(
        padding: EdgeInsets.only(bottom: MediaQuery.viewInsetsOf(ctx).bottom),
        child: _CompleteDeliveryForm(order: order, allowed: allowed),
      );
    },
  );
  return result == true;
}

class _CompleteDeliveryForm extends ConsumerStatefulWidget {
  const _CompleteDeliveryForm({required this.order, required this.allowed});

  final Order order;
  final List<String> allowed;

  @override
  ConsumerState<_CompleteDeliveryForm> createState() => _CompleteDeliveryFormState();
}

class _CompleteDeliveryFormState extends ConsumerState<_CompleteDeliveryForm> {
  late String _status;
  final _reason = TextEditingController();

  @override
  void initState() {
    super.initState();
    _status = widget.allowed.first;
  }

  @override
  void dispose() {
    _reason.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final ok = await ref.read(trackingControllerProvider.notifier).updateOutcome(
          orderId: widget.order.id,
          status: _status,
          failureReason: _reason.text,
        );
    if (!mounted) return;
    if (ok) Navigator.of(context).pop(true);
  }

  @override
  Widget build(BuildContext context) {
    final tracking = ref.watch(trackingControllerProvider);
    final needsReason = DeliveryOutcome.needsReason(_status);

    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(20, 12, 20, 20),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Center(
              child: Container(
                width: 40,
                height: 4,
                decoration: BoxDecoration(
                  color: AppColors.line,
                  borderRadius: BorderRadius.circular(99),
                ),
              ),
            ),
            const SizedBox(height: 16),
            Text(
              widget.allowed.length == 1 && widget.allowed.first == DeliveryOutcome.postponed
                  ? 'Postpone order'
                  : 'Complete delivery',
              style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w700),
            ),
            const SizedBox(height: 4),
            Text(
              widget.order.orderNumber,
              style: const TextStyle(color: AppColors.inkMuted),
            ),
            const SizedBox(height: 16),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                for (final s in widget.allowed)
                  ChoiceChip(
                    label: Text(DeliveryOutcome.label(s)),
                    showCheckmark: false,
                    selected: _status == s,
                    selectedColor: s == DeliveryOutcome.delivered
                        ? AppColors.go
                        : s == DeliveryOutcome.failed
                            ? AppColors.nogo
                            : AppColors.amber,
                    labelStyle: TextStyle(
                      color: _status == s ? AppColors.ground : AppColors.ink,
                      fontWeight: FontWeight.w700,
                    ),
                    onSelected: (_) => setState(() => _status = s),
                  ),
              ],
            ),
            if (needsReason) ...[
              const SizedBox(height: 14),
              TextField(
                controller: _reason,
                maxLines: 3,
                textCapitalization: TextCapitalization.sentences,
                decoration: InputDecoration(
                  hintText: _status == DeliveryOutcome.failed
                      ? 'Why did this delivery fail?'
                      : 'Why is this being postponed?',
                ),
              ),
            ],
            if (tracking.error != null) ...[
              const SizedBox(height: 10),
              Text(tracking.error!, style: const TextStyle(color: AppColors.nogo)),
            ],
            const SizedBox(height: 16),
            SizedBox(
              width: double.infinity,
              child: FilledButton(
                onPressed: tracking.busy ? null : _submit,
                style: _status == DeliveryOutcome.delivered
                    ? FilledButton.styleFrom(
                        backgroundColor: AppColors.go,
                        foregroundColor: AppColors.ground,
                      )
                    : _status == DeliveryOutcome.failed
                        ? FilledButton.styleFrom(
                            backgroundColor: AppColors.nogo,
                            foregroundColor: AppColors.ink,
                          )
                        : null,
                child: tracking.busy
                    ? const SizedBox(
                        width: 22,
                        height: 22,
                        child: CircularProgressIndicator(strokeWidth: 2, color: AppColors.ground),
                      )
                    : Text(
                        _status == DeliveryOutcome.delivered
                            ? 'MARK DELIVERED'
                            : _status == DeliveryOutcome.failed
                                ? 'MARK FAILED'
                                : 'POSTPONE',
                      ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
