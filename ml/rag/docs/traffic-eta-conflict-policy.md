# Traffic vs. ETA Conflict Policy

If TomTom reports a jam factor above 8/10 but the OSRM-computed ETA is still within the delivery deadline, this is a **soft conflict**: `traffic_impact` rises, but the system does not auto-force a NO-GO.

Agents should proceed as normal in this case, unless the dispatcher has specific local knowledge that OSRM's ETA is unreliable for that route (for example, known flooding or an accident not yet reflected in traffic data) — in which case the dispatcher may postpone the delivery and must log the reason in `failure_reason`.
