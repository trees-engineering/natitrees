/* ═══════════════════════════════════════════════════════════════
   TREELANCE DASHBOARD — app.js
   ═══════════════════════════════════════════════════════════════ */

'use strict';

// ── PWA: register service worker ────────────────────────────────
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/dashboard/sw.js').catch(() => {});
  });
}

// ── Session sim counter ──────────────────────────────────────────
let simCount = 0;

// ═══════════════════════════════════════
//  TAB NAVIGATION
// ═══════════════════════════════════════

function initTabs() {
  const btns = document.querySelectorAll('.tab-btn');
  const panels = document.querySelectorAll('.tab-panel');

  function activate(tabId) {
    btns.forEach(b => b.classList.toggle('active', b.dataset.tab === tabId));
    panels.forEach(p => p.classList.toggle('active', p.id === `tab-${tabId}`));

    // Lazy-load tab data
    if (tabId === 'analytics') loadAnalytics();
    if (tabId === 'psychology') renderPsychology();
    if (tabId === 'testing') loadScenarios();
    if (tabId === 'overview') loadConfig();
  }

  btns.forEach(btn => {
    btn.addEventListener('click', () => activate(btn.dataset.tab));
  });
}

// ── Sub-tabs (testing) ───────────────────────────────────────────
function initSubTabs() {
  const btns = document.querySelectorAll('.sub-tab');
  btns.forEach(btn => {
    btn.addEventListener('click', () => {
      btns.forEach(b => b.classList.toggle('active', b === btn));
      document.getElementById('subtab-builtin').style.display = btn.dataset.subtab === 'builtin' ? '' : 'none';
      document.getElementById('subtab-custom').style.display = btn.dataset.subtab === 'custom' ? '' : 'none';
      updateRunBtn();
    });
  });
}

// ═══════════════════════════════════════
//  SERVER STATUS
// ═══════════════════════════════════════

async function checkStatus() {
  const pill = document.getElementById('status-pill');
  const text = document.getElementById('status-text');
  try {
    const res = await fetch('/api/dashboard/health');
    if (res.ok) {
      pill.classList.add('online');
      pill.classList.remove('offline');
      text.textContent = 'Online';
    } else {
      throw new Error('not ok');
    }
  } catch {
    pill.classList.remove('online');
    pill.classList.add('offline');
    text.textContent = 'Offline';
  }
}

// ═══════════════════════════════════════
//  OVERVIEW: CONFIG CARD
// ═══════════════════════════════════════

async function loadConfig() {
  const card = document.getElementById('config-card');
  try {
    const res = await fetch('/api/dashboard/health');
    if (!res.ok) throw new Error();
    const data = await res.json();
    const p = data.providers ?? {};
    card.innerHTML = `
      <div class="provider-row"><span class="provider-label">LLM</span><span class="provider-val">${esc(p.llm ?? '—')}</span></div>
      <div class="provider-row"><span class="provider-label">Model</span><span class="provider-val">${esc(p.model ?? '—')}</span></div>
      <div class="provider-row"><span class="provider-label">STT</span><span class="provider-val">${esc(p.stt ?? '—')}</span></div>
      <div class="provider-row"><span class="provider-label">TTS</span><span class="provider-val">${esc(p.tts ?? '—')}</span></div>
      <div class="provider-row" style="border:none"><span class="provider-label">Checked</span><span style="font-size:12px;color:var(--text-3)">${new Date(data.timestamp).toLocaleTimeString()}</span></div>
    `;
  } catch {
    card.innerHTML = `<div class="card-desc text-muted">Could not load config — is the server running?</div>`;
  }
}

// ═══════════════════════════════════════
//  ANALYTICS
// ═══════════════════════════════════════

let analyticsLoaded = false;

async function loadAnalytics() {
  if (analyticsLoaded) return;
  analyticsLoaded = true;

  // Config card
  const configCard = document.getElementById('analytics-config');
  try {
    const res = await fetch('/api/dashboard/health');
    const data = await res.json();
    const p = data.providers ?? {};
    configCard.innerHTML = `
      <div class="provider-row"><span class="provider-label">LLM</span><span class="provider-val">${esc(p.llm ?? '—')}</span></div>
      <div class="provider-row"><span class="provider-label">Model</span><span class="provider-val">${esc(p.model ?? '—')}</span></div>
      <div class="provider-row"><span class="provider-label">STT</span><span class="provider-val">${esc(p.stt ?? '—')}</span></div>
      <div class="provider-row" style="border:none"><span class="provider-label">TTS</span><span class="provider-val">${esc(p.tts ?? '—')}</span></div>
    `;
    document.getElementById('stat-uptime').textContent = 'Online';
  } catch {
    configCard.innerHTML = `<div class="card-desc text-muted">Server unreachable</div>`;
    document.getElementById('stat-uptime').textContent = 'Off';
  }

  // Assessments
  loadAssessments();

  // Talents
  loadTalents();
}

