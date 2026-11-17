# Brandon RV — Design System

## Product context
Brandon RV is a mobile caravan and motorhome interior repair and accessory service based in Tamworth NSW. The public brand earns trust and gathers accurate job details. The authenticated workspace helps a small team assess, quote, schedule, execute, approve and close work without a workshop-style enterprise interface.

## Two visual registers, one system
The public website and customer portal use the supplied Brandon RV logo identity: navy and charcoal structure, clear blue accents, white and cool-neutral surfaces, and restrained editorial serif display typography. Keep the customer-facing experience distinct from the denser operational admin workspace even though both share the logo's navy/blue family. The active public/customer palette is defined in `brv-brand-system.css`, loaded after the legacy base and refresh stylesheets. The authenticated workspace overrides presentation only within `.brv-admin-frame`.

The authenticated admin workspace uses a practical workshop-office register: navy structure, restrained blue actions, white work surfaces and cool neutral page backgrounds. The customer portal retains the public logo palette but follows the same spacing, typography hierarchy, controls and interaction rules. Contact details in the portal must come from business configuration or link to the contact form; never hardcode a phone number. Staff tools use the compact operational register, with touch-safe actions for on-site use.

## Operational palette
- Navy: `#10283F` — admin navigation, headings and strong surfaces.
- Blue: `#1767AD` — primary actions, links and active states.
- Pale blue: `#EAF3FA` — selected states and low-emphasis information.
- Page neutral: `#F5F7F8` — admin workspace background.
- Surface: `#FFFFFF` — panels, forms and documents.
- Border: `#DBE4EC` — separators and control outlines.
- Muted: `#5D6F82` — secondary information with stronger contrast on the workspace background.
- Danger: semantic red with text/icon; never rely on colour alone.

## Public brand palette
Use the active brand variables: navy `#142B43`, blue `#155FBA`, pale blue `#EDF4FC`, white `#FFFFFF`, cool page neutral `#F4F7FB` and border `#DCE5EF`. The logo's charcoal/black is retained for strong wordmark contrast. The existing Georgia display and Inter/system body pairing remains the public-site identity unless a separately approved rebrand is requested.

## Typography and density
- Operational body text: 12–14px where dense records require it; 14–16px for customer explanations.
- Page headings: 22–28px in authenticated workspaces; avoid marketing-sized hero headings inside admin and portal.
- Labels and metadata: 10–12px with readable contrast; never put essential information only in metadata.
- Desktop operational controls: 34–36px. Important touch actions: at least 44px on touch layouts.
- Spacing follows a 4px base rhythm; common increments 8/12/16/20/24px.
- Radius: 6–10px for controls and operational panels. Avoid decorative shadows and oversized rounded cards.

## Layout
- Admin navigation is persistent, narrow and grouped around daily work, finance and configuration.
- Workspace pages use one clear title, one primary action, compact filters and a stable list/table.
- Lists show summaries only; full forms and approvals live on the record detail page.
- Detail pages use a consistent section order and avoid nested cards and duplicate headings.
- Forms are two-column only when related fields benefit from it; one column on narrow screens.
- Long forms use natural document height. Do not create fixed-height form shells, clipped fields or nested scroll traps.
- Customer Jobcard and staff Workcard print views use an A4-friendly document layout with sensible page breaks.

## Interaction contract
- Every action is a real button; every navigation is a link.
- Buttons state the actual outcome: Save quote, Confirm booking, Assign worker, Submit Workcard, Approve senior review.
- Save actions preserve input after errors and prevent duplicate submission.
- Internal notes, supplier costs and private attachments are never customer-visible.
- A scope or price variation requires explicit customer approval before extra work begins.
- Worker completion and senior review are separate sign-offs.
- Customer approval is recorded against the exact final Jobcard/report revision.
- A preferred appointment request is not a confirmed booking.
- Declined quotes close and archive the Jobcard and revoke guest access.
- Do not advertise conditional, deferred or excluded service categories as bookable.
