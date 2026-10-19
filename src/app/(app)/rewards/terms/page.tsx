import Link from "next/link";
import { ArrowLeft } from "lucide-react";

/**
 * /rewards/terms - the StrivUp reward rules.
 *
 * Public on purpose, and exempted from the auth gate in src/proxy.ts: someone
 * deciding whether to take part has to be able to read the rules first, and
 * the Play listing links here directly.
 *
 * Two things this page deliberately does not do. It does not claim StrivUp is
 * compliant with any particular law: that is a question for a qualified
 * adviser and for the per campaign compliance review, not for a page of app
 * copy. And it does not promise that cash rewards are running, because
 * whether any given campaign can pay cash depends on that review.
 *
 * LAST_REVIEWED is shown to the reader, so update it when the text changes.
 * Per campaign rules are versioned separately in campaign_rules_versions and
 * the version a person accepted is recorded in terms_acceptances.
 */

const LAST_REVIEWED = "15 October 2026";

export const metadata = {
  title: "Reward terms and conditions",
  description:
    "How rewards are awarded, claimed and paid on StrivUp, and the rules that apply to them.",
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="text-body-lg font-bold tracking-[-0.01em] text-on-surface">{title}</h2>
      <div className="space-y-2 text-body-md leading-relaxed text-on-surface-variant">
        {children}
      </div>
    </section>
  );
}

export default function RewardTermsPage() {
  return (
    <div className="min-h-screen bg-surface pb-24">
      <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-outline-variant bg-surface-container-lowest px-5 py-4">
        <Link href="/rewards" aria-label="Back to my rewards">
          <ArrowLeft className="h-5 w-5 text-on-surface-variant" />
        </Link>
        <h1 className="flex-1 text-body-lg font-bold tracking-[-0.01em] text-on-surface">
          Reward terms
        </h1>
      </header>

      <main className="mx-auto measure-page space-y-6 px-5 py-6">
        <p className="text-body-sm text-on-surface-variant">
          Last reviewed {LAST_REVIEWED}.
        </p>

        <Section title="1. What these terms cover">
          <p>
            These terms apply to every reward offered through StrivUp: cash prizes,
            partner coupons and badges. Each individual challenge or quest may also
            publish its own rules, including who can take part, what counts as
            completion and what the reward is. Where a campaign rule and these terms
            differ, the campaign rule applies to that campaign.
          </p>
          <p>
            The rules you accepted for a campaign are recorded with a version number,
            so the rules that apply to a reward are the ones that were in force when
            you took part.
          </p>
        </Section>

        <Section title="2. The three kinds of reward">
          <p>
            <strong className="font-semibold text-on-surface">Badges</strong> are
            recognition inside the app. They have no monetary value, cannot be sold,
            transferred or exchanged for money, and are not a prize.
          </p>
          <p>
            <strong className="font-semibold text-on-surface">Coupons</strong> are
            offers issued by a partner business. The business sets the offer, its
            validity period and its own conditions, and the business decides whether a
            redemption is accepted. A coupon has no cash value and is not exchangeable
            for money.
          </p>
          <p>
            <strong className="font-semibold text-on-surface">Cash rewards</strong> are
            paid in Indian rupees to a UPI ID you provide. A campaign can only offer a
            cash reward after it has passed StrivUp internal compliance review. Until a
            campaign has passed that review, no cash reward can be awarded under it,
            whatever a listing or a post may say.
          </p>
        </Section>

        <Section title="3. How a reward is awarded">
          <p>
            Completing a challenge or quest does not by itself award a reward. Every
            reward is allocated after review of the submitted proof against the
            campaign rules, and the review can decide that an entry does not qualify.
          </p>
          <p>
            A reward you can see in My Rewards shows its current status, and that
            status is what decides whether anything is payable. Nothing is owed to you
            while a reward is under review.
          </p>
          <p>
            StrivUp does not guarantee a date by which a review, an approval or a
            payment will happen.
          </p>
        </Section>

        <Section title="4. Claiming a cash reward">
          <p>
            An approved cash reward has to be claimed before it can be paid. The claim
            step asks for the UPI ID you want the money sent to. We ask for it at claim
            time and not before, because there is no reason to hold payment details for
            people who have not been awarded anything.
          </p>
          <p>
            <strong className="font-semibold text-on-surface">
              StrivUp will never ask for your UPI PIN, a one time password, your
              banking password, a card number or any other payment authorisation
              secret.
            </strong>{" "}
            Nobody from StrivUp will ask for them by phone, email, chat or any other
            route. If someone does, it is not us.
          </p>
          <p>
            The UPI ID you give must be one you are entitled to use. Payment to the UPI
            ID you provide discharges the reward.
          </p>
          <p>
            A payment that fails is shown as failed and the reward stays yours. An
            incorrect UPI ID is the most common cause.
          </p>
        </Section>

        <Section title="5. Eligibility">
          <p>
            You must be at least 18 years old, resident in India, and using one account
            that is genuinely yours. Employees of StrivUp and of the partner business
            running a campaign, and their immediate families, are not eligible for cash
            rewards from that campaign.
          </p>
          <p>
            Individual campaigns may narrow eligibility further, for example by city or
            by a limit on entries per person.
          </p>
        </Section>

        <Section title="6. Disqualification">
          <p>
            A reward can be withheld, reduced or withdrawn, and an account can be
            restricted, where there is evidence of fake or reused proof, more than one
            account being used by the same person, automation, tampering with the app or
            its data, or any other attempt to obtain a reward that was not earned.
          </p>
          <p>
            Where a reward is not approved or is withdrawn, the reason recorded is shown
            to you on the reward.
          </p>
        </Section>

        <Section title="7. Taxes">
          <p>
            A cash reward may be taxable in your hands, and tax may be required to be
            deducted at source before payment. Where deduction applies, the amount you
            receive is the amount after deduction. You are responsible for your own tax
            position and for reporting the reward where you are required to.
          </p>
          <p>
            StrivUp cannot give tax advice. If the amount matters to you, speak to a
            qualified adviser.
          </p>
        </Section>

        <Section title="8. Changes and withdrawal">
          <p>
            A campaign can be paused, changed or withdrawn, including for legal or
            regulatory reasons. Where that happens after a reward has already been
            approved for you, the approved reward is honoured under the rules it was
            approved under.
          </p>
          <p>
            These terms can be updated. The date at the top of this page is when the
            text was last reviewed.
          </p>
        </Section>

        <Section title="9. Your data">
          <p>
            A UPI ID collected at claim time is used to pay that reward and to keep the
            payment record required for accounting and dispute handling. It is not used
            for advertising and is not sold.
          </p>
          <p>
            See the{" "}
            <Link href="/privacy" className="font-semibold text-secondary hover:underline">
              privacy policy
            </Link>{" "}
            for how StrivUp handles your data generally.
          </p>
        </Section>

        <Section title="10. Questions and disputes">
          <p>
            If you think a reward decision is wrong, raise it with us at{" "}
            <a
              href="mailto:strivup.officialteam@gmail.com"
              className="font-semibold text-secondary hover:underline"
            >
              strivup.officialteam@gmail.com
            </a>{" "}
            and include the reward you are asking about. Tell us what you expected and
            what you saw.
          </p>
        </Section>
      </main>
    </div>
  );
}
