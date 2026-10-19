# Church-logic questions

These are questions about how the church works, not about technology. For each one I made the most sensible choice so the build could keep moving. Read the **Decided** line and tell me if anything should change. Most of these are quick to adjust.

## Check these first

These five change the numbers people see or what happens to real people, so they matter most:

1. **Remittance split** (#7): the percentages are placeholders.
2. **Spreadsheets with only a total** (#21): those services import with attendance unknown.
3. **Returning first-timers** (#8): ushers must use "Mark a returning guest present", or retention will read low.
4. **Report deadline** (#29): reports are due by the end of Monday.
5. **"Overall" scoring** (#30): this decides who shows as "Follow up" on the zone overview.

Status key: **Open** means I picked a default but would like your answer. **Settled** means you have already answered.

---

## Services and counting

### 1. Can a parish hold the same service twice on one day?
**Settled.** Each parish sets this per service in Admin › Parish setup › Services. The default is once a day.

### 2. How far back can a parish fill in missing records?
**Settled.** Any past date, Sunday or midweek. The Reports list shows missing dates for whatever date range you pick. It defaults to the last 12 weeks.

## People and roles

### 3. Who gets the Day-3 "call the first-timer" task?
**Open.** **Decided:** each parish picks a "follow-up lead" in Admin › Parish setup › Settings. If none is set, the task goes to the Parish Pastor.

### 4. Who can create accounts and give roles?
**Open.** **Decided:** the System Admin can give any role anywhere. A Parish Pastor can add people to their own parish and give parish roles only: Usher, Head Usher, Secretary, Head of Department, Tribe Leader and Parish Pastor. Ending a role takes effect from today. Every role change is recorded in the audit log.

### 5. Can someone remove their own Pastor or Admin role?
**Open.** **Decided:** no. Another Pastor or Admin has to do it, so a parish can't lock itself out by accident.

## Money and remittance

### 6. Who records whether a parish has paid its remittance?
**Open.** **Decided:** Area Pastors, Zonal Pastors, Provincial Admins and the System Admin can record it for the parishes they oversee. They type the amount due and the amount paid for the month. The status follows from that: paid in full is "Cleared", some paid is "Part-paid", nothing paid is "Outstanding".

### 7. What are the remittance split percentages?
**Open.** I seeded a placeholder split of Parish 50%, Area 10%, Zone 10%, Province 10% and National 20%. Please send the real figures. A different split can be set for a region, province or zone if they differ.

## Headcount (ushers)

### 8. How do we know a first-timer came back?
**Open.** **Decided:** ushers have a "Mark a returning guest present" button on the counting screen. They search by name or phone and tap "Mark present". Staff can also mark attendance from a member's profile. The 30-day "became a regular" rule counts these check-ins. If nobody marks returning guests, everyone will look like they didn't come back, so ushers need to be told about this button.

### 9. Does the first visit count towards the 3 visits in 30 days?
**Open.** **Decided:** yes. Three visits means the first visit plus two returns within 30 days.

### 10. Can an usher count a zone they weren't rostered to?
**Open.** **Decided:** yes. The roster only shows a "On your roster" badge. Counts from every usher in a zone add together.

### 11. How late can an usher's phone still send counts?
**Open.** **Decided:** up to 7 days after the service, so a phone that was offline over the weekend still sends. After that the Head Usher types the numbers on the report.

### 12. What if an usher's counts arrive after the report was submitted?
**Open.** **Decided:** the counts are stored but don't change the submitted report. The report shows a note that new counts arrived. The Head Usher or Pastor can reopen the report to include them.

### 13. Who counts as "on duty" for the workers-absent figure?
**Open.** **Decided:** an usher on the roster becomes "on duty" the moment their first count reaches the server. Rostered ushers who never counted are shown as absent.

### 14. A first-timer gives a phone number someone else already uses. What then?
**Open.** **Decided:** the app warns and offers two buttons. "It's them" marks the existing person present instead of creating a new record. "Different person" saves a new record, because families often share a phone. When offline, the app can't check, so it saves and the Secretary can merge duplicates later in Members.

### 15. Should the "happy to be contacted" box be ticked by default?
**Open.** **Decided:** no. The usher has to tick it after asking. Nigeria's data protection law expects a clear yes. Without it, the person gets no welcome or invitation messages, but they still get a follow-up call task and can still become a regular member.

### 16. Who can add an extra or special service on the day?
**Open.** **Decided:** the Head Usher or Parish Pastor, from the Count screen. A service can only run more times in one day than its parish setting allows if someone raises that setting first.

## Service reports

### 17. Can the Parish Pastor edit and submit a report, or only verify it?
**Open.** **Decided:** the Pastor can also fill in and submit reports, for example a past service they are entering themselves. The Head Usher and Secretary can do the same. Only the Pastor can verify.

### 18. Can the Pastor send a submitted report back for changes?
**Open.** **Decided:** yes, with "Send back for changes". It returns to Draft so the Head Usher can fix it and submit again.

### 19. Can the Head Usher override the usher tallies?
**Open.** **Decided:** yes, with "Type the numbers instead". From then on the report uses the typed numbers and new tallies no longer change it. The tallies are still kept and shown under "See tallies by zone".

### 20. When does a report count as "sent to the Area office"?
**Open.** **Decided:** as soon as the Pastor verifies it. There is no separate sending step, and only verified reports count in Area and Zone totals.

## Importing past services

### 21. Our old spreadsheets only have a total, not men/women/children. What happens?
**Open.** **Decided for now:** reports store attendance as men, women and children, so a total on its own imports as "attendance unknown". The total column is only used to check the other numbers. If many parishes only kept totals, I can add a "total only" attendance field. Please tell me.

### 22. A row's date isn't the usual day for that service, for example Accelerate on a Wednesday.
**Open.** **Decided:** as the spec says, the person importing chooses between "use the nearest service date" and "skip the row". If special midweek services are common, a third option "keep the date as it is" is easy to add.

### 23. Two rows in a spreadsheet have the same service on the same date.
**Open.** **Decided:** if the service is allowed to run twice that day, both are imported as the 1st and 2nd runs, ordered by a time column if there is one, otherwise by row order. If it isn't allowed, the extra row must be skipped. The person importing confirms each one.

### 24. Undoing an import when someone has since attached things to those services.
**Open.** **Decided:** undo always removes the imported reports. It removes the service itself only if nothing else hangs off it, such as tallies, check-ins or tasks. If any imported report was edited after the import, the app lists those and asks again before removing them.

## Tasks

### 25. Who can see which tasks?
**Open.** **Decided:** the Parish Pastor sees every task in the parish. A Head of Department sees their department's tasks. Everyone else sees the tasks given to them or created by them. First-timer follow-up calls appear under "First-timer follow-up".

### 26. Who can move a task between columns?
**Open.** **Decided:** the person it's assigned to, their HOD and the Pastor. Only the HOD or Pastor can cancel a task. Finished tasks drop off the board 14 days after they're done.

### 27. Can an HOD give a task to someone outside their department?
**Open.** **Decided:** no, as the spec says. They can assign themselves or active members of their department who have an account. The Pastor can assign anyone in the parish.

## Zone overview

### 28. What do "this week / month / quarter" mean, and what is the comparison?
**Open.** **Decided:** calendar periods up to today, with weeks starting on Sunday. The % change compares with the same number of days of the previous period. So on 20 October, "this month" is compared with 1 to 20 September, not all of September.

### 29. When is a Sunday report "Late" or "Overdue"?
**Open.** **Decided:** reports are due by the end of Monday. Submitted after that is "Late". Nothing submitted by then is "Overdue". A parish with two Sunday services needs both reports in before it shows "Submitted".

### 30. How is a parish's "Overall" decided?
**Open.** **Decided:** points are added up. A late report is 1 point and an overdue report is 2. Collections awaiting the pastor are 1 point and collections not logged are 2. Outstanding remittance is 1 point. 0 points is "On track", 1 to 2 is "Watch", and 3 or more is "Follow up".

### 31. Which month does the remittance tile use?
**Open.** **Decided:** last full month for the week and month views. For the quarter view, a parish counts as cleared only if all of the last three full months are cleared. Part-paid counts as "Outstanding".

### 32. What does "absent" mean on the workers tile?
**Open.** **Decided:** ushers on the roster for a service in the period, up to yesterday, who never sent a count.

## Members and follow-up

### 33. Should ushers see the member directory?
**Open.** **Decided:** no. Ushers can search for a returning guest and mark them present, but they don't get the Members tab or member profiles. The Members tab is for the Head Usher, Secretary, HODs, Tribe Leaders and the Pastor. Only the Secretary, Head Usher and Pastor can edit records.

### 34. Which tribe gets the Day-7 invite?
**Open.** **Decided:** the tribe the usher picked when registering them. If none was picked, the parish's first active tribe is used. We don't have locations to work out the truly nearest one yet.

### 35. What happens on Day 30 to someone who came fewer than 3 times?
**Open.** **Decided:** they stay a "First-timer" and the Pastor gets a "Pastoral follow-up" task saying how many times they came. Nothing else is sent automatically.

### 36. When should automatic messages go out?
**Open.** **Decided:** the welcome is queued for 15:00 on the day of the visit. The other invites go out when the 06:00 daily job runs. In v1 nothing is really sent: messages are logged and marked "sent" until an SMS/WhatsApp provider is chosen.

### 37. Merging duplicate people
**Open.** **Decided:** the Secretary, Head Usher or Pastor can merge two records that share a phone number from either profile. Attendance, milestones, tribes, departments, tasks and messages move to the kept record, which keeps the earliest first visit. The merge is recorded in the audit log.
