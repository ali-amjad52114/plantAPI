# Equipment note - KM104 contactor, Schneider TeSys D LC1D09BD

- Rating: 9 A AC-3, 3-pole, 1 NO + 1 NC auxiliary; coil 24 V DC.
- Location: MCC-03 bucket 4, starter for MTR-104 (CV-104 conveyor drive).
- Spare policy: 1 on site (currently 0 - see Odoo inventory). Supplier: RS Components, about $29.49, 1-2 day lead time.

## Failure signs
- Chattering / buzzing when energised, intermittent drop-out, "feedback lost" alarm.
- Pitted or burnt main contacts; overheated coil.
- Repeated nuisance trips after contact cleaning (temporary fix only).

## Replacement (approx. 45 min incl. LOTO)
1. Apply SOP-ELEC-014 (LOTO).
2. Photograph wiring; label wires.
3. Remove old contactor from DIN rail; fit new LC1D09BD.
4. Re-terminate power and coil wiring; torque to spec.
5. Check auxiliary feedback contact to PLC input.
6. Remove LOTO, test-run 10 min, record result.

## History (see Fiix)
- WO 1: trip, overload reset, contacts cleaned (25 min).
- WO 2: chattering, cleaned and re-seated; "replace at next failure, no spare in stock" (40 min).
