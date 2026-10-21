/**
 * src/lib/strivy/push/library.ts
 *
 * Push lines per language, for users whose language STRIVY knows: the one
 * they picked in push settings, else the one they last chatted in. Users
 * with neither get the mixed English/Hinglish library in messages.ts.
 *
 *   en        English
 *   hinglish  Hinglish / Roman Hindi (also used for mixed and Roman Bhojpuri)
 *   hi        Hindi (Devanagari)
 *   bho       Bhojpuri (Devanagari)
 *
 * Same voice in every language: short, playful, cheeky, the odd harmless
 * double meaning (at most one a day), and bad news is never teased.
 * Placeholders are filled only with the candidate's database values; counts
 * and hours are re-worded per language from the raw numbers.
 */
import type { StrivyLang } from "../language";
import type { PushType } from "./planner";

export type PushTone = "info" | "motivational" | "cheeky" | "funny" | "milestone" | "suggestive";

export interface Variant {
  tone: PushTone;
  text: string;
}

/** Every push type, plus the wording for a reward that has actually arrived. */
export type PushLibrary = Record<PushType | "reward_received", Variant[]>;

const v = (tone: PushTone, text: string): Variant => ({ tone, text });

const EN: PushLibrary = {
  morning_checkin: [
    v("info", "Good morning 👀 {count} on your plate today."),
    v("motivational", "Rise and grind 😌 {count} waiting for you today."),
    v("suggestive", "Nice plan. Now show me some action 👀 {count} today."),
    v("funny", "Today's menu: {count}. Chef's kiss if you clear it 🌞"),
  ],
  pending_task: [
    v("cheeky", "Today's proof is still pending 😏 {task} is waiting."),
    v("suggestive", "Show me the proof… then we'll talk progress 😏 {task} is still open."),
    v("motivational", "{task} is still open today. A few minutes, go 💪"),
    v("cheeky", "Today's proof is pending. You know what to do. 😏 {task}"),
  ],
  streak_at_risk: [
    v("cheeky", "Stop teasing your streak… drop today's proof 👀 {streak} streak on {challenge}."),
    v(
      "suggestive",
      "Don't make your streak touch-and-go 🔥 Your {streak} streak on {challenge} needs today's proof."
    ),
    v("info", "Your {streak} streak on {challenge} needs today's proof 🔥"),
  ],
  quest_deadline: [
    v("info", "{quest} ends in about {hours}, with {tasks} left ⏳"),
    v("cheeky", "Don't keep {quest} waiting 👀 It ends in about {hours}."),
  ],
  quest_progress: [
    v("cheeky", "Your {quest} quest is still waiting 👀 {approved}/{total} done."),
    v("suggestive", "Don't keep your quest waiting 👀 {quest}: {approved}/{total} done."),
    v("motivational", "{quest}: {approved}/{total} tasks done. One more today? 💪"),
    v("cheeky", "{quest} is still waiting. Don't keep it waiting 👀"),
  ],
  reward_earned: [
    v("funny", "Cha-ching 👀 You earned {reward} from {quest}."),
    v("milestone", "{reward} from {quest} is yours 🎉"),
  ],
  reward_received: [
    v("milestone", "You received {reward} from {quest} 🎉"),
    v("funny", "Cha-ching 👀 {reward} from {quest} has landed."),
    v("milestone", "Your reward just landed. 🏆 {reward} from {quest}."),
  ],
  proof_verified: [
    v("milestone", "Proof verified ✅ {label} on {parent} counts."),
    v("cheeky", "Approved ✅ {label} on {parent}. Told you so 😏"),
    v("funny", "Proof verified. Nice one. 👀 {label} on {parent} counts."),
  ],
  proof_rejected: [
    v("info", "Your proof for {label} on {parent} needs another go. Fix it and resubmit."),
    v("motivational", "{parent}: {label} needs a resubmit. Happens to everyone 💪"),
  ],
  streak_milestone: [
    v("milestone", "{streak} streak on {challenge} 🔥 Legend behaviour."),
    v("funny", "{streak} streak on {challenge}. Who's stopping you now? 🔥"),
    v("motivational", "{days} strong on {challenge}. Keep the streak alive 🔥"),
  ],
  proof_in_review: [v("info", "Your proof for {label} on {parent} is in review 👀 Hang tight.")],
  inactivity: [
    v("motivational", "{challenge} misses you 👀 One proof today and you're back."),
    v("cheeky", "Long time no see 👀 {challenge} is still waiting for you."),
  ],
  evening_checkin: [
    v("cheeky", "The day's almost over and work's still pending 👀 {count} left."),
    v("motivational", "Still time tonight 🌙 {count} left today."),
  ],
  evening_done: [
    v("milestone", "All {total} done today ✅ Rest easy, legend."),
    v("funny", "Done for the day ✅ All {total} finished. Chill mode unlocked 😌"),
  ],
};

