# 16 — Cost Model

Related: [09](09-ai-architecture.md), [13](13-deployment-and-infrastructure.md), [15](15-scaling-and-reliability.md).

**No vendor prices appear in this document.** Current prices, free-tier limits, and PayPal fee schedules were not retrieved and must be looked up from official sources and dated before any decision. Where a number appears, it is a **named variable or a placeholder**, not a quote. Dollar price points ($39/$59/$99) are experiment hypotheses from the brief, not facts.

## 1. Cost categories

| ID | Category | Driver | Type |
|---|---|---|---|
| C-1 | Hosting / compute | requests, build minutes, function duration | fixed + variable |
| C-2 | Managed Postgres | tier, storage, compute hours | mostly fixed |
| C-3 | Object storage + egress | dossier files stored/downloaded | variable (small) |
| C-4 | AI inference | input + output tokens per memo × regenerations | variable |
| C-5 | Document generation | PDF render CPU time (or renderer service) | variable (small) |
| C-6 | Payment processing | PayPal fee per transaction (percentage + fixed, per PayPal's current schedule, region/currency dependent) | variable per sale |
| C-7 | Monitoring / error tracking | event volume, retention | fixed/free tier |
| C-8 | Identity provider | monthly active users | free tier likely, verify |
| C-9 | Domain, email | annual | fixed |
| C-10 | Legal / tax advice | one-off | fixed, not modelled |
| C-11 | Rule-data sourcing effort | manual time to read official docs | labour |

## 2. Unit economics framework

Let, for one sold dossier at price `P` (minor units, currency c):

- `fee = f_pct × P + f_fixed` (PayPal parameters: **look up**)
- `ai = Σ (tokens_in × rate_in + tokens_out × rate_out)` over memo generations attributable to the case (include regenerations and rejected/retried calls)
- `render = R` (PDF generation cost per dossier, near zero if in-app)
- `infra_var = I` (storage/egress/DB variable share)
- `refund_rate × P` expected refund loss (hypothesis, unknown)
- `support = S` (labour allocation, optional)

**Contribution per dossier** `= P − fee − ai − render − infra_var − refund_rate×P − support`

**Break-even dossiers per month** `= ceil(fixed_monthly_costs / contribution_per_dossier)`, valid only if contribution > 0.

**Free-use cost:** free users trigger calculations (cheap) and possibly memo generation (not cheap). Decision (OPEN, OQ-004): whether memos are available pre-purchase. Default proposal: memo generation requires sign-in and is capped per case/day so that `free_user_ai_cost ≤ acquisition_budget_per_user` (budget is a business decision, unset).

Illustrative worksheet (all inputs are **placeholders to be filled with verified values**):

| Variable | Symbol | Value |
|---|---|---|
| Price point | P | experiment: 39 / 59 / 99 (USD, hypothesis) |
| PayPal % and fixed | f_pct, f_fixed | **TBD — look up** |
| Input tokens per memo | tokens_in | **TBD — measure in evaluation** |
| Output tokens per memo | tokens_out | **TBD — measure** |
| Token rates | rate_in/out | **TBD — look up for chosen model** |
| Memos per sold dossier | m | **TBD — measure (target ≤ 2)** |
| Fixed monthly infra | F | **TBD — depends on tiers chosen** |

## 3. Early-stage scenarios (structure, not figures)

| Scenario | Description | What to compute |
|---|---|---|
| S-0 Concierge | Manual dossiers, no billing automation; AI maybe used by operator | operator time per dossier; AI cost; payment via simple invoice/PayPal link |
| S-1 Sandbox/demo | Hackathon; no real revenue | near-zero; free tiers only |
| S-2 Soft launch | Real PayPal, tens of dossiers/month | fees + AI + fixed tiers |
| S-3 Growth | Hundreds/month | revisit hosting, DB tier, AI model choice |

Fill each with verified inputs when decisions are made. No revenue projection is made; none is supportable by current evidence.

## 4. Free-tier considerations (all to verify)

Typical constraints to check per vendor: serverless function duration and memory (PDF/AI), database storage and connection limits, pausing of idle free databases, backup/PITR availability on free tiers, bandwidth limits, commercial-use terms on free plans, webhook endpoint availability on hobby plans, **scheduler frequency limits** (the webhook sweeper and reconciliation need minute-scale schedules; a coarse free-tier cron lengthens the recovery time of failed webhook processing, doc 15), build minutes. Any free tier lacking backups or commercial-use rights is unsuitable for real-money operation (doc 22 release criterion).

## 5. Cost controls

- Per-memo token caps and per-case/day regeneration caps (doc 09 §13).
- Memo cached per run; idempotent generation.
- `ai_invocations.cost_micros` for actuals; daily budget alarm; kill switch.
- Smallest adequate model, selected via the evaluation set (cost/quality table).
- PDF rendered once and stored (or regenerated with limits).
- Billing alerts on hosting and DB; no always-on workers pre-trigger.
- Avoid paid monitoring until volume justifies.
- Concierge phase before automation (H-2) limits sunk cost.

## 6. Cost risks

RISK-017 (AI cost overrun), RISK-018 (free-tier limits invalidate architecture), RISK-019 (fees erode margin at low price points) — see doc 19.

## 7. Required follow-ups before approval of any budget

1. Look up and date-stamp: PayPal fee schedule, chosen host/DB/AI tiers.
2. Measure tokens per memo using the evaluation set.
3. Decide OQ-004 (free vs paid boundaries).
4. Decide whether to run S-0 first (OQ-008).
