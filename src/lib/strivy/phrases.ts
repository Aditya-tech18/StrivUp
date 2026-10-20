/**
 * src/lib/strivy/phrases.ts
 *
 * The language-response layer: every short line Strivy says, per language.
 *
 *  - English is required for every phrase and is the fallback for any
 *    language that has no template yet, so adding a language never breaks a
 *    reply: add its code in language.ts, then templates here as they're ready.
 *  - Templates hold wording only. Every value ({quest}, {approved}…) is filled
 *    by replies.ts from the database facts, so a template can't invent one.
 *  - Several variants per phrase give some variety; the pick is deterministic
 *    per message and day. Playful and plain variants are mixed so Strivy isn't
 *    cheeky every time. Lines for low moments (rejections, broken streaks)
 *    have no teasing variants at all.
 *
 * Humour rules: light, harmless and never about the person. No insults, no
 * sexual or explicit jokes, no shaming words (see persona.ts BANNED_WORDS;
 * tests render every template and check).
 */
import type { StrivyLang } from "./language";

export type Vars = Record<string, string | number>;
type Templates = { en: string[] } & Partial<Record<Exclude<StrivyLang, "en">, string[]>> & {
    /**
     * Bhojpuri typed in Roman letters ("ka haal ba"). Only small talk has these;
     * everything else answers such a message in Hinglish (see language.ts).
     */
    bhoRoman?: string[];
  };

/** A spelling variant of a reply language. */
export type StrivyDialect = "bhojpuri-roman";

