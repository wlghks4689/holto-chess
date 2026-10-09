import { FEEDBACK_MAX_LENGTH } from "../shared/feedback";
import { FEEDBACK_RETENTION_MS, FINISHED_ROOM_LIFETIME_MS, LOBBY_IDLE_LIFETIME_MS, ROOM_LIFETIME_MS } from "../shared/retention";
import { MAX_REMEMBERED } from "../ui/sessionStore";
import { MAX_RESULTS } from "../ui/finalResultArchive";
import { CONTACT_EMAIL, GA_MEASUREMENT_ID, MINIMUM_AGE, OPERATOR_NAME, SITE_URL, type LegalChrome, type LegalDocument } from "./legalTypes";

const minutes = (ms: number) => ms / 60_000;
const hours = (ms: number) => ms / 3_600_000;
const days = (ms: number) => ms / 86_400_000;
const mail = `[${CONTACT_EMAIL}](mailto:${CONTACT_EMAIL})`;

export const chromeEn: LegalChrome = {
  siteTitle: (kind) => `${kind === "privacy" ? "Privacy Policy" : "Terms of Service"} · PORENA`,
  effective: "Effective",
  home: "Back to PORENA",
  contents: "Contents",
  other: { privacy: "Privacy Policy", terms: "Terms of Service" },
  language: "Language",
};

