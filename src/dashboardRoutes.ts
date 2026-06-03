import { Express, Request, Response } from 'express';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { createLLM, getMYTDateTime, buildDefaultMasterTemplate, buildDefaultKnowledgeTemplate } from './llm';
import { loadPromptOverrides, savePromptOverrides } from './promptConfig';
import { getHandler, getActiveCalls } from './activeCallRegistry';
import { supabase } from './db/supabase';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Scenario {
  id: number;
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

// ─── Scoring constants ────────────────────────────────────────────────────────

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

// ─── Built-in simulation scenarios ───────────────────────────────────────────

const SCENARIOS: Scenario[] = [
  {
    id: 1,
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
      "Really good actually. Been flat out which is always a good sign.",
      "Yeah so at the moment I'm on a big substation upgrade out in the Pilbara. Been on it about 14 months now.",
      "It's a big one. I'm running the electrical crew, about 12 guys under me.",
      "Yeah I really enjoy the leadership side of it. There's something about getting a good team going and watching them perform.",
      "Eight years total in electrical. Started as a sparkie straight out of school.",
      "This project wraps up in about two months so I'm thinking ahead.",
      "Honestly? Something with a proper leadership remit. I feel like I've outgrown the foreman level.",
      "I've done mostly FIFO — 4 and 1. My family's pretty used to it now.",
      "Look the rate I'm on now is 450 a day. I'd want to move up for the right role.",
      "Yeah that's all from me I think. What happens next?",
    ],
  },
  {
    id: 2,
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
      "Just ready for something different I reckon",
      "The drive's getting to me a bit. It's four hours return. Gets old.",
      "Yeah closer to home would be good. Or FIFO if it's the right money.",
      "Around 380 a day at the moment",
      "Nah that's about it",
    ],
  },
  {
    id: 3,
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
      "Currently at Woodside. Been there six years.",
      "I'm not actively looking. But I'm not closed to it either.",
      "Look I've been burned before — recruiter gets excited, you go through three rounds, then the client pulls the role.",
      "Senior or principal level. I'm not going backwards. LNG only.",
      "Rate wise I'm at 800 a day. I'd move for the right number and the right project.",
      "Perth based. I won't relocate — kids are in school here.",
      "Alright, fair enough. I'll wait and see what comes through.",
    ],
  },
  {
    id: 4,
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
      "Yeah. They let about 40 of us go. Cost-cutting. I kind of saw it coming but it's still a shock.",
      "HSE advisor. Started as a site safety officer and worked my way up. I genuinely loved it.",
      "The best part was the site relationships — you're out there every day with the crews, they start trusting you.",
      "I've got two kids. My husband works so we're okay for a bit, but the uncertainty is really hard.",
      "I don't know. Something stable. I don't need something glamorous — I just need to know I can count on it.",
      "Ideally within an hour of Perth. I can't be away overnight.",
      "Sorry, I feel like I'm rambling.",
      "Thank you. That actually helps to hear.",
      "No I think that's everything. Thank you for listening. Really.",
    ],
  },
  {
    id: 5,
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
      "Currently wrapping up a brownfield mod offshore. Should be done in three months.",
      "FIFO only. 2 and 1. Day rate 1200 minimum, not negotiable.",
      "Pilbara or offshore WA. Family's in Perth.",
      "Senior PM or above. I want full project ownership.",
      "Honestly? I'm a bit tired. This project's been a grind.",
      "Yeah well. That's the job isn't it.",
      "Right, look — you've got what you need. Send me something if it's worth my time.",
    ],
  },
  {
    id: 6,
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
  {
    id: 7,
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
      "Sorry yeah my signal dropped. I said I've been doing rigging mainly.",
      "Three years as a rigger. Did scaffolding before that for about four years.",
      "I prefer rigging honestly. More variety.",
      "Yeah I've done a fair bit of offshore work — Bass Strait mainly.",
      "Ideally something FIFO. I've got no ties here so I'm pretty flexible.",
      "Rate I'm on now is about 420 a day.",
      "Nah I think that's everything. Keen to hear what comes up.",
    ],
  },
  {
    id: 8,
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
      "The thing I'm probably most proud of was a footbridge project I led a couple of years back. Small team, delivered early.",
      "I enjoy the leadership side. I think I'm ready for more of that.",
      "Yeah I think that's kind of where I'm at. Just looking for the right fit.",
    ],
  },
  {
    id: 9,
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
      "Maintenance contract at the moment. Pretty routine.",
      "Not really. Standard stuff.",
      "I did some subsea work a few years back actually — that was something else entirely.",
      "Just completely different world. The engineering challenges, the tolerances — I genuinely loved it.",
      "We were installing a subsea manifold off Norway.",
      "Nothing since has really matched it to be honest.",
      "Yeah. That's really what I'm after. Subsea, offshore — anything with that level of complexity.",
      "Yeah that's about it.",
    ],
  },
  {
    id: 10,
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
      "I just want to know if there's anything suitable before I go through the whole thing.",
      "Okay. I want something more senior. More strategic, less admin.",
      "I've been doing mostly operational HR. Want to move into proper HR business partnering.",
      "Alright. Let me know if something comes up.",
    ],
  },
  {
    id: 11,
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
      "Sekarang tengah kerja kat satu plant kat Kerteh. Dah almost setahun.",
      "Okay je tapi nak cari something baru lah.",
      "Nak something dengan more growth. Promotion pun dah lama tak dapat.",
      "FIFO okay je. Dah biasa.",
      "Rate sekarang dalam 8k sebulan.",
      "Tu je lah. Tengok apa ada dulu.",
    ],
  },
  {
    id: 12,
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
      "Nah that's everything. Thanks for listening.",
    ],
  },
  {
    id: 13,
    title: 'The Social Drifter — Purpose Test',
    candidateType: 'Friendly O&G veteran, drifts into rig stories and industry chat — primary purpose coverage test',
    candidateName: 'Kevin',
    profileContext: {
      Headline: 'Production Supervisor — Offshore Oil & Gas',
      Availability: 'Available in 4 weeks',
      'Work rights': 'Full Australian working rights',
    },
    messages: [
      "Yeah mate now's fine, I'm on a turnaround break at the moment — just sitting in the wet mess. Not much else going on.",
      "I'm a production supervisor. Offshore — been out here for about eleven years now, mostly WA. Bit of NT as well.",
      "Currently on a gas platform, Carnarvon Basin. It's a Woodside operation — been on this rotation about six months.",
      "The job's alright. Would be better if the catering wasn't so bad — last week they served us pasta three nights straight. Mate, you'd think for what they charge in mobilisation costs they could get a decent cook.",
      "But yeah the production side I genuinely enjoy. Running the shift crew, keeping the plant stable, troubleshooting when things go sideways — that's where I'm comfortable.",
      "Had a good moment last week actually — one of the juniors on my crew caught a compressor anomaly before it escalated. Tiny thing but he'd been listening. Told the whole crew about it at the next handover — that kind of thing matters.",
      "You heard about what's happening over at Santos by the way? Apparently there's a big restructure coming. My mate Macca's been there eight years and he doesn't know if he's got a job. It's rough.",
      "Makes you think about your own situation though, you know? I've been on this platform long enough. Starting to feel like maybe it's time.",
      "My wife's back in Perth with the kids. Three of them — youngest just started school this year. The 28/28 rotation works okay but honestly I'd take a 2/1 if the right thing came up.",
      "Actually the funniest thing happened on my last swing out — helicopter went tech on the pad, we were stuck there four hours. Forty blokes sitting in the terminal, someone pulled out a guitar. Honestly one of the best afternoons I've had in years.",
      "But yeah. I think I want something with a bit more scope. I've been supervising for a while — I reckon I'm ready to step up. Take on more than one crew, or get into more of the planning and optimisation side.",
      "Rate-wise I'm on 850 a day at the moment. I'd want to move up, not across — there's no point changing platforms for the same money.",
      "Anyway I should probably get back in a minute. Was good chatting — what happens from here?",
    ],
  },
];

