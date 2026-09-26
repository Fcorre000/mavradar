# MavRadar Handoff Amendment 002: Compliance, Tooling, and Course Process

**Date:** 2026-08-21
**Updates:** `docs/MAVRADAR_HANDOFF.md` and corrects `docs/MAVRADAR_HANDOFF_AMENDMENT_001.md`
**Written to be self-contained.** Assume the reader has no repository access.

---

## 0. Project recap, for a cold reader

MavRadar detects freight trains approaching the Center St grade crossing near the University
of Texas at Arlington and pushes a real-time alert to a mobile app, so students can divert to
the West St underpass. No public real-time freight train position data exists, so the system
detects trains directly with a 24GHz doppler radar.

```
OPS243-A radar --USB--> Raspberry Pi 4 --uplink--> ingest API --> alert filter --> FCM/APNs --> phone
                                                       |
                                                   Firestore (async, off the hot path)
```

Warning window is 30 to 45 seconds end to end. **Latency is the tiebreaker for every
architectural decision.** Push first, write Firestore after, never the reverse.

Owner: Fernando, UTA software engineering, graduating May 2027. This is now also his Senior
Design capstone, running Aug 2026 through Spring 2027. Dev machine is an 8GB M1 Mac with no
Xcode and no Android emulator, deliberately. iOS builds go through EAS cloud builds.

Stack: Expo SDK 57 app, Python edge service on the Pi, FastAPI on Cloud Run, Firestore, FCM
HTTP v1, Firebase Anonymous Auth.

---

## 1. Corrections to existing documents

Read this section first. Two prior claims are wrong and will propagate if not caught.

### 1.1 Amendment 001 misquotes the vendor policy

Amendment 001 correctly concludes that the Sixfab 4G/LTE modem cannot be purchased. Two of
its supporting claims are not supported by the source document, verified by full-text search
of the PDF.

**Claim: "The same policy section also prohibits wireless communication service fees."**
False. The words *wireless*, *service*, *fee*, *plan*, *SIM*, *subscription*, and *recurring*
appear **zero times** in the Vendor Policies document. Amendment 001 concludes from this that
the SIM data plan "has no funding source either" and treats that as settled. It is not
settled, it was never asked. This may have cost an option unnecessarily.

**Claim: "The policy language is ProCard-specific."** False. The document never mentions
ProCard. The prohibition list carries no purchasing-mechanism qualifier at all, which
*weakens* the proposed Purchase Order exception argument, because there is no written
distinction to appeal to. The only PO-specific language in the document concerns Grainger.

Both may have come from a verbal conversation or another handout. If so, cite that source.

### 1.2 Earlier conclusion that Google Cloud was unapproved

An earlier reading of the Senior Design vendor handout concluded that GCP was not an
approved vendor and the backend might have to migrate to Digital Ocean. **That was wrong**,
based on too narrow a source. See section 2.2.

---

## 2. Compliance and procurement

### 2.1 What the vendor policy actually prohibits

Quoted in full. The prohibition list is exactly two items:

> Things we CANNOT purchase:
> - Cellular Radio or Communications Equipment (See: 4G/LTE Comms boards for RasPi/etc)
> - Web Domain Names

This is a **procurement rule, not a technical or regulatory ban.** Nothing forbids the
project from using a cellular uplink acquired outside university funds. An exception request
is with the professor as of 2026-08-20, outcome pending.

**New finding not previously tracked: web domain names cannot be purchased.** Cloud Run
issues a `*.run.app` URL so nothing is blocked, but a custom domain for the ingest API or a
project page has no funding path.

UTA is a government institution and cannot pay Texas state sales tax, so vendors must honor
the exemption. Tariffs are generally acceptable.

### 2.2 Cloud vendor approval: resolved, stack is safe

Two separate UTA lists exist and they disagree in scope.

The **Senior Design vendor handout** names Digital Ocean as the only approved cloud vendor
(OIT and EIR office, assessment 7/2024, REQ05330005, next review June 4 2027).

**UTA OIT's own pre-approved technology list is broader and includes Google Cloud Platform**,
approved to the "Controlled" data classification, listed as "Google Cloud Platform (For
Campus Maps)", with UT System procurement required above $15,000 annually. MavRadar runs
roughly $120 to $180 a year, so that threshold is irrelevant. Cloud Run is a GCP service and
is covered.

Firebase does not appear on the approved list by name, but that is a branding artifact:

- A Firebase project **is** a Google Cloud project, sharing project ID, project number, IAM,
  and billing, manageable from the Cloud console, `gcloud`, and Terraform.
- Firestore, Cloud Functions, and Cloud Storage are shared products, the same GCP services
  exposed for client-side developers under Firebase branding.
