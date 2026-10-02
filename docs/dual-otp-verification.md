# Dual OTP order verification

How STRIVUP proves that a participant really ordered from a business, when
STRIVUP has no integration with the ordering platform.

Two codes travel by hand. The first rides in the order instructions the
participant types. The second is written on the printed bill by the business.
Neither can be produced by the side that benefits from it.

## Roles

| Side | Can do |
|---|---|
| Participant | Request code 1, redeem code 2 |
| Business | See the request, verify or reject it, receive code 2 |
| STRIVUP | Issue both codes, hold all state |

## Workflow

```
PARTICIPANT                      STRIVUP                        BUSINESS
     |                              |                              |
 1.  | taps Upload Proof            |                              |
     |----------------------------->|                              |
     |            issue_quest_order_code()                         |
     |         one active code per user/task/IST day               |
     |<-----------------------------|                              |
     |   code 1 (SV1612)            |                              |
     |                              |                              |
 2.  | types SV1612 into the order instructions on Zomato/Swiggy   |
     |------------------------------------------------------------>|
     |                              |        order arrives          |
     |                              |                              |
 3.  |                              |   business_lookup_order_detail()
     |                              |<-----------------------------|
     |                              |  profile + quest progress     |
     |                              |----------------------------->|
     |                              |                              |
 4a. |                              |   business_verify_order_code()
     |                              |<-----------------------------|
     |                              |  code 1 consumed, code 2 minted
     |                              |----------------------------->|
     |                              |   code 2 (SV7426)             |
     |                              |                              |
 4b. |                              |   business_reject_order_code()
     |                              |<-----------------------------|
     |                              |  cancelled, daily slot freed  |
     |                              |                              |
 5.  |          code 2 written on the printed bill                  |
     |<------------------------------------------------------------|
     |                              |                              |
 6.  | enters SV7426                |                              |
     |----------------------------->|                              |
     |         complete_task_with_bill_code()                      |
     |   submission approved, quest progress updated               |
     |<-----------------------------|                              |
```

## Database

One table holds the whole state machine: `quest_order_verifications`.

| Column | Purpose |
|---|---|
| `order_code` | Code 1, shown to the participant |
| `bill_code` | Code 2, minted only on verification |
| `status` | `code_issued`, `order_verified`, `completed`, `expired`, `cancelled` |
| `issued_on` | IST calendar day, drives the daily limit |
| `expires_at` | 24 hours from issue |
| `bill_code_attempts` | Counts wrong code 2 guesses |
| `order_verified_by` | Which business account verified |

Two partial unique indexes carry the rules that matter:

- `qov_one_active_per_day` on `(user_id, quest_id, task_id, issued_on)` where
  status is live. One active code per user, per task, per day.
- `qov_active_order_code` on `(order_code)` where status is live. A live code
  is unambiguous, so searching on it alone is safe.

## Functions

All are `SECURITY DEFINER` and re-check the caller.

| Function | Caller | Does |
|---|---|---|
| `issue_quest_order_code(quest, task, platform)` | Participant | Returns today's code, or mints one. Idempotent. |
| `business_lookup_order_detail(code)` | Business | Read only. Code plus participant profile. |
| `business_verify_order_code(code, platform)` | Business | Consumes code 1, mints code 2. Idempotent. |
| `business_reject_order_code(code, reason)` | Business | Cancels, frees the daily slot. |
| `complete_task_with_bill_code(quest, task, code)` | Participant | Checks code 2, approves the submission. |

## What the business sees about the participant

Public identity and progress on this quest only:

- Name, username, avatar, member since
- Tasks completed on this quest, out of the total
- Verified orders on this quest
- When they joined this quest

Deliberately excluded: email, phone, and any activity on another business's
quest. Enough to judge whether an order is genuine, not a profile dossier.

## Upload Proof interface

Both OTP sections are on one screen, so the whole journey is legible at a
glance rather than appearing one step at a time.

1. **Your STRIVUP order code** (generated). Large, selectable, with a copy
   button and instructions to paste it into the order description.
2. **Bill verification code** (entered by the participant). Visible from the
   start but disabled, labelled `Awaiting business`, and unlocked only once
   status reaches `order_verified`.

## Security

**No client writes.** `quest_order_verifications` has SELECT policies only. The
daily limit and the code 2 comparison are only trustworthy server side, so
PostgREST refuses direct inserts and updates. Every transition goes through a
definer function.

**Code 2 is never readable early.** It is null until the business verifies.
A participant polling their own row before verification sees nothing to enter.

**Cross-business isolation.** Lookup, verify and reject all join through
`quests.creator_id = auth.uid()`. A business searching another business's code
gets zero rows, not a permission error, so codes cannot be probed for
existence. Verified by test.

**Cross-user isolation.** `complete_task_with_bill_code` matches on
`user_id = auth.uid()`. Code 2 cannot be redeemed by whoever happens to see
the bill.

**Brute force.** `bill_code_attempts` increments on every wrong guess and locks
at 8, after which the business must re-verify. The code space is 10,000, so
without the cap a wrong guess would eventually land.

**Replay.** Codes are consumed by status transition, not deleted. A completed
row can never return to `order_verified`, so code 2 works exactly once.

**Rejection is not deletion.** A rejected code becomes `cancelled` and frees
the daily slot, so a participant rejected in error is not locked out until
tomorrow. An already verified order cannot be rejected: its bill code may
already be written on a bill.

**No platform integration.** STRIVUP never talks to Zomato or Swiggy. The
stored `order_platforms` entries are labels and outbound links only.

## Known limitations

- Codes are stored in plain text. They are short lived, single use and scoped
  to one quest and task, but a database reader can see a live code. Hashing
  would cost the business the ability to search by code, which is the whole
  counter workflow.
- The daily limit is per task, not per business. Somebody on three tasks of the
  same quest can hold three live codes in a day.
- Expiry is checked on read, not by a scheduled job. A row can sit past
  `expires_at` until something touches it.
