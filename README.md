# Help Yourself

A small website for passing on clothes you don't wear any more. Visitors pick something they'd wear, give whatever they like for it, including nothing, and get it home themselves by picking it up or booking their own courier.

It is an honesty box, not a shop. There are no prices, no minimum, no bargaining and no accounts. One garment at a time. The buyer types a number; the site takes it at its word.

Built by one household for its own wardrobes and shared so anyone can run their own for free.

## What a visitor sees

1. A plain list of garments in two sections (for example "Rachel's" and "Zoe's"), with size, condition and photos.
2. A garment page with honest facts: fit, measurements, condition, flaws, and how pick-up or courier works.
3. "Take this": they type an amount. Any amount. $0 is fine.
4. A 30-minute hold while they finish. Email, then either a free claim or a card payment on Stripe's hosted page.
5. "It's yours": a private page and email with the pick-up address or courier instructions. Payment is never treated as handover; that is a separate status the owner marks by hand.

Everything awkward is handled calmly: an unavailable garment, two people racing for one thing, a declined card, a closed tab mid-payment, an expired hold, a refund.

## What you need

All free tiers unless you take a lot of money:

- A [Stripe](https://stripe.com) account. Stripe charges a fee per card payment (in New Zealand, 2.65% + 30c domestic at the time of writing). There is no monthly cost. $0 claims never touch Stripe.
- A [Vercel](https://vercel.com) account to host it. The Hobby plan is free. Note that Vercel's Hobby plan is for personal, non-commercial use and runs scheduled jobs only once a day; the app is built to cope with that (see "How the money part is kept honest"). If your use looks commercial to them, use the Pro plan or another host.
- A Postgres database. The one-click Neon integration in Vercel's Storage tab has a free tier.
- Optional: a [Resend](https://resend.com) account for the confirmation emails. Without it, emails are written to the server log, which is fine while testing but not for real buyers.
- Optional: a Vercel Blob store for photos. Without it photos are kept on local disk, which only works on your own computer.

## Set it up

### 1. Get the code

Fork this repository on GitHub.

### 2. Stripe

Create an account, choose "accept online payments" only (no invoices, no subscriptions, no tax), and stay in **test mode** until everything works. From Developers → API keys copy the secret key (`sk_test_…`).

### 3. Vercel

Import your fork as a new Vercel project. In Storage, add a Neon Postgres database and a Blob store; both set their environment variables for you. Then add the rest in Settings → Environment Variables, using `.env.example` as the list:

| Variable | What it is |
|---|---|
| `STRIPE_SECRET_KEY` | from Stripe |
| `STRIPE_WEBHOOK_SECRET` | from step 4 |
| `APP_URL` | your site's address, e.g. `https://help-yourself-yourname.vercel.app` |
| `SHOP_NAME` | what the site is called |
| `LOCALITY`, `CITY` | the suburb shown publicly for pick-up. Never the street. |
| `OWNER_LABELS` | the sections, e.g. `"a=Rachel's,b=Zoe's"` |
| `PICKUP_ADDRESS`, `PICKUP_NOTE` | shown **only** to a buyer after a garment is theirs |
| `OWNER_PASSWORD` | for the owner screen at `/owner` |
| `MAIL_REPLY_TO`, `RESEND_API_KEY`, `MAIL_FROM` | optional, for real emails |

Deploy.

### 4. Tell Stripe where to send events

In Stripe → Developers → Webhooks, add an endpoint: `https://your-site/api/stripe/webhook`, with the events `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.expired` and `charge.refunded`. Copy the signing secret (`whsec_…`) into `STRIPE_WEBHOOK_SECRET` and redeploy.

### 5. Add your clothes

Go to `/owner`, log in, add garments with photos, measurements and flaws, and publish them. Try the whole thing yourself with Stripe's test card `4242 4242 4242 4242`.

### 6. Go live

Activate your Stripe account (identity and bank details), swap the test keys for live keys, create a live webhook endpoint, and redeploy. Try one real payment yourself first.

## Running it on your own computer

```
npm install
cp .env.example .env.local   # fill in at least STRIPE_SECRET_KEY and OWNER_PASSWORD
npm run seed                 # seven made-up specimen garments
npm run dev
```

Without `DATABASE_URL` it uses an embedded Postgres in `./data`. For webhooks locally, install the [Stripe CLI](https://docs.stripe.com/stripe-cli) and run:

```
stripe listen --events checkout.session.completed,checkout.session.async_payment_succeeded,checkout.session.expired,charge.refunded --forward-to localhost:3000/api/stripe/webhook
```

and put the secret it prints into `STRIPE_WEBHOOK_SECRET`.

## How the money part is kept honest

- The amount the buyer types is validated on the server and sent to Stripe unchanged. Nothing is added on top.
- $0 is recorded as `no_payment_required` and never as `paid`. Under 50c can't be charged by card, so the buyer is asked to choose $0 or 50c; the server never rounds.
- One garment, one winner: the reservation runs inside a database transaction with a row lock.
- A garment is allocated only from a verified Stripe record (matching session, order, amount and currency), exactly once, whichever arrives first: the webhook, the buyer's return page, or the sweep.
- A hold is released only when Stripe confirms the session cannot still pay. Expired holds are settled when anyone views the list or the garment, so nothing depends on a scheduled job.
- A refund never puts a garment back on the list. The owner does that once it is physically back.
- Payment is not handover. The private page and the email say so, and the owner marks "handed over" by hand.

## Owner screen

`/owner`: add and edit garments, upload photos, publish or withdraw, see orders, mark handover status, resend an email, resolve an exception. Refunds are done in the Stripe dashboard.

## Changing the words

All copy lives in the page files under `app/`. The name, suburb, sections and private details are environment variables. `SHOP_NAME="Yours For"` switches the headline and button to the "Yours for $3" form.

## Licence

MIT. Use it, change it, run your own.
