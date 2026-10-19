# Decisions

## 2026-10-19 · Same service type twice on one day
Configurable per parish, per service type, with `service_types.max_per_day` (default 1). `service_events` gets an `occurrence` number, and the unique key and import duplicate check become (parish, service type, date, occurrence). With the default of 1, nothing changes for parishes that don't need it.

## 2026-10-19 · Backfilling past services
No fixed backfill start date per parish. Users can add or import a record for any past date, Sunday or midweek. The date picker highlights scheduled dates with no verified report. The reports list shows "No record" gaps within a date range the user picks, defaulting to the last 12 weeks. A date with a draft or unverified report is not a gap; it shows that report's status instead.