export const PHRASES = {
  /* ── Small talk ─────────────────────────────────────────────────────── */
  greeting: {
    en: [
      "Hey{name} 👋 What are we tackling today?",
      "Hey{name}! Streak check or just saying hi? 👀",
    ],
    hinglish: [
      "Hey{name} 👋 Bol, aaj kya nipta rahe hain?",
      "Aaja{name} 😏 Streak check karein ya bas gossip?",
    ],
    hi: ["नमस्ते{name} 👋 बताओ, आज किस पर काम करें?"],
    bho: ["प्रणाम{name} 👋 बताईं, आज का निपटावल जाव?"],
    bhoRoman: [
      "Pranam{name} 👋 Bolin, aaj ka niptawal jaai?",
      "Ka ho{name} 😏 Streak dekhal jaai ki khaali gapshap?",
    ],
  },
  thanks: {
    en: [
      "Anytime 😌 Now go get that proof.",
      "That's what I'm here for 🔥",
      "Anytime. Same time tomorrow?",
    ],
    hinglish: ["Koi baat nahi 😌 Ab proof daal de.", "Hamesha 🔥 Bas kaam mat chhodna."],
    hi: ["कोई बात नहीं 😌 अब proof डाल दो।"],
    bho: ["कवनो बात ना 😌 अब proof डाल द।"],
    bhoRoman: ["Kawno baat na 😌 Ab proof daal d.", "Hamesha 🔥 Bas kaam mat chhodih."],
  },
  couldNotLoad: {
    en: ["I couldn't load {what} just now, so I won't guess. Try again in a moment."],
    hinglish: [
      "Abhi {what} load nahi ho paya, toh guess nahi karunga 👀 Thodi der me phir try kar.",
    ],
    hi: [
      "अभी {what} load नहीं हो पाया, इसलिए मैं अंदाज़ा नहीं लगाऊँगा। थोड़ी देर में फिर try करो।",
    ],
    bho: ["अभी {what} load ना हो पावल, एह से हम अंदाजा ना लगाइब। तनी देर में फेर try करीं।"],
  },
  unknown: {
    en: [
      "Hmm, lost me there 😅 Say that another way?",
      "Not sure I caught that 👀 Try me again?",
      "That one flew right over me 😅 Come again?",
    ],
    hinglish: [
      "Arre, ye bouncer nikal gaya 😅 Thoda aur seedha bol?",
      "Samjha nahi bhai 👀 Ek baar phir bol?",
      "Ye wala sar ke upar se gaya 😅 Dusre tareeke se bol na.",
    ],
    hi: ["ये वाला सिर के ऊपर से निकल गया 😅 थोड़ा और खुलकर बोलो?", "समझ नहीं आया 👀 फिर से बोलो?"],
    bho: ["ई त माथा के ऊपर से निकल गइल 😅 तनी फेर से बोलीं?", "बुझाइल ना 👀 फेर से कहीं?"],
    bhoRoman: [
      "Ee ta mathwa ke upar se nikal gail 😅 Tani pher se bolin?",
      "Bujhail na bhai 👀 Pher se kahin?",
    ],
  },
  clarify: {
    en: ["I'm not sure what that refers to. Streak, today's tasks, quest or proof?"],
    hinglish: ["Kiske baare me pooch raha hai? 👀 Streak, aaj ka kaam, quest ya proof?"],
    hi: ["किसके बारे में पूछ रहे हो? 👀 streak, आज का काम, quest या proof?"],
    bho: ["केकरा बारे में पूछत बानी? 👀 streak, आज के काम, quest भा proof?"],
  },
  offTopic: {
    // Only shown when the text model can't answer right now (off, rate-limited,
    // rejected). With the model on, general questions are answered first.
    en: [
      "Good one, but my general-knowledge brain is taking a break right now 😅 Ask me again in a bit. Meanwhile, STRIVUP stuff I can always do 👀",
      "I can't pull that answer up right now 😅 Try again in a moment, or ask me anything about your STRIVUP progress.",
    ],
    hinglish: [
      "Sawaal badhiya hai, par abhi mera general knowledge wala dimaag break pe hai 😅 Thodi der me phir pooch. STRIVUP wala kuch bhi abhi bata sakta hoon 👀",
      "Ye wala abhi nahi bata paunga 😅 Thodi der me phir try kar, ya STRIVUP ka kuch pooch le.",
    ],
    hi: [
      "सवाल अच्छा है, पर अभी मेरा general knowledge वाला दिमाग break पर है 😅 थोड़ी देर में फिर पूछो। STRIVUP का कुछ भी अभी बता सकता हूँ 👀",
    ],
    bho: [
      "सवाल बढ़िया बा, बाकिर अभी हमार general knowledge वाला दिमाग आराम पर बा 😅 तनी देर में फेर पूछीं। STRIVUP के कुछो अभी बता सकीलें 👀",
    ],
    bhoRoman: [
      "Sawaal badhiya ba, baakir abhi hamar dimaag aaram pe ba 😅 Tani der me pher puchhin. STRIVUP ke kuchho abhi bata sakile 👀",
    ],
  },
  /** A sum, answered exactly: "4 😌". {answer} is computed, never guessed. */
  mathAnswer: {
    en: ["{answer} 😌", "{answer}. Easy one 😎"],
    hinglish: ["{answer} 😌", "{answer}, bhai 😎 Easy tha."],
    hi: ["{answer} 😌"],
    bho: ["{answer} 😌"],
  },
  /**
   * The short StrivUp nudge after a general answer. Several wordings, picked
   * per message; never added to small talk, and never twice in a row.
   */
  strivupRedirect: {
    en: [
      "Got a STRIVUP question too? Hit me 😄",
      "Now give me a tougher one, maybe about your streak 😏",
      "Anything STRIVUP-related on your mind? I'm right here.",
      "Want to check your quest or streak while we're at it? 👀",
    ],
    hinglish: [
      "Waise StrivUp se related kuch poochna ho toh bata 😄",
      "Ab StrivUp wali koi tough query de 😏",
      "Streak ya quest check karna ho toh bol dena 👀",
      "Chal, ab thoda StrivUp ka bhi scene dekh le?",
    ],
    hi: ["वैसे StrivUp से जुड़ा कुछ पूछना हो तो बताओ 😄", "अब StrivUp वाली कोई tough query दो 😏"],
    bho: ["वइसे StrivUp से जुड़ल कुछ पूछे के होखे त बताईं 😄"],
    bhoRoman: ["Waise StrivUp ke kuchho puchhe ke hoke ta batain 😄"],
  },

  /* ── Banter: a playful comeback when the person insults Strivy ──────── */
  // Clean and short. Never repeats their swear words, never shames the person.
  // Every number or name comes from their own facts ({streak}, {quest}…).
  roastStreakSmall: {
    en: [
      "Maybe 😂 But first get that {streak} streak to {next}, then review my intelligence.",
      "Big talk from someone on a {streak} streak 😏 Make it {next} first, then roast me.",
    ],
    hinglish: [
      "Ho sakta hai bhai 😂 Pehle apni {streak} wali streak ko {next} tak survive kara le, phir meri intelligence pe review dena.",
      "{streak} ki streak aur itna attitude? 😏 Pehle {next} tak le ja, phir roast kar.",
    ],
    hi: [
      "हो सकता है भाई 😂 पहले अपनी {streak} वाली streak को {next} तक पहुँचा, फिर मेरी intelligence पे review देना।",
    ],
    bho: [
      "हो सकेला भाई 😂 पहिले आपन {streak} वाला streak के {next} तक पहुँचाईं, तब हमार review करीं।",
    ],
    bhoRoman: [
      "Ho sakela bhai 😂 Pahile aapan {streak} wala streak ke {next} tak pahunchaav, tab hamar review kariha.",
    ],
  },
  roastStreakBig: {
    en: [
      "A {streak} streak and you're roasting me? Okay, respect 😂",
      "Fair, you've earned some attitude with a {streak} streak 😏 Still not losing to you though.",
    ],
    hinglish: [
      "Accha bhai, {streak} streak wala banda mujhe roast kar raha hai? Respect 😂",
      "{streak} ki streak hai toh thoda attitude banta hai 😏 Par jeetega phir bhi nahi.",
    ],
    hi: ["अच्छा भाई, {streak} streak वाला मुझे roast कर रहा है? Respect 😂"],
    bho: ["अच्छा भाई, {streak} streak वाला हमके roast करत बा? Respect 😂"],
    bhoRoman: ["Achha bhai, {streak} streak wala hamke roast karat ba? Respect 😂"],
  },
  roastQuest: {
    en: [
      "You came to roast me while {quest} is sitting at {approved}/{total} 😭",
      "Roast later. {quest} is still at {approved}/{total} 😂",
    ],
    hinglish: [
      "Tu mujhe roast karne aaya hai aur {quest} abhi {approved}/{total} pe pada hai 😭",
      "Roast baad me, pehle {quest} ka {approved}/{total} dekh le 😂",
    ],
    hi: ["तू मुझे roast करने आया है और {quest} अभी {total} में से {approved} पे पड़ा है 😭"],
    bho: ["तू हमके roast करे आइल बाड़ आ {quest} अभी {total} में से {approved} पर पड़ल बा 😭"],
    bhoRoman: ["Tu hamke roast kare aail baada aa {quest} abhi {approved}/{total} pe padal ba 😭"],
  },
  roastGeneric: {
    en: [
      "Ouch 😂 Noted. Now put that energy into a task?",
      "Wow, harsh 😏 I'll survive. Will your to-do list?",
      "Roasting me won't finish your tasks, but nice try 😂",
    ],
    hinglish: [
      "Itna gussa? 😂 Chal, ye energy kisi task pe laga.",
      "Roast karna hai toh thoda creative ho ja bhai 😏 Main toh yahin hoon.",
      "Ouch 😂 Dil pe nahi liya. Ab bol, kya scene hai?",
    ],
    hi: [
      "इतना गुस्सा? 😂 चल, ये energy किसी task पे लगा।",
      "Ouch 😂 दिल पे नहीं लिया। अब बोलो, क्या scene है?",
    ],
    bho: ["एतना गुस्सा? 😂 चलीं, ई energy कवनो task पर लगाईं।"],
    bhoRoman: [
      "Etna gussa? 😂 Chal, ee energy kawno task pe lagaav.",
      "Ouch 😂 Dil pe na lihni. Ab bol, ka scene ba?",
    ],
  },

  /* ── "How do I finish this quest?" ──────────────────────────────────── */
  questHowTo: {
    en: [
      "🎯 To finish {quest}: open it, do the {left} remaining and submit proof for each. It's complete once all {total} are approved ({approved}/{total} so far).",
    ],
    hinglish: [
      "🎯 {quest} complete karne ke liye: quest khol, baaki {left} kar aur har ek ka proof daal. Saare {total} approve hote hi done ✅ Abhi {approved}/{total} hai.",
    ],
    hi: [
      "🎯 {quest} पूरा करने के लिए: quest खोलो, बाकी {left} करो और हर एक का proof डालो। सारे {total} approve होते ही पूरा ✅ अभी {total} में से {approved} हुए हैं।",
    ],
    bho: [
      "🎯 {quest} पूरा करे खातिर: quest खोलीं, बाकी {left} करीं आ हर एक के proof डालीं। सब {total} approve होते पूरा ✅ अभी {total} में से {approved} भइल बा।",
    ],
  },
  questRedo: {
    en: [" 👀 {count} need a redo."],
    hinglish: [" 👀 {count} dobara karne hain."],
    hi: [" 👀 {count} दोबारा करने हैं।"],
    bho: [" 👀 {count} फेर से करे के बा।"],
  },

  /* ── General conversation ───────────────────────────────────────────── */
  capabilities: {
    en: [
      "I can keep an eye on your streaks, quests, proofs, rewards and today's focus. Basically, I keep you honest 👀",
      "Streaks, quests, proof checks, rewards, what's pending today: that's my whole job. Basically, I keep you honest 😏",
    ],
    hinglish: [
      "Kaafi kuch 😏 Streak check karwa, quest ka haal dekh, pending kaam pooch, proof/reward check karwa, ya aaj ka focus decide karte hain.",
    ],
    hi: [
      "काफी कुछ 😏 streak देखो, quest का हाल जानो, pending काम पूछो, proof या reward check करो, या आज का focus तय करते हैं। बोलो, क्या करना है?",
    ],
    bho: [
      "बहुत कुछ 😏 streak देखीं, quest के हाल पूछीं, pending काम, proof भा reward check करीं, भा आज के focus तय करल जाव। बोलीं, का करे के बा?",
    ],
    bhoRoman: [
      "Bahut kuchh 😏 Streak dekhin, quest ke haal puchhin, pending kaam, proof bhaa reward check karin.",
    ],
  },
  /* ── STRIVUP the company ─────────────────────────────────────────── */
  /** Founder/team names aren't in STRIVY's knowledge: say so, never guess. */
  companyNoTeam: {
    en: [
      "I don't have the names of STRIVUP's founders or team in my current knowledge, so I won't guess 🙏 What I do know: STRIVUP is {tagline}, built around challenges, quests, streaks and community. For anything about the team, write to {email}.",
    ],
    hinglish: [
      "Bhai, STRIVUP ke founders ya team ke naam meri current knowledge me nahi hain, toh guess nahi karunga 🙏 Itna pakka pata hai: STRIVUP {tagline} hai, challenges, quests, streaks aur community wala. Team se baat karni ho toh {email} pe likh do.",
    ],
    hi: [
      "STRIVUP के founders या team के नाम मेरी अभी की जानकारी में नहीं हैं, इसलिए मैं अंदाज़ा नहीं लगाऊँगा 🙏 इतना पता है: STRIVUP {tagline} है, जिसमें challenges, quests, streaks और community हैं। Team से बात करनी हो तो {email} पर लिखो।",
    ],
    bho: [
      "STRIVUP के founders भा team के नाम हमार अभी के जानकारी में नइखे, एह से हम अंदाजा ना लगाइब 🙏 एतना पता बा: STRIVUP {tagline} ह, जेमें challenges, quests, streaks आ community बा। Team से बात करे के होखे त {email} पर लिखीं।",
    ],
    bhoRoman: [
      "Bhai, STRIVUP ke founders bhaa team ke naam hamaar abhi ke jaankari me naikhe, eh se andaaja na lagaaib 🙏 Etna pata ba: STRIVUP {tagline} ha. Team se baat kare ke hoe t {email} pa likhin.",
    ],
  },
  /** Founder/team names that STRIVUP has published (knowledge.ts STRIVUP_TEAM). */
  companyTeam: {
    en: ["Here's STRIVUP's team, as STRIVUP lists it: {team}."],
    hinglish: ["STRIVUP ki team, jaise STRIVUP ne bataya hai: {team}."],
    hi: ["STRIVUP की team, जैसा STRIVUP ने बताया है: {team}।"],
    bho: ["STRIVUP के team, जइसन STRIVUP बतवले बा: {team}।"],
  },
  strivyInfo: {
    en: [
      "I'm Strivy, your accountability buddy inside STRIVUP 👀 I keep tabs on your streaks, quests and proof so you keep showing up.",
    ],
    hinglish: [
      "Main Strivy hoon, STRIVUP wala tera accountability buddy 👀 Streak, quest aur proof pe nazar rakhta hoon taaki tu roz show up kare.",
    ],
    hi: [
      "मैं Strivy हूँ, STRIVUP में तुम्हारा accountability buddy 👀 streak, quest और proof पर नज़र रखता हूँ ताकि तुम रोज़ show up करो।",
    ],
    bho: [
      "हम Strivy हईं, STRIVUP में रउआ के accountability buddy 👀 streak, quest आ proof पर नजर राखिले ताकि रउआ रोज show up करीं।",
    ],
    bhoRoman: [
      "Hum Strivy hain, STRIVUP mein tohar accountability buddy 👀 Streak, quest aa proof pa najar rakhile.",
    ],
  },
  generalHowAreYou: {
    en: [
      "All good here 😌 You? What's the vibe today?",
      "Living my best chatbox life 😎 How about you?",
      "Pretty great, honestly 👀 What's up with you?",
    ],
    hinglish: [
      "Main toh mast 😌 Tu suna, kya chal raha hai?",
      "Badhiya bhai 😎 Tera kya haal hai?",
      "Ekdum first class 👌 Tu bata, kya vibe hai aaj?",
    ],
    hi: ["मैं तो बढ़िया 😌 तुम सुनाओ, क्या चल रहा है?", "एकदम मस्त 😎 तुम्हारा क्या हाल है?"],
    bho: ["हम त मस्त बानी 😌 रउआ सुनाईं, का चलत बा?", "एकदम बढ़िया 😎 रउआ के का हाल बा?"],
    bhoRoman: [
      "Hum ta ekdam mast bani 😌 Tohar ka haal ba?",
      "Badhiya bani bhai 😎 Tu suna, ka chalat ba?",
    ],
  },
  generalBored: {
    en: [
      "Bored? Dangerous. That's how people end up reorganising their sock drawer 😏",
      "Boredom is just energy with no plan 😏 Want me to give it one?",
    ],
    hinglish: [
      "Bore ho raha hai? Khatarnak 😏 Isi mood me log fridge 10 baar khol lete hain.",
      "Boredom matlab energy hai, bas plan nahi 😏 Plan de doon?",
    ],
    hi: ["बोर हो रहे हो? खतरनाक 😏 इसी मूड में लोग फ्रिज दस बार खोल लेते हैं।"],
    bho: ["बोर होत बानी? खतरनाक बा 😏 एही मूड में लोग फ्रिज दस बेर खोलेला।"],
    bhoRoman: [
      "Bor hot baad? Khatarnaak ba 😏 Ehi mood mein log fridge das ber kholela.",
      "Bor hoe ke matlab energy ba, bas plan naikhe 😏 Plan de di?",
    ],
  },
  /** "aaj mood off hai": kind, short, and never about tasks or streaks. */
  generalMood: {
    en: [
      "Ugh, those days happen 🫂 Want to talk about it, or should I just distract you?",
      "Sending a virtual chai ☕ Off days are allowed. What's up?",
    ],
    hinglish: [
      "Arre, aise din aate hain bhai 🫂 Batana hai kya hua, ya bas timepass karein?",
      "Ek virtual chai le ☕ Off din bhi allowed hain. Kya hua?",
    ],
    hi: ["अरे, ऐसे दिन आते हैं 🫂 बताना है क्या हुआ, या बस थोड़ी बातें करें?"],
    bho: ["अरे, अइसन दिन आवेला 🫂 बताईं का भइल, कि बस गपशप करीं?"],
    bhoRoman: ["Arre, aisan din aawela 🫂 Batain ka bhail, ki bas gapshap kari?"],
  },
  /** "bhai kal se pakka start karunga": cheeky, never a lecture or guilt. */
  generalPromise: {
    en: [
      "Tomorrow-you is going to love that promise 😏 Want to sneak in one tiny thing today too?",
      "Noted ✍️ Tomorrow it is. A small head start today wouldn't hurt though 👀",
    ],
    hinglish: [
      "Kal se? 😏 Pakka wala kal na? Chal, aaj ek chhota sa kaam karke trailer dikha de 🔥",
      "Noted bhai ✍️ Kal se full power. Aaj bas ek chhota step ho jaaye? 👀",
    ],
    hi: ["कल से? 😏 पक्का वाला कल ना? आज एक छोटा सा काम करके trailer दिखा दो 🔥"],
    bho: ["काल्ह से? 😏 पक्का वाला काल्ह नू? आज एगो छोट काम करके trailer देखा द 🔥"],
    bhoRoman: ["Kaalh se? 😏 Pakka wala kaalh nu? Aaj ego chhot kaam karke trailer dekha d 🔥"],
  },
  generalSomething: {
    en: [
      "Here's one: the hardest part of any streak is day two 😏",
      "Fun fact: showing up badly still beats not showing up 👀",
      "Hot take: naps are just productivity loading screens 😴",
    ],
    hinglish: [
      "Suna: streak ka sabse mushkil din doosra hota hai 😏",
      "Ek baat bolun? Aadha-adhoora show up bhi skip karne se better hai 👀",
      "Gyaan ki baat: neend bhi ek loading screen hai 😴",
    ],
    hi: [
      "एक बात सुनो: streak का सबसे मुश्किल दिन दूसरा होता है 😏",
      "ज्ञान की बात: नींद भी एक loading screen है 😴",
    ],
    bho: [
      "एगो बात सुनीं: streak के सबसे कठिन दिन दूसरका होला 😏",
      "ज्ञान के बात: नींद भी एगो loading screen ह 😴",
    ],
    bhoRoman: [
      "Ego baat sunin: streak ke sabse kathin din dusarka hola 😏",
      "Gyaan ke baat: neend bhi ego loading screen ha 😴",
    ],
  },
  generalFun: {
    en: [
      "I told my alarm I'd see it tomorrow. It took that personally 😏",
      "My workout plan is simple: I lift my phone, very consistently 💪",
      "I'd tell you a joke about procrastination, but I'll do it later 😌",
    ],
    hinglish: [
      "Alarm ko bola kal milte hain, usne dil pe le liya 😏",
      "Mera workout simple hai: phone uthana, roz, full consistency 💪",
      "Procrastination pe joke sunata, par baad me sunaunga 😌",
    ],
    hi: [
      "अलार्म से कहा कल मिलते हैं, उसने दिल पे ले लिया 😏",
      "मेरा workout सिंपल है: रोज़ फ़ोन उठाना, पूरी consistency से 💪",
    ],
    bho: [
      "अलार्म से कहनी काल्ह भेंटाइब, ऊ दिल पर ले लिहलस 😏",
      "हमार workout सिंपल बा: रोज फोन उठावल, पूरा consistency से 💪",
    ],
    bhoRoman: [
      "Alarm se kahni kaal bhentaaib, u dil pa le lihlas 😏",
      "Hamar workout simple ba: roj phone uthawal, full consistency se 💪",
    ],
  },
  generalChat: {
    en: ["I'm all ears 👀", "Go on, I'm listening 😌", "Say more, I'm here 👀"],
    hinglish: ["Haan bol 👀", "Bol na, sun raha hoon 😌", "Haan bhai, bata 👀"],
    hi: ["हाँ बोलो 👀", "बोलो, सुन रहा हूँ 😌"],
    bho: ["हँ बोलीं 👀", "बोलीं, सुनत बानी 😌"],
    bhoRoman: ["Han bolin 👀", "Bolin, sunat bani 😌"],
  },
  cantDoAction: {
    en: ["I can't complete that from here yet, but I can tell you what's left 👀"],
    hinglish: ["Ye main yahan se nahi kar sakta abhi, par bata sakta hoon kya baaki hai 👀"],
    hi: ["यह मैं यहाँ से अभी नहीं कर सकता, पर बता सकता हूँ कि क्या बाकी है 👀"],
    bho: ["ई हम इहाँ से अभी ना कर सकीं, बाकिर बता सकीं कि का बाकी बा 👀"],
    bhoRoman: ["Ee hum ihaan se abhi na kar sakin, bakir bata sakin ki ka baaki ba 👀"],
  },

  /* ── Streak ─────────────────────────────────────────────────────────── */
  noChallenge: {
    en: ["No active challenge yet 😏 Join one and we'll start counting."],
    hinglish: [
      "Abhi active challenge nahi hai bhai 👀 Challenge join kar aur streak start kar.",
      "Abhi streak zero hai bhai 👀 Challenge join kar, phir game start.",
    ],
    hi: ["अभी कोई active challenge नहीं है 👀 Challenge join करो और streak शुरू करो।"],
    bho: ["अभी कवनो active challenge नइखे 👀 Challenge join करीं, तब streak शुरू होई।"],
  },
  streakNone: {
    en: ["No streak running right now 👀 One approved proof today restarts it."],
    hinglish: ["Abhi streak zero pe hai 👀 Aaj ek approved proof aur game wapas on."],
    hi: ["अभी कोई streak नहीं चल रही 👀 आज एक approved proof से फिर शुरू होगी।"],
    bho: ["अभी streak शून्य पर बा 👀 आज एगो approved proof से फेर शुरू हो जाई।"],
  },
  streakBest: {
    en: [" Your best is {best}. Go beat it."],
    hinglish: [" Best {best} ka hai, tod usko 😏"],
    hi: [" तुम्हारा best {best} है।"],
    bho: [" तोहार best {best} के बा।"],
  },
  streakActive: {
    en: [
      "{streak} streak on {challenge} 🔥 Don't get comfy now.",
      "You're on a {streak} streak in {challenge} 🔥 Keep it rolling.",
    ],
    hinglish: [
      "{challenge} pe {streak} ki streak 🔥 Ab rukna mana hai.",
      "{challenge} pe {streak} lagatar 😏 Chain mat todna.",
    ],
    hi: ["{challenge} में {streak} की streak 🔥 ऐसे ही चलते रहो।"],
    bho: ["{challenge} में {streak} के streak बा 🔥 अइसहीं लागल रहीं।"],
  },
  streakLongest: {
    en: [" Best ever: {best}."],
    hinglish: [" Best ab tak: {best}."],
    hi: [" अब तक का best: {best}।"],
    bho: [" अब तक के best: {best}।"],
  },

  /* ── Quests ─────────────────────────────────────────────────────────── */
  noQuests: {
    en: [
      "No quests joined yet 👀 Quests are one-off missions, separate from your daily challenges.",
    ],
    hinglish: ["Abhi koi quest join nahi kiya 👀 Ek utha le, mazaa aayega."],
    hi: ["अभी तुमने कोई quest join नहीं किया 👀"],
    bho: ["अभी ले कवनो quest join नइखे कइल 👀 एगो पकड़ीं।"],
  },
  noQuestsForProgress: {
    en: ["You're not in any quest yet, so there's no quest progress to show 👀"],
    hinglish: ["Abhi koi quest join hi nahi kiya, progress kiska dikhaun? 😏"],
    hi: ["अभी कोई quest join नहीं किया, तो दिखाने को quest progress नहीं है 👀"],
    bho: ["अभी कवनो quest join नइखे, त progress का देखाईं 😏"],
  },
  questsAllDone: {
    en: ["No open quests right now. {done} already done 🏆"],
    hinglish: ["Abhi koi open quest nahi. {done} pehle hi nipta chuka 🏆"],
    hi: ["अभी कोई open quest नहीं है। {done} पहले ही पूरे हो चुके 🏆"],
    bho: ["अभी कवनो open quest नइखे। {done} पहिलहीं पूरा हो गइल 🏆"],
  },
  questOne: {
    en: ["Your active quest is {quest} 😏", "You're on {quest} right now 👀"],
    hinglish: ["Tera active quest {quest} hai 😏"],
    hi: ["तुम्हारा active quest {quest} है 👀"],
    bho: ["तोहार active quest {quest} बा 😏"],
  },
  questTasks: {
    en: [" {approved}/{total} tasks approved so far."],
    hinglish: [" Abhi {approved}/{total} tasks approved hain."],
    hi: [" अभी {total} में से {approved} tasks approved हैं।"],
    bho: [" अभी {total} में से {approved} task approve भइल बा।"],
  },
  questMany: {
    en: ["You've got {count} active quests: {names} 👀"],
    hinglish: ["{count} quests chal rahe hain: {names} 👀"],
    hi: ["{count} quests चल रहे हैं: {names} 👀"],
    bho: ["{count} गो quest चलत बा: {names} 👀"],
  },
  questNotStarted: {
    en: [
      "You're at {approved}/{total} approved tasks on {quest} 👀 You've still got time, go get the first one done.",
      "{quest}: {approved}/{total} tasks approved 😏 First one's the hardest. Go.",
    ],
    hinglish: [
      "{quest} 😏 {approved}/{total} tasks approved, {left} baaki. Ab first wala nipta.",
      "Abhi {quest} pe {approved}/{total} tasks approved, {left} baaki 👀 Quest dekh ke bhaagna nahi hai. 😌",
    ],
    hi: ["{quest} में अभी {total} में से {approved} tasks approved हैं 👀 पहला task आज निपटा दो।"],
    bho: ["{quest} में अभी {total} में से {approved} task approve भइल बा 😏 पहिला वाला निपटा द।"],
  },
  questUnderway: {
    en: ["{quest}: {approved}/{total} tasks approved, {left} to go 🔥"],
    hinglish: ["{quest} pe {approved}/{total} approved, {left} baaki 🔥"],
    hi: ["{quest}: {total} में से {approved} approved, {left} बाकी 🔥"],
    bho: ["{quest}: {total} में से {approved} approve, {left} बाकी बा 🔥"],
  },
  questAllApproved: {
    en: ["All {total} tasks on {quest} are approved ✅ Nice work."],
    hinglish: ["{quest} ke saare {total} tasks approved ✅ Kya baat hai."],
    hi: ["{quest} के सभी {total} tasks approved हैं ✅ बढ़िया।"],
    bho: ["{quest} के सब {total} task approve हो गइल ✅ बढ़िया।"],
  },
  questNoTasks: {
    en: ["You've joined {quest}, but it has no tasks listed yet."],
    hinglish: ["{quest} join kar liya, par abhi usme koi task listed nahi hai."],
    hi: ["तुमने {quest} join किया है, पर उसमें अभी कोई task नहीं है।"],
    bho: ["रउआ {quest} join कइले बानी, बाकिर ओमें अभी कवनो task नइखे।"],
  },
  questPendingReview: {
    en: [" {pending} waiting on review."],
    hinglish: [" Review me: {pending}."],
    hi: [" {pending} review में है।"],
    bho: [" {pending} review में बा।"],
  },

  /* ── Challenges ─────────────────────────────────────────────────────── */
  challengeLine: {
    en: ["{challenge}: {parts}"],
    hinglish: ["{challenge}: {parts}"],
    hi: ["{challenge}: {parts}"],
    bho: ["{challenge}: {parts}"],
  },
  challengeDay: {
    en: ["Day {day} of {duration}"],
    hinglish: ["Day {day}/{duration}"],
    hi: ["{duration} में से दिन {day}"],
    bho: ["{duration} में से दिन {day}"],
  },
  challengeConsistency: {
    en: ["{pct}% consistent"],
    hinglish: ["{pct}% consistent"],
    hi: ["{pct}% consistency"],
    bho: ["{pct}% consistency"],
  },
  challengesActive: {
    en: ["You're in {count} active challenges: {names} 👀"],
    hinglish: ["{count} challenges chal rahe hain: {names} 👀"],
    hi: ["तुम {count} active challenges में हो: {names} 👀"],
    bho: ["रउआ {count} गो active challenge में बानी: {names} 👀"],
  },
  challengeOneActive: {
    en: ["You're in {challenge} 🔥"],
    hinglish: ["Tu {challenge} me hai 🔥"],
    hi: ["तुम {challenge} में हो 🔥"],
    bho: ["रउआ {challenge} में बानी 🔥"],
  },
  noActiveChallengeDoneBefore: {
    en: ["No active challenge right now. You've finished {done} before, so you know the drill 😏"],
    hinglish: [
      "Abhi koi active challenge nahi. {done} pehle poore kiye hain, toh tujhe pata hai kaise hota hai 😏",
    ],
    hi: ["अभी कोई active challenge नहीं। पहले {done} पूरे कर चुके हो 😏"],
    bho: ["अभी कवनो active challenge नइखे। पहिले {done} पूरा कइले बानी 😏"],
  },

  /* ── Week progress ──────────────────────────────────────────────────── */
  weekStrong: {
    en: ["Strong week 🔥 Approved proof on {days}/7 days."],
    hinglish: ["Solid hafta 🔥 {days}/7 din approved proof."],
    hi: ["शानदार हफ्ता 🔥 पिछले 7 में से {days} दिन approved proof।"],
    bho: ["बढ़िया हफ्ता 🔥 पिछला 7 में से {days} दिन approved proof।"],
  },
  weekSolid: {
    en: ["Solid week: approved proof on {days}/7 days. Room for more 😏"],
    hinglish: ["Theek-thaak hafta: {days}/7 din approved proof. Aur ho sakta hai 😏"],
    hi: ["ठीक-ठाक हफ्ता: 7 में से {days} दिन approved proof।"],
    bho: ["ठीक-ठाक हफ्ता: 7 में से {days} दिन approved proof।"],
  },
  weekSlow: {
    en: ["Slow week so far: {days}/7 days with approved proof. Today's a good day to fix that."],
    hinglish: ["Hafta slow chal raha: {days}/7 din approved proof. Aaj se speed badha."],
    hi: ["हफ्ता धीमा रहा: 7 में से {days} दिन approved proof। आज से रफ्तार बढ़ाओ।"],
    bho: ["हफ्ता धीमा रहल: 7 में से {days} दिन approved proof। आज से रफ्तार बढ़ाईं।"],
  },
  weekNone: {
    en: ["No approved proof in the last 7 days 👀 Let's fix that today."],
    hinglish: ["Pichhle 7 din me koi approved proof nahi 👀 Aaj isko todte hain."],
    hi: ["पिछले 7 दिनों में कोई approved proof नहीं 👀 आज शुरुआत करो।"],
    bho: ["पिछला 7 दिन में एको approved proof ना भइल 👀 आज से शुरू करीं।"],
  },
  nothingToTrack: {
    en: [" You're not in any challenge or quest yet, so there's nothing to track."],
    hinglish: [" Abhi koi challenge ya quest join nahi hai, toh track karne ko kuch nahi."],
    hi: [" अभी कोई challenge या quest join नहीं है।"],
    bho: [" अभी कवनो challenge भा quest join नइखे।"],
  },
  completedChallenges: {
    en: [" {done} completed so far 🏆"],
    hinglish: [" {done} complete ho chuke 🏆"],
    hi: [" {done} पूरे हो चुके 🏆"],
    bho: [" {done} पूरा हो चुकल बा 🏆"],
  },

  /* ── Deadlines ──────────────────────────────────────────────────────── */
  challengeDaysLeft: {
    en: ["{challenge} has {left} to go ({dayText}) ⏳"],
    hinglish: ["{challenge} me {left} bache hain ({dayText}) ⏳"],
    hi: ["{challenge} में {left} बाकी हैं ({dayText}) ⏳"],
    bho: ["{challenge} में {left} बाकी बा ({dayText}) ⏳"],
  },
  challengeLastDay: {
    en: ["{challenge} wraps up today ⏳ Finish strong."],
    hinglish: ["{challenge} aaj khatam 😏 Strong finish kar."],
    hi: ["{challenge} आज खत्म हो रहा है ⏳ जोरदार finish करो।"],
    bho: ["{challenge} आज खतम होता ⏳ जोरदार finish करीं।"],
  },
  questEndsInDays: {
    en: ["{quest} ends on {date}, about {left} left ⏳"],
    hinglish: ["{quest} {date} ko khatam, lagbhag {left} bache ⏳"],
    hi: ["{quest} {date} को खत्म होगा, लगभग {left} बचे हैं ⏳"],
    bho: ["{quest} {date} के खतम होई, लगभग {left} बाचल बा ⏳"],
  },
  questEndsInHours: {
    en: ["{quest} ends in about {left} ⏳ Move!"],
    hinglish: ["{quest} bas {left} me khatam ⏳ Chal jaldi."],
    hi: ["{quest} लगभग {left} में खत्म होगा ⏳ जल्दी करो।"],
    bho: ["{quest} लगभग {left} में खतम होई ⏳ जल्दी करीं।"],
  },
  questEnded: {
    en: ["{quest} has already ended."],
    hinglish: ["{quest} toh khatam ho chuka hai."],
    hi: ["{quest} खत्म हो चुका है।"],
    bho: ["{quest} खतम हो चुकल बा।"],
  },
  questNoEnd: {
    en: ["{quest} has no end date set."],
    hinglish: ["{quest} ki koi end date set nahi hai."],
    hi: ["{quest} की कोई end date तय नहीं है।"],
    bho: ["{quest} के कवनो end date तय नइखे।"],
  },
  challengeNoEnd: {
    en: ["{challenge} doesn't have a fixed length, so there's no countdown."],
    hinglish: ["{challenge} ki fixed length nahi hai, toh countdown nahi."],
    hi: ["{challenge} की कोई तय अवधि नहीं है।"],
    bho: ["{challenge} के कवनो तय अवधि नइखे।"],
  },
  nothingWithDeadline: {
    en: ["Nothing's on the clock right now 👀 No active challenge or open quest."],
    hinglish: ["Abhi koi deadline nahi 👀 Na active challenge, na open quest."],
    hi: ["अभी कोई deadline नहीं 👀 न active challenge, न open quest।"],
    bho: ["अभी कवनो deadline नइखे 👀 ना active challenge, ना open quest।"],
  },

  /* ── Today and focus ────────────────────────────────────────────────── */
  todayNothing: {
    en: ["Nothing due today and no open quests 👀 Want to pick something?"],
    hinglish: ["Aaj kuch due nahi, koi open quest bhi nahi 👀 Kuch naya utha?"],
    hi: ["आज कुछ due नहीं है और कोई open quest भी नहीं 👀"],
    bho: ["आज कुछो due नइखे आ कवनो open quest भी ना 👀"],
  },
  todayNothingQuestsUnknown: {
    en: ["No challenge tasks due today. I couldn't check your quests just now."],
    hinglish: ["Aaj challenge ka kuch due nahi. Quests abhi check nahi ho paye."],
    hi: ["आज कोई challenge task due नहीं। quests अभी check नहीं हो पाए।"],
    bho: ["आज कवनो challenge task due नइखे। quests अभी check ना हो पावल।"],
  },
  todayAllDone: {
    en: [
      "All {total} done today ✅ Streak safe.",
      "Every challenge task done today ({completed}/{total}). Nice 🔥",
    ],
    hinglish: ["Aaj ke saare {total} done ✅ Streak safe hai."],
    hi: ["आज के सभी {total} पूरे ✅ streak सुरक्षित है।"],
    bho: ["आज के सब {total} पूरा ✅ streak बचल बा।"],
  },
  todayOpen: {
    en: ["{completed} of {total} done today. Next: {task} 👀"],
    hinglish: ["Aaj {total} me se {completed} done. Next: {task} 👀"],
    hi: ["आज {total} में से {completed} पूरे। अगला: {task} 👀"],
    bho: ["आज {total} में से {completed} पूरा। अगिला: {task} 👀"],
  },
  todayNoChallengeTasks: {
    en: ["No challenge tasks due today."],
    hinglish: ["Aaj challenge ka kuch due nahi."],
    hi: ["आज कोई challenge task due नहीं।"],
    bho: ["आज कवनो challenge task due नइखे।"],
  },
  todayQuest: {
    en: [" Quest {quest}: {approved}/{total} approved."],
    hinglish: [" Quest {quest}: {approved}/{total} approved."],
    hi: [" Quest {quest}: {total} में से {approved} approved।"],
    bho: [" Quest {quest}: {total} में से {approved} approve।"],
  },
  remainingChallenges: {
    en: ["Today: {count} left on your challenges, starting with {task} 👀"],
    hinglish: ["Aaj challenge ke {count} baaki, pehle {task} 👀"],
    hi: ["आज challenge के {count} बाकी, पहले {task} 👀"],
    bho: ["आज challenge के {count} बाकी बा, पहिले {task} 👀"],
  },
  remainingChallengesDone: {
    en: ["Today's challenge tasks are all done ✅"],
    hinglish: ["Aaj ke challenge tasks sab done ✅"],
    hi: ["आज के challenge tasks सब पूरे ✅"],
    bho: ["आज के challenge task सब पूरा ✅"],
  },
  remainingQuest: {
    en: [" Quest {quest}: {count} still to prove."],
    hinglish: [" Quest {quest}: {count} ka proof baaki."],
    hi: [" Quest {quest}: {count} का proof बाकी।"],
    bho: [" Quest {quest}: {count} के proof बाकी बा।"],
  },
  remainingQuestOnly: {
    en: ["Quest {quest}: {count} still to prove 👀 Don't keep it waiting."],
    hinglish: ["Quest {quest}: {count} ka proof baaki 👀 Quest ko itna wait mat karwa."],
    hi: ["Quest {quest}: {count} का proof बाकी 👀 इसे इतना इंतज़ार मत कराओ।"],
    bho: ["Quest {quest}: {count} के proof बाकी बा 👀 एतना इंतजार मत करवाईं।"],
  },
  remainingNothing: {
    en: ["Nothing left right now ✅ Enjoy it, you earned it."],
    hinglish: ["Abhi kuch baaki nahi ✅ Chill kar, kamaya hai tune."],
    hi: ["अभी कुछ बाकी नहीं ✅ आराम करो, तुमने कमाया है।"],
    bho: ["अभी कुछो बाकी नइखे ✅ आराम करीं।"],
  },
  streakSince: {
    en: ["{days} in a row on {challenge} 🔥 Every one of them counted."],
    hinglish: ["{challenge} pe pichhle {days} se lagatar 🔥 Ek bhi din miss nahi."],
    hi: ["{challenge} पर पिछले {days} से लगातार 🔥"],
    bho: ["{challenge} पर पिछला {days} से लगातार 🔥"],
  },
  streakSinceNone: {
    en: [
      "No streak is running, so there's no 'since' yet 😅 One approved proof today starts the count.",
    ],
    hinglish: [
      "Abhi koi streak chal hi nahi rahi, toh kab se ka sawaal hi nahi 😅 Aaj ek approved proof se ginti shuru.",
    ],
    hi: ["अभी कोई streak चल ही नहीं रही 😅 आज एक approved proof से गिनती शुरू होगी।"],
    bho: ["अभी कवनो streak चलते नइखे 😅 आज एगो approved proof से गिनती शुरू होई।"],
  },
  streakSinceNoChallenge: {
    en: ["No active challenge, so no streak to count yet 😅 Join one and we'll start."],
    hinglish: ["Challenge hi nahi chal raha, toh streak kab se ka sawaal hi nahi 😅 Ek join kar."],
    hi: ["कोई challenge ही नहीं चल रहा, तो streak गिनने को कुछ नहीं 😅 एक join करो।"],
    bho: ["कवनो challenge चलते नइखे, त streak गिने के कुछो ना 😅 एगो join करीं।"],
  },
  todayQuestsUnknown: {
    en: [" I couldn't check your quests just now."],
    hinglish: [" Quests abhi check nahi ho paye."],
    hi: [" quests अभी check नहीं हो पाए।"],
    bho: [" quests अभी check ना हो पावल।"],
  },
  rejectedNudge: {
    en: [" One got rejected. Happens to everyone, fix it and resubmit."],
    hinglish: [" Ek reject hua hai. Sabke saath hota hai, theek karke resubmit kar."],
    hi: [" एक reject हुआ है। सबके साथ होता है, ठीक करके resubmit करो।"],
    bho: [" एगो reject भइल बा। सबका साथे होला, ठीक करके resubmit करीं।"],
  },
  streakNudge: {
    en: [
      " {streak} streak on the line 🔥",
      " {streak} in a row. Don't make me remind you twice 😏",
    ],
    hinglish: [
      " {streak} ki streak daav pe hai 🔥",
      " Proof daal de bhai, sirf plan se streak nahi banti. 😏",
    ],
    hi: [" {streak} की streak दांव पर है 🔥"],
    bho: [" {streak} के streak दांव पर बा 🔥"],
  },
  startNudge: {
    en: [" 10 minutes. That's all I'm asking.", " Still negotiating with it? 👀 Just start."],
    hinglish: [" Ab excuses ko thoda rest de, task ko nahi. 👀", " Bas 10 minute. Shuru kar."],
    hi: [" बस 10 मिनट। शुरू करो।"],
    bho: [" बस 10 मिनट। शुरू करीं।"],
  },
  focusRejected: {
    en: ["Fix {task} first. That proof got rejected, and a quick resubmit gets you back on track."],
    hinglish: ["Pehle {task} theek kar. Proof reject hua tha, jaldi resubmit kar de."],
    hi: ["पहले {task} ठीक करो। proof reject हुआ था, जल्दी resubmit करो।"],
    bho: ["पहिले {task} ठीक करीं। proof reject भइल रहे, जल्दी resubmit करीं।"],
  },
  focusTodoStreak: {
    en: ["Start with {task}. Your {streak} streak is riding on it 🔥"],
    hinglish: ["Pehle {task} nipta 😏 {streak} ki streak daav pe hai 🔥"],
    hi: ["पहले {task} पूरा करो। {streak} की streak दांव पर है 🔥"],
    bho: ["पहिले {task} निपटा द। {streak} के streak दांव पर बा 🔥"],
  },
  focusTodo: {
    en: ["Start with {task} 👀 It's still open for today.", "Pick up {task} and knock it out 😏"],
    hinglish: ["Ek kaam pakad aur nipta de: {task} 😏 Aaj consistency todni nahi hai."],
    hi: ["पहले {task} पूरा करो 👀 आज के लिए अभी बाकी है।"],
    bho: ["पहिले {task} निपटा द 👀 आज खातिर अभी बाकी बा।"],
  },
  focusMore: {
    en: [" Then {more} more."],
    hinglish: [" Uske baad {more} aur."],
    hi: [" उसके बाद {more} और।"],
    bho: [" ओकरा बाद {more} अउर।"],
  },
  focusQuestAfterChallenges: {
    en: ["Challenges are covered. Next up: {quest}, with {count} still needing proof 👀"],
    hinglish: ["Challenges set hain. Ab quest {quest} pe {count} baaki 👀 Proof daal de bhai."],
    hi: ["challenges पूरे हैं। अब quest {quest} पर {count} का proof बाकी है 👀"],
    bho: ["challenges पूरा बा। अब quest {quest} पर {count} के proof बाकी बा 👀"],
  },
  focusQuest: {
    en: [
      "Your move: {quest}, with {count} still needing proof 👀",
      "Next up is {quest}: {count} still need proof 😏",
    ],
    hinglish: [
      "Aaj ka simple mission: {quest} ka ek task nipta 😌 {count} baaki hain.",
      "Tera next kaam: {quest} ke {count} 😏 Quest dekh ke bhaagna nahi hai.",
    ],
    hi: ["अगला काम: {quest}, {count} का proof बाकी है 👀"],
    bho: ["आज एगो task निपटा द भइया 👀 {quest} में {count} बाकी बा। Consistency टूटे मत दिहल जाव।"],
  },
  focusDonePending: {
    en: ["Nothing left for today. {count} waiting on review, so all that's left is patience 😌"],
    hinglish: ["Aaj ka kaam khatam. {count} review me hai, ab bas sabr 😌"],
    hi: ["आज का काम पूरा। {count} review में है, अब बस इंतज़ार 😌"],
    bho: ["आज के काम पूरा। {count} review में बा, अब बस इंतजार 😌"],
  },
  focusDone: {
    en: ["You're done for today 😌 Rest counts too.", "Everything's done today. Go enjoy it 🏆"],
    hinglish: ["Aaj ka sab done 😌 Rest bhi zaroori hai."],
    hi: ["आज का सब पूरा 😌 आराम भी ज़रूरी है।"],
    bho: ["आज के सब पूरा 😌 आराम भी जरूरी बा।"],
  },
  focusNothing: {
    en: ["Nothing pending right now 👀 Join a challenge you'll actually show up for."],
    hinglish: ["Abhi kuch pending nahi 👀 Ek challenge join kar, phir game start."],
    hi: ["अभी कुछ pending नहीं 👀 कोई challenge join करो।"],
    bho: ["अभी कुछो pending नइखे 👀 कवनो challenge join करीं।"],
  },

  /* ── Proof ──────────────────────────────────────────────────────────── */
  noProof: {
    en: ["No proof submitted yet 👀 Upload one and I'll track it here."],
    hinglish: ["Abhi proof submit nahi hua 👀 Ek upload kar de, phir main track kar lunga."],
    hi: ["अभी कोई proof submit नहीं हुआ 👀 एक upload करो, फिर मैं track करूँगा।"],
    bho: ["अभी ले कवनो proof submit ना भइल 👀 एगो upload करीं, तब हम track करब।"],
  },
  proofLatest: {
    en: ["Your latest proof, {proof} ({when}), is {status}."],
    hinglish: ["Latest proof, {proof}: {status}."],
    hi: ["आख़िरी proof, {proof}: {status}।"],
    bho: ["आखिरी proof, {proof}: {status}।"],
  },
  proofApproved: {
    en: [" Nice 🔥"],
    hinglish: [" Badhiya 🔥"],
    hi: [" बढ़िया 🔥"],
    bho: [" बढ़िया 🔥"],
  },
  proofRejected: {
    en: [" Happens to everyone. Fix it and resubmit."],
    hinglish: [" Sabke saath hota hai. Theek karke resubmit kar."],
    hi: [" सबके साथ होता है। ठीक करके resubmit करो।"],
    bho: [" सबका साथे होला। ठीक करके resubmit करीं।"],
  },

  /* ── Rewards ────────────────────────────────────────────────────────── */
  rewardNoneButAvailable: {
    en: ["No reward earned yet 👀 But {parent} still has {reward} in play."],
    hinglish: [
      "Abhi reward earned nahi hua 👀 But {parent} ka {reward} abhi bhi in play hai.",
      "Abhi reward pocket me nahi aaya 👀 Lekin {parent} ka {reward} abhi game me hai.",
    ],
    hi: ["अभी कोई reward नहीं मिला 👀 लेकिन {parent} का {reward} अभी भी दांव पर है।"],
    bho: ["अभी ले कवनो reward ना मिलल 👀 बाकिर {parent} के {reward} अबहियो दांव पर बा।"],
  },
  rewardNone: {
    en: ["No rewards yet 👀 They come from quests that offer one: finish it and it lands here."],
    hinglish: ["Abhi reward pocket me nahi aaya 👀 Reward wale quest poore kar, phir milega."],
    hi: ["अभी कोई reward नहीं 👀 reward वाले quest पूरे करो, फिर मिलेगा।"],
    bho: ["अभी कवनो reward नइखे 👀 reward वाला quest पूरा करीं, तब मिली।"],
  },
  rewardAvailableUnknown: {
    en: [" I couldn't check which rewards you can still earn just now."],
    hinglish: [" Kaunse reward abhi mil sakte hain, ye check nahi ho paya."],
    hi: [" कौन से reward मिल सकते हैं, यह अभी check नहीं हो पाया।"],
    bho: [" कवन reward मिल सकेला, ई अभी check ना हो पावल।"],
  },
  rewardHave: {
    en: ["You've got {count}: {reward} from {quest}, {status} 🏆"],
    hinglish: ["Tere paas {count} hai: {quest} se {reward}, {status} 🏆"],
    hi: ["तुम्हारे पास {count} है: {quest} से {reward}, {status} 🏆"],
    bho: ["रउआ लगे {count} बा: {quest} से {reward}, {status} 🏆"],
  },
  rewardMore: {
    en: [" Plus {more} more."],
    hinglish: [" Aur {more} bhi."],
    hi: [" और {more} भी।"],
    bho: [" अउर {more} भी।"],
  },
  rewardAlsoAvailable: {
    en: [" And {parent} still has {reward} in play."],
    hinglish: [" Aur {parent} ka {reward} abhi bhi in play hai."],
    hi: [" और {parent} का {reward} अभी भी दांव पर है।"],
    bho: [" अउर {parent} के {reward} अबहियो दांव पर बा।"],
  },

  /* ── Motivation ─────────────────────────────────────────────────────── */
  motivationOpen: {
    en: [
      "{name}low-energy days are normal. You don't need to feel like it, you just need to start.",
      "{name}motivation comes after you start, not before. Let's make it small.",
    ],
    hinglish: ["{name}mood ka wait mat kar, bas shuru kar 😌 Chhota sa step bhi count hota hai."],
    hi: ["{name}मन न हो तो भी चलता है, बस शुरू करो 😌 छोटा कदम भी गिनती में आता है।"],
    bho: ["{name}मन ना करे त कवनो बात ना, बस शुरू करीं 😌 छोट कदम भी गिनाला।"],
  },
  motivationTask: {
    en: [" One thing: {task}. Do the smallest version and upload the proof."],
    hinglish: [" Bas ek kaam: {task}. Sabse chhota version kar aur proof daal."],
    hi: [" बस एक काम: {task}। सबसे छोटा version करो और proof डालो।"],
    bho: [" बस एगो काम: {task}। सबसे छोट version करीं आ proof डालीं।"],
  },
  motivationAllDone: {
    en: [" And everything due today is already in. Rest is allowed."],
    hinglish: [" Aur aaj ka sab already done hai. Rest allowed hai."],
    hi: [" और आज का सब पहले ही हो चुका है। आराम करो।"],
    bho: [" आ आज के सब पहिलहीं हो गइल बा। आराम करीं।"],
  },
  motivationNothingDue: {
    en: [" Nothing's due today, so no pressure. Tomorrow's a clean start."],
    hinglish: [" Aaj kuch due nahi, toh no pressure. Kal fresh start."],
    hi: [" आज कुछ due नहीं, तो कोई दबाव नहीं।"],
    bho: [" आज कुछो due नइखे, त कवनो दबाव ना।"],
  },
  motivationUnknown: {
    en: [
      " I couldn't load today's tasks just now, but pick the smallest thing you can do and do that.",
    ],
    hinglish: [" Aaj ke tasks abhi load nahi hue, par sabse chhota kaam utha aur kar de."],
    hi: [" आज के tasks अभी load नहीं हुए, पर सबसे छोटा काम उठाओ और कर दो।"],
    bho: [" आज के tasks अभी load ना भइल, बाकिर सबसे छोट काम उठाईं आ कर दीं।"],
  },
  motivationClose: {
    en: [" Showing up imperfectly still counts 💪"],
    hinglish: [" Imperfect hi sahi, show up karna count hota hai 💪"],
    hi: [" अधूरा ही सही, शुरू करना गिनती में आता है 💪"],
    bho: [" अधूरा सही, शुरू कइल गिनाला 💪"],
  },
} satisfies Record<string, Templates>;

