/**
 * src/lib/strivy/intents.ts
 *
 * Deterministic, transparent intent detection. No model is involved.
 *
 * Each rule is a named regex with a weight. A message's score for an intent is
 * the sum of the weights of that intent's matching rules; the highest score
 * wins and ties go to the intent listed first in PRIORITY. The result carries
 * the names of the rules that matched, so any routing decision can be traced.
 *
 * Two special cases run outside the scoring:
 *  - crisis: messages suggesting self-harm always get the safety reply.
 *  - follow-ups: a short "why?" / "and yesterday?" with no match of its own
 *    reuses the intent of Strivy's previous reply.
 */
import type { ChatTurn, IntentResult, StrivyDetail, StrivyIntent, StrivyTopic } from "./types";

interface Rule {
  name: string;
  intent: StrivyIntent;
  pattern: RegExp;
  weight: number;
}

const CRISIS =
  /\b(kill myself|killing myself|end my life|want to die|wanna die|suicid(e|al)|self[- ]?harm|hurt myself|no reason to live)\b/;

const QUEST_WORD = /\b(quests?|kwest)\b|क्वेस्ट/;
const CHALLENGE_WORD = /\bchallenges?\b|चैलेंज|चुनौती/;

/**
 * "How far along": progress words plus "how many tasks are left". With a
 * quest or challenge named, the answer is about that one thing.
 */
const PROGRESS_DETAIL =
  /\b(progress|how am i doing|how im doing|how far|kitna (hua|ho gaya|hogaya)|kitni progress|kahan tak|how many tasks|tasks? (left|remaining|bache|baaki|baki)|(kitne|kitna) tasks? (bache|baaki|baki|hue|hua|left)|tasks? done)\b|प्रगति|प्रोग्रेस|कितना हुआ|कितना हो गया|केतना भइल|केतना भईल|कितने टास्क/;

/**
 * "What's still to do": tasks left, "kya bacha hai?". Checked before
 * PROGRESS_DETAIL; with a quest in view it is that quest's progress.
 */
const REMAINING_DETAIL =
  /\b(how many tasks|tasks? (left|remaining|bache|bachi|baaki|baki)|(kitne|kitna|kitni) (tasks? |kaam )?(left|bacha|bache|bachi|baaki|baki)|(kya|kuch|what|whats|anything) (tasks? )?(bacha|bache|baaki|baki|left)|whats left|what is left)\b|कितने टास्क|क्या बचा|कितना बचा|कितने बचे|का बाचल|केतना बाचल|का बाकी/;

/** "Since when?" about a streak. */
const SINCE =
  /^(since when|kab se|kabse|from when|how long)\b|\b(since when|kab se|kabse)\b|कब से|कहिया से|कब ले से/;

/** A bare "how much?" / "kitna?" that only makes sense after a previous reply. */
const QUANTITY_FOLLOW_UP =
  /^(and )?(how much|how many|kitna|kitne|kitni|kitna hua|kitna mila|aur kitna|केतना|कितना|कितने)\??$/;

/** "Explain that in detail": a longer answer about whatever came before. */
const DETAIL_ASK =
  /\b(details?|detail me|detail mein|in detail|samjha|samjhao|samjhaao|elaborate|explain (more|that|it)|aur bata|poora bata|pura bata)\b|विस्तार|समझा|समझाओ|बिस्तार से/;

/** "How long is left": days, time, the end date. */
const DEADLINE_DETAIL =
  /\bhow (much|many) (time|days?|hours?)\b|\b(days?|time|hours?) (left|remaining)\b|\bdeadline\b|\bwhen does .{0,40}\bend\b|\bends? when\b|\bkitne din\b|\bkitna (time|samay|waqt)\b|\bkab tak\b|\bkab (khatam|end)\b|कितने दिन|केतना दिन|कब तक|कब ले|कितना समय|कितना टाइम/;

/**
 * Profanity or an insult aimed at Strivy ("bkl", "tu chutiya hai", "tu bekaar
 * hai", "you're useless"). Never matched for self-talk ("main bekaar hoon"):
 * that is a low moment (general-mood), not banter.
 */
const BANTER =
  /\b(bkl|bkc|bsdk|bsdke|bhosdi\w*|bhosad\w*|bhosd\w*|chutiy\w*|chutya|chutia|lund|lauda|lavda|lawda|gandu|gaandu|madarchod|maderchod|behenchod|bhenchod|behnchod|fuck\w*|fck|stfu|bitch|bastard|asshole|dumbass)\b|(^|\b(tu|abe|oye|bhai|strivy)\s)(mc|bc)\b|\b(tu|tum|tu toh|tu to|you|u|ur|youre|you are|strivy|bot|ye bot|yeh bot)(\s+\w+){0,3}\s+(bekaar|bekar|bakwas|bakwaas|useless|stupid|dumb|idiot|pagal|paagal|chomu|nalla|nikamma|ghatiya|bewakoof|bevkoof|bewkoof|faltu|trash|garbage|kamina|kameena|gadha|ullu|bot hai|noob)\b|\b(bekaar|bakwas|useless|stupid|dumb|ghatiya|faltu) (bot|ai|app|strivy)\b|चूतिय|लंड|भोसड|मादरचोद|बहनचोद|तू बेकार/;