const HINGLISH: PushLibrary = {
  morning_checkin: [
    v("info", "Good morning 👀 Aaj ki list: {count}."),
    v("motivational", "Utho aur shuru ho jao 😌 Aaj baaki: {count}."),
    v("suggestive", "Plan toh sexy hai, ab action bhi dikha de. 👀 Aaj: {count}."),
    v("funny", "Subah ho gayi 🌞 Aaj ka menu: {count}."),
  ],
  pending_task: [
    v("cheeky", "Aaj ka proof abhi pending hai 😏 {task} wait kar raha hai."),
    v("suggestive", "Proof dikha de… progress tabhi maanenge 😏 {task} abhi open hai."),
    v("motivational", "{task} abhi baaki hai. Bas kuch minute, chal 💪"),
    v("cheeky", "Aaj ka proof pending hai. Tu jaanta hai kya karna hai 😏 {task}"),
  ],
  streak_at_risk: [
    v(
      "cheeky",
      "Streak ko itna tease mat kar… aaj ka proof daal de 👀 {challenge} pe {streak} ki streak."
    ),
    v(
      "suggestive",
      "Streak ko touch-and-go mat bana. 🔥 {challenge} pe {streak} ki streak ko aaj ka proof chahiye."
    ),
    v("info", "{challenge} pe {streak} ki streak ko aaj ka proof chahiye 🔥"),
  ],
  quest_deadline: [
    v("info", "{quest} lagbhag {hours} mein khatam, {tasks} baaki ⏳"),
    v("cheeky", "Quest ko itna wait mat karwa 👀 {quest} lagbhag {hours} mein khatam."),
  ],
  quest_progress: [
    v("cheeky", "Tera {quest} quest abhi bhi wait kar raha hai 👀 {approved}/{total} done."),
    v("suggestive", "Quest ko itna wait mat karwa 👀 {quest}: {approved}/{total} done."),
    v("motivational", "{quest}: {approved}/{total} tasks done. Aaj ek aur? 💪"),
  ],
  reward_earned: [
    v("funny", "Cha-ching 👀 {quest} se {reward} jeet liya."),
    v("milestone", "{quest} se {reward} ab tera hai 🎉"),
  ],
  reward_received: [
    v("milestone", "{quest} se {reward} mil gaya 🎉"),
    v("funny", "Cha-ching 👀 {quest} ka {reward} aa gaya."),
    v("milestone", "Tera reward aa gaya 🏆 {quest} se {reward}."),
  ],
  proof_verified: [
    v("milestone", "Proof verified ✅ {parent} pe {label} count ho gaya."),
    v("cheeky", "Approved ✅ {parent} pe {label}. Dekha? Ho gaya na 😏"),
    v("funny", "Proof verified 👀 Nice one. {parent} pe {label} count ho gaya."),
  ],
  proof_rejected: [
    v("info", "{parent} pe {label} ka proof dobara chahiye. Theek karke resubmit kar."),
    v("motivational", "{parent}: {label} ko resubmit karna hai. Sabke saath hota hai 💪"),
  ],
  streak_milestone: [
    v("milestone", "{challenge} pe {streak} ki streak 🔥 Legend behaviour."),
    v("funny", "{challenge} pe {streak} ki streak. Ab kaun rokega? 🔥"),
    v("motivational", "{challenge} pe {days} strong 🔥 Streak zinda rakh."),
  ],
  proof_in_review: [v("info", "{parent} pe {label} ka proof review mein hai 👀 Thoda ruk.")],
  inactivity: [
    v("motivational", "{challenge} tujhe miss kar raha hai 👀 Aaj ek proof aur tu wapas."),
    v("cheeky", "Itna gap? 👀 {challenge} abhi bhi wait kar raha hai."),
  ],
  evening_checkin: [
    v("cheeky", "Kaam pending hai... aur din khatam hone wala hai 👀 {count} baaki."),
    v("motivational", "Raat mein abhi time hai 🌙 Aaj {count} baaki."),
  ],
  evening_done: [
    v("milestone", "Aaj ke saare {total} done ✅ Aaram kar, legend."),
    v("funny", "Aaj ka kaam khatam ✅ Saare {total} done. Ab chill allowed 😌"),
  ],
};

