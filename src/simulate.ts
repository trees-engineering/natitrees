import 'dotenv/config';
import { createLLM } from './llm';

interface Scenario {
  title: string;
  candidateType: string;
  candidateName: string;
  profileContext: Record<string, string>;
  messages: string[];
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

];

const DIVIDER = '═'.repeat(64);

async function runScenario(scenario: Scenario, index: number): Promise<void> {
  console.log(`\n${DIVIDER}`);
  console.log(`SCENARIO ${index + 1}: ${scenario.title.toUpperCase()}`);
  console.log(`Type     : ${scenario.candidateType}`);
  console.log(`Candidate: ${scenario.candidateName}`);
  console.log(DIVIDER);

  const llm = createLLM([], scenario.candidateName, scenario.profileContext);

  const greeting = `Hey ${scenario.candidateName}, this is Treelance from Trees OS — just so you know, you're speaking with an AI. This is just a quick, relaxed chat to get to know you a bit better so we can match you to the right opportunities. Is now an okay time?`;
  llm.addMessage('assistant', greeting);
  console.log(`\n[AGENT]  ${greeting}\n`);

  for (const message of scenario.messages) {
    console.log(`[${scenario.candidateName.toUpperCase()}]  ${message}`);
    llm.addMessage('user', message);

    try {
      const response = await llm.respond();
      const hasEndCall = response.includes('[END_CALL]');
      const clean = response.replace('[END_CALL]', '').trim();

      console.log(`[AGENT]  ${clean}`);
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
