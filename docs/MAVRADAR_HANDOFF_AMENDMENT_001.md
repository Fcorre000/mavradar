# MavRadar - Handoff Amendment 001: Uplink Change

**Date:** August 2026
**Supersedes:** the LTE uplink sections of `docs/HANDOFF.md`
**Status:** blocking. Do not order or write code against the previous uplink assumption.

---

## What changed

MavRadar is running as a UTA Senior Design project, which means hardware is bought through university procurement, not personally. The department's Vendor Policies document prohibits purchasing cellular radio and communications equipment, and calls out 4G/LTE comms boards for Raspberry Pi by name as the example.

The planned Sixfab Raspberry Pi 4G/LTE Modem Kit ($140) is exactly that category. It cannot be bought with project funds.

The same policy section also prohibits wireless communication service fees. That kills the Hologram IoT SIM and the Sixfab data plan, so the recurring connectivity cost has no funding source either.

**Every reference to LTE, cellular, Sixfab modem, or SIM in `docs/HANDOFF.md` is now obsolete.** The architecture is otherwise unchanged.

## What did not change

- The radar sensor (OmniPreSense OPS243-A-CW-RP) is unaffected. It is FCC Part 15 unlicensed and is not communications equipment.
- The Raspberry Pi, power subsystem, enclosure, and mounting hardware are unaffected.
- The entire cloud and app architecture is unaffected. Ingest API, alert filter, FCM, Firestore, Expo app, all the same.
- The 30 to 45 second latency budget is unchanged and still the governing constraint.

Only the transport between the field unit and the internet changes.

## Replacement options

The field unit still needs an internet path. Ranked by preference:

**1. WiFi from the host property. $0.**
The project already requires written permission from a property owner to mount the unit, since it must sit 50+ feet from the nearest rail. That same owner is the one to ask for guest WiFi. This removes the problem rather than solving it.

**2. Point-to-point WiFi bridge. Roughly $60 to $120 per pair.**
If the host building has internet but its WiFi does not reach the mounting point, a directional bridge pair (Ubiquiti NanoStation class) links them over line of sight. Ethernet at both ends. Unambiguously networking equipment under the vendor policy, and maps to IEEE 802 for the standards deliverable.

**3. LoRa at 915MHz. Roughly $40 to $80.**
Best technical fit. A train event is a few bytes, which is LoRa's ideal payload, and it tolerates distance and obstruction better than WiFi. Unlicensed ISM under FCC Part 15, same regulatory bucket as the radar. Two caveats: it still needs a gateway on a building with internet, so the host-property dependency remains; and a purchasing agent skimming for the word "radio" may flag it, so get written approval before ordering.

**4. Wired ethernet.** Most reliable option if the host property can run a drop. Rare, but worth asking.

## Decision status

**Undecided, and deliberately so.** The right choice depends on the deployment site, which is not yet secured. Do not select or order uplink hardware until the site is known.

Two exception requests are outstanding and may reopen the LTE option:
- Whether an unattended IoT data modem qualifies for a pre-approved exception. The rule appears aimed at expensed phones and cell plans, not sensor uplinks.
- Whether a Purchase Order route permits what the ProCard does not. The policy language is ProCard-specific and Grainger is already listed as PO-only, so the mechanisms have different rules.

Treat LTE as unavailable until one of those comes back yes.

## Implications for code

**Write the uplink as a swappable transport.** The `edge/` detection service should not know or care how bytes reach the internet. Detection logic produces an event; a transport layer ships it. The transport is a plug, not a branch in the detection code.

Practically this means:
- The Pi sends over standard networking (HTTPS POST to the ingest API) regardless of whether the physical link is WiFi, a bridge, ethernet, or eventually LTE. Options 1, 2, and 4 are all just "the Pi has an IP address."
- Option 3 (LoRa) is the only one that changes the software shape, since it needs a gateway process relaying LoRa frames to HTTPS. Keep this in mind but do not build it until LoRa is chosen.
- The SQLite ring buffer for offline queueing is now more important, not less. Guest WiFi is less reliable than cellular. Assume the link drops and design the retry accordingly.
- Do not hardcode any assumption about link type, signal strength reporting, or modem AT commands.

## Budget effect

| Line | Before | After |
|---|---|---|
| Hardware subtotal | ~$648 | ~$508 |
| Uplink | $140 (Sixfab kit) | $0 to $120, site dependent |
| Recurring | ~$1.30/month | $0 |
| Grand total | ~$670 to $685 | ~$530 to $650 |

Semester budget is $1000, so headroom improved.

## Procurement rules to follow going forward

UTA is a government institution and does not pay Texas state sales tax. Any vendor must honor the exemption. Tariffs are acceptable.

Preferred electronics vendors, in rough order of usefulness here:
- **Mouser** (Mansfield TX). The only preferred vendor with free shipping. Next-day if the order is in by noon. Default to Mouser when the part is available there.
- **DigiKey** (Minnesota). Small price break, paid shipping. Stocks things Mouser does not, including the OPS243.
- **Pololu**, **ServoCity/goBILDA** (15% educational discount, order through the ServoCity site specifically since the two entities are legally distinct), **Speedy FPV**, **Amazon** (non-Prime items have 5 to 8 day lead times through the supply chain).

Grainger and Home Depot cannot be ordered directly. They route through the CSE Purchasing Agent and CSE Accounting respectively.

Also prohibited: web domain names. Only OIT can purchase those, as approved by University Advancement. If MavRadar ever needs a domain, that is not a project-budget item.

## Action items

1. Ask the faculty advisor or CSE Purchasing Agent about the modem exception and the PO route. One email each.
2. Secure a deployment site. This now gates the uplink decision, not just the mounting decision. Ask for network access and mounting permission in the same conversation.
3. Update `docs/HANDOFF.md` to strike the LTE references once the uplink is chosen.
4. Update the architecture diagram: the "Sixfab LTE modem" box becomes a generic uplink.
5. Order the OPS243 from DigiKey. It is unaffected by any of this and remains the long-lead item that should go first.
