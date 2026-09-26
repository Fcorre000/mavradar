# UTA Senior Design: Constraints, Standards, and Vendor Policy

Source documents, as handed out by the instructor, are in this folder:

- `uta-constraints-and-standards.pdf` (5 pages)
- `uta-vendor-policies.pdf` (6 pages)

This file is the working extract. It exists because PDFs are not greppable and these
rules bind design decisions. If a decision conflicts with something here, the decision
changes, not the rule.

---

## 1. Vendor policy: what cannot be purchased

Quoted in full. The prohibition list in the source document is exactly two items:

> Things we CANNOT purchase:
> - Cellular Radio or Communications Equipment (See: 4G/LTE Comms boards for RasPi/etc)
> - Web Domain Names

### What this does and does not say

It prohibits **purchasing** the hardware. It is a procurement rule, not a technical or
regulatory ban. Nothing in the document forbids the project from using a cellular uplink
that was acquired outside university funds.

The document does **not** contain the words wireless, service, fee, plan, SIM,
subscription, or recurring. It says nothing about connectivity service costs. See the
correction note in section 5.

The document does **not** mention ProCard. The prohibition list carries no purchasing
mechanism qualifier, so there is no textual basis for a Purchase Order exception being
treated differently from any other mechanism. The only PO-specific language in the
document concerns Grainger.

### Impact on MavRadar

Kills the Sixfab Raspberry Pi 4G/LTE Modem Kit (EG25-G) as a **procured** item.
See `docs/MAVRADAR_HANDOFF_AMENDMENT_001.md` for the replacement uplink options.

Also worth noting, and not previously tracked: **web domain names cannot be purchased.**
Cloud Run issues a `*.run.app` URL, so nothing is blocked today, but a custom domain for
the ingest API or a project landing page has no funding path.

## 2. Vendor policy: approved and preferred vendors

Tax exemption matters. UTA is a government institution and cannot pay Texas state sales
tax, so vendors must honor the exemption. Tariffs are generally acceptable.

**Preferred (UTA has business partnerships):**

| Vendor | Location | Notes |
|---|---|---|
| Mouser Electronics | Mansfield TX | Free shipping, next-day if ordered by noon. Only free-shipping vendor. |
| ServoCity / goBILDA | Kansas | 15% educational discount. Tax-free agreement is with **ServoCity**, so link ServoCity, not goBILDA. |
| Pololu | Nevada | 3 to 4 days, price break |
| DigiKey | Minnesota | Small price break, pay shipping. Stocks items Mouser does not. |
| Speedy FPV | College Station TX | Drone and video parts, tax exemption on file |
| Amazon | n/a | Special pricing. Non-PRIME items carry 5 to 8 day supply chain lead time. |

**Known good but no partnership:** SparkFun, Adafruit, Copper Hill (CANbus), Maker Motor,
JLCPCB (PCB fab). Note that Mouser carries many SparkFun and Adafruit lines at $1 to $3
more per item, which the free shipping usually offsets.

**Construction:** McMaster-Carr, SendCutSend (laser/waterjet), Misumi (extruded aluminum),
Schmalz, Grainger (**PO only, not orderable via website**), Ace Hardware (two local stores
with exemptions on file), Home Depot North Arlington (via CSE Accounting).

**Action item:** OmniPreSense is not on any list. Check whether the OPS243-A can be sourced
through Mouser or DigiKey to stay inside the preferred-vendor path. Buying direct means
sorting out tax exemption separately, on the single longest-lead item in the BOM.

## 3. Vendor policy: software and cloud

The Vendor Policies handout lists Digital Ocean as the only approved cloud vendor:

> DO has been approved by OIT and the EIR office: https://webapp.uta.edu/tap/product/1557
> EIR Accessibility assessment completed 7/2024 REQ05330005. Next Review: June 4, 2027.

