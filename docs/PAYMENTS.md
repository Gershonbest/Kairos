# Kairos Payments (Paystack)

Guide for configuring and operating Paystack in Kairos Bookings.

Kairos collects money in **two ways**:

| Stream | Who pays | Who receives | Mechanism |
|--------|----------|--------------|-----------|
| **Booking payments** | Client | Tenant (most) + Kairos (platform fee %) | Paystack **subaccount** split |
| **Tenant subscription** | Tenant (business) | Kairos (100%) | Paystack checkout (no subaccount) |

---

## Prerequisites

1. A [Paystack](https://dashboard.paystack.com) account
2. Backend migration applied: `alembic upgrade head` (includes Paystack fields)
3. Backend env vars set (see below)
4. Webhook URL reachable from the internet (ngrok locally, Render in production)

---

## Environment variables

Add these to `backend/.env` (local) and **kairos-backend** on Render (production):

```bash
PAYSTACK_SECRET_KEY=sk_test_xxxxxxxx        # or sk_live_...
PAYSTACK_PUBLIC_KEY=pk_test_xxxxxxxx        # or pk_live_...
PAYSTACK_WEBHOOK_SECRET=sk_test_xxxxxxxx    # usually same as secret key
PAYSTACK_PLATFORM_FEE_PERCENT=5.0           # Kairos share of each booking payment
PAYSTACK_CALLBACK_BASE_URL=http://localhost:5173   # frontend origin for return URLs
```

| Variable | Required | Notes |
|----------|----------|--------|
| `PAYSTACK_SECRET_KEY` | Yes | Server API calls (subaccounts, initialize, verify) |
| `PAYSTACK_PUBLIC_KEY` | Optional | For Inline JS; redirect checkout works without it |
| `PAYSTACK_WEBHOOK_SECRET` | Recommended | HMAC-SHA512 of webhook body; defaults to secret key if empty |
| `PAYSTACK_PLATFORM_FEE_PERCENT` | No (default `5`) | Stored on subaccount as `percentage_charge` |
| `PAYSTACK_CALLBACK_BASE_URL` | Recommended | Defaults to `FRONTEND_BASE_URL` |

Optional frontend build arg / env:

```bash
VITE_PAYSTACK_PUBLIC_KEY=pk_test_xxxxxxxx
```

Restart the API after changing env vars.

**If `PAYSTACK_SECRET_KEY` is empty:** booking payments stay in demo mode (`provider=kairos`, auto-succeed). Subscription “Pay with Paystack” falls back to simulated activation.

---

## Activate Paystack (checklist)

### 1. Get API keys

1. Open [Paystack Dashboard → Settings → API Keys & Webhooks](https://dashboard.paystack.com/#/settings/developer)
2. Copy **Test** Secret + Public keys first
3. Switch to **Live** keys only when go-live ready

### 2. Configure local or production env

- Local: edit `backend/.env`, restart `python main.py`
- Render: set the same keys on **kairos-backend**, then restart/redeploy

### 3. Register webhook

In Paystack → **API Keys & Webhooks**, set:

| Environment | Webhook URL |
|-------------|-------------|
| Local (ngrok) | `https://YOUR-NGROK-HOST/api/v1/payments/webhooks/paystack` |
| Production | `https://YOUR-BACKEND-HOST/api/v1/payments/webhooks/paystack` |

Subscribe to at least **`charge.success`**.

Signature header expected: `x-paystack-signature` (HMAC-SHA512).

### 4. Connect a tenant settlement account

1. Sign up / log in as a business user
2. Complete onboarding through **Connect Paystack**
3. Enter:
   - Settlement business name
   - Bank
   - Account number  

Kairos calls Paystack **Create Subaccount** and stores:

- `tenant.payment_provider = paystack`
- `tenant.payment_account_id = subaccount_code`
- `tenant.payments_enabled = true`
- platform fee % used at create time

Trial tenants can connect Paystack. After trial, **payment processing** requires a plan with the `payment_processing` entitlement (Premium+).

### 5. Smoke test

**Booking payment**

1. Tenant has Paystack connected and a service with price/deposit &gt; 0  
2. Open public booking page → complete details  
3. Browser redirects to Paystack checkout  
4. Pay with a [test card](https://paystack.com/docs/payments/test-payments/)  
5. Return URL verifies payment → booking status `confirmed`  
6. Check Paystack dashboard for the charge and subaccount split  

**Subscription payment**

1. Open **Dashboard → Choose plan** (or wait for trial expiry)  
2. Select Standard/Premium → **Pay with Paystack**  
3. Complete checkout  
4. Return verifies → `subscription_paid_until` advanced ~30 days  

---

## How it works

### Booking payment flow

```
Client → POST /public/.../bookings
       → PaymentTransaction (pending) + Paystack initialize (subaccount)
       → Redirect to authorization_url
       → Paystack charge.success webhook
       → Transaction succeeded, booking confirmed
       → Client callback → confirm-payment / verify (safety net)
```

- Amount: service `deposit_amount` if set, else full `price_amount` (NGN → kobo)
- Split: Paystack settles tenant via subaccount; Kairos keeps `percentage_charge`
- Demo: if payments not enabled / no subaccount → auto-confirm with provider `kairos`

### Subscription flow

```
Tenant → POST /subscriptions/checkout { plan_code }
       → Paystack initialize (no subaccount, full amount to Kairos)
       → Redirect → pay → webhook / verify
       → plan_code set, status=active, paid_until = now + 30 days
```

One-month checkout for MVP (not auto-renewing Paystack Plans yet).

### Key code locations

| Area | Path |
|------|------|
| Paystack HTTP client | `backend/app/infra/paystack.py` |
| Intents / webhooks | `backend/app/modules/payments/` |
| Booking checkout | `backend/app/modules/public/router.py` |
| Subaccount onboarding | `backend/app/modules/tenants/router.py` |
| Subscription checkout | `backend/app/modules/subscriptions/` |
| Onboarding UI | `src/app/pages/onboarding/PaymentIntegration.tsx` |
| Public booking UI | `src/app/pages/public/PublicBooking.tsx` |
| Choose plan UI | `src/app/pages/dashboard/ChoosePlan.tsx` |

---

## API reference (payments)

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET | `/api/v1/payments/config` | No | Public key + configured flag |
| GET | `/api/v1/payments/transactions` | Tenant | Booking payment history |
| POST | `/api/v1/payments/verify/{reference}` | No* | Verify Paystack reference |
| POST | `/api/v1/payments/webhooks/paystack` | Signature | Webhook receiver |
| GET | `/api/v1/tenants/me/paystack/banks` | Tenant | Bank list for onboarding |
| POST | `/api/v1/tenants/me/payment-provider` | Tenant | Create/link subaccount |
| GET | `/api/v1/tenants/me/payment-provider` | Tenant | Connection status |
| POST | `/api/v1/subscriptions/checkout` | Tenant | Start plan payment |
| POST | `/api/v1/public/.../bookings/{id}/confirm-payment` | No | Verify after booking redirect |

\* Prefer treating verify as reconciliation after Paystack redirect; webhook is source of truth.

---

## Reporting

- **Tenant Payments dashboard** — booking transactions for that tenant  
- **Admin metrics**
  - `mrr` → succeeded **subscription** payments  
  - `booking_gmv` → gross booking payment volume  
  - `platform_fee_earned` → Kairos fee from booking splits  

---

## Go-live checklist

- [ ] Switch from `sk_test_` / `pk_test_` to **live** keys  
- [ ] Update webhook URL to production backend  
- [ ] Set `PAYSTACK_CALLBACK_BASE_URL` to production frontend  
- [ ] Confirm business bank accounts settle correctly in Paystack  
- [ ] Test one real booking payment and one subscription payment  
- [ ] Confirm emails still send after paid bookings  

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| “Paystack is not configured” | Missing `PAYSTACK_SECRET_KEY` | Add key and restart API |
| Onboarding can’t load banks | Invalid/missing secret key | Check key; check Paystack dashboard |
| Subaccount create fails | Wrong bank code / account number | Use Paystack test banks in test mode |
| Redirect works but booking stays pending | Webhook not reaching server | Fix webhook URL / ngrok; check signature |
| Signature 401 on webhook | Wrong `PAYSTACK_WEBHOOK_SECRET` | Use secret key as webhook secret |
| Choose plan says use checkout | Paystack configured; old activate endpoint | Use **Pay with Paystack** (checkout) |
| No split on Paystack | Subaccount not attached | Ensure tenant `payment_account_id` is set |

**Useful logs:** `paystack.api_error`, `email.sent`, payment webhook processing in backend logs.

---

## Security notes

- Never store tenant Paystack secret keys — only Kairos platform keys  
- Never commit `.env` with live keys  
- Prefer live keys only on Render/production secrets  
- Webhook signature verification is required before applying payment success  

---

## Related docs

- Developer overview: [`docs/DEVELOPERS.md`](./DEVELOPERS.md)  
- Env template: [`backend/.env.example`](../backend/.env.example)  
- Paystack docs: [https://paystack.com/docs](https://paystack.com/docs)  
- Test cards: [https://paystack.com/docs/payments/test-payments](https://paystack.com/docs/payments/test-payments)
