/**
 * The privacy policy text, in one place.
 *
 * Two routes render it: /privacy, which is public, and
 * /settings/privacy-policy, which is inside the app shell. Play Console
 * requires a privacy policy URL that is reachable without signing in, and
 * /settings/* is behind the auth guard in proxy.ts, so the public route is not
 * optional. Keeping one array means the two can never drift.
 */

export const SUPPORT_EMAIL = "strivup.officialteam@gmail.com";

export const PRIVACY_EFFECTIVE = "September 2026";

export interface PolicySection {
  title: string;
  body: string;
}

export const PRIVACY_SECTIONS: PolicySection[] = [
  {
    title: "1. Information We Collect",
    body: "We collect information you provide when you create an account, complete your profile, join challenges, upload content, or contact us. This includes your name, email address, phone number, age, gender, interests, profile photo, social links, and any content you submit as challenge proof. We also collect usage data about how you interact with the platform.",
  },
  {
    title: "2. How We Use Your Information",
    body: "We use your data to provide and improve STRIVUP services; personalise your feed and recommend relevant challenges and quests based on your interests; send you notifications about account activity; ensure platform security and integrity; and comply with legal obligations. We do not sell your personal data.",
  },
  {
    title: "3. Sharing of Information",
    body: "Your public profile (name, username, avatar, bio, social links) is visible to other STRIVUP users. If your account is set to Private, only your approved followers can view your profile and content. We may share data with service providers who help us operate the platform, subject to strict confidentiality agreements.",
  },
  {
    title: "4. Interests & Personalisation",
    body: "The interests you select are stored and used to personalise your challenge and quest recommendations. This data is used only within STRIVUP for personalisation purposes and is not shared with advertisers or third-party marketers.",
  },
  {
    title: "5. Data Storage & Security",
    body: "Your data is stored securely using Supabase infrastructure with Row Level Security (RLS) policies ensuring users can only access their own private data. We use industry-standard encryption for data in transit and at rest. Profile photos are stored in secure cloud buckets restricted to the account owner.",
  },
  {
    title: "6. Your Rights",
    body: "You may access, update, or delete your personal information at any time through Account Settings. You can deactivate your account to temporarily hide your profile while keeping your data intact. For permanent removal, use the Delete Account option. Requests are processed in accordance with applicable law.",
  },
  {
    title: "7. Cookies & Analytics",
    body: "STRIVUP uses session cookies to maintain your login state. We may use aggregated, anonymised analytics to understand platform usage and improve the product. No individual users are identified through our analytics processes.",
  },
  {
    title: "8. Children's Privacy",
    body: "STRIVUP is not intended for users under the age of 13. We do not knowingly collect personal information from children under 13. If we become aware of such data, we will take immediate steps to delete it.",
  },
  {
    title: "9. Changes to This Policy",
    body: "We may update this Privacy Policy from time to time. Significant changes will be notified by updating the effective date and, where appropriate, through in-app notifications. Continued use of STRIVUP after changes constitutes acceptance of the updated policy.",
  },
  {
    title: "10. Contact",
    body: `For privacy-related questions or requests, please contact us at ${SUPPORT_EMAIL}. We aim to respond to all privacy enquiries within 48 hours.`,
  },
];