export type PhraseKey = keyof typeof PHRASES;

/** Deterministic variety: the same seed gets the same line. */
export function pick<T>(options: readonly T[], seed: string): T {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return options[h % options.length];
}

/** True when `lang` has its own template for `key` (not the English fallback). */
export function hasTemplate(lang: StrivyLang, key: PhraseKey): boolean {
  return lang === "en" || Boolean((PHRASES[key] as Templates)[lang]?.length);
}

/**
 * One line in `lang`, falling back to English, with {vars} filled in. A var
 * that isn't supplied is left visible as {name} so tests catch it.
 */
export function say(
  lang: StrivyLang,
  key: PhraseKey,
  vars: Vars = {},
  seed = "",
  dialect?: StrivyDialect
): string {
  const templates = PHRASES[key] as Templates;
  const set =
    (dialect === "bhojpuri-roman" ? templates.bhoRoman : undefined) ??
    templates[lang] ??
    PHRASES[key].en;
  const template = pick(set, `${seed}|${key}`);
  return template.replace(/\{(\w+)\}/g, (whole, name: string) =>
    name in vars ? String(vars[name]) : whole
  );
}

/* ── Counted words ───────────────────────────────────────────────────────── */

export type Unit = "day" | "task" | "hour" | "proof" | "quest" | "challenge" | "reward";