async function loadAssessments() {
  const card = document.getElementById('assessments-card');
  const stat = document.getElementById('stat-calls');
  try {
    const res = await fetch('/api/dashboard/assessments');
    const { data, error } = await res.json();
    if (error && (!data || data.length === 0)) throw new Error(error);
    stat.textContent = data.length;
    if (data.length === 0) {
      card.innerHTML = `<div class="empty-state"><div class="empty-icon">📋</div><div class="empty-msg">No call history yet. Trigger a call to get started.</div></div>`;
      return;
    }
    card.innerHTML = data.map(a => `
      <div class="assessment-row">
        <div class="assessment-name">${esc(a.talent_id ?? 'Unknown candidate')}</div>
        <div class="assessment-meta">
          <span>${a.created_at ? new Date(a.created_at).toLocaleString() : 'No date'}</span>
          <span class="assessment-tag tag-voice">${esc(a.channel ?? 'voice')}</span>
          ${a.assessor_type ? `<span>${esc(a.assessor_type)}</span>` : ''}
        </div>
      </div>`).join('');
  } catch (err) {
    stat.textContent = '—';
    const msg = String(err).includes('supabase') || String(err).includes('SUPABASE')
      ? 'Supabase not configured — connect your database to see call history.'
      : 'Could not load assessments. Check server connection.';
    card.innerHTML = `<div class="empty-state"><div class="empty-icon">📋</div><div class="empty-msg">${msg}</div></div>`;
  }
}

async function loadTalents() {
  const card = document.getElementById('talents-card');
  const stat = document.getElementById('stat-talents');
  try {
    const res = await fetch('/api/dashboard/talents');
    const { data, error } = await res.json();
    if (error && (!data || data.length === 0)) throw new Error(error);
    stat.textContent = data.length;
    if (data.length === 0) {
      card.innerHTML = `<div class="empty-state"><div class="empty-icon">👤</div><div class="empty-msg">No candidates in the talent pool yet.</div></div>`;
      return;
    }
    card.innerHTML = data.map(t => `
      <div class="assessment-row">
        <div class="assessment-name">${esc(t.name ?? 'Unknown')}</div>
        <div class="assessment-meta">
          ${t.headline ? `<span>${esc(t.headline)}</span>` : ''}
          ${t.availability_status ? `<span class="assessment-tag tag-voice">${esc(t.availability_status)}</span>` : ''}
        </div>
      </div>`).join('');
  } catch (err) {
    stat.textContent = '—';
    const msg = String(err).includes('supabase') || String(err).includes('SUPABASE')
      ? 'Supabase not configured — connect your database to see the talent pool.'
      : 'Could not load talent pool.';
    card.innerHTML = `<div class="empty-state"><div class="empty-icon">👤</div><div class="empty-msg">${msg}</div></div>`;
  }
}

// ═══════════════════════════════════════
//  PSYCHOLOGY
// ═══════════════════════════════════════

