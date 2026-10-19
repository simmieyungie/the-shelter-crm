# Church-logic questions

These are questions about how the church works, not about technology. For each one I made the most sensible choice so the build could keep moving. Read the **Decided** line and tell me if anything should change. Most of these are quick to adjust.

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
