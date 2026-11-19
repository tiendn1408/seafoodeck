# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- **Primary:** Vietnamese people new to the seafood trade, plus sales staff at an import-export company. They learn on their phones in short breaks of a few minutes: open the app, do a few cards, close it.
- **Secondary:** editors and reviewers who prepare content in the admin area.
- **Evaluator:** the customer's decision-makers, who are choosing between this team's demo and competing vendors.

## Product Purpose

The app helps a learner connect the four names of one commercial species: Vietnamese, English, Japanese, and scientific. It also teaches HS classification from the description of the goods. This is a learning tool, not a tool for declaring real shipments.

Success means:
- the learner finishes a short session;
- the learner comes back for due reviews;
- first-attempt accuracy goes up for each skill.

For the current demo, success also means the customer picks this product over competitors because both the UX and the feature set convince them.

## Positioning

- **Four-name identity per species.** The species profile is separate from the trade scenario, and HS codes attach to the form the goods take, not to the species.
- **Real review loop.** Spaced review at 1, 3, 7 and 14 days, tracked separately for each skill.
- **Editorial pipeline.** Content goes through draft, then review, then publish; learners only see published content.

Quiz apps built on fixed species lists cannot claim any of the three.

## Operating Context

The app is an online pilot. Learners sign in with an invite code; admins sign in with their own accounts. Learners use it mostly on mobile phones.

The content is about 100 or more commercial species: fish, crustaceans, molluscs and others. Each has photos, Japanese trade names, and HS cases (WCO HS 2022 at 6 digits; Vietnamese tariff codes at 8 digits come later).

Learning modes: Flashcard, name matching, image guessing, and HS by product form. Also review, a summary, and progress.

## Capabilities and Constraints

- **Stack:** React/Vite web (apps/web) and a NestJS API (apps/api) with PostgreSQL and private S3. There is no offline mode.
- **Unapproved content:**
  - Drafts may appear only in internal releases.
  - Prices and rarity have no source yet and are admin-only.
  - Audio has not been recorded; browser TTS may be offered only with a "chưa duyệt" (not yet approved) label.
- **Images:** many prototype photos lack complete attribution. Images used for the image-guessing mode require a reviewer to confirm the species.
- **Language:** the UI is in Vietnamese.

## Brand Commitments

- Nothing is fixed yet. The name, logo, colours and illustrations may all be replaced to win the customer.
- The product is built for one specific customer company, so its identity may later carry that customer's branding.

## Evidence on Hand

- Source data:
  - 6 curated demo species, with sources in docs/sources/customer-demo/;
  - 96 prototype species imported as drafts, with provenance in docs/sources/prototype-import/;
  - HS scenarios.
- Photos: Wikimedia/CSIRO images; their attribution is incomplete.
- Do not fabricate customer logos, testimonials, prices, or approval states.

## Product Principles

1. A session is complete within a few minutes on a phone.
2. Show the trade as it really is: species identity, product form, and code. Never let unverified content pass as verified.
3. Every screen should feel like it belongs to the seafood trade, not to a generic quiz app.
4. Be honest about states: missing audio, images and approvals are shown, never faked.

## Accessibility & Inclusion

- Mobile first, at 320px and wider, with touch targets of at least 44px.
- Keyboard-operable matching; no drag-only interactions.
- Respect reduced motion.
- Vietnamese diacritics and Japanese kana/kanji must render correctly.