/**
 * "How do I finish it?", "isko complete kaise karu?", "what do I do next?":
 * how to complete the thing in view (a named quest, or the previous answer's).
 */
const COMPLETE_ASK =
  /\b(complete|finish|khatam|khatm|pura|poora|puri|poori|done|nipta\w*)\b.{0,24}\b(kaise|kese|kaisey|kaisay|how|kaise hoga|kaise hogi)\b|\b(kaise|kese|kaisey|how (do|can|should|to)( i| we)?|how to)\b.{0,24}\b(complete|finish|khatam|khatm|pura|poora|puri|poori|nipta\w*|done|get (it|this|that) done)\b|\b(what (do|should|can) i do next|whats next|what next|next step|aage kya|ab kya (karu|karun|kru|karna hai|karna h))\b|पूरा कैसे|कैसे पूरा|कइसे पूरा|पूरा कइसे|कैसे खत्म/;

/** "isko", "ye wala", "this", "it": a pointer to whatever came before. */
const REFERENCE =
  /\b(isko|isse|ise|isey|iska|iski|iske|isme|ismein|usko|use|uska|ye|yeh|ye wala|yeh wala|wo|woh|this|it|that|ehke|eke|ekra|ee)\b|इसको|इसे|इसका|ये|यह|एकरा|एके|ई/;

/** A general-knowledge question or a sum: "who was Einstein?", "2+2?", "Modi ji kon hain?". */
const GENERAL_QUESTION =
  /^(who|whos|whose|what|whats|when|where|why|which|how (much|many|far|old|big|long|does|do|is|are|did|was)|is|are|was|were|can|could|does|do|did|tell me about|define|explain|kaun|kon)\b|\b(kaun|kon|kaun hai|kon hai|kon hain|kaun hain|kaun tha|kaun the|kya hai|kya hota|kya hoti|kya hote|kise kehte|kisko kehte|ka matlab|matlab kya|kab hua|kab tha|kahan hai|kaha hai|kyun hota|kyu hota|kaise hota|kaise bana|ke ha|ke hawe|ka hola|ka hoyela)\b|\?\s*$|कौन|क्या है|क्या होता|का होला|के हवे|के ह/;

