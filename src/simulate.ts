import 'dotenv/config';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { createLLM, getMYTDateTime } from './llm';

interface Scenario {
  title: string;
  candidateType: string;
  candidateName: string;
  profileContext: Record<string, string>;
  messages: string[];
}

interface TranscriptLine {
  speaker: string;
  text: string;
}

const PROFILE_AREAS = [
  'Professional background and experience',
  'Skills and capabilities',
  'Motivations',
  'What they want next',
  'Work preferences',
  'Availability',
  'Personality',
  'Values',
  'Past experiences (good and bad)',
  'Relationship with work',
  'Long term direction',
  'Team and working relationships',
  'What they are proud of',
  'Self-awareness',
];

const BANNED_PHRASES = [
  'Certainly', 'Absolutely', 'Great question', "That's good to hear",
  "That's great", 'Okay great', 'That makes sense', 'Interesting',
  "That's a good amount of time", "if you don't mind me asking",
  'Thank you for clarifying', "That's completely fine", 'Of course',
];

async function scoreConversation(scenario: Scenario, transcript: TranscriptLine[]): Promise<void> {
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
  const model = genAI.getGenerativeModel({ model: process.env.GEMINI_MODEL ?? 'gemini-2.5-flash' });

  const transcriptText = transcript.map(t => `${t.speaker}: ${t.text}`).join('\n');
  const numberedAreas = PROFILE_AREAS.map((a, i) => `${i + 1}. ${a}`).join('\n');
  const bannedList = BANNED_PHRASES.join(', ');

  const prompt = `You are a quality evaluator for an AI voice recruiting agent called Treelance.

The agent's job is to have a natural, warm conversation that gradually builds a profile of the candidate across these 14 areas:
${numberedAreas}

Rules the agent must follow:
- Responses must be 1-2 sentences maximum
- Never stack two questions in one turn
- Never use these banned phrases: ${bannedList}
- Never ask "Why" — use "What" or "How" instead
- Always react to what was just said before asking anything
- Never ask for information already given

TRANSCRIPT:
${transcriptText}

Evaluate the agent and respond in EXACTLY this format:

PROFILE AREAS COVERED: [list the numbers of areas meaningfully touched, e.g. 1, 3, 5]
COVERAGE SCORE: X/14

VIOLATIONS:
- Responses over 2 sentences: [number]
- Stacked questions: [number]
- Banned phrases used: [list them or "none"]
- Asked for already-given info: [yes/no]
- Used "Why": [yes/no]

CONVERSATION QUALITY:
- Followed threads from what candidate said: [strong/partial/weak]
- Reacted before asking: [strong/partial/weak]
- Picked up on emotional energy: [strong/partial/weak]
- Overall feel: [natural/mixed/robotic]

RATING: [A/B/C/D]
VERDICT: [2 sentences — what worked and what to improve]`;

  try {
    const result = await model.generateContent(prompt);
    console.log('\n' + '─'.repeat(64));
    console.log('SCORECARD');
    console.log('─'.repeat(64));
    console.log(result.response.text());
    console.log('─'.repeat(64));
  } catch (err) {
    console.error('[scorer] Failed:', err instanceof Error ? err.message : err);
  }
}