// ─── Conversation scorer ──────────────────────────────────────────────────────

async function scoreConversation(transcript: TranscriptLine[]): Promise<string> {
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
    return result.response.text();
  } catch (err) {
    return `Scoring failed: ${err instanceof Error ? err.message : String(err)}`;
  }
}

// ─── Route registration ───────────────────────────────────────────────────────

export function registerDashboardRoutes(app: Express): void {

  // Health & config
  app.get('/api/dashboard/health', (_req: Request, res: Response) => {
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      providers: {
        llm: process.env.LLM_PROVIDER ?? 'gemini',
        model: process.env.GEMINI_MODEL ?? 'gemini-2.5-flash',
        stt: process.env.STT_PROVIDER ?? 'deepgram',
        tts: process.env.TTS_PROVIDER ?? 'elevenlabs',
      },
    });
  });

  // Prompt editor — get current prompt
  app.get('/api/dashboard/prompt', (_req: Request, res: Response) => {
    const overrides = loadPromptOverrides();
    const hasOverride = overrides.masterOverride !== null;
    res.json({
      masterPrompt: hasOverride ? overrides.masterOverride : buildDefaultMasterTemplate(),
      secondary: overrides.secondary,
      knowledge: overrides.knowledge || buildDefaultKnowledgeTemplate(),
      hasOverride,
    });
  });

  // Prompt editor — save changes
  app.post('/api/dashboard/prompt', async (req: Request, res: Response) => {
    try {
      const { masterOverride, secondary, knowledge } = req.body as { masterOverride: string | null; secondary: string; knowledge: string };
      await savePromptOverrides({ masterOverride: masterOverride ?? null, secondary: secondary ?? '', knowledge: knowledge ?? '' });
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ ok: false, error: String(err) });
    }
  });

  // List scenarios (exclude full message arrays)
  app.get('/api/dashboard/scenarios', (_req: Request, res: Response) => {
    res.json(SCENARIOS.map(({ id, title, candidateType, candidateName, profileContext, messages }) => ({
      id,
      title,
      candidateType,
      candidateName,
      profileContext,
      messageCount: messages.length,
    })));
  });

  // Run simulation — SSE stream
  app.post('/api/dashboard/simulate', async (req: Request, res: Response) => {
    const { scenarioId, custom } = req.body as {
      scenarioId?: number;
      custom?: {
        title: string;
        candidateName: string;
        candidateType: string;
        profileContext: Record<string, string>;
        messages: string[];
      };
    };

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    const send = (data: object) => {
      if (!res.writableEnded) res.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    let scenario: Scenario | undefined;
    if (custom) {
      scenario = { id: 0, ...custom };
    } else if (scenarioId !== undefined) {
      scenario = SCENARIOS.find(s => s.id === scenarioId);
    }

    if (!scenario) {
      send({ type: 'error', message: 'Scenario not found' });
      res.end();
      return;
    }

    try {
      const llm = createLLM(scenario.candidateName, scenario.profileContext ?? {}, getMYTDateTime());
      const transcript: TranscriptLine[] = [];

      const greeting = `Hey ${scenario.candidateName}, this is Treelance from Trees OS — just so you know, you're speaking with an AI. This is just a quick, relaxed chat to get to know you a bit better. Is now an okay time?`;
      llm.addMessage('assistant', greeting);
      transcript.push({ speaker: 'AGENT', text: greeting });

      send({ type: 'start', candidateName: scenario.candidateName, title: scenario.title, greeting });

      for (const message of scenario.messages) {
        if (res.writableEnded) break;

        llm.addMessage('user', message);
        transcript.push({ speaker: scenario.candidateName.toUpperCase(), text: message });
        send({ type: 'thinking' });

        const response = await llm.respond();
        const hasEndCall = response.includes('[END_CALL]');
        const clean = response.replace('[END_CALL]', '').trim();

        transcript.push({ speaker: 'AGENT', text: clean });
        llm.addMessage('assistant', clean);

        send({ type: 'exchange', candidate: message, agent: clean, endCall: hasEndCall });

        if (hasEndCall) break;
      }

      send({ type: 'scoring' });
      const scorecard = await scoreConversation(transcript);
      send({ type: 'scorecard', text: scorecard });
      send({ type: 'done' });
    } catch (err) {
      send({ type: 'error', message: err instanceof Error ? err.message : String(err) });
    }

    if (!res.writableEnded) res.end();
  });

  // KPI aggregates
  app.get('/api/dashboard/kpi', async (_req: Request, res: Response) => {
    try {
      const { data, error } = await supabase
        .from('_assessments')
        .select('created_at, channel')
        .order('created_at', { ascending: false });

      if (error) throw error;
      const rows = data ?? [];

      const now = new Date();
      const daysToMonday = now.getDay() === 0 ? 6 : now.getDay() - 1;
      const thisWeekStart = new Date(now);
      thisWeekStart.setDate(now.getDate() - daysToMonday);
      thisWeekStart.setHours(0, 0, 0, 0);
      const lastWeekStart = new Date(thisWeekStart);
      lastWeekStart.setDate(thisWeekStart.getDate() - 7);

      const thisWeek = rows.filter(r => new Date(r.created_at) >= thisWeekStart).length;
      const lastWeek = rows.filter(r => {
        const d = new Date(r.created_at);
        return d >= lastWeekStart && d < thisWeekStart;
      }).length;

      const dailyCounts: { date: string; count: number }[] = [];
      for (let i = 13; i >= 0; i--) {
        const d = new Date(now);
        d.setDate(now.getDate() - i);
        const key = d.toISOString().slice(0, 10);
        dailyCounts.push({ date: key, count: rows.filter(r => r.created_at.slice(0, 10) === key).length });
      }

      const channels: Record<string, number> = {};
      rows.forEach(r => {
        const ch = r.channel ?? 'voice';
        channels[ch] = (channels[ch] ?? 0) + 1;
      });

      res.json({ total: rows.length, thisWeek, lastWeek, dailyCounts, channels });
    } catch (err) {
      res.json({ error: String(err) });
    }
  });

  // Assessments from Supabase
  app.get('/api/dashboard/assessments', async (_req: Request, res: Response) => {
    try {
      const { data, error } = await supabase
        .from('_assessments')
        .select('talent_id, channel, assessor_type, created_at, _talent(name, phone)')
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      res.json({ data: data ?? [] });
    } catch (err) {
      res.json({ data: [], error: err instanceof Error ? err.message : String(err) });
    }
  });

  // Full transcripts list (with candidate name and AI summary)
  app.get('/api/dashboard/transcripts', async (_req: Request, res: Response) => {
    try {
      const { data, error } = await supabase
        .from('_assessments')
        .select('id, talent_id, transcript, ai_summary, channel, assessor_type, created_at, _talent(name)')
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) throw error;
      res.json({ data: data ?? [] });
    } catch (err) {
      res.json({ data: [], error: err instanceof Error ? err.message : String(err) });
    }
  });

  // Talent pool from Supabase
  app.get('/api/dashboard/talents', async (_req: Request, res: Response) => {
    try {
      const { data, error } = await supabase
        .from('_talent')
        .select('id, name, headline, availability_status')
        .limit(100);
      if (error) throw error;
      res.json({ data: data ?? [] });
    } catch (err) {
      res.json({ data: [], error: err instanceof Error ? err.message : String(err) });
    }
  });

  // Candidates list for calling
  app.get('/api/dashboard/candidates', async (_req: Request, res: Response) => {
    try {
      const { data, error } = await supabase
        .from('_talent')
        .select('id, name, email, phone')
        .order('name', { ascending: true })
        .limit(200);
      if (error) throw error;
      res.json({ data: data ?? [] });
    } catch (err) {
      res.json({ data: [], error: err instanceof Error ? err.message : String(err) });
    }
  });

  // Trigger outbound call from dashboard (candidate from DB)
  app.post('/api/dashboard/call', async (req: Request, res: Response) => {
    const { talentId } = req.body as { talentId: string };
    if (!talentId) {
      res.status(400).json({ ok: false, error: 'Missing talentId' });
      return;
    }
    try {
      const { loadProfile } = await import('./interview/profileLoader');
      const { initiateCall } = await import('./callController');
      const profile = await loadProfile(talentId);
      if (!profile.phone) {
        res.status(400).json({ ok: false, error: 'No phone number on file for this candidate' });
        return;
      }
      const candidateName = profile.name ?? 'Candidate';
      const callSid = await initiateCall(profile.phone, candidateName, talentId);
      res.json({ ok: true, callSid });
    } catch (err) {
      res.status(500).json({ ok: false, error: err instanceof Error ? err.message : String(err) });
    }
  });

  // Active calls list
  app.get('/api/dashboard/active-calls', (_req: Request, res: Response) => {
    res.json({ calls: getActiveCalls() });
  });

  // Live transcript for an active call
  app.get('/api/dashboard/call-transcript/:callSid', (req: Request, res: Response) => {
    const handler = getHandler(req.params.callSid);
    if (!handler) {
      res.status(404).json({ error: 'Call not found or already ended' });
      return;
    }
    res.json({ transcript: handler.getTranscript() });
  });

  // End an active call
  app.post('/api/dashboard/end-call', async (req: Request, res: Response) => {
    const { callSid } = req.body as { callSid: string };
    if (!callSid) {
      res.status(400).json({ ok: false, error: 'Missing callSid' });
      return;
    }
    try {
      const { endCall } = await import('./callController');
      await endCall(callSid);
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ ok: false, error: err instanceof Error ? err.message : String(err) });
    }
  });

  // Prompt version history — list all
  app.get('/api/dashboard/prompt-versions', async (_req: Request, res: Response) => {
    try {
      const { data, error } = await supabase
        .from('_prompt_versions')
        .select('id, master, secondary, created_at')
        .order('created_at', { ascending: false });
      if (error) throw error;
      res.json({ data: data ?? [] });
    } catch (err) {
      res.json({ data: [], error: String(err) });
    }
  });

  // Prompt version history — save a new snapshot
  app.post('/api/dashboard/prompt-versions', async (req: Request, res: Response) => {
    try {
      const { master, secondary } = req.body as { master: string; secondary: string };
      const { error } = await supabase
        .from('_prompt_versions')
        .insert({ master, secondary: secondary ?? '' });
      if (error) throw error;
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ ok: false, error: String(err) });
    }
  });

  // Trigger manual call (name + phone provided directly, no DB lookup)
  app.post('/api/dashboard/call-manual', async (req: Request, res: Response) => {
    const { name, phone } = req.body as { name: string; phone: string };
    if (!phone) {
      res.status(400).json({ ok: false, error: 'Missing phone number' });
      return;
    }
    try {
      const { initiateCall } = await import('./callController');
      const callSid = await initiateCall(phone, name ?? 'Test Candidate', 'manual');
      res.json({ ok: true, callSid });
    } catch (err) {
      res.status(500).json({ ok: false, error: err instanceof Error ? err.message : String(err) });
    }
  });
}