const HI: PushLibrary = {
  morning_checkin: [
    v("info", "सुप्रभात 👀 आज की list: {count}."),
    v("motivational", "उठो और शुरू हो जाओ 😌 आज बाकी: {count}."),
    v("suggestive", "Plan तो sexy है, अब action भी दिखाओ 👀 आज: {count}."),
    v("funny", "सुबह हो गई 🌞 आज का menu: {count}."),
  ],
  pending_task: [
    v("cheeky", "आज का proof अभी pending है 😏 {task} इंतज़ार में है."),
    v("suggestive", "Proof दिखाओ… progress तभी मानेंगे 😏 {task} अभी खुला है."),
    v("motivational", "{task} अभी बाकी है. बस कुछ मिनट, चलो 💪"),
  ],
  streak_at_risk: [
    v(
      "cheeky",
      "Streak को इतना tease मत करो… आज का proof डाल दो 👀 {challenge} पर {streak} की streak."
    ),
    v(
      "suggestive",
      "Streak को touch-and-go मत बनाओ 🔥 {challenge} पर {streak} की streak को आज का proof चाहिए."
    ),
    v("info", "{challenge} पर {streak} की streak को आज का proof चाहिए 🔥"),
  ],
  quest_deadline: [
    v("info", "{quest} लगभग {hours} में खत्म, {tasks} बाकी ⏳"),
    v("cheeky", "Quest को इतना इंतज़ार मत कराओ 👀 {quest} लगभग {hours} में खत्म."),
  ],
  quest_progress: [
    v("cheeky", "तुम्हारा {quest} quest अभी भी इंतज़ार में है 👀 {approved}/{total} पूरे."),
    v("suggestive", "Quest को इतना इंतज़ार मत कराओ 👀 {quest}: {approved}/{total} पूरे."),
    v("motivational", "{quest}: {approved}/{total} tasks पूरे. आज एक और? 💪"),
  ],
  reward_earned: [
    v("funny", "Cha-ching 👀 {quest} से {reward} जीत लिया."),
    v("milestone", "{quest} से {reward} अब तुम्हारा है 🎉"),
  ],
  reward_received: [
    v("milestone", "{quest} से {reward} मिल गया 🎉"),
    v("funny", "Cha-ching 👀 {quest} का {reward} आ गया."),
  ],
  proof_verified: [
    v("milestone", "Proof verified ✅ {parent} पर {label} गिना गया."),
    v("cheeky", "Approved ✅ {parent} पर {label}. देखा? हो गया ना 😏"),
  ],
  proof_rejected: [
    v("info", "{parent} पर {label} का proof दोबारा चाहिए. ठीक करके फिर से भेजो."),
    v("motivational", "{parent}: {label} फिर से भेजना है. सबके साथ होता है 💪"),
  ],
  streak_milestone: [
    v("milestone", "{challenge} पर {streak} की streak 🔥 Legend वाली बात."),
    v("funny", "{challenge} पर {streak} की streak. अब कौन रोकेगा? 🔥"),
  ],
  proof_in_review: [v("info", "{parent} पर {label} का proof review में है 👀 थोड़ा रुको.")],
  inactivity: [
    v("motivational", "{challenge} तुम्हें miss कर रहा है 👀 आज एक proof और तुम वापस."),
    v("cheeky", "इतना gap? 👀 {challenge} अभी भी इंतज़ार में है."),
  ],
  evening_checkin: [
    v("cheeky", "काम pending है… और दिन खत्म होने वाला है 👀 {count} बाकी."),
    v("motivational", "रात में अभी time है 🌙 आज {count} बाकी."),
  ],
  evening_done: [
    v("milestone", "आज के सारे {total} पूरे ✅ आराम करो, legend."),
    v("funny", "आज का काम खत्म ✅ सारे {total} पूरे. अब chill 😌"),
  ],
};

