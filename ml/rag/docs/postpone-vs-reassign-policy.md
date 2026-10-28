# Postpone vs. Reassign Policy

**Postpone** when the blocking factor is external and time-bound (weather, traffic, deadline) — check the decision's `reschedule_suggestion` for the model's recommended date and time window.

**Reassign** when the blocking factor is agent-specific — for example an overloaded agent, evidenced by a low `agent_profit_score` due to route inefficiency. Move the order to a less-loaded agent in the same area instead of delaying the customer.

Reassignment is preferred over postponement whenever a lighter-loaded agent is available in the same area, since it does not cost the customer a delay.