- Firebase Authentication runs on Identity Platform, a GCP product with identical features.
- FCM is the only component that stays Firebase-branded, and it bills through the same GCP
  project and authenticates with a GCP service account.

**Confirmed 2026-08-21: neither Firebase nor Firestore appears on OIT's not-approved list.**
The hard-blocker scenario is closed. Cloud Run, Firestore, and FCM are safe to build on.

**Residual, non-blocking:** whether the GCP approval is product-scoped or scoped to the
campus-maps use case its entry describes.

**Scope argument that likely moots all of this.** OIT policy governs technology "approved for
use on UTA-owned devices and the UTA network" and applies "before the technology can be
procured, installed and used." MavRadar's backend is a personally funded GCP account,
developed on a personal machine, with a field unit on private property using the host's
internet. None of it is procured by UTA, installed on UTA hardware, or run on the UTA
network. **This is the same argument that may rescue the LTE modem, and it should be made
consistently in both conversations.**

**Fallback if anyone objects to the Firebase name:** build against GCP-branded SKUs. Use the
`google-cloud-firestore` client library instead of the Firebase Admin SDK, and Identity
Platform instead of the Firebase Auth console. Same services, same project, GCP branding
throughout. A labeling change, not an architectural one.

### 2.3 Data classification

GCP is approved to "Controlled". MavRadar stores FCM device tokens, anonymous auth UIDs,
quiet-hours preferences, and train event logs. **No names, emails, or student IDs**, because
Firebase Anonymous Auth was chosen to avoid signup. That decision was made for user
experience and turns out to be a compliance advantage: there is no directly identifying data
in the system. Comfortably within Controlled.

### 2.4 Preferred vendors

| Vendor | Location | Notes |
|---|---|---|
| Mouser Electronics | Mansfield TX | **Best default.** Free shipping, next-day if ordered by noon. Only free-shipping vendor. |
| ServoCity / goBILDA | Kansas | 15% educational discount. Tax-free agreement is with **ServoCity**, so link ServoCity even though part numbers match. |
| Pololu | Nevada | 3 to 4 days, price break |
| DigiKey | Minnesota | Small price break, pay shipping. Stocks items Mouser does not. |
| Speedy FPV | College Station TX | Drone and video parts |
| Amazon | n/a | Non-PRIME items carry 5 to 8 day supply chain lead time |

Non-partner but usable: SparkFun, Adafruit, JLCPCB, Copper Hill, Maker Motor. Mouser resells
much of SparkFun and Adafruit at $1 to $3 more, usually offset by free shipping.
**Grainger is Purchase Order only** and cannot be ordered through its website.

**Action item: OmniPreSense is not on any list.** The OPS243-A radar is the longest-lead item
in the BOM. Check whether Mouser or DigiKey can source it before going direct and having to
arrange tax exemption separately on the one purchase that gates everything else.

---

## 3. Course process and documentation

### 3.1 Deliverable dependency chain

The instructor provides LaTeX templates. They form a chain and want to be written in order:

1. **Project charter** (start here, no upstream dependencies)
2. Requirements Gathering Worksheet (an `.xlsx`, not a LaTeX deliverable)
3. System Requirements Specification (SRS)
4. Architectural Design Specification
5. Detailed Design Specification
6. Test Plan (traces back to SRS requirement numbers, so it cannot start until the SRS is stable)

Individual sprint reports and sprint presentations run in parallel on their own cadence.

Note: the template repo has two SRS directories plus a zip. Confirm which is current before
building on one.

### 3.2 Why the charter first, specifically

The faculty advisor is still unsecured. The charter is the artifact that fixes that;
approaching a professor with a scoped problem statement, stakeholder list, and risk register
is a different conversation than describing an idea aloud.

The charter is also where scope boundaries get drawn, and this project needs two:
**crowdsourced "train here now" reports** and the **historical pattern layer over 100+ logged
passes** must both be explicitly Phase 2, not core scope. The pattern layer in particular
cannot exist until the unit has been logging at the crossing for weeks. Written into core
requirements, a hardware delay stops being a missing feature and becomes a failed project.

Core scope: one crossing, detect the train, deliver the push inside the warning window.

### 3.3 The Agile versus document-first tension

The course is documentation-first for the fall semester. The reconciliation is specific:
**you cannot write a defensible SRS about train detection without having powered on the
radar.** Any requirement about detection range, classification confidence, or false positive
rate is invented until real doppler returns have been observed. Writing "detect approaching
trains at 100m with 95% reliability" from a datasheet is how capstone teams end up in April
holding requirements they cannot meet.

Exploratory hardware work is not a violation of "know what you're building." It is what makes
the requirements true. What is being avoided is premature *product* code, not premature
learning.

**Consequence: the radar should be ordered now, not in January.** The documentation semester
is exactly when the hardware needs to be on the desk, so the SRS and architecture spec can
contain measured numbers instead of datasheet numbers.