export const privacyEn: LegalDocument = {
  title: "Privacy Policy",
  intro: [
    "PORENA (the \"Service\") processes only the personal information it needs and describes here what it processes and how. This policy is based on what the Service actually does today.",
    "PORENA offers optional Google sign-in. You can play without signing in. We do not store your Google account name, email or photo, or ask for your phone number, date of birth, address or payment details.",
  ],
  sections: [
    { id: "operator", title: "1. Operator and contact", body: [{ list: [
      "Service: PORENA",
      `Operator and privacy officer: ${OPERATOR_NAME}`,
      `Privacy and service questions: ${mail}`,
      `Website: [${SITE_URL}](${SITE_URL})`,
    ] }] },
    { id: "collected", title: "2. Information we process", body: [
      "**2-1. Feedback and contact form**",
      { list: [
        `What you enter: the type of message (feedback, bug report, question, support), the message (up to ${FEEDBACK_MAX_LENGTH} characters) and, optionally, an email address for a reply`,
        "You only enter an email if you want an answer, and it is accepted only if you agree to its collection and use. Without that consent, the message is sent without an email.",
        "Stored automatically with it: your language setting (e.g. en-US), your browser's User-Agent (browser and operating system type), when it was received and updated, and its handling status",
        "The feedback database does not store IP addresses.",
      ] },
      "**2-2. Multiplayer**",
      { list: [
        "Your nickname (1–8 letters or digits), shown to the other players in the same room",
        "The room code and the player identifier used inside the room",
        "Game state and results: cards, points, BB, rankings, chosen abilities and so on",
        "Reconnection session data: the session token itself is stored only in your browser; the server keeps only its SHA-256 hash.",
      ] },
      "Single play runs entirely in your browser and does not send game data to the server.",
      "**2-3. Technical information processed automatically**",
      "The Service runs on Cloudflare's network, so the following may be processed when you connect:",
      { list: [
        "IP address",
        "Request information: the address requested, request time, response result and other network information",
        "Browser and device information",
        "Security and rate-limiting information",
      ] },
      "IP addresses are used briefly for rate limiting against excessive requests and are not stored in the Service's databases. Service logs (Cloudflare Workers Logs) may record request information and are deleted after Cloudflare's retention period (currently 3 days on the free plan).",
      "**2-4. Optional Google sign-in**",
      { list: [
        "A separate account database stores the Google account identifier (sub), sign-in provider, PORENA account identifier, account creation and last sign-in times, and account status.",
        "Google's signed ID token is used only to verify sign-in. We do not store the original ID, access or refresh tokens.",
        "We store the sign-in session hash, creation and expiry times, and temporary authentication data that prevents forged or replayed sign-in requests.",
        "The Google account identifier is used only to recognise the same account at sign-in. Accounts are currently not linked to multiplayer seats or match history.",
      ] },
    ] },
    { id: "browser", title: "3. Information stored only in your browser", body: [
      "The following is not a user profile on PORENA's servers. It is kept in your browser's storage (localStorage and sessionStorage), and the operator cannot see it. Of these, your nickname and session token are sent to the server when you join or reconnect to a multiplayer room (2-2).",
      { table: { head: ["Item", "What it holds"], rows: [
        ["Nickname", "Used as the default next time you join a room"],
        ["Recent room sessions", `Room codes and reconnection tokens for up to ${MAX_REMEMBERED} recent rooms`],
        ["Room in this tab", "The room code this tab is playing (sessionStorage, cleared when the tab closes)"],
        ["Language", "Korean or English"],
        ["Tutorial progress", "Steps completed and where you left off"],
        ["Round guides", "Auto-show setting and which guides you have seen"],
        ["Sound", "Sound effects on/off and volume"],
        ["Motion", "Cinematic animations on/off"],
        ["Final match history", `Final standings of up to ${MAX_RESULTS} recent matches, including players' nicknames and scores`],
        ["Update reload marker", "A timestamp so the page reloads only once right after a new version is deployed (sessionStorage)"],
      ] } },
      "You can remove this information at any time by clearing the site's data in your browser. Browser storage is not guaranteed to last.",
    ] },
    { id: "analytics", title: "4. Google Analytics", body: [
      `PORENA uses Google Analytics 4 (measurement ID ${GA_MEASUREMENT_ID}) to understand how the Service is used. Google Analytics may process:`,
      { list: [
        "Visit, session and screen usage statistics",
        "Browser and device information",
        "Language",
        "Screen information such as screen size",
        "Approximate location (country, region and city level)",
        "The Google Analytics client identifier (stored in the browser cookies `_ga` and `_ga_*`)",
      ] },
      "Google states that Google Analytics 4 does not log or store IP addresses. IP addresses may still be processed to derive approximate location.",
      "PORENA's Google Analytics property is set to keep user-level and event-level data for 14 months, and new activity does not extend that period. This setting does not apply to Google Analytics' standard aggregated reports.",
      "PORENA shows no advertising and does not use Google Analytics data to identify individual users.",
      "You can opt out by blocking cookies in your browser or by using the [Google Analytics Opt-out Browser Add-on](https://tools.google.com/dlpage/gaoptout). Opting out does not affect the game. See the [Google Privacy Policy](https://policies.google.com/privacy) and [How Google uses information from sites or apps that use our services](https://policies.google.com/technologies/partner-sites) for details.",
      "When PORENA runs inside the Discord app, Discord's security policy may block Google Analytics.",
    ] },
    { id: "discord", title: "5. Discord Activity", body: [
      "When you run PORENA inside the Discord app (as a Discord Activity), it uses the Discord Embedded App SDK to connect to Discord. PORENA currently does not use Discord login (OAuth) or request user information through the Discord API, and does not collect:",
      { list: [
        "Your Discord user ID",
        "Your Discord username or display name",
        "Your Discord email",
        "Your Discord avatar",
        "Your Discord friend list",
        "Discord server member lists",
        "Discord messages",
      ] },
      "The technical launch information Discord provides (application ID, frame_id, instance_id, platform) is used in your browser only to connect to Discord and is not stored in PORENA's databases.",
      "When you connect through Discord, requests pass through Discord's proxy, and the [Discord Privacy Policy](https://discord.com/privacy) applies to that.",
      "If we add Discord account features in the future, we will update this policy before they launch to explain what is processed and why.",
    ] },
    { id: "purpose", title: "6. Why we use it", body: [
      { list: [
        "To provide the game",
        "To create and join multiplayer rooms, reconnect and keep game state in sync",
        "To provide optional Google sign-in, recognise accounts and maintain sign-in sessions",
        "To remember settings such as language, sound and motion",
        "To fix bugs, keep the Service stable and respond to outages",
        "To read and answer feedback and questions",
        "To analyze how the Service is used",
        "To prevent abuse and for security and rate limiting",
      ] },
      "Sign-in identifiers recognise the same account; they are not used to verify your real-world name or profile your individual behavior.",
    ] },
    { id: "retention", title: "7. How long we keep it", body: [
      { table: { head: ["Information", "Retention"], rows: [
        ["Lobby (room before the game starts)", `${minutes(LOBBY_IDLE_LIFETIME_MS)} minutes after the last change (join, ready, leave, nickname change)`],
        ["Game in progress", `Up to ${hours(ROOM_LIFETIME_MS)} hours after the game starts`],
        ["Finished game", `About ${minutes(FINISHED_ROOM_LIFETIME_MS)} minutes after the final standings are shown`],
        ["Feedback records", `Permanently deleted by an automatic job that runs once a day, once ${days(FEEDBACK_RETENTION_MS)} days have passed since receipt (within one day after the ${days(FEEDBACK_RETENTION_MS)} days)`],
        ["Reply email", `Deleted as soon as the request is handled and archived as "handled". Even if not yet handled, deleted with the record ${days(FEEDBACK_RETENTION_MS)} days after receipt`],
        ["Google Analytics", "User-level and event-level data: 14 months"],
        ["Cloudflare service logs", "Cloudflare's retention period (currently 3 days)"],
        ["Browser-stored information", "Until you or your browser clear it"],
        ["Google account link and PORENA account", "While the account is maintained; deleted together after an account deletion request and identity verification"],
        ["Sign-in sessions", "Up to 30 days. Signing out deletes that session immediately; expired server sessions are purged daily"],
        ["Temporary sign-in authentication data", "Valid for up to 10 minutes. Consumed once when processing a callback; expired data is purged when sign-in starts or by the daily job"],
      ] } },
      "When a room's retention period ends, its room state, game results and session hashes stored on the server (Cloudflare Durable Objects) are deleted.",
      "Deleted feedback and account records may remain in the database's disaster-recovery history (Cloudflare D1 Time Travel) for up to 30 days (currently 7 days on the free plan) and then disappear automatically. The operator uses this only to recover from failures.",
    ] },
    { id: "providers", title: "8. Service providers and processing outside Korea", body: [
      "PORENA does not sell personal information and does not provide it to third parties except where required by law. We use the following providers to run the Service, so information may be processed outside the Republic of Korea. It is transferred over the network when you use the Service.",
      { table: { head: ["Provider (country)", "Purpose", "Information"], rows: [
        ["Cloudflare, Inc. (USA, global data centers)", "Hosting the website and game servers, storing feedback and accounts, security and rate limiting", "Information in section 2 and connection data such as IP address · [Privacy Policy](https://www.cloudflare.com/privacypolicy/)"],
        ["Google LLC (USA)", "Optional Google sign-in; Google Analytics usage statistics; Google Fonts", "Sign-in requests and account identifier (2-4); information in section 4; IP address and browser information when fonts are requested · [Privacy Policy](https://policies.google.com/privacy)"],
        ["Discord Inc. (USA)", "Connection and delivery when running inside the Discord app", "Information in section 5 and connection data · [Privacy Policy](https://discord.com/privacy)"],
      ] } },
    ] },
    { id: "children", title: "9. Children under 14", body: [
      `PORENA is intended for users aged ${MINIMUM_AGE} and over. PORENA has no parental consent process, so users under ${MINIMUM_AGE} should not use Google sign-in or enter an email or other personal information in the feedback form.`,
      `If we learn that personal information of a child under ${MINIMUM_AGE} was collected without a legal guardian's consent, we will delete it without delay. If you become aware of this, please tell us at ${mail}.`,
    ] },
    { id: "rights", title: "10. Your rights", body: [
      `You can ask to access, correct or delete your personal information, or to stop its processing. Email ${mail} and we will act on it without delay.`,
      "You can request account deletion through the contact above. After identity verification, the operator deletes the account, Google account link and all its sign-in sessions. Signing out or clearing browser data does not delete the server account.",
      "Feedback records are not linked to sign-in accounts. Telling us the date you sent it, its type, part of the message and the email you left helps us find it; we use these details only for that.",
      "You can clear information stored in your browser yourself by clearing the site's data.",
    ] },
    { id: "cookies", title: "11. Cookies and similar technologies", body: [
      "Google sign-in uses a session cookie (up to 30 days) and a sign-in flow cookie (up to 10 minutes). Both are sent only over HTTPS and cannot be read by scripts. Signing out clears the session cookie. Game settings and reconnection use the browser storage in section 3; Google Analytics uses the cookies in section 4.",
      "You can block or delete cookies and site data in your browser settings. The game still works with cookies blocked, but if browser storage is also blocked, settings and reconnection data may not be saved.",
    ] },
    { id: "security", title: "12. Security measures", body: [{ list: [
      "All traffic is encrypted with HTTPS.",
      "Reconnection tokens are stored on the server only as hashes.",
      "The feedback admin page is protected by a separate address and login, and the admin password is stored only as a hash.",
      "Rate limiting blocks excessive requests and brute-force attempts.",
      "We process only the information we need and delete it automatically when its retention period ends.",
    ] }] },
    { id: "remedies", title: "13. Remedies", body: [
      "For advice or to report a privacy infringement, you can contact the following Korean authorities:",
      { list: [
        "Personal Information Infringement Report Center: 118 (in Korea) · [privacy.kisa.or.kr](https://privacy.kisa.or.kr)",
        "Personal Information Dispute Mediation Committee: 1833-6972 · [www.kopico.go.kr](https://www.kopico.go.kr)",
        "Supreme Prosecutors' Office: 1301 (in Korea) · [www.spo.go.kr](https://www.spo.go.kr)",
        "Korean National Police Agency: 182 (in Korea) · [ecrm.police.go.kr](https://ecrm.police.go.kr)",
      ] },
    ] },
    { id: "changes", title: "14. Changes to this policy", body: [
      "If we change this policy, we will post it on this page with a new effective date. Changes that add information or purposes will be announced before they take effect.",
      "If the Korean and English versions differ, the Korean version prevails.",
    ] },
  ],
};