/** Just a sum: "2+2?", "what is 12*3", "15 / 3 kitna hota hai". */
export const MATH_ONLY =
  /^(what is|whats|what s|calculate|solve|kitna hota hai|kitna hai)?\s*[-(]*\d+(?:\.\d+)?(?:\s*[-+*/x×÷^%]\s*[-(]*\d+(?:\.\d+)?\)*)+\s*(=|equals|kitna|kitna hota hai|kitna hai|kya hai|hota hai)?\s*\??$/;

/* ── STRIVUP the company: founders, team, who built it ────────────────── */

/** Founder and leadership words: always about a company. */
const FOUNDER_WORDS =
  /\b(co ?-?founders?|cofounders?|founders?|founded|founding team|ceo|cto|cmo|coo|cfo|leadership team|management team)\b|संस्थापक|सह-संस्थापक|को-फाउंडर|को फाउंडर|फाउंडर|फ़ाउंडर|सीईओ|सीटीओ/;

/** The message is about STRIVUP (or Strivy, or "you") itself. */
const OWN_COMPANY =
  /\b(strivup|strive ?up|striv ?up|strivy|this app|ye app|yeh app|is app|iss app|the app|this company|ye company|is company|the company|company|your|ur|tumhare|tumhari|tumhara|aapke|aapki|aapka|apke|apki|apka|tere|teri|tera|you|tum|tumhe|tumko|aap)\b|स्ट्रिवअप|स्ट्राइवअप|स्ट्रिवप|स्ट्राइवी|स्ट्रिवी/;

/**
 * Another named subject: "founder of Google", "Tesla ka CEO". Then it is a
 * general-knowledge question, not one about STRIVUP.
 */
const OTHER_SUBJECT =
  /\b(of|at|for)\s+(?!strivup|strive|striv|strivy|this|the app|the company|your|ur|you)[a-z]{2,}|\b(?!strivup|strivy|app|company|tumhare|tumhari|aapke|apke|aapki|apki|tere|teri|iske|uske|unke)([a-z]{3,})\s+(k|ka|ke|ki)\s+(co ?-?founders?|cofounders?|founders?|ceo|cto|cmo|coo|cfo|owner|malik)\b/;

/** Who made it, who owns it, who works on it. Needs OWN_COMPANY. */
const MADE_OR_RUN =
  /\b(who (created|made|built|started|developed|designed|owns|runs|is behind|are behind|works on|work on)|(kisne|kis ne|kaun|kon) (banaya|banayi|bnaya|banai|create kiya|create kia|start kiya|shuru kiya|chalata|chalate|develop kiya)|(banaya|bnaya|banayi|banai|create kiya|start kiya|shuru kiya) (kisne|kis ne|kaun|kon)|(created|made|built|started|founded) by|owners?|malik|maalik|team members?|(strivup|company|app|strivy) (ki |ka |ke |k )?team|people behind|log (kaun|kon))\b|किसने बनाया|किसने शुरू|किसके|मालिक|टीम/;

/** "team me kaun kaun hai?": the team, with or without saying STRIVUP. */
const TEAM_WHO =
  /\bteam (me|mein|main|mai|mei|m) (kaun|kon|kaun kaun|kon kon|who)\b|\b(who|kaun|kon)( all| kaun| kon)? (is|are|hai|hain|h)? ?(in|on) (the |your |ur )?team\b|\bwho (is|are) (the |your |ur )?team\b|टीम (में|मे) कौन/;

/** A message that names a challenge or quest is about that, not the company. */
const ITEM_WORD = /\b(challenges?|quests?|tasks?)\b|चैलेंज|क्वेस्ट|टास्क/;

/**
 * "bhai strivup k co founder kon h?", "who founded STRIVUP?", "team me kaun
 * kaun hai?": a question about STRIVUP the company. A founder word alone
 * ("founder kaun hai?") is read as STRIVUP's, since that's where the person
 * is asking; "founder of Google" is a general question instead.
 */
export function isCompanyQuestion(text: string): boolean {
  const own = OWN_COMPANY.test(text);
  if (FOUNDER_WORDS.test(text)) {
    if (/\bstrivup\b|स्ट्रिवअप|स्ट्राइवअप/.test(text)) return true;
    return !OTHER_SUBJECT.test(text) && !ITEM_WORD.test(text);
  }
  if (ITEM_WORD.test(text)) return false;
  if (TEAM_WHO.test(text)) return true;
  if (!own) return false;
  // "who made STRIVUP?", "strivy ko kisne banaya?", "who created you?"
  const subject =
    /\b(strivup|strive ?up|strivy|app|company|you|tumhe|tumko|aapko|apko|tujhe)\b|स्ट्रिवअप|स्ट्राइवअप|तुम्हें|आपको/;
  if (MADE_OR_RUN.test(text) && subject.test(text)) return true;
  return /\b(your|ur|tumhari|aapki|apki|teri) team\b/.test(text);
}

/** A short follow-up after a company answer: "unka naam?", "and the CEO?", "contact kaise karu?". */
const COMPANY_FOLLOW_UP =
  /\b(naam|name|names|unka|unke|unki|uska|uske|who|kaun|kon|team|log|people|members?|based|where|kahan|kaha|kab|when|start|started|contact|email|mail|baat|more|aur|and|also|batao|bata|bta|details?|kya|which|city|office|founded)\b|नाम|कौन|कहाँ|कब|और|टीम/;
const DATA_WORDS =
  /\b(streaks?|quests?|challenges?|proofs?|rewards?|progress|pending|today|aaj)\b|स्ट्रीक|क्वेस्ट|चैलेंज|प्रूफ/;

const RULES: Rule[] = [
  // Small talk
  {
    name: "greeting",
    intent: "greeting",
    weight: 3,
    pattern:
      /^(hi+|hey+|hello|yo|sup|hola|namaste|namaskar|pranam|ram ram|good (morning|afternoon|evening))\b|^(नमस्ते|नमस्कार|प्रणाम|राम राम)/,
  },
  {
    name: "thanks",
    intent: "thanks",
    weight: 3,
    pattern:
      /^(thanks|thank you|thx|ty|cheers|ok thanks|great thanks|nice thanks|shukriya|dhanyavaa?d|dhanyawaa?d|thanku)\b|^(धन्यवाद|शुक्रिया)/,
  },

  // About Strivy itself
  {
    name: "who-are-you",
    intent: "strivy_info",
    weight: 4,
    pattern:
      /\b(who are you|what are you|whats strivy|what is strivy|about strivy|are you (an? )?(ai|bot|robot|human|chatgpt|real)|(tum|tu|aap) kaun (ho|hai|hain|h)|kaun (ho|hai) (tum|tu|aap)|strivy kaun)\b|तुम कौन हो|आप कौन हैं|तू कौन है|रउआ के हईं|तू के हउअ/,
  },
  {
    name: "what-can-you-do",
    intent: "capabilities",
    weight: 5,
    pattern:
      /\b(what (all )?can you do|what do you do|how can you help|how do i use (you|strivy)|what can i ask|what are you for|kya kya (kar|kr) (sakte|skte|sakta|skta|sakti|skti) (ho|h|hai)|kya (kar|kr) (sakte|skte|sakta|skta) (ho|h|hai)|tum kya (karte|krte) (ho|h)|kis kaam ke ho)\b|^help\??$|क्या क्या कर सकते|क्या कर सकते हो|का का कर सके(लऽ|ल|ला)|का कर सकत बानी/,
  },

  // Small talk that isn't a greeting: "kya haal?", "bored hu", "tell me something".
  {
    name: "general-how-are-you",
    intent: "general_chat",
    weight: 3,
    pattern:
      /\b(kya haal|kya hal|kya haal chaal|kaise ho|kaisa hai|kaisi ho|kaise hain|how are you|how r u|hows it going|how is it going|whats up|wassup|wasup|whatsup|sup bro|kya chal raha|kya chal rha|sab badhiya|how was (your|ur) day|hows (your|ur) day|how is (your|ur) day|how are you doing|how you doing|kya (kar|kr) (raha|rha|rahi|rhi|rahe|rhe)|ka (ba |baa )?haal|ka hal|haal (ba|baa)|kaisan (ba|bani|baani|badu|baadu|bada|baada|baru)|ka karat (ba|baa|baadu|badu|bani))\b|क्या हाल|कैसे हो|कैसी हो|का हाल बा|का बा हाल|हाल बा|कइसन बानी|कइसे बानी|क्या कर रहा|क्या कर रही|क्या कर रहे|का करत बाड़/,
  },
  {
    // Feelings and moods: "aaj mood off hai", "feeling low", "udaas hu". A
    // casual statement, never a request for tasks or progress, so it outweighs
    // the bare "aaj"/"today" word. An explicit data ask in the same message
    // ("mood off hai, meri streak kitni hai?") still wins the tie.
    name: "general-mood",
    intent: "general_chat",
    weight: 3,
    pattern:
      /\b(mood( thoda| bilkul| bahut| kuch)? (off|kharab|kharaab|down|low|bad|theek nahi|thik nahi|sahi nahi|nahi hai|nhi hai|accha nahi|acha nahi|achha nahi)|(feeling|feel|i am|im|i m) (so |very |really |a bit |kinda |bit )?(sad|low|down|off|bad|upset|lonely|stressed|anxious|meh|blue)|(sad|udaas|udas|dukhi|upset|stressed|tension|pareshan|pareshaan) (hu|hoon|hun|hai|h|lag raha|ho gaya|feel)|dil nahi lag|man nahi lag|mann nahi lag|mood swing|bad day|(din|day) (bahut |bilkul |ekdum )?(kharab|kharaab|bekar|bura|bad|terrible)|(feel|feeling|i feel|im feeling) (so |very |really )?(terrible|awful|horrible|worst|empty|exhausted|overwhelmed|depressed|hopeless|useless|worthless)|(i am|im|i m|main|mai|mein) (so |bahut |bilkul |kitna )?(bekaar|bekar|useless|worthless|stupid|a failure|failure|loser|nikamma) ?(hoon|hun|hu|h|hai)?$|bura lag (raha|rha|rahi)|rona aa (raha|rha)|akela (feel|lag)|tension me|stress me|overthink)\b|मूड (ऑफ|खराब|ठीक नहीं)|उदास|दुखी|मन नहीं लग|मन ना लागत|दिन खराब|बुरा लग/,
  },
  {
    // Promises about later: "bhai kal se pakka start karunga", "from tomorrow".
    name: "general-promise",
    intent: "general_chat",
    weight: 3,
    pattern:
      /\b(kal se|kal sey|parso se|monday se|from tomorrow|starting tomorrow|from monday|(pakka|pakki|sure) (start|shuru)|(start|shuru) (karunga|karungi|karenge|karta hoon|karti hoon|kar dunga|kar dungi)|ill start|i will start|will start tomorrow|kal pakka)\b|कल से|काल्ह से|पक्का (शुरू|स्टार्ट)|शुरू करूँगा|शुरू करूंगा|शुरू करब/,
  },
  {
    name: "general-bored",
    intent: "general_chat",
    weight: 3,
    pattern: /\b(bored|bore (ho )?(raha|rahi|rha|rhi|hu|hoon|hun)|boring lag|timepass)\b|बोर/,
  },
  {
    // Jokes and banter: beats off_topic's "joke" so Strivy plays along.
    name: "general-fun",
    intent: "general_chat",
    weight: 5,
    pattern:
      /\b(jokes?|funny|make me laugh|roast me|roast kar|mazak|mazaak|majak|chutkula|chutkule|hasa (do|de|na)|hasao|hansa (do|de)|masti|kuch mast bol|random (answer|baat|funny))\b|चुटकुला|जोक|मज़ाक|मजाक|हँसा|हंसा/,
  },
  {
    name: "general-something",
    intent: "general_chat",
    weight: 3,
    pattern:
      /\b(tell me something|say something|talk to me|kuch bata|kuch bolo|kuch bol|kuch bhi (bol|bolo|bata)|baat kar|entertain me|lets chat|chat with me)\b|कुछ बताओ|कुछ बोलो|कुछो बताईं/,
  },

  {
    // Playful abuse or insults aimed at Strivy: a short, clean comeback roast.
    // Weighted below every data rule and below a low mood, so "bkl meri
    // streak bata" is answered and "main bekaar hoon" gets support instead.
    name: "banter",
    intent: "banter",
    weight: 2,
    pattern: BANTER,
  },
  // Things Strivy can't do from the chat: "complete my quest", "mark it done".
  {
    name: "action-request",
    intent: "action_request",
    weight: 5,
    pattern:
      /^(please |pls |plz )?(can you |could you |will you |just )?(complete|finish|mark|submit|upload|verify|approve|claim|redeem)\b.{0,30}\b(quests?|tasks?|proofs?|challenges?|rewards?|it|done)\b|\b(quests?|tasks?|proofs?|challenges?|rewards?) (complete|done|submit|verify|approve|claim|upload) (kar|kr) ?(do|de|dena|dijiye|dijie)\b|\bmark (it|this|that) (as )?done\b|(quest|task|proof|challenge|क्वेस्ट|टास्क) (को )?(पूरा|complete|submit|done) (कर दो|कर दीजिए|क द|कर द)/,
  },

  // Product concepts ("how does X work", "what is a quest")
  {
    name: "how-does-x-work",
    intent: "how_it_works",
    weight: 3,
    pattern: /\bhow (does|do|is|are) (?!i\b).{0,40}\b(work|calculated|counted|decided|verified)\b/,
  },
  {
    name: "what-is-concept",
    intent: "how_it_works",
    weight: 3,
    pattern:
      /\b(what is|what are|whats) (strivup|a quest|quests|a challenge|challenges|consistency|a streak|streaks|verification|proof)\b/,
  },
  {
    name: "difference",
    intent: "how_it_works",
    weight: 4,
    pattern: /\b(difference between|vs\.?|versus)\b.*\b(quest|challenge)/,
  },
  { name: "strivup-mention", intent: "how_it_works", weight: 1, pattern: /\bstrivup\b/ },
  {
    name: "explain",
    intent: "how_it_works",
    weight: 1,
    pattern: /\b(explain|help me understand)\b/,
  },

  // How-to questions about using the app
  {
    name: "how-do-i",
    intent: "help",
    weight: 3,
    pattern: /\bhow (do|can|should) i\b|\bhow to\b|\bwhere (do|can) i\b/,
  },
  { name: "can-i", intent: "help", weight: 2, pattern: /\bcan i\b/ },
  { name: "help-word", intent: "help", weight: 1, pattern: /\bhelp\b/ },

  // Creating things
  {
    name: "create",
    intent: "create",
    weight: 4,
    pattern: /\b(create|make|start|set ?up|build|new)\b.*\b(quest|challenge)s?\b/,
  },

  // Things STRIVUP doesn't have
  {
    name: "points",
    intent: "not_built",
    weight: 4,
    pattern: /\b(points?|xp|coins?|badges?|level ?up|levels?)\b/,
  },
  {
    name: "crews",
    intent: "not_built",
    weight: 4,
    pattern: /\b(crews?|accountability partners?|partners?|buddy|buddies)\b/,
  },
  { name: "marketplace", intent: "not_built", weight: 4, pattern: /\b(marketplace|shop|store)\b/ },
  {
    name: "subscriptions",
    intent: "not_built",
    weight: 4,
    pattern: /\b(subscri(be|ption)s?|premium|pro plan|pricing|paid plan)\b/,
  },

  // The person's own data
  {
    name: "proof-word",
    intent: "proof_status",
    weight: 2,
    pattern: /\b(proofs?|submission|submitted|uploaded)\b|प्रूफ|सबूत/,
  },
  {
    name: "verification-word",
    intent: "proof_status",
    weight: 2,
    pattern: /\b(verif(y|ied|ication)|approved?|rejected?|reviewed?|under review)\b/,
  },
  {
    name: "why-rejected",
    intent: "proof_status",
    weight: 3,
    pattern: /\bwhy (was|did|is) .{0,30}(reject|declin|fail)/,
  },

  {
    name: "reward-word",
    intent: "rewards",
    weight: 3,
    pattern:
      /\b(rewards?|prizes?|earn(ed)?|claim(ed)?|vouchers?|coupons?|inaa?m|kuch mila|(i|we|maine|have i|did i|what did i|anything i) (won|win|earned)|(maine|kya|kuch) (kya |kuch )?jeet(a|i|e))\b|इनाम|रिवॉर्ड|रिवार्ड|कुछ मिला/,
  },

  {
    name: "streak-word",
    intent: "streak",
    weight: 3,
    pattern: /\b(streaks?|in a row|lagatar)\b|🔥|स्ट्रीक|स्ट्रिक|लगातार/,
  },

  {
    name: "focus",
    intent: "focus",
    weight: 4,
    pattern:
      /\b(focus|prioriti[sz]e|priority|what should i do|where (do|should) i start|what next|what now)\b/,
  },
  {
    // "What's pending?", "what needs my attention?", "ab kya karna hai?"
    name: "pending",
    intent: "focus",
    weight: 4,
    pattern:
      /\b(whats|what is|anything|any|kya|kuch) (still )?pending\b|\bpending (hai|h|kya|kaam|task|tasks|work|stuff)\b|^pending\b|\bneeds? my attention\b|\bsupposed to do\b|\b(anything|what do|what) i (need|have) to (do|complete|finish)\b|\bwhat do i need to\b|\bneed to do anything\b|\baccountability events?\b|\brelevant to me\b|\bkya (karna|krna|karu|kru|karun)\b|\b(karna|krna) (hai|h)\b|\b(next|agla) kaam\b|\bkaam kya\b|\bka kaam\b|करना है|करे के|का करीं|क्या करूं|क्या करूँ|अगला काम|(क्या|का) (pending|पेंडिंग)|(pending|पेंडिंग) (है|बा)/,
  },

  {
    name: "today-word",
    intent: "today",
    weight: 2,
    pattern: /\b(today|tonight|todays|aaj|aj)\b|आज/,
  },
  {
    name: "due",
    intent: "today",
    weight: 2,
    pattern: /\b(whats|what is|what do i have) ?(left|due|pending|remaining)\b|\bto ?do\b/,
  },

  {
    name: "progress-word",
    intent: "progress",
    weight: 3,
    pattern:
      /\b(progress|this week|last week|past week|how am i doing|how im doing|consisten(t|cy)|stats?|overview|summary|kitna (hua|ho gaya|hogaya)|kitni progress|kahan tak)\b|प्रगति|प्रोग्रेस|कितना हुआ|कितना हो गया|केतना भइल|केतना भईल/,
  },

  {
    name: "active-quest",
    intent: "quests",
    weight: 3,
    pattern: /\b(active|current|open|joined|ongoing) quests?\b/,
  },
  {
    // "meri quest kya hai?", "what's my quest?": the person's own quest.
    name: "my-quest",
    intent: "quests",
    weight: 1,
    pattern:
      /\b(my|meri|mera|mere|hamar|hamaar|apni|apna) (current |active |abhi ki |wali )?quests?\b|मेरी क्वेस्ट|मेरा क्वेस्ट|हमार (quest|क्वेस्ट)/,
  },
  { name: "quest-word", intent: "quests", weight: 1, pattern: QUEST_WORD },

  {
    name: "active-challenge",
    intent: "challenges",
    weight: 3,
    pattern: /\b(active|current|joined|ongoing) challenges?\b|\bchallenges? (am i|im) in\b/,
  },
  {
    name: "my-challenges",
    intent: "challenges",
    weight: 3,
    pattern:
      /\b(my|meri|mera|mere|hamar|hamaar|apne|apni) (current |active )?challenges?\b|(kitne|kitna|how many) challenges?\b|मेरे चैलेंज|कितने चैलेंज/,
  },
  { name: "challenge-word", intent: "challenges", weight: 1, pattern: CHALLENGE_WORD },

  // Motivation and low moments
  {
    name: "low-motivation",
    intent: "motivation",
    weight: 4,
    pattern:
      /\b(motivate me|motivation|not motivated|dont feel like|dont want to|too tired|so tired|give up|giving up|i quit|lazy|cant do (it|this)|feel like quitting)\b/,
  },

  // Clearly outside Strivy's lane
  {
    name: "off-topic",
    intent: "off_topic",
    weight: 4,
    pattern:
      /\b(weather|news|politic(s|al)|election|president|prime minister|stocks?|crypto|bitcoin|recipe|movie|lyrics|cricket|football|ipl|match|score|write (me )?(a |an )?(poem|essay|story|code|email)|translate|homework|jokes?|gossip|girlfriend|boyfriend|song|gaana)\b/,
  },
];

/** Tie-break order: earlier wins. Specific before broad. */
const PRIORITY: StrivyIntent[] = [
  "company_info",
  "action_request",
  "strivy_info",
  "capabilities",
  "not_built",
  "create",
  "how_it_works",
  "help",
  "proof_status",
  "rewards",
  "motivation",
  "streak",
  "focus",
  "today",
  "progress",
  "quests",
  "challenges",
  "off_topic",
  "general_chat",
  "banter",
  "thanks",
  "greeting",
];

/** Intents whose answer depends on the person's data (follow-up targets). */
const DATA_INTENTS = new Set<StrivyIntent>([
  "today",
  "focus",
  "streak",
  "proof_status",
  "progress",
  "challenges",
  "quests",
  "rewards",
]);

/**
 * Short messages that only make sense with the previous reply: "why?",
 * "and that one?", "tell me more". Pronoun-only questions ("is it done?")
 * count too.
 */
const FOLLOW_UP =
  /^(why|how come|and|what about|how about|more|details?|tell me more|really|which|show me|ok and|so|what else|anything else|is it|was it|that one|this one|since when|kab se|kyun|kyu|kyon|aur|matlab|achha|accha|kab)\b|\b(it|that|this one|that one)\??$|^(कब से|काहे|क्यों|और)/;

/**
 * Intents that answer their own question even when a progress or deadline
 * word appears ("how does quest progress work?" is still how_it_works).
 */
const KEEPS_DETAIL_WORDS = new Set<StrivyIntent>([
  "company_info",
  "crisis",
  "strivy_info",
  "capabilities",
  "general_chat",
  "general_question",
  "banter",
  "action_request",
  "not_built",
  "create",
  "how_it_works",
  "help",
  "proof_status",
  "rewards",
  "motivation",
  "streak",
  "off_topic",
]);

/** The quest or challenge the conversation was last about. */
function topicFromHistory(history: ChatTurn[]): StrivyTopic | undefined {
  const last = [...history].reverse().find((t) => t.role === "strivy")?.intent;
  if (last === "quests") return "quest";
  if (last === "challenges" || last === "streak") return "challenge";
  return undefined;
}

/**
 * The most specific entity wins: "how much progress on my quest?" is about the
 * quest, "how many days are left?" after a quest reply is the quest's
 * deadline. Returns null when the message has no progress/deadline detail.
 */
function resolveDetail(
  text: string,
  history: ChatTurn[],
  best: StrivyIntent | null
): IntentResult | null {
  if (best && KEEPS_DETAIL_WORDS.has(best)) return null;
  // "meri quest ka kya pending hai?": what's left in that quest, not the
  // whole day's to-do list.
  if (best === "focus" && QUEST_WORD.test(text) && !CHALLENGE_WORD.test(text)) {
    return {
      intent: "quests",
      confidence: "high",
      matched: ["quest-pending", "named-topic"],
      topic: "quest",
      detail: "progress",
    };
  }
  const detail: StrivyDetail | null = DEADLINE_DETAIL.test(text)
    ? "deadline"
    : REMAINING_DETAIL.test(text)
      ? "remaining"
      : PROGRESS_DETAIL.test(text)
        ? "progress"
        : null;
  if (!detail) return null;

  const quest = QUEST_WORD.test(text);
  const challenge = CHALLENGE_WORD.test(text);
  const named: StrivyTopic | undefined =
    quest && !challenge ? "quest" : challenge && !quest ? "challenge" : undefined;
  const inherited = quest || challenge ? undefined : topicFromHistory(history);
  const topic = named ?? inherited;

  const matched = [
    `${topic ?? "general"}-${detail}`,
    ...(named ? ["named-topic"] : inherited ? ["topic-from-history"] : []),
  ];
  // "Tasks left" on a quest is how far along the quest is; on a challenge it
  // is today's challenge tasks.
  if (topic === "quest") {
    const d = detail === "remaining" ? "progress" : detail;
    return { intent: "quests", confidence: "high", matched, topic, detail: d };
  }
  if (topic === "challenge") {
    if (detail === "remaining") {
      return { intent: "today", confidence: "high", matched, topic, detail };
    }
    return { intent: "challenges", confidence: "high", matched, topic, detail };
  }
  // No topic: deadlines check challenges first, then quests; "what's left"
  // is today's tasks plus open quests; progress is the weekly overview.
  if (detail === "deadline") return { intent: "challenges", confidence: "medium", matched, detail };
  if (detail === "remaining") return { intent: "today", confidence: "high", matched, detail };
  return { intent: "progress", confidence: "high", matched, detail };
}

/**
 * "How do I complete it?" keeps the entity in view: a quest named in the
 * message, or the quest/challenge the previous answer was about. "isko
 * complete kaise karu?" after a quest answer is that quest, never a
 * challenge. With a pointer ("isko", "this") and nothing to point at, Strivy
 * asks instead of guessing. Returns null when the message isn't such a
 * question.
 */
function completionAsk(text: string, history: ChatTurn[]): IntentResult | null {
  if (!COMPLETE_ASK.test(text)) return null;
  if (/\b(streaks?)\b|स्ट्रीक/.test(text)) return null;
  const quest = QUEST_WORD.test(text);
  const challenge = CHALLENGE_WORD.test(text);
  if (quest && !challenge) {
    return {
      intent: "quests",
      confidence: "high",
      matched: ["quest-complete", "named-topic"],
      topic: "quest",
      detail: "complete",
    };
  }
  if (challenge && !quest) {
    return {
      intent: "today",
      confidence: "high",
      matched: ["challenge-complete", "named-topic"],
      topic: "challenge",
      detail: "remaining",
    };
  }
  if (quest || challenge) return null;
  const topic = topicFromHistory(history);
  if (topic === "quest") {
    return {
      intent: "quests",
      confidence: "high",
      matched: ["quest-complete", "topic-from-history"],
      topic: "quest",
      detail: "complete",
    };
  }
  if (topic === "challenge") {
    return {
      intent: "today",
      confidence: "high",
      matched: ["challenge-complete", "topic-from-history"],
      topic: "challenge",
      detail: "remaining",
    };
  }
  if (REFERENCE.test(text) && text.length <= 60) {
    return { intent: "unknown", confidence: "low", matched: ["follow-up-no-context"] };
  }
  return null;
}

/** Lower-case, straighten quotes, drop apostrophes, collapse whitespace. */
export function normalizeMessage(message: string): string {
  return message
    .toLowerCase()
    .replace(/[’‘`']/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function classifyIntent(message: string, history: ChatTurn[] = []): IntentResult {
  const text = normalizeMessage(message);
  if (!text) return { intent: "unknown", confidence: "low", matched: [] };

  if (CRISIS.test(text)) return { intent: "crisis", confidence: "high", matched: ["crisis"] };

  // STRIVUP the company (founders, team, who built it). Checked before the
  // keyword scoring: "strivup" alone would otherwise score how_it_works and
  // "kon h?" a general question, and neither may answer it.
  if (isCompanyQuestion(text)) {
    return { intent: "company_info", confidence: "high", matched: ["company"] };
  }
  const lastStrivy = [...history].reverse().find((t) => t.role === "strivy")?.intent;
  if (
    lastStrivy === "company_info" &&
    text.length <= 60 &&
    COMPANY_FOLLOW_UP.test(text) &&
    !DATA_WORDS.test(text)
  ) {
    return { intent: "company_info", confidence: "medium", matched: ["company-follow-up"] };
  }

  const completing = completionAsk(text, history);
  if (completing) return completing;

  const scores = new Map<StrivyIntent, number>();
  const matched: string[] = [];
  for (const rule of RULES) {
    if (rule.pattern.test(text)) {
      scores.set(rule.intent, (scores.get(rule.intent) ?? 0) + rule.weight);
      matched.push(rule.name);
    }
  }

  // "Hey, how's my streak?" is answered as the question, not the greeting.
  if (scores.size > 1) scores.delete("greeting");

  if (scores.size === 0) {
    const detailed = resolveDetail(text, history, null);
    if (detailed) return detailed;
    const lastIntent = [...history].reverse().find((t) => t.role === "strivy")?.intent;
    // "kab se?" after a streak answer: since when the streak has run.
    if (
      SINCE.test(text) &&
      text.length <= 40 &&
      (lastIntent === "streak" || lastIntent === "challenges")
    ) {
      return { intent: "streak", confidence: "medium", matched: ["streak-since"], detail: "since" };
    }
    // A bare "kitna?" keeps the subject: the quest's progress, the rewards…
    if (QUANTITY_FOLLOW_UP.test(text) && lastIntent && DATA_INTENTS.has(lastIntent)) {
      if (lastIntent === "quests") {
        return {
          intent: "quests",
          confidence: "medium",
          matched: ["quantity-follow-up"],
          topic: "quest",
          detail: "progress",
        };
      }
      return { intent: lastIntent, confidence: "low", matched: ["quantity-follow-up"] };
    }
    // "detail me samjha" after an answer: the same subject, in full.
    if (DETAIL_ASK.test(text) && text.length <= 40 && lastIntent && DATA_INTENTS.has(lastIntent)) {
      return { intent: lastIntent, confidence: "medium", matched: ["detail-follow-up"] };
    }
    if (FOLLOW_UP.test(text) && text.length <= 40) {
      if (lastIntent && DATA_INTENTS.has(lastIntent)) {
        return { intent: lastIntent, confidence: "low", matched: ["follow-up"] };
      }
      // A follow-up with nothing (useful) to follow: ask, don't guess.
      return { intent: "unknown", confidence: "low", matched: ["follow-up-no-context"] };
    }
    // "Who was Einstein?", "2+2?": answered first, like a friend would.
    if (MATH_ONLY.test(text)) {
      return { intent: "general_question", confidence: "high", matched: ["math"] };
    }
    if (GENERAL_QUESTION.test(text)) {
      return { intent: "general_question", confidence: "medium", matched: ["general-question"] };
    }
    return { intent: "unknown", confidence: "low", matched: [] };
  }

  let best: StrivyIntent = "unknown";
  let bestScore = -1;
  for (const intent of PRIORITY) {
    const score = scores.get(intent);
    if (score !== undefined && score > bestScore) {
      best = intent;
      bestScore = score;
    }
  }

  if (best === "streak" && SINCE.test(text)) {
    return {
      intent: "streak",
      confidence: "high",
      matched: [...matched, "streak-since"],
      detail: "since",
    };
  }

  const detailed = resolveDetail(text, history, best);
  if (detailed) return { ...detailed, matched: [...matched, ...detailed.matched] };

  const runnerUp = Math.max(
    0,
    ...[...scores.entries()].filter(([i]) => i !== best).map(([, s]) => s)
  );
  const confidence: IntentResult["confidence"] =
    bestScore >= 3 && bestScore > runnerUp ? "high" : bestScore >= 2 ? "medium" : "low";

  return { intent: best, confidence, matched };
}

/** Phase 1 API, kept for callers that only need the intent. */
export function detectIntent(message: string, history: ChatTurn[] = []): StrivyIntent {
  return classifyIntent(message, history).intent;
}

/**
 * The coarse route a message takes, named the way the product talks about
 * it. CASUAL_CHAT reads no personal data and goes to the model with the
 * compact chat prompt; the data categories read only what they need from
 * Supabase and the model may only rephrase the grounded draft.
 */
export type IntentCategory =
  | "CASUAL_CHAT"
  | "QUEST"
  | "STREAK"
  | "CHALLENGE"
  | "PROGRESS"
  | "PENDING"
  | "REWARDS"
  | "PROOF"
  | "HELP"
  | "COMPANY"
  | "UNKNOWN";

const CATEGORY: Record<StrivyIntent, IntentCategory> = {
  greeting: "CASUAL_CHAT",
  thanks: "CASUAL_CHAT",
  general_chat: "CASUAL_CHAT",
  off_topic: "CASUAL_CHAT",
  general_question: "CASUAL_CHAT",
  banter: "CASUAL_CHAT",
  strivy_info: "CASUAL_CHAT",
  quests: "QUEST",
  streak: "STREAK",
  challenges: "CHALLENGE",
  progress: "PROGRESS",
  today: "PENDING",
  focus: "PENDING",
  motivation: "PENDING",
  rewards: "REWARDS",
  proof_status: "PROOF",
  help: "HELP",
  capabilities: "HELP",
  how_it_works: "HELP",
  company_info: "COMPANY",
  create: "HELP",
  not_built: "HELP",
  action_request: "HELP",
  crisis: "UNKNOWN",
  unknown: "UNKNOWN",
};

/** The category for a classified message (see IntentCategory). */
export function intentCategory(intent: Pick<IntentResult, "intent">): IntentCategory {
  return CATEGORY[intent.intent];
}