### 3.4 Design constraints required in the SRS

The instructor requires applicable constraints and engineering standards to be documented in
the SRS and carried through later deliverables. Eighteen categories are listed: Accessibility,
Aesthetics, Constructability, Cost/Economic, Ergonomics, Environmental, Extensibility,
Functionality, Interoperability, Legal, Maintainability, Marketability, Public Health,
Safety & Welfare, Schedule, Social/Cultural, Standards, Usability.

Heaviest for MavRadar: **Safety & Welfare** (a false positive permanently burns the iOS Time
Sensitive channel; a false negative strands someone), **Legal** (FCC Part 15, Texas Penal Code
28.07, UP right-of-way, 50+ ft siting, written property owner permission), **Accessibility**,
**Schedule**, **Interoperability**, **Usability**, **Environmental**, **Cost**.

### 3.5 Defensible engineering standards

- **IEC 60529 / NEMA 250** ingress protection rating for the enclosure. Non-optional.
- **IEEE 1692** lightning protection. Elevated mast near a rail line in North Texas.
- **IEEE 802** networking. Covers the WiFi and point-to-point bridge uplink options.
- **ANSI C18 / IEC 60086** batteries. **IEC 60287** cable current capacity. **IEC 60445**
  wiring identification. **IEC 60169 / 60966** RF and coaxial connectors for the radar.
- **NIST SP 800-63B** authentication and lifecycle management. Cite this to justify the
  Firebase Anonymous Auth decision.
- **ISO 17185** journey planning systems. MavRadar is literally one.
- **ISO 11270** Intelligent Transport Systems. **ISO 16982** human-centered usability.
- **ISO 20802** JSON, for ingest API payloads. **W3C / WCAG** for accessibility.

---

## 4. Architecture decisions added this session

### 4.1 Do not key push tokens on the anonymous auth UID

Firebase has an optional automatic cleanup that deletes anonymous accounts older than 30
days. It ships with the Identity Platform upgrade and is **off unless enabled. Leave it off.**

The reason it matters here: MavRadar users are passive by design. A student installs the app
and never opens it again, because the whole point is that the app speaks up on its own. That
pattern is indistinguishable from an abandoned account.

**Key Firestore push token documents on the FCM device token, not the anonymous UID.** The
device token is what FCM actually needs, it survives auth changes, and it gives a natural
place to store delivery receipts. Treat the anonymous UID as authorization for a write, not
as the identity of a subscriber.

### 4.2 Put the token registry behind an interface in v1

See section 5 for why. This costs nothing now and is the difference between the multi-site
feature being additive later versus surgery.

### 4.3 Firestore database ID

Use `(default)`, including the parentheses. Every SDK connects to it with no extra argument,
the Firebase CLI deploys rules and indexes there by default, and only the first database in a
project receives the no-cost tier (1 GiB storage, 50k reads/day, 20k writes/day). The ID is
permanent, like the location. If a staging environment is wanted later, create a second
Firebase *project*, not a second database.

Firestore is configured: production mode rules (locked), `us-central1`.

---

## 5. Future feature earmark: multi-site radar network

Requested feature: scale beyond one crossing, with users picking which crossings alert them,
or the app auto-deciding from location while driving.

**Verdict: the software scales easily. The binding constraint is site acquisition, not the
network.** Every additional crossing needs a property owner 50+ feet from the rail who will
host an unattended unit and supply its internet. That is a human problem that does not get
cheaper with engineering effort, and it is currently unsolved even once.

**Manual per-crossing subscription is nearly free.** Field units already authenticate
individually so events can carry a `crossingId`. The token registry gains a `subscriptions`
array; the alert filter, which already handles quiet hours and radius, gains one predicate.
Fan-out per event *drops* as crossings multiply. FCM multicast caps at 500 tokens per call,
so even 10,000 users across 10 crossings is about two batched calls.

**Geolocation auto-selection reduces to manual selection.** It is a client-side mechanism
that writes the same subscription list. The server does not change.

**Use geofencing, not continuous location.** Life360's approach costs battery, triggers iOS's
recurring background-location notice with a map of everywhere the user has been, draws App
Store scrutiny, and leaves the project holding student location traces. Geofencing has the OS
monitor regions at system level and wake the app only on enter/exit, with near-zero battery
cost and no location history stored or transmitted. `expo-location` on SDK 57 supports it
(`startGeofencingAsync`), iOS caps at 20 monitored regions, Android at 100, and it requires a
development build.

**The one architectural consequence.** Subscription filtering introduces a Firestore **read
before the push**, which is exactly what the push-first design avoids. Fix: hold an in-memory
crossing-to-token map on the warm Cloud Run instance (`min-instances=1` guarantees one) and
keep a Firestore snapshot listener open to refresh it. Hot path stays at zero I/O. This is
why the token registry should sit behind an interface in v1 rather than being queried inline.