const PSYCH_CARDS = [
  {
    icon: '🪞',
    name: 'The Echo',
    desc: 'Pick up the most specific or unexpected word the candidate just used and reflect it back naturally. It should feel like genuine curiosity landing on that one word — not a technique being applied.',
    quote: '"Eight years total in electrical." → "Eight years."',
  },
  {
    icon: '🌊',
    name: 'Pacing & Leading',
    desc: "Before shifting direction, match where the person already is. Mirror their energy, pace, and register. Once they feel in sync — heard and matched — you can gradually lead the conversation somewhere deeper.",
    quote: 'Match first. Lead second. Trying to lead before pacing makes them feel pulled.',
  },
  {
    icon: '🎯',
    name: 'Presumptive Framing',
    desc: "Frame questions as though the interesting version of the answer already exists. This removes the yes/no gate and invites them straight into the experience — signalling genuine expectation.",
    quote: '"What was it like when you made the switch?" — not "Did you ever switch?"',
  },
  {
    icon: '🤝',
    name: 'Reciprocal Disclosure',
    desc: 'Sharing creates sharing. A small genuine observation or natural reaction from the agent lowers the social cost for the candidate to share in return. Not talking about itself — just showing it\'s a real presence.',
    quote: 'Genuine warmth and reaction invite openness without the agent saying anything personal.',
  },
  {
    icon: '🧱',
    name: 'Commitment Momentum',
    desc: 'People are consistent with what they\'ve already said. Each small share makes the next one easier. Start with easy, low-stakes threads — the first real thing they share unlocks the next.',
    quote: '"That\'s the job isn\'t it." becomes an opening, not a closed door.',
  },
  {
    icon: '🚫',
    name: 'Inviting "No"',
    desc: 'Inviting a "no" is more powerful than chasing a "yes." When someone can decline, they feel in control — which makes them more likely to say yes to what actually matters.',
    quote: '"Is now an okay time?" — they can say no. That makes yes mean something.',
  },
  {
    icon: '🤫',
    name: 'Strategic Silence',
    desc: "After someone shares something meaningful, don't immediately respond. Let the silence sit for a beat. People instinctively fill silence — and what they say to fill it is often more revealing than what came before.",
    quote: 'Rushing to fill silence signals you\'re not fully present. Holding it signals the opposite.',
  },
  {
    icon: '🔓',
    name: 'Calibrated Questions',
    desc: 'Questions that can\'t be answered yes or no, that put the candidate in control, and make them think before speaking. The goal is the process of arriving at the answer — that\'s where personality and values come through.',
    quote: '"What" and "How" — never "Why." Why sounds like an accusation.',
  },
  {
    icon: '⚓',
    name: 'Anchoring & Return',
    desc: 'When a candidate mentions something in passing — a detail, a name, a preference — note it. Returning to it later, naturally and specifically, signals genuine listening across the whole call.',
    quote: '"You mentioned the footbridge earlier…" — more powerful than any new question.',
  },
  {
    icon: '🏷️',
    name: 'Labelling Emotions',
    desc: 'Name what you sense before doing anything else. A slightly wrong label is still useful — they\'ll correct it, and the correction gives you the real picture. Never say "I feel like you\'re…" — it centres your perception.',
    quote: '"It sounds like…" / "It seems like…" / "It feels like…"',
  },
  {
    icon: '🧵',
    name: 'Thread Chaining',
    desc: 'Every response is a direct continuation of what was just said — nothing else. Pick one word or moment from their last response and let your response grow from that. The conversation is one unbroken thread.',
    quote: 'If you can\'t point to the exact word your response came from, you\'re not following the thread.',
  },
  {
    icon: '⚡',
    name: 'Energy Matching',
    desc: 'Read their energy in the first 30 seconds and match it immediately. Upbeat and chatty — be warmer and more relaxed. Measured and quiet — be calm and precise. Mismatched energy is the fastest way to feel like a bot.',
    quote: 'For candidates who light up about something: lean in and go deeper, don\'t move on.',
  },
  {
    icon: '🛡️',
    name: 'Accusation Audit',
    desc: 'Before delivering any limitation or uncomfortable message, name the negative thing they\'re likely already thinking. This defuses defensiveness before it forms.',
    quote: '"This probably isn\'t what you were hoping to hear — but here\'s what I can actually do…"',
  },
  {
    icon: '📖',
    name: 'Story Over Description',
    desc: 'Guide toward specific moments, not general summaries. A story reveals personality in a way a description never does. When it flows naturally, steer toward a real memory — but never force it.',
    quote: '"What happened?" invites a story. "Tell me about your experience" invites a summary.',
  },
];

let psychRendered = false;

function renderPsychology() {
  if (psychRendered) return;
  psychRendered = true;
  const grid = document.getElementById('psych-grid');
  grid.innerHTML = PSYCH_CARDS.map(c => `
    <div class="psych-card">
      <div class="psych-icon">${c.icon}</div>
      <div>
        <div class="psych-name">${esc(c.name)}</div>
        <div class="psych-desc">${esc(c.desc)}</div>
        <div class="psych-quote">${esc(c.quote)}</div>
      </div>
    </div>
  `).join('');
}

