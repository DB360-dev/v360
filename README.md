# Brand Portal

The client-facing app. Brands register, connect their Shopify store, and follow every order from confirmation to delivery. They also prepare and dispatch orders to the hub from here.

The portal is white-labelled. It shows the name set in `VITE_APP_NAME` and refers to operations only as "our team", "the hub" and "delivery partner".

## Features

**Accounts**
- **Register:** name, brand name, email, phone, and password.
  - New brands are reviewed before they get access; until then they see an "under review" screen.
  - A rejected brand sees the reason.
- **Sign in:** email and password, with "forgot password" and a set-password screen that also handles invite links.

**Overview**
- A six-stage pipeline strip: Confirm, Prepare, Hub, In transit, Last mile, Delivered.
- A "waiting on you" list, showing how long each order has waited.
- A live feed of the latest updates.
- A banner if Shopify isn't connected.

**Orders**
- Tabs by stage, with "Needs your action" first and a count on each tab.
- Search, a date range filter, and pagination.
- Bulk actions: "Mark preparing" and "Dispatch to hub".

**Order detail**
- The journey rail, plus banners explaining any problem.
- Items, with a "received at hub" count per item.
- Customer, payment and cash-on-delivery (expected vs collected), and the confirmation.
- The dispatch, the shipment, the last-mile delivery, and a full timeline.
- Actions: edit, mark preparing, dispatch, cancel.

**Ready to send**
- A printable packing list of confirmed orders, with one-step dispatch.

**Dispatches**
- Every parcel sent to the hub, and what the hub received from it.

**Settings**
- Shopify connection (brand owner only), profile, password, and theme.

**Everywhere**
- Light and dark themes, live updates, and works on phones.
- Brand switcher for users with more than one brand.

## Error handling

- **Database rule rejections** are shown in plain words. Inside dialogs they appear in the dialog itself, with everything the user typed kept.
- **Form validation** happens before anything is sent, with a message under each field.
- **Network failures** show "Can't reach the server". An offline banner appears when the connection drops.
- **Expired sessions** return the user to sign-in.
- **Every list and page** has loading, empty and retry states.
- **Crashes** are contained per page.
- **Missing configuration** shows a setup screen instead of a blank page.

## Run locally

```bash
cp .env.example .env      # Supabase URL + anon key, and your product name
npm install
npm run dev               # http://localhost:5173
```

## Deploy (Vercel or Netlify)

- **Build command:** `npm run build`
- **Output folder:** `dist`
- **Environment variables:** `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_APP_NAME`

In Supabase, go to **Authentication → URL Configuration** and:

1. Set **Site URL** to the portal's address.
2. Add `<portal>/reset-password` to **Redirect URLs**.
3. Add `<portal>/` to **Redirect URLs** as well; registration confirmation links return there.

To make the emails match your product name, edit the email templates under **Authentication → Emails**.

## Where things live

```
src/lib/app.ts        product name (from VITE_APP_NAME)
src/lib/status.ts     every status label, colour and hint: change wording here
src/lib/neutral.ts    keeps internal team names out of anything brands see
src/lib/errors.ts     turns any error into one readable sentence
src/hooks/useData.ts  every database read and action
src/index.css         theme colours (light + dark)
src/pages/            one file per screen
```
