# SOP-ELEC-014 - Lockout/Tagout: CV-104 Conveyor (Crushing Line 2)

Applies to: CV-104 conveyor, drive motor MTR-104, starter in MCC-03 bucket 4 (contactor KM104, Schneider LC1D09BD, 24 V DC coil).
Required: qualified electrician, LOTO-trained. Category: safety-critical — work requires supervisor approval and a reserved downtime window.

1. Notify the Line 2 operator and shift supervisor; confirm the line is in a reserved maintenance window.
2. Stop CV-104 from the HMI; confirm belt at standstill.
3. Open disconnect Q104 in MCC-03 bucket 4. Apply personal lock and tag. Also lock out the 24 V DC control supply breaker F104.
4. Verify zero energy: try to start from the local station (no movement); test for absence of voltage on L1/L2/L3 and the coil terminals A1/A2 with a tested meter.
5. Perform the work. Do not bypass interlocks or jumper contactor feedback.
6. Remove tools, refit covers, account for all personnel.
7. Remove locks/tags in reverse order; restore F104 then Q104.
8. Test-run CV-104 for 10 minutes under load; record restart time and actual downtime in the work order.

Never: work energised, bypass safety relays, or remove another person's lock.