// ═══════════════════════════════════════
//  TESTING — SCENARIOS
// ═══════════════════════════════════════

let scenarios = [];
let scenariosLoaded = false;

async function loadScenarios() {
  if (scenariosLoaded) return;
  scenariosLoaded = true;

  const sel = document.getElementById('scenario-select');
  try {
    const res = await fetch('/api/dashboard/scenarios');
    scenarios = await res.json();
    sel.innerHTML = `<option value="">— choose a scenario —</option>` +
      scenarios.map(s => `<option value="${s.id}">[${s.id}] ${esc(s.title)} — ${esc(s.candidateName)} (${s.messageCount} turns)</option>`).join('');
  } catch {
    sel.innerHTML = `<option value="">Failed to load scenarios — is the server running?</option>`;
  }

  sel.addEventListener('change', () => {
    const s = scenarios.find(x => String(x.id) === sel.value);
    const meta = document.getElementById('scenario-meta');
    if (s) {
      document.getElementById('scenario-meta-type').textContent = s.candidateType;
      document.getElementById('scenario-meta-tags').innerHTML = Object.entries(s.profileContext ?? {})
        .map(([k, v]) => `<span class="profile-tag"><strong>${esc(k)}:</strong> ${esc(v)}</span>`).join('');
      meta.classList.add('visible');
    } else {
      meta.classList.remove('visible');
    }
    updateRunBtn();
  });
}

// ── Custom scenario validation ───────────────────────────────────
['custom-name', 'custom-messages'].forEach(id => {
  document.getElementById(id)?.addEventListener('input', updateRunBtn);
});

function updateRunBtn() {
  const btn = document.getElementById('run-btn');
  const btnText = document.getElementById('run-btn-text');
  const isCustom = document.querySelector('.sub-tab.active')?.dataset.subtab === 'custom';

  if (isCustom) {
    const name = document.getElementById('custom-name')?.value.trim();
    const msgs = document.getElementById('custom-messages')?.value.trim();
    if (name && msgs) {
      btn.disabled = false;
      btnText.textContent = 'Run Custom Simulation';
    } else {
      btn.disabled = true;
      btnText.textContent = 'Fill in name & messages to run';
    }
  } else {
    const sel = document.getElementById('scenario-select');
    if (sel?.value) {
      btn.disabled = false;
      btnText.textContent = 'Run Simulation';
    } else {
      btn.disabled = true;
      btnText.textContent = 'Select a scenario to run';
    }
  }
}

// ═══════════════════════════════════════
//  TESTING — RUN SIMULATION (SSE)
// ═══════════════════════════════════════

document.getElementById('run-btn')?.addEventListener('click', runSimulation);

