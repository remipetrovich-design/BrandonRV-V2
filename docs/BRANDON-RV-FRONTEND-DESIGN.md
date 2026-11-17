# Brandon RV V2 — public website and customer portal design

## Scope

This branch applies a unified visual layer to the existing Next.js public website and customer portal. It does not replace the existing application, data model, route handlers, Supabase integration, authentication, role checks, customer records, quote workflows, appointment workflows, invoice records or private document delivery.

## Brand direction

The supplied Brandon RV logo and website plan establish a navy, blue, white and light-neutral identity. The visual layer uses deep navy for structure, a clear mid-blue for primary actions and active states, cool neutral page backgrounds, white content surfaces and restrained borders/shadows. The public website remains customer-facing and editorial; the customer portal remains task-oriented and account-focused while sharing the same brand language.

## Existing public website routes and behaviours retained

- Home: published page content, published service catalogue, service areas, business details, pre-launch state and enquiry availability.
- About / services, how it works / service areas, FAQs, gallery and general enquiry.
- Quote request entry point and customer sign-in/register entry points.
- Business contact details and site navigation remain data-driven where already implemented.

## Existing customer portal routes and behaviours retained

- Overview and recent customer activity.
- Jobcards and linked job records.
- Enquiries and messages.
- Quotes and quote responses.
- Bookings and job visits.
- Customer vehicle records and editing.
- Private customer documents.
- Invoices and payment history.
- Customer profile details.
- Sign-in, registration, email verification, password recovery and reset flows.

## Presentation-only implementation

- Added `src/app/brv-brand-system.css` as the final global presentation layer.
- Imported the stylesheet from the root application layout after the existing global and Brandon refresh styles.
- Updated brand tokens and component styling for the public website, customer portal, forms, navigation, status labels and responsive layouts.
- No application data, business rules, routes, API handlers, database migrations, authentication or permission logic were changed.

## Content and compliance guardrails

Use only services approved for public advertising. Cabinetry and interior hardware plus suitable living-area accessories are the launch candidates in the supplied business plan. 12V/24V accessories, water-system work, awnings and insurance-related jobs remain conditional on task-specific competency, legal scope and insurance. Deferred and excluded work must not be presented as bookable. The website should not imply that business registration, licences, insurance, supplier accounts, insurer-authorised status or domain/email operation are confirmed until evidence is supplied.

The business plan's provisional 20 km Tamworth service radius and proposed pricing are planning assumptions, not verified public commitments. Genuine work photographs require customer permission.