**Recommendation: leave location native config out of the v1 EAS build batch.** It costs one
extra iOS build whenever the feature lands, out of 15 per month, which is cheaper than
declaring a sensitive background capability the app does not use.

**Geofencing is a safety feature at scale, not a convenience.** More crossings means more
alerts per user, and iOS asks only once whether to keep Time Sensitive alerts. Geofenced
auto-subscription makes irrelevant alerts structurally impossible, because a user is only
subscribed while physically near the crossing. It also preserves the data classification
posture in section 2.3, since location never leaves the device.

**Course value:** Extensibility is one of the eighteen required SRS constraint categories.
This is a concrete answer to it.

---

## 6. Environment and tooling state

**Repository.** `app/` was a nested git repository, because `create-expo-app` runs `git init`
in the directory it scaffolds. Git will not descend into another repo's working tree, so
`app/` showed as a single opaque untracked entry and `git add app/` would have recorded a
dangling gitlink that clones as an empty folder. Resolved by deleting `app/.git`; 59 files
committed and pushed.

**`.gitignore` hardened** for gaps found by testing candidate paths:
- `*.pem`, `*.key`, `*.cer`, `*.certSigningRequest` at root. Expo's own `.gitignore` covers
  the first two but only within `app/`, leaving `server/` and `edge/` exposed. This matters
  because the FCM service account credential will live in `server/`, and Apple Developer
  enrollment will produce certs.
- `*.ipa`, `*.apk`, `*.aab`. EAS downloads land in the project directory and an `.ipa` will
  exceed GitHub's 100MB limit.
- `**/.claude/settings.local.json`, previously ignored only via a machine-local global config.
- LaTeX build artifacts including beamer's `.nav`, `.snm`, `.vrb` for sprint presentations.
  Built PDFs are deliberately **not** ignored, since the PDF is the submitted deliverable.

Firebase config files (`google-services.json`, `GoogleService-Info.plist`) were already
covered at any depth, since patterns without slashes match recursively.

**LaTeX.** Full MacTeX installed, TeX Live 2026, 9.7GB. Full distribution chosen over
BasicTeX because the instructor's templates span three eras and pull unpredictable packages;
BasicTeX turns every unknown `\usepackage` into a `tlmgr` detour. Verified compiling with
`graphicx`, `hyperref`, `booktabs`, and a table of contents.

Gotcha: MacTeX installs `/etc/paths.d/TeX`, read by `path_helper` at login shell start, so
shells opened before installation cannot see it. The symptom is confusing, `latexmk` runs
fine and then reports `sh: pdflatex: command not found`. Fix is a new terminal window or tab,
not `source ~/.zshrc`.

---

## 7. Open items

**Critical path**
1. **Order the OPS243-A radar.** Longest lead item, still unordered, and it gates bench
   testing, the SRS's detection numbers, log-only deployment, and the pattern layer. Check
   Mouser and DigiKey first (section 2.4).
2. **Secure a deployment site.** 50+ ft from the nearest rail, written owner permission, and
   since Amendment 001, a source of internet. Every uplink option depends on it, and so does
   any multi-site future.
3. **Secure a faculty advisor.** Write the project charter first (section 3.2).

**Waiting on others**
4. Apple Developer Program enrollment. Gates all iOS builds.
5. LTE modem exception request with the professor. Treat LTE as unavailable until it returns
   yes. Note the section 2.2 scope argument applies here too.

**Next actions**
6. Enable Anonymous auth in the Firebase console (Authentication, Sign-in method).
7. Write Firestore security rules. The database is in production mode and locked, so the app
   cannot register a push token until rules exist. Roughly 15 lines.
8. Do **not** generate the FCM service account key until `server/` exists.
9. Defer the Blaze upgrade and the $10/month budget alert until backend deployment. The $300
   credit expires 90 days from enrollment regardless of balance.
10. Batch all native config changes into one `app.json` pass: expo-notifications, the Time
    Sensitive entitlement, bundle identifier, Android package. EAS free tier allows 15 iOS
    builds a month. Leave location config out (section 5).

---

## 8. Standing rules that have not changed

- Never commit credentials. The repo is public.
- Never commit the field unit's deployment coordinates.
- Assume 50+ feet from the nearest rail in any siting code, config, or documentation.
- Batch native config changes; every one triggers an EAS rebuild.
- Protect the iOS Time Sensitive channel. iOS asks the user once. A single false or
  irrelevant alert burns it permanently for that user.
- Push first, write Firestore after. Never block a notification on a database write.
- No em dashes in written output. Concise, human, conversational tone.