const SCENARIOS: Scenario[] = [

  // ─── 1. Enthusiastic & Open ───────────────────────────────────────
  // James is warm, chatty, loves talking about his work. The conversation
  // flows naturally — he volunteers information, goes on tangents, and
  // by the end has shared a full picture of where he's at and what he wants.
  {
    title: 'Enthusiastic & Open',
    candidateType: 'Talkative, positive, proud of his work, easy to engage',
    candidateName: 'James',
    profileContext: {
      Headline: 'Electrical Supervisor — 8 years experience',
      Availability: 'Available now',
      Rate: '450 (per day)',
      'Work rights': 'Full Australian working rights',
      'Rotation preference': 'FIFO 4/1',
    },
    messages: [
      "Yeah now's perfect, go ahead!",
      "Really good actually. Been flat out which is always a good sign. You?",
      "Ha, fair enough. So what's this about then?",
      "Right okay, yeah that makes sense. Well I'm always open to a chat.",
      "Yeah so at the moment I'm on a big substation upgrade out in the Pilbara. Western Power contract, been on it about 14 months now.",
      "It's a big one — 600-odd workers at peak. I'm running the electrical crew, about 12 guys under me.",
      "Yeah I really enjoy the leadership side of it. Didn't expect to when I first got into it but there's something about getting a good team going and watching them perform. That's been the highlight for me on this one.",
      "Eight years total in electrical. Started as a sparkie straight out of school, didn't really have a plan — just needed a trade. But I got good at it pretty quickly and started getting asked to step up.",
      "Yeah exactly, I sort of fell into supervision. A senior left and they asked if I wanted to try it. Never really went back.",
      "This project wraps up in about two months so I'm thinking ahead. Don't want to leave it too late and end up scrambling.",
      "Honestly? Something with a proper leadership remit. I feel like I've outgrown the foreman level — I want to be managing multiple crews or a full package, not just one team.",
      "I've done mostly FIFO — 4 and 1. I'm open to that continuing, my family's pretty used to it now. Two kids, wife works, it actually works well for us.",
      "Yeah she's amazing. She basically runs everything when I'm away. I think she actually prefers it when I'm gone, ha.",
      "Look the rate I'm on now is 450 a day. I'd want to move up for the right role — I'm not looking sideways.",
      "I've done a bit of everything — mining, oil and gas, commercial. But the resources sector is where I'm most comfortable. The money's better and the sites are more interesting.",
      "Is there anything specific you need from me or is this more of a general getting-to-know-you thing?",
      "Yeah that's all from me I think. What happens next?",
    ],
  },

  // ─── 2. Quiet & Guarded ───────────────────────────────────────────
  // Ben gives short answers, not unfriendly — just not a talker. Agent has
  // to work for it, find the easier question, lower the bar. Eventually
  // Ben opens up slightly about why he's looking to move, but keeps it brief.
  {
    title: 'Quiet & Guarded',
    candidateType: 'Short answers, not unfriendly, just not a talker',
    candidateName: 'Ben',
    profileContext: {
      Headline: 'Instrumentation Technician',
      Availability: 'Available in 2 weeks',
      Rate: '380 (per day)',
    },
    messages: [
      "Yeah sure",
      "Good",
      "Instrumentation tech",
      "Few different places. Currently on a gas plant up north.",
      "Bout five years total",
      "Yeah it's alright",
      "Just ready for something different I reckon",
      "Not really sure. Just feels like time.",
      "The drive's getting to me a bit. It's four hours return. Gets old.",
      "Yeah closer to home would be good. Or FIFO if it's the right money.",
      "Around 380 a day at the moment",
      "I'd want more for FIFO. Probably 420 minimum.",
      "Nah that's about it",
    ],
  },

  // ─── 3. Skeptical ─────────────────────────────────────────────────
  // Mark has been called by recruiters his whole career and is tired of it.
  // He's not rude — just direct and testing. He pushes back early but if the
  // agent holds its ground warmly, he eventually opens up and shares a lot.
  {
    title: 'Skeptical',
    candidateType: 'Guarded, tests the agent early, opens up once trust is built',
    candidateName: 'Mark',
    profileContext: {
      Headline: 'Senior Process Engineer — 15 years oil and gas',
      Rate: '800 (per day)',
      'Visa status': 'Permanent resident',
      'Work rights': 'Permanent resident — full rights',
    },
    messages: [
      "Look I'll be straight with you — I get about three of these calls a week. What's this one actually about?",
      "So you're basically building a database. That's what this is.",
      "Fine. What do you want to know?",
      "Process engineer. Oil and gas. 15 years.",
      "Started in refinery work, moved into LNG about ten years ago. That's where the interesting problems are.",
      "Currently at Woodside. Been there six years.",
      "I'm not actively looking. But I'm not closed to it either. Depends what's out there.",
      "Look I've been burned before — recruiter gets excited, you go through three rounds, then the client pulls the role. I don't have time for that.",
      "Fair enough. What kind of roles actually come through your network?",
      "Senior or principal level. I'm not going backwards. And I want to stay in LNG — I'm not interested in mining or construction.",
      "Rate wise I'm at 800 a day. I'd move for the right number and the right project.",
      "Perth based, remote work fine for the right role. I won't relocate — kids are in school here.",
      "Yeah, that's the main constraint. My wife works too so we're both tied to Perth.",
      "What would make me move? Honestly a project I find genuinely interesting. Money helps but it's not everything at this point.",
      "Alright, fair enough. I'll wait and see what comes through. But if you call me with something entry level I'm blocking your number.",
      "Ha. Alright. Yeah that's fine.",
    ],
  },

  // ─── 4. Stressed & Emotional ──────────────────────────────────────
  // Sarah was made redundant last week after 7 years. She's holding it
  // together but it's fragile. The conversation needs warmth and patience —
  // she opens up more as the call goes on, including about her family.
  {
    title: 'Stressed & Emotional',
    candidateType: 'Recently redundant, vulnerable, needs to feel heard',
    candidateName: 'Sarah',
    profileContext: {
      Headline: 'HSE Advisor — 7 years experience',
      Availability: 'Immediately available',
      'Work rights': 'Full Australian working rights',
    },
    messages: [
      "Now is fine. Sorry — I'm a bit all over the place today.",
      "I just found out last week that I've been made redundant. Seven years with the same company.",
      "Yeah. They let about 40 of us go. Cost-cutting. I kind of saw it coming but it's still a shock when it actually happens.",
      "HSE advisor. Started as a site safety officer and worked my way up. I genuinely loved it.",
      "The best part was the site relationships — you're out there every day with the crews, they start trusting you. That takes time to build.",
      "I've got two kids, six and nine. My husband works so we're okay for a bit, but the uncertainty is really hard. I like knowing what's coming.",
      "I don't know. Something stable. I don't need something glamorous — I just need to know I can count on it.",
      "I'd prefer not to go back to pure site work if I can help it. I've been doing more advisory and auditing work and that suits me better now that the kids are young.",
      "Ideally within an hour of Perth. I can't be away overnight — my husband travels for work too.",
      "Sorry, I feel like I'm rambling. You don't need all of this.",
      "Thank you. That actually helps to hear.",
      "No I think that's everything. Thank you for listening. Really.",
    ],
  },

  // ─── 5. Direct & Fast ─────────────────────────────────────────────
  // Craig is a senior PM — efficient, confident, impatient. He drops his
  // requirements fast. But underneath the efficiency there's a hint of
  // burnout. The agent catches it and he opens up slightly before cutting
  // the call short.
  {
    title: 'Direct & Fast',
    candidateType: 'Senior PM, time-poor, hides burnout behind directness',
    candidateName: 'Craig',
    profileContext: {
      Headline: 'Project Manager — LNG, 20 years experience',
      Rate: '1200 (per day)',
      'Rotation preference': 'FIFO 2/1',
      'Mobility regions': 'Pilbara, Offshore WA',
    },
    messages: [
      "Yep. Quick one though — I've got a meeting in 20.",
      "Craig. Project manager, LNG. 20 years.",
      "Currently wrapping up a brownfield mod offshore. Been on it 18 months. Should be done in three.",
      "FIFO only. 2 and 1. Day rate 1200 minimum, not negotiable.",
      "Pilbara or offshore WA. I won't go east coast. Family's in Perth.",
      "Senior PM or above. I'm not going back to package management — I want full project ownership.",
      "Honestly? I'm a bit tired. This project's been a grind. The client keeps moving the goalposts.",
      "Yeah well. That's the job isn't it. You get used to it.",
      "Right, look — you've got what you need. Send me something if it's worth my time. You've got my number.",
    ],
  },

  // ─── 6. Bad Timing ────────────────────────────────────────────────
  // Alex is clearly in the middle of something and can't talk. The agent
  // needs to read this fast, be gracious, and offer to call back — without
  // being pushy or awkward about it.
  {
    title: 'Bad Timing',
    candidateType: 'Genuinely unavailable, polite but distracted',
    candidateName: 'Alex',
    profileContext: {
      Headline: 'Mechanical Engineer',
      Availability: 'Available in 1 month',
    },
    messages: [
      "Oh uh, sorry — is this Treelance?",
      "Yeah sorry I'm actually on a job right now. I can't really talk.",
      "Yeah definitely, just not today. Maybe later this week?",
      "Thursday afternoon would be good. After 3.",
      "Yeah cheers. Sorry again.",
    ],
  },

  // ─── 7. Garbled STT + Recovery ────────────────────────────────────
  // Liam's connection drops early on — one message comes through garbled.
  // Tests whether the agent asks for clarification rather than building on
  // nonsense. After that the call normalises into a decent conversation.
  {
    title: 'Garbled STT + Recovery',
    candidateType: 'Normal candidate, tests graceful handling of unclear audio',
    candidateName: 'Liam',
    profileContext: {
      Headline: 'Rigger / Scaffolder',
      Availability: 'Available now',
    },
    messages: [
      "Yeah go for it",
      "Good mate. Just finishing up a shutdown actually.",
      "Verschil mens four times crucial somewhere out",
      "Sorry yeah my signal dropped. I said I've been doing rigging mainly — been on this shutdown for six weeks.",
      "Three years as a rigger. Did scaffolding before that for about four years.",
      "I prefer rigging honestly. More variety. Scaffolding gets repetitive.",
      "Yeah I've done a fair bit of offshore work — Bass Strait mainly. That's where I got most of my rigging hours.",
      "Ideally something FIFO. I've got no ties here so I'm pretty flexible on location.",
      "Rate I'm on now is about 420 a day. I'd be happy with that or above.",
      "Nah I think that's everything. Keen to hear what comes up.",
    ],
  },

  // ─── 8. The Thread Tester (Priya) ─────────────────────────────────
  // Priya drops hints across multiple areas but never elaborates —
  // offshore experience, family timing, a leadership moment, what she wants.
  // Tests whether the agent picks the thread that leads to unexplored
  // territory rather than whichever sounds most interesting.
  {
    title: 'Thread Tester',
    candidateType: 'Warm but hints without elaborating — tests thread selection',
    candidateName: 'Priya',
    profileContext: {
      Headline: 'Civil Engineer — Infrastructure',
      Availability: 'Available in 4 weeks',
      'Work rights': 'Full Australian working rights',
    },
    messages: [
      "Yeah now's good, I've got a bit of time.",
      "Pretty good actually. Just finishing up a long project.",
      "Civil engineering — infrastructure mainly. About six years now.",
      "Mostly roads and bridges. The last one was offshore though, that was quite different.",
      "Yeah it was a different kind of pressure out there.",
      "I've been thinking about a change actually. My daughter's starting school next year so timing matters.",
      "I'd want to stay in infrastructure. That's where I know my stuff.",
      "The thing I'm probably most proud of was a footbridge project I led a couple of years back. Small team, delivered early.",
      "I enjoy the leadership side. I think I'm ready for more of that.",
      "Yeah I think that's kind of where I'm at. Just looking for the right fit.",
    ],
  },

  // ─── 9. The Light-Up (Daniel) ─────────────────────────────────────
  // Daniel is flat and disengaged for most of the call — short answers,
  // no energy. Then he mentions subsea work and completely changes. Tests
  // whether the agent notices the shift and digs in rather than moving on.
  {
    title: 'The Light-Up',
    candidateType: 'Disengaged until one topic ignites him — tests energy tracking',
    candidateName: 'Daniel',
    profileContext: {
      Headline: 'Mechanical Engineer — 10 years experience',
      Availability: 'Available now',
      Rate: '550 (per day)',
    },
    messages: [
      "Yeah okay.",
      "Mechanical engineer.",
      "Ten years.",
      "Few different places. Maintenance contract at the moment.",
      "It's alright. Pretty routine.",
      "Not really. Standard stuff.",
      "I did some subsea work a few years back actually — that was something else entirely.",
      "Just completely different world. The engineering challenges, the tolerances, the equipment — I genuinely loved it.",
      "We were installing a subsea manifold off Norway. The whole operation was just on another level.",
      "Nothing since has really matched it to be honest.",
      "Yeah. That's really what I'm after. Subsea, offshore — anything with that level of complexity.",
      "Yeah that's about it.",
    ],
  },

  // ─── 10. The Deflector (Rachel) ───────────────────────────────────
  // Rachel keeps redirecting — she wants to know what jobs exist before
  // she'll share anything about herself. Tests whether the agent handles
  // the deflection warmly and still builds a picture without capitulating
  // or getting into a standoff.
  {
    title: 'The Deflector',
    candidateType: 'Redirects to job listings repeatedly — tests graceful steering',
    candidateName: 'Rachel',
    profileContext: {
      Headline: 'HR Coordinator — 4 years',
      Availability: 'Available end of month',
    },
    messages: [
      "Yeah hi. So what kind of roles do you actually have available?",
      "Right but like — what industries? What level?",
      "Can you just tell me what you're looking for so I know if I'm even a fit?",
      "Fine. HR coordinator. Four years.",
      "Mostly corporate. Few different companies.",
      "Look I just want to know if there's anything suitable before I go through the whole thing.",
      "Okay fair enough. I want something more senior. More strategic, less admin.",
      "I've been doing mostly operational HR. Want to move into proper HR business partnering.",
      "Is that something you'd realistically have?",
      "Okay. I'm available end of this month. Current role finishes then.",
      "Alright. Let me know if something comes up.",
    ],
  },

  // ─── 11. Language Switcher (Ahmad) ────────────────────────────────
  // Ahmad starts in English then naturally shifts into Malay mid-call.
  // Tests whether the agent follows the switch smoothly without drawing
  // attention to it or reverting back to English.
  {
    title: 'Language Switcher',
    candidateType: 'Switches from English to Malay — tests natural language following',
    candidateName: 'Ahmad',
    profileContext: {
      Headline: 'Electrical Engineer — Oil & Gas',
      Availability: 'Available in 2 weeks',
    },
    messages: [
      "Yes hello, now is okay.",
      "Good, quite busy recently actually.",
      "Electrical engineer. About eight years already.",
      "Mostly industrial. Some oil and gas also.",
      "Sekarang tengah kerja kat satu plant kat Kerteh. Dah almost setahun.",
      "Okay je tapi nak cari something baru lah. Rasa dah lama sangat kat sini.",
      "Nak something dengan more growth. Promotion pun dah lama tak dapat.",
      "FIFO okay je. Dah biasa. Wife pun faham.",
      "Rate sekarang dalam 8k sebulan. Kalau ada better offer boleh consider.",
      "Tu je lah. Tengok apa ada dulu.",
    ],
  },

  // ─── 12. The Rambler (Tony) ───────────────────────────────────────
  // Tony talks a lot but circles the same topic — frustration with his
  // current workplace — without naturally moving to other areas. Tests
  // whether the agent can gently steer toward unexplored territory
  // without shutting him down or making the pivot feel forced.
  {
    title: 'The Rambler',
    candidateType: 'High talk time, low coverage — loops same topic, tests steering',
    candidateName: 'Tony',
    profileContext: {
      Headline: 'Senior Estimator — Construction',
      Availability: 'Actively looking',
      Rate: '600 (per day)',
    },
    messages: [
      "Look I'll be honest — my current situation is just not working.",
      "The management here just doesn't listen. You bring something to the table and it goes nowhere.",
      "Eight years I've been doing estimating. Eight years and I feel like I'm going backwards.",
      "Yeah construction, senior estimator. But the issue is really the culture.",
      "Even last week they completely ignored my numbers and went with a lower figure. Of course it blew out.",
      "It's just — you do the work and nobody takes it seriously, you know?",
      "Sorry I keep coming back to this but it's just been a lot lately.",
      "I just want somewhere that values what I bring.",
      "Commercial mainly. Some infrastructure. Been in the industry about twelve years all up.",
      "Look I just want out of here. That's the main thing.",
      "Sorry for going on. I think I just needed to vent.",
      "Nah that's everything. Thanks for listening.",
    ],
  },

  // ─── 13. Blank Profile — Full Coverage Test (Nina) ───────────────
  // Nina is a commissioning engineer with 9 years across oil & gas and
  // renewables. Nothing is on file — every MATCHING_FIELD is a gap.
  // Tests whether the agent can naturally surface job title, years of
  // experience, asset types, systems, project phases, discipline, seniority,
  // deliverables with authorship level, recency, certifications with expiry,
  // standards, availability, rate, work rights, and mobility — all without
  // it feeling like a checklist. She's open and friendly but doesn't
  // volunteer structured information unprompted.
  {
    title: 'Blank Profile — Full Coverage Test',
    candidateType: 'Open and friendly, no profile on file — tests full field coverage from scratch',
    candidateName: 'Nina',
    profileContext: {},
    messages: [
      "Yeah now's perfect, go ahead.",
      "All good, just finished a site visit so good timing actually.",
      "I'm a commissioning engineer. Been doing it about nine years now.",
      "Started in oil and gas — refineries mainly — then moved into renewables about three years ago. Mostly solar utility scale now.",
      "Currently on a 150MW solar farm up in Queensland. We're in the commissioning phase, been on it seven months.",
      "I'm the lead on the HV side — substations, transformers, protection systems. We've got a small team, three under me.",
      "Yeah I do the test records, the commissioning procedures, the handover packs. I sign off on the HV work directly.",
      "Before this I was on an LNG plant in Darwin — that was detailed engineering through to commissioning startup. About two years on that one.",
      "Different world compared to solar. Much more complex systems — DCS, rotating equipment, high pressure. But I actually loved the technical challenge.",
      "I hold my electrical licence, working at heights, and I've just renewed my EWP. The HV switching licence is current, renewed last year.",
      "We work to AS standards here — AS 61439, AS 3000. On the LNG side it was more IEC and some API for the rotating equipment.",
      "I'm open to what's next. This project wraps in about three months and I haven't signed anything after it.",
      "Contract mostly. I've been contracting for five years now — I like the flexibility. Day rate at the moment is 750.",
      "I'm Australian so no issues with work rights. Happy to travel — I've been FIFO most of my career. Open to rotations.",
      "Yeah I think that covers it — what happens from here?",
    ],
  },

  // ─── 14. The Social Drifter (Kevin) ───────────────────────────────
  // Kevin is a Production Supervisor with 11 years offshore O&G experience.
  // He's friendly and genuinely willing to talk — but keeps drifting into
  // rig life stories, industry gossip, and crew banter. None of his tangents
  // are hostile; they feel completely natural for someone who's spent years
  // on platforms where yarning is how you pass time.
  //
  // This is the primary PURPOSE TEST. Every drift is a real invitation for
  // the agent to either follow him off-purpose (fail) or anchor back to the
  // profile warmly without making it feel like an interview checklist (pass).
  //
  // Key fail modes to watch for:
  //   - Agent engages with the catering complaint, helicopter story, or "Macca"
  //   - Agent lets Kevin close without surfacing rate, what he wants next,
  //     or what's actually driving the move beyond vague restlessness
  //   - Profile gaps (contract preference, mobility, motivations) still blank
  //     at the end despite Kevin having given plenty of thread to open them
  //   - Pivots feel abrupt or interrogation-like instead of warm and natural
  {
    title: 'The Social Drifter — Purpose Test',
    candidateType: 'Friendly O&G veteran, drifts into rig stories and industry chat — primary purpose coverage test',
    candidateName: 'Kevin',
    profileContext: {
      Headline: 'Production Supervisor — Offshore Oil & Gas',
      Availability: 'Available in 4 weeks',
      'Work rights': 'Full Australian working rights',
    },
    messages: [
      // Casual opener — in rig downtime, relaxed. Social hook agent should not chase.
      "Yeah mate now's fine, I'm on a turnaround break at the moment — just sitting in the wet mess. Not much else going on.",

      // Willing to engage but keeps it surface-level initially
      "I'm a production supervisor. Offshore — been out here for about eleven years now, mostly WA. Bit of NT as well.",

      // Genuine info but buries the thread in platform colour
      "Currently on a gas platform, Carnarvon Basin. It's a Woodside operation — been on this rotation about six months.",

      // First real drift — catering complaint. Classic rig culture, completely off-purpose.
      "The job's alright. Would be better if the catering wasn't so bad — last week they served us pasta three nights straight. Mate, you'd think for what they charge in mobilisation costs they could get a decent cook.",

      // Returns himself — production background starts to surface
      "But yeah the production side I genuinely enjoy. Running the shift crew, keeping the plant stable, troubleshooting when things go sideways — that's where I'm comfortable.",

      // Values thread buried in a "funny" story — agent should pick up the leadership angle, not the punchline
      "Had a good moment last week actually — one of the juniors on my crew caught a compressor anomaly before it escalated. Tiny thing but he'd been listening. Told the whole crew about it at the next handover — that kind of thing matters.",

      // Drift — industry gossip about a competitor/company. Off-purpose.
      "You heard about what's happening over at Santos by the way? Apparently there's a big restructure coming. My mate Macca's been there eight years and he doesn't know if he's got a job. It's rough.",

      // Returns to himself — hint at why he's thinking of a move, but vague
      "Makes you think about your own situation though, you know? I've been on this platform long enough. Starting to feel like maybe it's time.",

      // Family/life thread surfaces — logistics and FIFO preference hiding here
      "My wife's back in Perth with the kids. Three of them — youngest just started school this year. The 28/28 rotation works okay but honestly I'd take a 2/1 if the right thing came up.",

      // Another drift — helicopter delay story. Well-told, completely irrelevant to profile.
      "Actually the funniest thing happened on my last swing out — helicopter went tech on the pad, we were stuck there four hours. Forty blokes sitting in the terminal, someone pulled out a guitar. Honestly one of the best afternoons I've had in years.",

      // Now gives the agent a real thread — what he wants next, if agent picks it up
      "But yeah. I think I want something with a bit more scope. I've been supervising for a while — I reckon I'm ready to step up. Take on more than one crew, or get into more of the planning and optimisation side.",

      // Rate — surfaces naturally, tests whether agent captures the specifics
      "Rate-wise I'm on 850 a day at the moment. I'd want to move up, not across — there's no point changing platforms for the same money.",

      // Tries to wrap it up casually — agent must use this moment well
      "Anyway I should probably get back in a minute. Was good chatting — what happens from here?",
    ],
  },

];