const UNITS: Record<StrivyLang, Record<Unit, [string, string]>> = {
  en: {
    day: ["day", "days"],
    task: ["task", "tasks"],
    hour: ["hour", "hours"],
    proof: ["proof", "proofs"],
    quest: ["quest", "quests"],
    challenge: ["challenge", "challenges"],
    reward: ["reward", "rewards"],
  },
  hinglish: {
    day: ["din", "din"],
    task: ["task", "tasks"],
    hour: ["ghanta", "ghante"],
    proof: ["proof", "proofs"],
    quest: ["quest", "quests"],
    challenge: ["challenge", "challenges"],
    reward: ["reward", "rewards"],
  },
  hi: {
    day: ["दिन", "दिन"],
    task: ["task", "tasks"],
    hour: ["घंटा", "घंटे"],
    proof: ["proof", "proofs"],
    quest: ["quest", "quests"],
    challenge: ["challenge", "challenges"],
    reward: ["reward", "rewards"],
  },
  bho: {
    day: ["दिन", "दिन"],
    task: ["task", "task"],
    hour: ["घंटा", "घंटा"],
    proof: ["proof", "proof"],
    quest: ["quest", "quest"],
    challenge: ["challenge", "challenge"],
    reward: ["reward", "reward"],
  },
};

/** "3 days", "1 task", "3 din", "3 दिन". */
export function count(lang: StrivyLang, n: number, unit: Unit): string {
  const [one, many] = UNITS[lang][unit];
  return `${n} ${n === 1 ? one : many}`;
}