**That handout is not the whole picture.** UTA OIT maintains a separate pre-approved
technology list via its Technology Assessment process, and **Google Cloud Platform is on
it**, approved to the "Controlled" data classification, listed as "Google Cloud Platform
(For Campus Maps)". Purchases above $15,000 annually must go through UT System and UTA
procurement. MavRadar runs roughly $120 to $180 a year, so that threshold is irrelevant.

Cloud Run is a GCP service and is covered by that approval. Unity Asset Store has a
tax-free educational record; ArtStation approval is in progress.

### The Firebase question

Firebase-branded services do not appear on the pre-approved list by name. This is probably
a naming artifact rather than a real gap, because Firebase is not a separate platform:

- A Firebase project **is** a Google Cloud project with extra configuration. Project ID,
  project number, IAM, and billing are shared, and it is manageable from the Cloud console,
  `gcloud`, and Terraform.
- Firestore, Cloud Functions, and Cloud Storage are shared products, the same GCP services
  exposed for client-side developers through Firebase branding.
- Firebase Authentication runs on Identity Platform, which is a GCP product with identical
  features.

So Firestore and Auth are GCP services with a Firebase label. FCM is the one component that
stays Firebase-branded, though it is billed through the same GCP project and authenticated
with a GCP service account.

### Open questions for OIT, not the instructor

1. **Is the GCP approval product-scoped or use-case-scoped?** The entry reads "(For Campus
   Maps)" and its description discusses the Google Maps Platform. An approval granted in a
   campus-maps context may not automatically extend to IoT ingest and push notification.
2. ~~Does Firebase appear on the explicitly not-approved list?~~ **Checked and clear.**
   Neither Firebase nor Firestore appears on OIT's not-approved list, so the hard-blocker
   scenario is closed. What remains is at most a paperwork question: the OIT page states
   that technology absent from the pre-approved list requires a Technology Assessment. The
   Firebase-is-GCP argument above should resolve that, since the platform in use is the
   approved one.

If a Technology Assessment turns out to be required, budget lead time. It is reviewed by
OIT EIR Accessibility, OIT Enterprise Architecture, and sometimes the Information Security
Office.

**Scope caveat worth noting before chasing any of this further.** The OIT policy governs
technology "approved for use on UTA-owned devices and the UTA network" and applies "before
the technology can be procured, installed and used." MavRadar's backend runs on a personally
funded GCP account, developed on a personal machine, with a field unit on private property
using the host's internet. None of it is procured by UTA, installed on UTA devices, or run
on the UTA network. The policy may not reach it at all. This is the same reasoning that may
rescue the LTE modem, and it should be applied consistently to both.

### Data classification

GCP is approved to "Controlled". MavRadar stores FCM device tokens, anonymous auth UIDs,
quiet-hours preferences, and train event logs. It holds no names, emails, or student IDs,
because Firebase Anonymous Auth was chosen to avoid signup. That decision was made for user
experience reasons and turns out to be a compliance advantage: there is no directly
identifying data in the system.

Revisit this if the multi-site geolocation feature in `docs/FUTURE_MULTI_SITE_NETWORK.md`
is ever built. The geofencing design keeps location on the device and transmits only a
crossing subscription, which preserves this posture. Continuous location tracking would not.

### Fallback if OIT objects to the Firebase name

Build against the GCP-branded SKUs instead. Use the `google-cloud-firestore` client library
rather than the Firebase Admin SDK, and Identity Platform rather than the Firebase Auth
console. Same services, same project, GCP branding throughout. This is a labeling change,
not an architectural one, and it is worth knowing before it is needed.

## 4. Design constraints to document in the SRS

The instructor requires applicable constraints to be documented in the System Requirements
Specification and carried through later documentation. All eighteen categories from the
source, with an assessment of whether each binds MavRadar.