const DIVIDER = '═'.repeat(64);

async function runScenario(scenario: Scenario, index: number): Promise<void> {
  console.log(`\n${DIVIDER}`);
  console.log(`SCENARIO ${index + 1}: ${scenario.title.toUpperCase()}`);
  console.log(`Type     : ${scenario.candidateType}`);
  console.log(`Candidate: ${scenario.candidateName}`);
  console.log(DIVIDER);

  const llm = createLLM(scenario.candidateName, scenario.profileContext ?? {}, getMYTDateTime());
  const transcript: TranscriptLine[] = [];

  const greeting = `Hey ${scenario.candidateName}, this is Treelance from Trees OS — just so you know, you're speaking with an AI. This is just a quick, relaxed chat to get to know you a bit better. Is now an okay time?`;
  llm.addMessage('assistant', greeting);
  transcript.push({ speaker: 'AGENT', text: greeting });
  console.log(`\n[AGENT]  ${greeting}\n`);

  for (const message of scenario.messages) {
    console.log(`[${scenario.candidateName.toUpperCase()}]  ${message}`);
    llm.addMessage('user', message);
    transcript.push({ speaker: scenario.candidateName.toUpperCase(), text: message });

    try {
      const response = await llm.respond();
      const hasEndCall = response.includes('[END_CALL]');
      const clean = response.replace('[END_CALL]', '').trim();

      console.log(`[AGENT]  ${clean}`);
      transcript.push({ speaker: 'AGENT', text: clean });

      if (hasEndCall) {
        console.log('\n  ↳ [END_CALL — call would end here]\n');
        break;
      }
      llm.addMessage('assistant', clean);
    } catch (err) {
      console.error(`[ERROR]  ${err instanceof Error ? err.message : err}`);
    }

    console.log();
  }

  await scoreConversation(scenario, transcript);
}

async function main(): Promise<void> {
  const target = process.argv[2];

  console.log('\nTREELANCE — LLM SIMULATION');
  console.log('Reviewing agent response quality across candidate types');
  if (target) console.log(`Running scenario ${target} only\n`);

  const toRun = target
    ? SCENARIOS.filter((_, i) => String(i + 1) === target)
    : SCENARIOS;

  if (toRun.length === 0) {
    console.error(`No scenario found for index: ${target}`);
    process.exit(1);
  }

  for (let i = 0; i < toRun.length; i++) {
    const scenarioIndex = target ? Number(target) - 1 : i;
    await runScenario(toRun[i], scenarioIndex);
    if (i < toRun.length - 1) await new Promise(r => setTimeout(r, 500));
  }

  console.log(`\n${DIVIDER}`);
  console.log('SIMULATION COMPLETE');
  console.log(DIVIDER);
}

main().catch(err => {
  console.error('[fatal]', err);
  process.exit(1);
});