const BHO: PushLibrary = {
  morning_checkin: [
    v("info", "सुप्रभात 👀 आज के list: {count}."),
    v("motivational", "उठीं आ शुरू हो जाईं 😌 आज बाकी: {count}."),
    v("suggestive", "Plan त sexy बा, अब action भी देखाईं 👀 आज: {count}."),
    v("funny", "भोर हो गइल 🌞 आज के menu: {count}."),
  ],
  pending_task: [
    v("cheeky", "आज के proof अभी pending बा 😏 {task} राह देखत बा."),
    v("suggestive", "Proof देखाईं… progress तबे मानल जाई 😏 {task} अभी खुलल बा."),
    v("motivational", "{task} अभी बाकी बा. बस कुछ मिनट, चलीं 💪"),
  ],
  streak_at_risk: [
    v(
      "cheeky",
      "Streak के एतना tease मत करीं… आज के proof डाल दीं 👀 {challenge} पर {streak} के streak."
    ),
    v(
      "suggestive",
      "Streak के touch-and-go मत बनाईं 🔥 {challenge} पर {streak} के streak के आज के proof चाहीं."
    ),
    v("info", "{challenge} पर {streak} के streak के आज के proof चाहीं 🔥"),
  ],
  quest_deadline: [
    v("info", "{quest} करीब {hours} में खतम, {tasks} बाकी ⏳"),
    v("cheeky", "Quest के एतना इंतजार मत करवाईं 👀 {quest} करीब {hours} में खतम."),
  ],
  quest_progress: [
    v("cheeky", "रउरा {quest} quest अभी ले राह देखत बा 👀 {approved}/{total} भइल."),
    v("suggestive", "Quest के एतना इंतजार मत करवाईं 👀 {quest}: {approved}/{total} भइल."),
    v("motivational", "{quest}: {approved}/{total} tasks भइल. आज एगो अउर? 💪"),
  ],
  reward_earned: [
    v("funny", "Cha-ching 👀 {quest} से {reward} जीत लिहनी."),
    v("milestone", "{quest} से {reward} अब रउरा के बा 🎉"),
  ],
  reward_received: [
    v("milestone", "{quest} से {reward} मिल गइल 🎉"),
    v("funny", "Cha-ching 👀 {quest} के {reward} आ गइल."),
  ],
  proof_verified: [
    v("milestone", "Proof verified ✅ {parent} पर {label} गिनाइल."),
    v("cheeky", "Approved ✅ {parent} पर {label}. देखनी? हो गइल नू 😏"),
  ],
  proof_rejected: [
    v("info", "{parent} पर {label} के proof फेर से चाहीं. ठीक करके फेर भेजीं."),
    v("motivational", "{parent}: {label} फेर से भेजे के बा. सबके साथे होला 💪"),
  ],
  streak_milestone: [
    v("milestone", "{challenge} पर {streak} के streak 🔥 Legend वाला काम."),
    v("funny", "{challenge} पर {streak} के streak. अब के रोकी? 🔥"),
  ],
  proof_in_review: [v("info", "{parent} पर {label} के proof review में बा 👀 तनी रुकीं.")],
  inactivity: [
    v("motivational", "{challenge} रउरा के miss करत बा 👀 आज एगो proof आ रउआ वापस."),
    v("cheeky", "एतना gap? 👀 {challenge} अभी ले राह देखत बा."),
  ],
  evening_checkin: [
    v("cheeky", "काम pending बा… आ दिन खतम होखे वाला बा 👀 {count} बाकी."),
    v("motivational", "रात में अभी time बा 🌙 आज {count} बाकी."),
  ],
  evening_done: [
    v("milestone", "आज के सब {total} पूरा ✅ आराम करीं, legend."),
    v("funny", "आज के काम खतम ✅ सब {total} पूरा. अब chill 😌"),
  ],
};

export const LANGUAGE_LIBRARIES: Record<StrivyLang, PushLibrary> = {
  en: EN,
  hinglish: HINGLISH,
  hi: HI,
  bho: BHO,
};