| Constraint | Applies | Why |
|---|---|---|
| Accessibility | **Strongly** | Safety alert consumed under time pressure. VoiceOver and TalkBack, contrast, no color-only signaling. Texas EIR rules make this more than a nicety. |
| Aesthetics | Yes | Field unit sits on someone else's private property. It has to look acceptable to the host or permission evaporates. |
| Constructability | Yes | Enclosure, mast, solar mount, all assembled by one student without a machine shop. |
| Cost / Economic | **Strongly** | Hardware BOM plus roughly $10 to $15/month recurring Cloud Run idle. End user cost is $0. |
| Ergonomics | Yes | Alert must be actionable in seconds, one-handed, likely while walking. |
| Environmental | **Strongly** | Outdoor year-round in North Texas. Heat, storms, solar and battery. |
| Extensibility | Yes | Second crossing, or a future team taking over. |
| Functionality | **Strongly** | Cannot predict schedules. Detection only, no railroad data feed exists. |
| Interoperability | **Strongly** | Radar serial, FCM and APNs, iOS and Android. |
| Legal | **Strongly** | FCC Part 15, Texas Penal Code 28.07, UP right-of-way, 50+ ft siting, written property owner permission. |
| Maintainability | Yes | Unattended unit in a parking lot. Tailscale before deployment, or every fix is a drive. |
| Marketability | Weak | Not commercializing. Note it and move on. |
| Public Health | Indirect | Reduces people racing a crossing. |
| Safety & Welfare | **Strongly** | This is the core. A false negative strands someone; a false positive burns the iOS Time Sensitive channel permanently. |
| Schedule | **Strongly** | Aug 2026 to May 2027. Radar lead time and site permission are the critical path. |
| Social / Cultural | Yes | Large international student population at UTA. Consider language. |
| Standards | Yes | See section 5. |
| Sustainability | Yes | Solar and battery, no grid drop. |
| Usability | **Strongly** | Depends on an uplink and on push delivery, neither fully controlled. |

## 5. Engineering standards that apply

Selected from the instructor's list. These are the ones MavRadar can defensibly claim.

**Enclosure and field unit**
- IEC 60529 and NEMA 250, ingress protection rating for the enclosure. Non-optional.
- IEEE 1692, lightning protection. Elevated mast near a rail line in North Texas.
- ANSI C18 and IEC 60086, batteries (12V AGM).
- IEC 60287, cable current capacity. IEC 60445, wiring identification.
- IEC 60169 and IEC 60966, RF and coaxial connectors and cable for the radar.

**Networking and backend**
- IEEE 802, networking. Covers WiFi and the point-to-point bridge uplink options.
- ISO 20802, JSON and OData, for ingest API payloads.
- ISO 13249, databases.

**Security and identity**
- NIST SP 800-63B, authentication and lifecycle management. Relevant to the Firebase
  Anonymous Auth decision and worth citing to justify it.
- OAuth and OIDC, underlying Firebase Auth.
- AES, SHA, RSA, transport security on the ingest endpoint.

**Domain**
- ISO 11270, Intelligent Transport Systems.
- ISO 17185, journey planning systems. MavRadar is literally a journey planning aid.
- ISO 16982, human-centered usability and ergonomics.
- W3C and WCAG, for the accessibility constraint.

## 6. Correction to Amendment 001

`docs/MAVRADAR_HANDOFF_AMENDMENT_001.md` makes two claims about this policy that the
source document does not support. Verified by full-text search of the PDF.

1. It states "The same policy section also prohibits wireless communication service fees"
   and concludes the SIM and data plan have no funding source. The document contains no
   such provision. The words wireless, service, fee, plan, SIM, subscription, and recurring
   do not appear anywhere in it. A data-only SIM may or may not be purchasable, but that is
   an open question, not a documented prohibition.

2. It states "The policy language is ProCard-specific." The document never mentions
   ProCard. The prohibition list has no mechanism qualifier, which weakens the proposed
   Purchase Order exception argument, since there is no written distinction to appeal to.

Both may have come from a verbal conversation or another handout. If so, cite that source.
As written, the amendment attributes rules to this document that are not in it, and
architectural decisions should not rest on that.
