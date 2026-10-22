/**
 * src/lib/i18n/businessStrings.ts
 *
 * Business-side copy in English and Hindi.
 *
 * English is the source of truth: its object defines the key set, and the
 * Hindi table is a Partial of it. A key Hindi has not been given yet falls
 * back to the English sentence rather than rendering the key, so a partial
 * translation reads as mixed language instead of as broken UI. That is also
 * what makes this safe to extend: adding an English string never breaks the
 * Hindi build.
 *
 * Numerals are left as Latin digits in Hindi. Devanagari digits are correct
 * but unfamiliar on a dashboard, and the owner asked for a language toggle,
 * not a numeral system.
 */

export const EN = {
  /* Chrome */
  "brand.tagline": "India's Platform for Growth",
  "nav.search": "Search",
  "nav.alerts": "Alerts",
  "nav.menu": "Open menu",
  "nav.close": "Close menu",
  "nav.yourProfile": "Your profile",
  "lang.label": "Language",
  "lang.english": "English",
  "lang.hindi": "हिंदी",

  /* Profile header */
  "biz.yourBusiness": "Your Business",
  "biz.editProfile": "Edit Profile",
  "biz.verifyParticipants": "Verify Participants",
  "biz.verified": "Verified business",
  "biz.businessVerification": "Business Verification",
  "biz.verifyNow": "Verify now →",

  /* Status badges */
  "status.verified": "Verified",
  "status.underReview": "Under Review",
  "status.needsInfo": "Needs Info",
  "status.notVerified": "Not Verified",
  "status.rejected": "Rejected",
  "status.suspended": "Suspended",

  /* Stat tiles */
  "stat.customers": "Customers",
  "stat.challenges": "Challenges",
  "stat.participants": "Participants",
  "stat.orders": "No. of Orders",
  "stat.totalQuests": "Total Quests",
  "stat.active": "Active",
  "stat.pendingProof": "Pending Proof",

  /* Rejection banner */
  "reject.title": "Verification Rejected",
  "reject.fallback": "Your verification was rejected.",
  "reject.resubmit": "Resubmit",

  /* Quick actions */
  "action.createQuest": "Create Quest",
  "action.myQuests": "My Quests →",
  "action.createChallenge": "Create Challenge",
  "action.myChallenges": "My Challenges →",

  /* Campaigns */
  "camp.heading": "Your Active Campaigns",
  "camp.viewAll": "View all",
  "camp.emptyTitle": "No active Quests yet",
  "camp.emptyBody": "Create your first Quest to start attracting participants.",
  "camp.participants": "Participants",
  "camp.active": "Active",

  /* Tools */
  "tools.heading": "Business Tools",
  "tools.sub": "Manage your challenges, verify participants and track your impact on STRIVUP.",
  "tools.verification": "Verification",
  "tools.verificationDesc": "Verify participant activities and business visits.",
  "tools.verifyCta": "Verify Participant →",
  "tools.history": "Verification History",
  "tools.historyDesc": "View all past verifications.",
  "tools.viewAll": "View all",
  "tools.pending": "Pending Requests",
  "tools.pendingDesc": "Verification requests waiting for your approval.",
  "tools.reviewNow": "Review now",
  "tools.how": "How Verification Works",
  "tools.howDesc": "Learn the step-by-step verification process.",
  "tools.learnMore": "Learn more",
  "tools.proofs": "Proofs",
  "tools.analytics": "Analytics",
  "tools.rewards": "Rewards",
  "tools.promote": "Promote",

  /* Recent activity */
  "recent.heading": "Recent Activity",
  "recent.completed": "completed a verification",
  "recent.requested": "requested verification",
  "recent.unknown": "Unknown",
  "recent.pending": "Pending",
  "recent.expired": "Expired",

  /* Time */
  "time.justNow": "just now",
  "time.minute": "minute",
  "time.minutes": "minutes",
  "time.hour": "hour",
  "time.hours": "hours",
  "time.day": "day",
  "time.days": "days",
  "time.ago": "ago",

  /* My Challenges (business) */
  "mych.title": "My Challenges",
  "mych.sub": "Challenges your business runs.",
  "mych.emptyTitle": "No challenges yet",
  "mych.emptyBody": "Create a challenge to bring participants to your business.",
  "mych.joined": "joined",
  "mych.manage": "Manage",
  "mych.back": "Back",

  /* Order verification console */
  "ov.title": "Verify Participants",
  "ov.searchHeading": "Search order code",
  "ov.searchSub": "Type any part of the code. Matching open orders appear as you type.",
  "ov.placeholder": "SV____",
  "ov.search": "Search",
  "ov.searching": "Searching…",
  "ov.refresh": "Refresh",
  "ov.openHeading": "Open verifications",
  "ov.openSub": "Codes issued to participants that are not closed yet.",
  "ov.nothingWaiting": "Nothing waiting right now.",
  "ov.noMatch": "No open order matches those digits.",
  "ov.matchCount": "matching",
  "ov.open": "Open",
  "ov.participant": "Participant",
  "ov.enterCode": "Enter the STRIVUP code from the order.",
} as const;

export type StringKey = keyof typeof EN;