export const termsEn: LegalDocument = {
  title: "Terms of Service",
  intro: [
    "These terms set the conditions for using PORENA (the \"Service\"). By using the Service you agree to them.",
  ],
  sections: [
    { id: "service", title: "1. The Service", body: [
      `PORENA is a free browser game operated by ${OPERATOR_NAME}. It is a tactical poker autobattler and strategy game in which you buy cards from a shared 52-card pool to build the strongest poker hand. It is offered on the website (${SITE_URL}) and as a Discord Activity.`,
    ] },
    { id: "not-gambling", title: "2. Not real-money gambling", body: [
      "PORENA is a strategy game that uses poker hands as rules. It is not a real-money gambling service.",
      { list: [
        "BB, points, cards, rankings and rewards in the game are in-game values only.",
        "They are not cash, cryptocurrency, gift cards or redeemable currency, cannot be exchanged for real money or assets, and have no real monetary value.",
        "PORENA has no real-money wagers, entry fees or cash prizes.",
        "Using in-game values or results to bet real money or goods is prohibited.",
      ] },
    ] },
    { id: "age", title: "3. Age", body: [
      `PORENA is intended for users aged ${MINIMUM_AGE} and over. When you use it on a third-party platform such as Discord whose minimum age is higher, that platform's minimum age also applies.`,
    ] },
    { id: "account", title: "4. Accounts", body: [
      "Google sign-in is optional; you can play without it. Sign-in recognises the same account and maintains its session. Accounts are currently not linked to multiplayer seats or match history. Settings, progress and match history remain in your browser. You can request account deletion through the contact in the Privacy Policy.",
    ] },
    { id: "nickname", title: "5. Nicknames", body: [
      "Your nickname is shown to other players in the same room. You may not use a nickname that impersonates another person or the operator, contains hateful, discriminatory, sexual or violent content, is unlawful or infringes others' rights. The operator may restrict such nicknames.",
    ] },
    { id: "sessions", title: "6. Multiplayer rooms and sessions", body: [
      { list: [
        "You may share room codes and invite links with the people you want to play with.",
        "The reconnection token stored in your browser is the key to your seat. Do not share or publish it.",
        `Rooms are not permanent. A lobby is deleted ${minutes(LOBBY_IDLE_LIFETIME_MS)} minutes after its last change, a game in progress after at most ${hours(ROOM_LIFETIME_MS)} hours, and a finished game about ${minutes(FINISHED_ROOM_LIFETIME_MS)} minutes after the final standings are shown.`,
        "If you leave during a game, a computer (AI) player takes over your seat, and the results in the meantime stand.",
      ] },
    ] },
    { id: "prohibited", title: "7. Prohibited conduct", body: [
      "You may not:",
      { list: [
        "Hack, tamper with packets or traffic, or modify the client",
        "Abuse the API or bypass rate limits",
        "Use bots or automation to gain an unfair advantage",
        "Steal or use another person's session or reconnection token",
        "Exploit vulnerabilities, or abuse one you found instead of reporting it",
        "Spread malware or disrupt the Service",
        "Harass other players or use hate speech",
        "Infringe intellectual property or other rights of others",
      ] },
      `If you find a vulnerability, please report it to ${mail}.`,
    ] },
    { id: "fair-play", title: "8. Fair play", body: [
      "Multiplayer results are decided by the server's game rules and random values generated by the server. Single play runs the same rules in your browser. Some seats may be played by computer (AI) players.",
    ] },
    { id: "changes", title: "9. Changes and interruptions", body: [
      "Game rules, balance, the interface and supported platforms may change as the Service improves. The operator may suspend all or part of the Service for maintenance, outages or operational reasons and will give notice in advance where possible.",
    ] },
    { id: "local-data", title: "10. Data stored in your browser", body: [
      "Data stored in your browser, such as settings, tutorial progress and match history, can be lost through browser settings, private browsing, changing devices or clearing site data. The operator cannot restore it and does not guarantee that it is kept.",
    ] },
    { id: "feedback", title: "11. Feedback", body: [
      "Do not include passwords, security tokens, reconnection tokens, payment details, national ID numbers or other sensitive information in the feedback form. We may use your feedback to improve the Service. It is handled as described in the [Privacy Policy](/privacy).",
    ] },
    { id: "ip", title: "12. Intellectual property", body: [
      "Rights in PORENA's name, logo, code, design, graphics, audio and other content belong to the operator or their rightful owners.",
      "You are free to make and share gameplay videos, streams and screenshots of PORENA. You may not extract the game's graphics, audio or other assets to redistribute them, or use them in a way that suggests an official service.",
    ] },
    { id: "platforms", title: "13. Third-party platforms", body: [
      "When you use PORENA on a third-party platform such as Discord, that platform's terms and policies apply alongside these terms. The platform operator is responsible for the platform itself.",
    ] },
    { id: "liability", title: "14. Liability", body: [
      "PORENA is provided free of charge, and the operator does not guarantee that it will be uninterrupted or error-free.",
      "The operator is liable under applicable law for damage caused by the operator's intent or gross negligence. These terms do not limit any liability that cannot be excluded by law.",
    ] },
    { id: "restriction", title: "15. Restrictions", body: [
      "If you breach these terms, the operator may take necessary measures such as removing you from a room or restricting access.",
    ] },
    { id: "amendment", title: "16. Changes to these terms", body: [
      "If we change these terms, we will post the new terms and their effective date on this page at least 7 days in advance, or at least 30 days in advance for changes that are unfavorable to users or significant.",
      "If the Korean and English versions differ, the Korean version prevails.",
    ] },
    { id: "law", title: "17. Governing law and disputes", body: [
      "These terms are governed by the laws of the Republic of Korea. Disputes relating to the Service will be resolved in the court with jurisdiction under the Korean Civil Procedure Act.",
    ] },
    { id: "contact", title: "18. Contact", body: [
      `Operator: ${OPERATOR_NAME} · Email: ${mail}`,
    ] },
  ],
};