/** "3-day" in English ("a 3-day streak"); other languages use the count. */
export function spanOf(lang: StrivyLang, n: number): string {
  return lang === "en" ? `${n}-day` : count(lang, n, "day");
}

/** Names of things Strivy couldn't load, per language. */
const WHAT: Record<Exclude<StrivyLang, "en">, Record<string, string>> = {
  hinglish: {
    "today's tasks": "aaj ke tasks",
    "your challenges": "tere challenges",
    "your streaks": "teri streak",
    "your quests": "tere quests",
    "your proofs": "tere proofs",
    "your rewards": "tere rewards",
    "this week's activity": "is hafte ka data",
  },
  hi: {
    "today's tasks": "आज के tasks",
    "your challenges": "तुम्हारे challenges",
    "your streaks": "तुम्हारी streak",
    "your quests": "तुम्हारे quests",
    "your proofs": "तुम्हारे proofs",
    "your rewards": "तुम्हारे rewards",
    "this week's activity": "इस हफ्ते का data",
  },
  bho: {
    "today's tasks": "आज के tasks",
    "your challenges": "तोहार challenges",
    "your streaks": "तोहार streak",
    "your quests": "तोहार quests",
    "your proofs": "तोहार proofs",
    "your rewards": "तोहार rewards",
    "this week's activity": "एह हफ्ता के data",
  },
};

export function whatLabel(lang: StrivyLang, what: string): string {
  return lang === "en" ? what : (WHAT[lang][what] ?? what);
}
