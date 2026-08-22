import 'package:flutter/material.dart';

import '../models/order.dart';
import '../theme/app_theme.dart';
import '../utils/helpers.dart';
import 'risk_card.dart';

Color statusColor(String status) {
  switch (status) {
    case 'pending':
      return AppColors.urgent;
    case 'in_transit':
      return AppColors.amber;
    case 'delivered':
      return AppColors.go;
    case 'failed':
      return AppColors.nogo;
    default:
      return AppColors.inkDim;
  }
}

Color riskColor(String? level) {
  switch (level) {
    case 'low':
      return AppColors.go;
    case 'medium':
      return AppColors.amber;
    case 'high':
      return AppColors.nogo;
    default:
      return AppColors.inkDim;
  }
}

class StatusBadge extends StatelessWidget {
  const StatusBadge({super.key, required this.status});

  final String status;

  @override
  Widget build(BuildContext context) {
    final color = statusColor(status);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.16),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Text(
        statusLabel(status).toUpperCase(),
        style: TextStyle(color: color, fontSize: 10, fontWeight: FontWeight.w700, letterSpacing: 0.4),
      ),
    );
  }
}

class OrderCard extends StatelessWidget {
  const OrderCard({super.key, required this.order, required this.onTap});

  final Order order;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: AppColors.surface,
      borderRadius: BorderRadius.circular(14),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(14),
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Row(
            children: [
              Container(
                width: 8,
                height: 48,
                decoration: BoxDecoration(
                  color: riskColor(order.effectiveRiskLevel),
                  borderRadius: BorderRadius.circular(8),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Text(
                          order.orderNumber,
                          style: const TextStyle(
                            fontWeight: FontWeight.w700,
                            color: AppColors.ink,
                          ),
                        ),
                        if (order.isUrgent) ...[
                          const SizedBox(width: 8),
                          const Text(
                            'URGENT',
                            style: TextStyle(
                              color: AppColors.urgent,
                              fontSize: 10,
                              fontWeight: FontWeight.w800,
                            ),
                          ),
                        ],
                        const Spacer(),
                        DecisionBadge(
                          decision: order.effectiveDecision,
                          urgent: order.isUrgent,
                        ),
                      ],
                    ),
                    const SizedBox(height: 4),
                    Text(
                      '${order.customerName}  ·  ${order.area}',
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(color: AppColors.inkMuted, fontSize: 13),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      [
                        if (order.effectiveDecision.isNotEmpty) order.effectiveDecision,
                        if (order.effectiveRiskLevel.isNotEmpty)
                          '${order.effectiveRiskLevel} risk',
                        if (order.deadline.isNotEmpty) 'by ${formatTime(order.deadline)}',
                      ].join('  ·  '),
                      style: const TextStyle(color: AppColors.inkDim, fontSize: 12),
                    ),
                  ],
                ),
              ),
              StatusBadge(status: order.status),
            ],
          ),
        ),
      ),
    );
  }
}