async function runSimulation() {
  const btn = document.getElementById('run-btn');
  const btnText = document.getElementById('run-btn-text');
  const isCustom = document.querySelector('.sub-tab.active')?.dataset.subtab === 'custom';

  // Build payload
  let payload;
  if (isCustom) {
    const msgs = document.getElementById('custom-messages').value.trim()
      .split('\n').map(l => l.trim()).filter(Boolean);
    const profile = {};
    const headline = document.getElementById('custom-headline').value.trim();
    const rate = document.getElementById('custom-rate').value.trim();
    const avail = document.getElementById('custom-avail').value.trim();
    if (headline) profile['Headline'] = headline;
    if (rate) profile['Rate'] = rate;
    if (avail) profile['Availability'] = avail;
    payload = {
      custom: {
        title: 'Custom Scenario',
        candidateName: document.getElementById('custom-name').value.trim(),
        candidateType: document.getElementById('custom-type').value.trim() || 'Custom candidate',
        profileContext: profile,
        messages: msgs,
      },
    };
  } else {
    payload = { scenarioId: Number(document.getElementById('scenario-select').value) };
  }

  // UI: loading state
  btn.disabled = true;
  btnText.innerHTML = '<div class="spinner"></div><span>Simulating…</span>';

  const output = document.getElementById('sim-output');
  const transcriptEl = document.getElementById('transcript');
  const scorecardWrap = document.getElementById('scorecard-wrap');
  const simStatus = document.getElementById('sim-status');
  const simTitle = document.getElementById('sim-title');

  output.classList.add('visible');
  transcriptEl.innerHTML = '';
  scorecardWrap.innerHTML = '';
  simStatus.className = 'sim-status running';
  simStatus.textContent = 'Running…';
  simTitle.textContent = '';

  // Scroll to output
  setTimeout(() => output.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);

  try {
    const res = await fetch('/api/dashboard/simulate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!res.ok || !res.body) {
      throw new Error(`Server returned ${res.status}`);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = '';
    let thinkingEl = null;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buf += decoder.decode(value, { stream: true });
      const blocks = buf.split('\n\n');
      buf = blocks.pop() || '';

      for (const block of blocks) {
        const line = block.split('\n').find(l => l.startsWith('data: '));
        if (!line) continue;
        let evt;
        try { evt = JSON.parse(line.slice(6)); } catch { continue; }

        if (thinkingEl) { thinkingEl.remove(); thinkingEl = null; }

        switch (evt.type) {
          case 'start':
            simTitle.textContent = evt.title || 'Custom Simulation';
            appendTurn('AGENT', evt.greeting, false);
            break;

          case 'thinking':
            thinkingEl = appendThinking();
            break;

          case 'exchange':
            appendTurn('CANDIDATE', evt.candidate, false);
            appendTurn('AGENT', evt.agent, false);
            if (evt.endCall) {
              const tag = document.createElement('div');
              tag.className = 'end-call-tag';
              tag.textContent = '✓ Call ended naturally — [END_CALL] triggered';
              transcriptEl.appendChild(tag);
            }
            break;

          case 'scoring':
            simStatus.textContent = 'Scoring…';
            thinkingEl = appendThinking();
            break;

          case 'scorecard':
            if (thinkingEl) { thinkingEl.remove(); thinkingEl = null; }
            renderScorecard(scorecardWrap, evt.text);
            scorecardWrap.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            break;

          case 'done':
            simStatus.className = 'sim-status done';
            simStatus.textContent = 'Complete';
            simCount++;
            document.getElementById('stat-sims').textContent = simCount;
            break;

          case 'error':
            simStatus.className = 'sim-status error';
            simStatus.textContent = 'Error';
            transcriptEl.innerHTML += `<div class="card" style="border-color:var(--red);color:var(--red);font-size:13px;padding:12px">${esc(evt.message)}</div>`;
            break;
        }
      }
    }
  } catch (err) {
    simStatus.className = 'sim-status error';
    simStatus.textContent = 'Error';
    transcriptEl.innerHTML += `<div class="card" style="border-color:var(--red);color:var(--red);font-size:13px;padding:12px">${esc(String(err))}</div>`;
  } finally {
    btn.disabled = false;
    updateRunBtn();
  }
}

function appendTurn(speaker, text, isThinking) {
  const t = document.getElementById('transcript');
  const isAgent = speaker === 'AGENT';
  const div = document.createElement('div');
  div.className = `turn ${isAgent ? 'agent' : 'candidate'}`;
  div.innerHTML = `
    <div class="turn-label">${isAgent ? '🌿 Treelance' : `👤 ${esc(speaker)}`}</div>
    <div class="turn-bubble">${esc(text)}</div>
  `;
  t.appendChild(div);
  return div;
}

function appendThinking() {
  const t = document.getElementById('transcript');
  const div = document.createElement('div');
  div.className = 'turn agent';
  div.innerHTML = `
    <div class="turn-label">🌿 Treelance</div>
    <div class="turn-bubble thinking-indicator">
      <div class="thinking-dot"></div>
      <div class="thinking-dot"></div>
      <div class="thinking-dot"></div>
    </div>
  `;
  t.appendChild(div);
  div.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  return div;
}

function renderScorecard(container, text) {
  const ratingMatch = text.match(/RATING:\s*([ABCD])/i);
  const rating = ratingMatch?.[1]?.toUpperCase() || null;

  container.innerHTML = `
    <div class="scorecard">
      <div class="scorecard-header">
        ${rating ? `<span class="rating-badge rating-${rating}">${rating}</span>` : ''}
        Simulation Scorecard
      </div>
      <div class="scorecard-body">${esc(text)}</div>
    </div>
  `;
}

// ═══════════════════════════════════════
//  UTILITIES
// ═══════════════════════════════════════

function esc(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// ═══════════════════════════════════════
//  INIT
// ═══════════════════════════════════════

function init() {
  initTabs();
  initSubTabs();
  checkStatus();
  loadConfig();
  setInterval(checkStatus, 30_000);
}

document.addEventListener('DOMContentLoaded', init);