export const HI: Partial<Record<StringKey, string>> = {
  "brand.tagline": "भारत का ग्रोथ प्लैटफ़ॉर्म",
  "nav.search": "खोजें",
  "nav.alerts": "सूचनाएँ",
  "nav.menu": "मेनू खोलें",
  "nav.close": "मेनू बंद करें",
  "nav.yourProfile": "आपकी प्रोफ़ाइल",
  "lang.label": "भाषा",
  "lang.english": "English",
  "lang.hindi": "हिंदी",

  "biz.yourBusiness": "आपका व्यापार",
  "biz.editProfile": "प्रोफ़ाइल बदलें",
  "biz.verifyParticipants": "प्रतिभागी सत्यापित करें",
  "biz.verified": "सत्यापित व्यापार",
  "biz.businessVerification": "व्यापार सत्यापन",
  "biz.verifyNow": "अभी सत्यापित करें →",

  "status.verified": "सत्यापित",
  "status.underReview": "समीक्षा में",
  "status.needsInfo": "जानकारी चाहिए",
  "status.notVerified": "असत्यापित",
  "status.rejected": "अस्वीकृत",
  "status.suspended": "निलंबित",

  "stat.customers": "ग्राहक",
  "stat.challenges": "चैलेंज",
  "stat.participants": "प्रतिभागी",
  "stat.orders": "ऑर्डर की संख्या",
  "stat.totalQuests": "कुल क्वेस्ट",
  "stat.active": "सक्रिय",
  "stat.pendingProof": "प्रूफ़ बाक़ी",

  "reject.title": "सत्यापन अस्वीकृत",
  "reject.fallback": "आपका सत्यापन अस्वीकार कर दिया गया।",
  "reject.resubmit": "फिर से भेजें",

  "action.createQuest": "क्वेस्ट बनाएँ",
  "action.myQuests": "मेरे क्वेस्ट →",
  "action.createChallenge": "चैलेंज बनाएँ",
  "action.myChallenges": "मेरे चैलेंज →",

  "camp.heading": "आपके चालू कैम्पेन",
  "camp.viewAll": "सभी देखें",
  "camp.emptyTitle": "अभी कोई सक्रिय क्वेस्ट नहीं",
  "camp.emptyBody": "प्रतिभागी जोड़ने के लिए अपना पहला क्वेस्ट बनाएँ।",
  "camp.participants": "प्रतिभागी",
  "camp.active": "सक्रिय",

  "tools.heading": "व्यापार टूल",
  "tools.sub": "अपने चैलेंज चलाएँ, प्रतिभागियों को सत्यापित करें और STRIVUP पर अपना असर देखें।",
  "tools.verification": "सत्यापन",
  "tools.verificationDesc": "प्रतिभागियों की गतिविधि और दुकान पर आना सत्यापित करें।",
  "tools.verifyCta": "प्रतिभागी सत्यापित करें →",
  "tools.history": "सत्यापन इतिहास",
  "tools.historyDesc": "पिछले सभी सत्यापन देखें।",
  "tools.viewAll": "सभी देखें",
  "tools.pending": "बाक़ी अनुरोध",
  "tools.pendingDesc": "आपकी मंज़ूरी के इंतज़ार में सत्यापन अनुरोध।",
  "tools.reviewNow": "अभी देखें",
  "tools.how": "सत्यापन कैसे होता है",
  "tools.howDesc": "सत्यापन की पूरी प्रक्रिया समझें।",
  "tools.learnMore": "और जानें",
  "tools.proofs": "प्रूफ़",
  "tools.analytics": "एनालिटिक्स",
  "tools.rewards": "रिवॉर्ड",
  "tools.promote": "प्रचार",

  "recent.heading": "हाल की गतिविधि",
  "recent.completed": "ने सत्यापन पूरा किया",
  "recent.requested": "ने सत्यापन का अनुरोध किया",
  "recent.unknown": "अज्ञात",
  "recent.pending": "बाक़ी",
  "recent.expired": "समय समाप्त",

  "time.justNow": "अभी",
  "time.minute": "मिनट",
  "time.minutes": "मिनट",
  "time.hour": "घंटा",
  "time.hours": "घंटे",
  "time.day": "दिन",
  "time.days": "दिन",
  "time.ago": "पहले",

  "mych.title": "मेरे चैलेंज",
  "mych.sub": "आपके व्यापार के चैलेंज।",
  "mych.emptyTitle": "अभी कोई चैलेंज नहीं",
  "mych.emptyBody": "अपने व्यापार पर प्रतिभागी लाने के लिए चैलेंज बनाएँ।",
  "mych.joined": "ने जॉइन किया",
  "mych.manage": "प्रबंधित करें",
  "mych.back": "वापस",

  "ov.title": "प्रतिभागी सत्यापित करें",
  "ov.searchHeading": "ऑर्डर कोड खोजें",
  "ov.searchSub": "कोड का कोई भी हिस्सा टाइप करें। मिलते हुए खुले ऑर्डर साथ-साथ दिखेंगे।",
  "ov.placeholder": "SV____",
  "ov.search": "खोजें",
  "ov.searching": "खोज रहे हैं…",
  "ov.refresh": "रिफ़्रेश",
  "ov.openHeading": "खुले सत्यापन",
  "ov.openSub": "प्रतिभागियों को दिए गए कोड जो अभी बंद नहीं हुए।",
  "ov.nothingWaiting": "अभी कुछ बाक़ी नहीं है।",
  "ov.noMatch": "इन अंकों से कोई खुला ऑर्डर नहीं मिला।",
  "ov.matchCount": "मिले",
  "ov.open": "खोलें",
  "ov.participant": "प्रतिभागी",
  "ov.enterCode": "ऑर्डर पर लिखा STRIVUP कोड डालें।",
};
