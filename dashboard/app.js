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

// ── Count-up animation ───────────────────────────────────────────
function animateNumber(el, target, duration = 700) {
  const num = parseInt(target, 10);
  if (isNaN(num)) { el.textContent = target; return; }
  const start = Date.now();
  (function tick() {
    const p = Math.min((Date.now() - start) / duration, 1);
    el.textContent = Math.round(num * (1 - Math.pow(1 - p, 3)));
    if (p < 1) requestAnimationFrame(tick);
  })();
}

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
    if (tabId === 'transcripts') loadTranscripts();
    if (tabId === 'psychology') renderPsychology();
    if (tabId === 'testing') loadScenarios();
    if (tabId === 'overview') loadConfig();
    if (tabId === 'prompt') loadPrompt();
    if (tabId === 'calls') loadCandidates();
    if (tabId === 'callbrief') initCallBrief();
    if (tabId === 'providers') loadProviders();
  }

  btns.forEach(btn => {
    btn.addEventListener('click', () => activate(btn.dataset.tab));
  });
}

// ── Tab switcher (used by quick-action buttons) ──────────────────
function switchTab(tabId) {
  const btn = document.querySelector(`[data-tab="${tabId}"]`);
  if (btn) btn.click();
}

// ── Sub-tabs (testing) ───────────────────────────────────────────
function initSubTabs() {
  const btns = document.querySelectorAll('.sub-tab');
  btns.forEach(btn => {
    btn.addEventListener('click', () => {
      btns.forEach(b => b.classList.toggle('active', b === btn));
      const st = btn.dataset.subtab;
      document.getElementById('subtab-builtin').style.display = st === 'builtin' ? '' : 'none';
      document.getElementById('subtab-custom').style.display  = st === 'custom'  ? '' : 'none';
      document.getElementById('subtab-voice').style.display   = st === 'voice'   ? '' : 'none';
      // hide run button and sim output when on voice tab
      document.getElementById('run-btn').style.display    = st === 'voice' ? 'none' : '';
      document.getElementById('sim-output').style.display = st === 'voice' ? 'none' : '';
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
//  OVERVIEW
// ═══════════════════════════════════════

async function loadConfig() {
  const [healthRes, assessRes, talentRes] = await Promise.allSettled([
    fetch('/api/dashboard/health').then(r => r.ok ? r.json() : Promise.reject()),
    fetch('/api/dashboard/assessments').then(r => r.json()),
    fetch('/api/dashboard/talents').then(r => r.json()),
  ]);

  const health    = healthRes.status  === 'fulfilled' ? healthRes.value  : null;
  const assessments = assessRes.status === 'fulfilled' ? assessRes.value  : null;
  const talents   = talentRes.status  === 'fulfilled' ? talentRes.value  : null;

  // Hero KPIs
  const _callsEl  = document.getElementById('ov-calls');
  const _talentEl = document.getElementById('ov-talent');
  assessments?.data?.length != null ? animateNumber(_callsEl, assessments.data.length) : (_callsEl.textContent = '—');
  talents?.data?.length     != null ? animateNumber(_talentEl, talents.data.length)    : (_talentEl.textContent = '—');
  document.getElementById('ov-server').textContent = health ? 'Online' : 'Offline';

  // System Health card
  renderHealthCard(health, assessments);

  // Recent Activity card
  renderRecentActivity(assessments?.data ?? null);

  // Live Configuration card
  const configCard = document.getElementById('config-card');
  if (health) {
    const p = health.providers ?? {};
    configCard.innerHTML = `
      <div class="provider-row"><span class="provider-label">LLM</span><span class="provider-val">${esc(p.llm ?? '—')}</span></div>
      <div class="provider-row"><span class="provider-label">Model</span><span class="provider-val">${esc(p.model ?? '—')}</span></div>
      <div class="provider-row"><span class="provider-label">STT</span><span class="provider-val">${esc(p.stt ?? '—')}</span></div>
      <div class="provider-row"><span class="provider-label">TTS</span><span class="provider-val">${esc(p.tts ?? '—')}</span></div>
      <div class="provider-row" style="border:none"><span class="provider-label">Checked</span><span style="font-size:12px;color:var(--text-3)">${new Date(health.timestamp).toLocaleTimeString()}</span></div>
    `;
  } else {
    configCard.innerHTML = `<div class="card-desc text-muted">Could not load config — is the server running?</div>`;
  }
}

function renderHealthCard(health, assessments) {
  const card = document.getElementById('health-card');
  const serverOk = !!health;
  const dbOk = assessments && !assessments.error;
  const p = health?.providers ?? {};

  const services = [
    { label: 'API Server',    value: serverOk ? 'Online'        : 'Offline',       status: serverOk ? 'ok' : 'err' },
    { label: 'LLM',          value: p.model  ? `${p.llm} · ${p.model}` : '—',    status: p.model  ? 'ok' : 'warn' },
    { label: 'STT',          value: p.stt    ? p.stt            : '—',             status: p.stt    ? 'ok' : 'warn' },
    { label: 'TTS',          value: p.tts    ? p.tts            : '—',             status: p.tts    ? 'ok' : 'warn' },
    { label: 'Database',     value: dbOk     ? 'Connected'      : 'Not configured', status: dbOk    ? 'ok' : 'warn' },
  ];

  card.innerHTML = services.map(s => `
    <div class="health-row">
      <div class="health-left">
        <div class="health-dot ${s.status}"></div>
        <span class="health-label">${esc(s.label)}</span>
      </div>
      <span class="health-val">${esc(s.value)}</span>
    </div>
  `).join('');
}

function renderRecentActivity(data) {
  const card = document.getElementById('recent-card');
  if (!data) {
    card.innerHTML = `<div class="card-desc text-muted">Could not load activity — is the server running?</div>`;
    return;
  }
  if (data.length === 0) {
    card.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">📞</div>
        <div class="empty-msg">No calls yet. Trigger a call to see activity here.</div>
      </div>`;
    return;
  }
  const recent = data.slice(0, 5);
  card.innerHTML =
    `<div class="recent-header">Last ${recent.length} call${recent.length !== 1 ? 's' : ''}</div>` +
    recent.map(a => `
      <div class="recent-item">
        <div class="recent-name">${esc(a._talent?.name ?? a.candidate_name ?? 'Unknown candidate')}</div>
        <div class="recent-meta">
          <span>${a.created_at ? relativeTime(new Date(a.created_at)) : '—'}</span>
          <span class="assessment-tag tag-voice">${esc(callTypeLabel(a.call_type))}</span>
        </div>
      </div>
    `).join('');
}

function callTypeLabel(callType) {
  if (callType === 'manual_test') return '🧪 Manual test';
  if (callType === 'browser_test') return '🎙️ Browser test';
  return '📞 Candidate call';
}

function relativeTime(date) {
  const diff = Date.now() - date.getTime();
  const m = Math.floor(diff / 60000);
  const h = Math.floor(diff / 3600000);
  const d = Math.floor(diff / 86400000);
  if (m < 1)  return 'Just now';
  if (m < 60) return `${m}m ago`;
  if (h < 24) return `${h}h ago`;
  if (d < 7)  return `${d}d ago`;
  return date.toLocaleDateString();
}

// ═══════════════════════════════════════
//  TRANSCRIPTS
// ═══════════════════════════════════════

let transcriptsLoaded = false;

function parseTranscript(raw) {
  if (!raw) return [];
  // Stored as array of {role, content}
  if (Array.isArray(raw)) return raw.map(l => ({ role: l.role ?? 'user', content: l.content ?? '' }));
  // Stored as plain string: "[assistant] text\n[user] text\n..."
  if (typeof raw === 'string') {
    return raw.split('\n').filter(Boolean).map(line => {
      const m = line.match(/^\[(\w+)\]\s*(.*)/s);
      return m ? { role: m[1], content: m[2] } : { role: 'user', content: line };
    });
  }
  return [];
}

async function loadTranscripts() {
  if (transcriptsLoaded) return;
  transcriptsLoaded = true;

  const list = document.getElementById('transcripts-list');
  try {
    const res = await fetch('/api/dashboard/transcripts');
    const { data, error } = await res.json();
    if (error && (!data || data.length === 0)) throw new Error(error);

    if (!data || data.length === 0) {
      list.innerHTML = `<div class="empty-state"><div class="empty-icon">📋</div><div class="empty-msg">No transcripts yet.</div></div>`;
      return;
    }

    list.innerHTML = data.map((t, i) => {
      const date = t.created_at ? new Date(t.created_at) : null;
      const dateStr = date ? date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
      const timeStr = date ? date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }) : '';
      const name = t._talent?.name ?? t.candidate_name ?? 'Unknown';
      const lines = parseTranscript(t.transcript);
      const snippet = t.ai_summary
        ? `<div class="tx-snippet">${esc(t.ai_summary.length > 110 ? t.ai_summary.slice(0, 110) + '…' : t.ai_summary)}</div>`
        : '';
      return `
        <div class="tx-card" id="tx-${i}">
          <button class="tx-header" onclick="toggleTranscript(${i})">
            <div class="tx-header-left">
              <div class="tx-name">${esc(name)} <span class="tx-turns">${esc(callTypeLabel(t.call_type))}</span></div>
              <div class="tx-meta">${dateStr}${timeStr ? ` · ${timeStr}` : ''} <span class="tx-turns">${lines.length} turns</span></div>
              ${snippet}
            </div>
            <span class="tx-chevron" id="tx-chev-${i}">▾</span>
          </button>
          <div class="tx-body" id="tx-body-${i}">
            ${t.ai_summary ? `<div class="tx-summary">${esc(t.ai_summary)}</div>` : ''}
            <div class="tx-lines">
              ${lines.map(l => `
                <div class="tx-line ${l.role === 'assistant' ? 'tx-agent' : 'tx-candidate'}">
                  <span class="tx-speaker">${l.role === 'assistant' ? '🌿 Treelance' : '👤 Candidate'}</span>
                  <span class="tx-text">${esc(l.content)}</span>
                </div>`).join('')}
              ${lines.length === 0 ? `<div class="tx-empty">No transcript recorded.</div>` : ''}
            </div>
          </div>
        </div>`;
    }).join('');
  } catch (err) {
    const msg = String(err).includes('supabase') || String(err).includes('SUPABASE')
      ? 'Supabase not configured.'
      : 'Could not load transcripts. Check server connection.';
    list.innerHTML = `<div class="empty-state"><div class="empty-icon">📋</div><div class="empty-msg">${msg}</div></div>`;
  }
}

function toggleTranscript(i) {
  const body  = document.getElementById(`tx-body-${i}`);
  const chev  = document.getElementById(`tx-chev-${i}`);
  const card  = document.getElementById(`tx-${i}`);
  const open  = body.classList.toggle('tx-body-open');
  chev.style.transform = open ? 'rotate(180deg)' : '';
  card.classList.toggle('tx-expanded', open);
}

// ═══════════════════════════════════════
//  ANALYTICS
// ═══════════════════════════════════════

let analyticsLoaded = false;

async function loadAnalytics() {
  if (analyticsLoaded) return;
  analyticsLoaded = true;

  loadKPIs();

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
}

async function loadKPIs() {
  try {
    const res = await fetch('/api/dashboard/kpi');
    const data = await res.json();
    if (data.error) throw new Error(data.error);

    animateNumber(document.getElementById('kpi-total'), data.total);
    animateNumber(document.getElementById('kpi-week'), data.thisWeek);
    animateNumber(document.getElementById('kpi-lastweek'), data.lastWeek);

    const trendEl = document.getElementById('kpi-trend');
    if (data.lastWeek === 0) {
      trendEl.textContent = data.thisWeek > 0 ? 'New' : '—';
      trendEl.className = 'kpi-value';
    } else {
      const pct = Math.round(((data.thisWeek - data.lastWeek) / data.lastWeek) * 100);
      trendEl.textContent = `${pct > 0 ? '+' : ''}${pct}%`;
      trendEl.className = `kpi-value ${pct >= 0 ? 'kpi-up' : 'kpi-down'}`;
    }

    const chart = document.getElementById('kpi-chart');
    const max = Math.max(...data.dailyCounts.map(d => d.count), 1);
    chart.innerHTML = data.dailyCounts.map(d => {
      const pct = Math.round((d.count / max) * 100);
      const tip = `${d.date.slice(5)}: ${d.count} call${d.count !== 1 ? 's' : ''}`;
      return `
        <div class="kpi-bar-wrap" data-tip="${esc(tip)}">
          <div class="kpi-bar-val">${d.count || ''}</div>
          <div class="kpi-bar-track">
            <div class="kpi-bar" data-pct="${pct}" style="height:0%"></div>
          </div>
          <div class="kpi-bar-label">${d.date.slice(5)}</div>
        </div>`;
    }).join('');
    requestAnimationFrame(() => requestAnimationFrame(() => {
      chart.querySelectorAll('.kpi-bar[data-pct]').forEach(b => { b.style.height = b.dataset.pct + '%'; });
    }));

    const chCard = document.getElementById('kpi-channels');
    const entries = Object.entries(data.channels);
    if (entries.length === 0) {
      chCard.innerHTML = `<div class="card-desc text-muted">No calls recorded yet.</div>`;
    } else {
      chCard.innerHTML = entries.map(([ch, count]) => {
        const pct = Math.round((count / data.total) * 100);
        return `
          <div class="kpi-channel-row">
            <span class="kpi-channel-name">${esc(ch)}</span>
            <div class="kpi-channel-bar-track">
              <div class="kpi-channel-bar" style="width:${pct}%"></div>
            </div>
            <span class="kpi-channel-count">${count}</span>
          </div>`;
      }).join('');
    }
  } catch {
    document.getElementById('kpi-chart-card').innerHTML =
      `<div class="card-desc text-muted">Could not load KPIs — is the database connected?</div>`;
    ['kpi-total', 'kpi-week', 'kpi-lastweek', 'kpi-trend'].forEach(id => {
      document.getElementById(id).textContent = '—';
    });
  }
}

// ═══════════════════════════════════════
//  PSYCHOLOGY
// ═══════════════════════════════════════

const PSYCH_CARDS = [
  {
    icon: '🪞',
    name: 'React',
    desc: 'When something genuinely lands — a detail, a decision, a moment of energy — respond to it the way a real person would. One short, specific reaction to what actually caught your attention. Not a technique. Never repeat their words back verbatim. If nothing actually landed, don\'t react — nudge or ask instead.',
    quote: '"Installing a manifold off Norway — that\'s serious work." Not: "Norway." Not: "Manifold." A reaction, not a mirror.',
  },
  {
    icon: '🌀',
    name: 'Nudge',
    desc: 'When they are mid-story, have paused, or have more to say but stopped — create space to continue with no direction. "Say more", "go on", "what happened?", "and then?" This is the most natural move and often the right one. When in doubt, nudge rather than react or ask.',
    quote: '"Say more." — not a question, not a reaction. Just an open door.',
  },
  {
    icon: '🔓',
    name: 'Question',
    desc: 'Only when the conversation has genuinely stalled and neither a nudge nor a reaction will restart it. Keep it as open and specific as possible — anchored to something they actually said. What and How only, never Why. Open questions only, never yes/no. One question mark per turn — nothing before it, nothing after it.',
    quote: '"What made the offshore work different?" — not "What kind of problems do you enjoy?" One is specific; the other is generic.',
  },
  {
    icon: '🧵',
    name: 'Thread Chaining',
    desc: 'Every response is a direct continuation of what was just said — nothing else. Find the word in their last response that connects to their work life, career, or motivations. Respond to that word. Let the next move grow from it invisibly.',
    quote: 'If you can\'t point to the exact word your response came from, you\'re not following the thread.',
  },
  {
    icon: '⚡',
    name: 'Energy Matching',
    desc: 'Read their energy and match it. Upbeat and chatty — be warmer and more relaxed. Measured and quiet — be calm and precise. When energy rises around a topic, stay there longer rather than moving on. Mismatched energy is the fastest way to feel like a bot.',
    quote: 'For candidates who light up about something: lean in and go deeper, don\'t move on.',
  },
  {
    icon: '🤫',
    name: 'Strategic Silence',
    desc: "Do not fill silence — let them think. After someone shares something meaningful, don't immediately respond. People instinctively fill silence — and what they say to fill it is often more revealing than what came before.",
    quote: 'Rushing to fill silence signals you\'re not fully present. Holding it signals the opposite.',
  },
  {
    icon: '⚓',
    name: 'Anchoring & Return',
    desc: 'When a candidate mentions something in passing — hesitation, a name, a contradiction — note it. Returning to it much later, naturally and specifically, signals genuine listening across the whole call. Never repeat a question; drop it and return from a completely different angle.',
    quote: 'Hesitation before answering a specific period — something happened there. Note it, return much later.',
  },
  {
    icon: '📖',
    name: 'Story Over Description',
    desc: 'Real capabilities surface through stories, never through declarations. Guide toward specific moments, not general summaries. A story reveals personality in a way a description never does. The first answer is almost never the real one — patience brings the real one.',
    quote: '"What happened?" invites a story. "Tell me about your experience" invites a summary.',
  },
  {
    icon: '🔍',
    name: 'Reading What Is Not Said',
    desc: 'Hesitation before answering a specific role or period — something happened there. Vagueness on a specific question — they\'re protecting something; move to easier ground and let it surface later. Contradiction between what they say now and earlier — file it, return gently. The subtext is often more valuable than the text.',
    quote: 'Note it, move on, return much later. Pressing too early closes the door.',
  },
  {
    icon: '🧲',
    name: 'Motivation Mining',
    desc: 'Motivations are the hardest thing to surface and the most valuable for matching. They emerge through contrast — what they loved vs what made them move on. What they elaborate on without being asked. The pattern across roles they\'ve enjoyed. Open the future frame naturally: "if this next move goes really well, what does that look like?"',
    quote: 'What they say quickly is what they think you want to hear. What they say slowly is what they actually mean.',
  },
  {
    icon: '🧭',
    name: 'Steering as Following',
    desc: 'The conversation has one purpose — build a rich professional picture. But steering never looks like steering. Find the word in their last response that connects to their work life or motivations and respond to that word. Every drift has a door back. Walk through it within one or two turns.',
    quote: '"You mentioned your mate — what\'s that making you think about your own situation?" Steering always looks like following.',
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

// ── Custom scenario persistence (localStorage) ───────────────────

const CUSTOM_SCENARIOS_KEY = 'treelance_custom_scenarios';

function getCustomScenarios() {
  try { return JSON.parse(localStorage.getItem(CUSTOM_SCENARIOS_KEY) ?? '[]'); }
  catch { return []; }
}

function saveCustomScenario() {
  const title  = document.getElementById('custom-title').value.trim();
  const name   = document.getElementById('custom-name').value.trim();
  const type   = document.getElementById('custom-type').value.trim();
  const hl     = document.getElementById('custom-headline').value.trim();
  const rate   = document.getElementById('custom-rate').value.trim();
  const avail  = document.getElementById('custom-avail').value.trim();
  const msgs   = document.getElementById('custom-messages').value.trim()
    .split('\n').map(l => l.trim()).filter(Boolean);

  if (!title || !name || !msgs.length) return;

  const profile = {};
  if (hl)    profile['Headline']     = hl;
  if (rate)  profile['Rate']         = rate;
  if (avail) profile['Availability'] = avail;

  const existing = getCustomScenarios();
  const newScenario = {
    id: `c-${Date.now()}`,
    title,
    candidateName: name,
    candidateType: type || 'Custom candidate',
    profileContext: profile,
    messages: msgs,
    messageCount: msgs.length,
  };

  localStorage.setItem(CUSTOM_SCENARIOS_KEY, JSON.stringify([...existing, newScenario]));
  populateScenarioDropdown();

  // Switch to built-in tab and select the new scenario
  const builtinBtn = document.querySelector('[data-subtab="builtin"]');
  if (builtinBtn) builtinBtn.click();
  const sel = document.getElementById('scenario-select');
  sel.value = newScenario.id;
  sel.dispatchEvent(new Event('change'));
}

function deleteCustomScenario(id) {
  const updated = getCustomScenarios().filter(s => s.id !== id);
  localStorage.setItem(CUSTOM_SCENARIOS_KEY, JSON.stringify(updated));
  populateScenarioDropdown();
  document.getElementById('scenario-meta').classList.remove('visible');
  document.getElementById('scenario-select').value = '';
  updateRunBtn();
}

function populateScenarioDropdown() {
  const sel = document.getElementById('scenario-select');
  const builtIn = scenarios.filter(s => !String(s.id).startsWith('c-'));
  const custom  = getCustomScenarios();

  const builtInOpts = builtIn
    .map(s => `<option value="${s.id}">[${s.id}] ${esc(s.title)} — ${esc(s.candidateName)} (${s.messageCount} turns)</option>`)
    .join('');
  const customOpts = custom
    .map(s => `<option value="${s.id}">★ ${esc(s.title)} — ${esc(s.candidateName)} (${s.messageCount} turns)</option>`)
    .join('');

  sel.innerHTML = `<option value="">— choose a scenario —</option>`
    + (builtInOpts ? `<optgroup label="Built-in">${builtInOpts}</optgroup>` : '')
    + (customOpts  ? `<optgroup label="My Scenarios">${customOpts}</optgroup>` : '');

  // Merge for lookup
  scenarios = [...builtIn, ...custom];
}

async function loadScenarios() {
  if (scenariosLoaded) return;
  scenariosLoaded = true;

  const sel = document.getElementById('scenario-select');
  try {
    const res = await fetch('/api/dashboard/scenarios');
    scenarios = await res.json();
    populateScenarioDropdown();
  } catch {
    sel.innerHTML = `<option value="">Failed to load scenarios — is the server running?</option>`;
  }

  sel.addEventListener('change', () => {
    const s = scenarios.find(x => String(x.id) === sel.value);
    const meta = document.getElementById('scenario-meta');
    const isCustomSaved = s && String(s.id).startsWith('c-');
    if (s) {
      document.getElementById('scenario-meta-type').textContent = s.candidateType;
      document.getElementById('scenario-meta-tags').innerHTML =
        Object.entries(s.profileContext ?? {})
          .map(([k, v]) => `<span class="profile-tag"><strong>${esc(k)}:</strong> ${esc(v)}</span>`)
          .join('');
      document.getElementById('scenario-delete-btn').style.display = isCustomSaved ? '' : 'none';
      document.getElementById('scenario-delete-btn').onclick = () => deleteCustomScenario(s.id);
      meta.classList.add('visible');
    } else {
      meta.classList.remove('visible');
    }
    updateRunBtn();
  });

  document.getElementById('save-scenario-btn')?.addEventListener('click', saveCustomScenario);
  ['custom-name', 'custom-messages', 'custom-title'].forEach(id => {
    document.getElementById(id)?.addEventListener('input', updateRunBtn);
  });
}

function updateRunBtn() {
  const btn     = document.getElementById('run-btn');
  const btnText = document.getElementById('run-btn-text');
  const saveBtn = document.getElementById('save-scenario-btn');
  const isCustom = document.querySelector('.sub-tab.active')?.dataset.subtab === 'custom';

  if (isCustom) {
    const name  = document.getElementById('custom-name')?.value.trim();
    const msgs  = document.getElementById('custom-messages')?.value.trim();
    const title = document.getElementById('custom-title')?.value.trim();
    const ready = !!(name && msgs);
    btn.disabled = !ready;
    btnText.textContent = ready ? 'Run Custom Simulation' : 'Fill in name & messages to run';
    if (saveBtn) saveBtn.disabled = !(ready && title);
  } else {
    const sel = document.getElementById('scenario-select');
    const ready = !!sel?.value;
    btn.disabled = !ready;
    btnText.textContent = ready ? 'Run Simulation' : 'Select a scenario to run';
    if (saveBtn) saveBtn.disabled = true;
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
    const rate     = document.getElementById('custom-rate').value.trim();
    const avail    = document.getElementById('custom-avail').value.trim();
    if (headline) profile['Headline']     = headline;
    if (rate)     profile['Rate']         = rate;
    if (avail)    profile['Availability'] = avail;
    payload = {
      custom: {
        title: document.getElementById('custom-title').value.trim() || 'Custom Scenario',
        candidateName: document.getElementById('custom-name').value.trim(),
        candidateType: document.getElementById('custom-type').value.trim() || 'Custom candidate',
        profileContext: profile,
        messages: msgs,
      },
    };
  } else {
    const selVal = document.getElementById('scenario-select').value;
    if (selVal.startsWith('c-')) {
      // Saved custom scenario — run as custom payload
      const s = scenarios.find(x => x.id === selVal);
      payload = { custom: { title: s.title, candidateName: s.candidateName, candidateType: s.candidateType, profileContext: s.profileContext, messages: s.messages } };
    } else {
      payload = { scenarioId: Number(selVal) };
    }
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
//  CALLS TAB
// ═══════════════════════════════════════

let callsLoaded = false;
let pendingCall = null; // { type: 'db'|'manual', talentId?, name, phone }
let allCandidates = [];

async function loadCandidates() {
  if (callsLoaded) return;
  callsLoaded = true;

  const sel = document.getElementById('candidate-select');
  const detailEl = document.getElementById('candidate-detail');
  const dbCallBtn = document.getElementById('db-call-btn');

  try {
    const res = await fetch('/api/dashboard/candidates');
    const { data, error } = await res.json();
    if (error && (!data || data.length === 0)) throw new Error(error);

    allCandidates = data ?? [];

    if (allCandidates.length === 0) {
      sel.innerHTML = `<option value="">— no candidates found —</option>`;
      return;
    }

    function populateSelect(list) {
      const prev = sel.value;
      sel.innerHTML = `<option value="">— choose a candidate —</option>` +
        list.map(c =>
          `<option value="${esc(c.id)}">${esc(c.name ?? 'Unknown')}${c.phone ? '' : ' (no phone)'}</option>`
        ).join('');
      if (list.find(c => String(c.id) === prev)) sel.value = prev;
      const countEl = document.getElementById('candidate-count');
      if (countEl) countEl.textContent = list.length < allCandidates.length ? `(${list.length} of ${allCandidates.length})` : `(${allCandidates.length})`;
      sel.dispatchEvent(new Event('change'));
    }

    document.getElementById('candidates-search').addEventListener('input', e => {
      const q = e.target.value.trim().toLowerCase();
      const filtered = q
        ? allCandidates.filter(c =>
            (c.name ?? '').toLowerCase().includes(q) ||
            (c.phone ?? '').toLowerCase().includes(q)
          )
        : allCandidates;
      populateSelect(filtered);
    });

    sel.addEventListener('change', () => {
      const c = allCandidates.find(x => String(x.id) === sel.value);
      if (c) {
        detailEl.innerHTML = `
          <div class="candidate-detail-row">
            <div class="candidate-name">${esc(c.name ?? 'Unknown')}</div>
            <div class="candidate-meta">
              ${c.email ? `<span>${esc(c.email)}</span><span>·</span>` : ''}
              ${c.phone ? `<span>${esc(c.phone)}</span>` : '<span class="text-muted">No phone on file</span>'}
            </div>
            <div class="candidate-id">ID: ${esc(c.id)}</div>
          </div>`;
        dbCallBtn.disabled = !c.phone;
        dbCallBtn.title = c.phone ? '' : 'No phone number on file';
      } else {
        detailEl.innerHTML = '';
        dbCallBtn.disabled = true;
      }
    });

    dbCallBtn.addEventListener('click', () => {
      const c = allCandidates.find(x => String(x.id) === sel.value);
      if (!c || !c.phone) return;
      openCallModal({ type: 'db', talentId: c.id, name: c.name ?? 'Unknown', phone: c.phone });
    });

    populateSelect(allCandidates);
  } catch {
    sel.innerHTML = `<option value="">— could not load candidates —</option>`;
  }
}

// ── Active call banner ───────────────────────────────────────────
let activeCall = null; // { callSid, name, status: 'ringing'|'connected', startedAt, connectedAt }
let transcriptPollTimer = null;

function fmtClock(elapsedMs) {
  const secs = Math.max(0, Math.floor(elapsedMs / 1000));
  const mm = String(Math.floor(secs / 60)).padStart(2, '0');
  const ss = String(secs % 60).padStart(2, '0');
  return `${mm}:${ss}`;
}

function setActiveCall(callSid, name, opts = {}) {
  activeCall = {
    callSid,
    name,
    status: opts.status ?? 'ringing',
    startedAt: opts.startedAt ?? Date.now(),
    connectedAt: opts.connectedAt ?? null,
  };
  document.getElementById('active-call-name').textContent = name;
  document.getElementById('active-call-banner').classList.add('visible');
  updateActiveCallUI();
}

function clearActiveCall() {
  activeCall = null;
  document.getElementById('active-call-banner').classList.remove('visible', 'connected');
  closeTranscriptModal();
}

// Keeps the banner's Ringing/Live badge, dot color and live clock in sync —
// called on every status change and on every clock tick.
function updateActiveCallUI() {
  if (!activeCall) return;
  const connected = activeCall.status === 'connected';
  document.getElementById('active-call-banner').classList.toggle('connected', connected);
  document.getElementById('active-call-label').textContent = connected ? 'Live' : 'Ringing';
  const clockEl = document.getElementById('active-call-clock');
  if (connected && activeCall.connectedAt) {
    clockEl.textContent = fmtClock(Date.now() - activeCall.connectedAt);
  } else {
    const secs = Math.max(0, Math.floor((Date.now() - activeCall.startedAt) / 1000));
    clockEl.textContent = `${secs}s`;
  }
}

async function endActiveCall() {
  if (!activeCall) return;
  const btn = document.getElementById('active-end-btn');
  btn.disabled = true;
  btn.textContent = 'Ending…';
  try {
    const res = await fetch('/api/dashboard/end-call', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ callSid: activeCall.callSid }),
    });
    const data = await res.json();
    if (!data.ok) throw new Error(data.error);
    showToast('Call ended');
    clearActiveCall();
  } catch (err) {
    showToast('Failed to end call: ' + String(err), true);
  } finally {
    btn.disabled = false;
    btn.textContent = 'End Call';
  }
}

function openTranscriptModal() {
  if (!activeCall) return;
  document.getElementById('transcript-modal-title').textContent = `Live Transcript — ${activeCall.name}`;
  document.getElementById('transcript-modal-overlay').classList.add('visible');
  updateTranscriptBadge();
  pollTranscript();
  transcriptPollTimer = setInterval(pollTranscript, 2000);
}

function closeTranscriptModal() {
  document.getElementById('transcript-modal-overlay').classList.remove('visible');
  clearInterval(transcriptPollTimer);
  transcriptPollTimer = null;
}

function updateTranscriptBadge() {
  const badge = document.getElementById('transcript-modal-badge');
  const connected = !!activeCall && activeCall.status === 'connected';
  badge.textContent = connected ? 'Live' : 'Ringing';
  badge.classList.toggle('connected', connected);
}

// A call that hasn't been answered yet is a normal, expected state — the endpoint
// responds 200 with status:'ringing' for it, never a 404. Only a real 404 (the call
// no longer exists at all) means it actually ended, and that's the one case where the
// banner should be cleared. Previously any 404 — including "not answered yet" — cleared
// the banner, so an early click on "View Transcript" made it disappear.
async function pollTranscript() {
  if (!activeCall) return;
  try {
    const res = await fetch(`/api/dashboard/call-transcript/${activeCall.callSid}`);
    if (res.status === 404) {
      showToast(`Call with ${activeCall.name} ended`);
      clearActiveCall();
      return;
    }
    const { status, transcript } = await res.json();
    if (activeCall && status && activeCall.status !== status) {
      activeCall.status = status;
      if (status === 'connected' && !activeCall.connectedAt) activeCall.connectedAt = Date.now();
      updateActiveCallUI();
    }
    updateTranscriptBadge();
    renderTranscript(status, transcript ?? []);
  } catch {}
}

function renderTranscript(status, lines) {
  const body = document.getElementById('transcript-modal-body');
  if (status === 'ringing') {
    const secs = activeCall ? Math.max(0, Math.floor((Date.now() - activeCall.startedAt) / 1000)) : 0;
    body.innerHTML = `
      <div class="transcript-waiting">
        <div class="transcript-waiting-radar">
          <div class="wave"></div><div class="wave w2"></div><div class="wave w3"></div><div class="core"></div>
        </div>
        <div class="transcript-waiting-title">Ringing ${esc(activeCall ? activeCall.name : '')}…</div>
        <div class="transcript-waiting-sub">The transcript will appear the moment they pick up — this call stays active, feel free to leave this open.</div>
        <div class="transcript-waiting-clock">${secs}s elapsed</div>
      </div>`;
    return;
  }
  if (!lines.length) {
    body.innerHTML = `<div class="empty-state"><div class="empty-msg">Waiting for conversation…</div></div>`;
    return;
  }
  body.innerHTML = lines.map(l => `
    <div class="live-turn ${l.role === 'assistant' ? 'agent' : 'candidate'}">
      <div class="turn-label">${l.role === 'assistant' ? '🌿 Treelance' : '👤 Candidate'}</div>
      <div class="turn-bubble">${esc(l.content)}</div>
    </div>
  `).join('');
  body.scrollTop = body.scrollHeight;
}

function initActiveBanner() {
  document.getElementById('active-end-btn').addEventListener('click', endActiveCall);
  document.getElementById('active-transcript-btn').addEventListener('click', openTranscriptModal);
  document.getElementById('transcript-close-btn').addEventListener('click', closeTranscriptModal);
  document.getElementById('transcript-modal-overlay').addEventListener('click', e => {
    if (e.target === document.getElementById('transcript-modal-overlay')) closeTranscriptModal();
  });

  // Recover active call on page load — covers calls that are still ringing too.
  fetch('/api/dashboard/active-calls')
    .then(r => r.json())
    .then(({ calls }) => {
      if (calls && calls.length > 0) {
        const c = calls[0];
        setActiveCall(c.callSid, c.candidateName, {
          status: c.status, startedAt: c.startedAt, connectedAt: c.connectedAt,
        });
      }
    })
    .catch(() => {});
}

// ═══════════════════════════════════════
//  LIVE CALL STATUS (OVERVIEW CARD)
// ═══════════════════════════════════════

let liveCallTracked = null; // { callSid, name, status, startedAt, connectedAt }

function initCallStatusCard() {
  pollCallStatus();
  setInterval(pollCallStatus, 5000);
  setInterval(tickLiveClocks, 1000);
}

async function pollCallStatus() {
  const card = document.getElementById('live-call-card');
  if (!card) return;
  try {
    const res = await fetch('/api/dashboard/active-calls');
    const { calls } = await res.json();

    // Reconcile the floating banner against the server's view of reality: if the call
    // we're tracking has dropped out of the active list, it genuinely ended (failed,
    // busy, no-answer, completed) — clear the banner even if the transcript modal was
    // never opened, instead of leaving it stuck showing a dead call.
    if (activeCall) {
      const match = calls && calls.find(c => c.callSid === activeCall.callSid);
      if (!match) {
        showToast(`Call with ${activeCall.name} ended`);
        clearActiveCall();
      } else if (activeCall.status !== match.status) {
        activeCall.status = match.status;
        activeCall.connectedAt = match.connectedAt ?? activeCall.connectedAt;
        updateActiveCallUI();
        updateTranscriptBadge();
      }
    }

    if (!calls || calls.length === 0) {
      liveCallTracked = null;
      card.innerHTML = `
        <div class="live-call-idle">
          <div class="live-call-idle-dot"></div>
          <span class="live-call-idle-text">No active call</span>
        </div>`;
    } else {
      const c = calls[0];
      const connected = c.status === 'connected';
      liveCallTracked = {
        callSid: c.callSid, name: c.candidateName, status: c.status,
        startedAt: c.startedAt, connectedAt: c.connectedAt,
      };
      card.innerHTML = `
        <div class="live-call-active${connected ? ' connected' : ''}">
          <div class="live-call-pulse"></div>
          <div class="live-call-info">
            <div class="live-call-name">${esc(c.candidateName)}</div>
            <div class="live-call-meta"><span class="badge">${connected ? 'Live' : 'Ringing'}</span><span class="clock" id="live-call-elapsed"></span></div>
          </div>
          <button class="live-call-goto-btn" onclick="switchTab('calls')">View</button>
        </div>`;
      tickLiveClocks();
    }
  } catch {
    // silently keep last state
  }
}

// Single 1s tick that keeps every live-call clock on the page in sync: the Overview
// card, the floating banner, and the transcript modal's ringing counter if it's open.
function tickLiveClocks() {
  const elapsedEl = document.getElementById('live-call-elapsed');
  if (elapsedEl && liveCallTracked) {
    if (liveCallTracked.status === 'connected' && liveCallTracked.connectedAt) {
      elapsedEl.textContent = fmtClock(Date.now() - liveCallTracked.connectedAt);
    } else {
      const secs = Math.max(0, Math.floor((Date.now() - liveCallTracked.startedAt) / 1000));
      elapsedEl.textContent = `${secs}s`;
    }
  }

  if (activeCall) updateActiveCallUI();

  const waitingClock = document.querySelector('#transcript-modal-body .transcript-waiting-clock');
  if (waitingClock && activeCall) {
    const secs = Math.max(0, Math.floor((Date.now() - activeCall.startedAt) / 1000));
    waitingClock.textContent = `${secs}s elapsed`;
  }
}

function openCallModal(call) {
  pendingCall = call;
  document.getElementById('modal-name').textContent = call.name;
  document.getElementById('modal-phone').textContent = call.phone;
  document.getElementById('call-modal-overlay').classList.add('visible');
}

function closeCallModal() {
  pendingCall = null;
  document.getElementById('call-modal-overlay').classList.remove('visible');
}

async function proceedCall() {
  if (!pendingCall) return;

  const btn = document.getElementById('modal-proceed-btn');
  btn.disabled = true;
  btn.textContent = 'Calling…';

  try {
    let res;
    if (pendingCall.type === 'db') {
      res = await fetch('/api/dashboard/call', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ talentId: pendingCall.talentId }),
      });
    } else {
      res = await fetch('/api/dashboard/call-manual', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: pendingCall.name, phone: pendingCall.phone }),
      });
    }

    const data = await res.json();
    if (!data.ok) throw new Error(data.error);
    const calledName = pendingCall.name;
    const calledSid = data.callSid;
    closeCallModal();
    if (calledSid) setActiveCall(calledSid, calledName);
    showToast(`Call started — ${calledName}`);
  } catch (err) {
    showToast('Call failed: ' + String(err), true);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Proceed';
  }
}

function initCalls() {
  // Manual call button enable/disable
  ['manual-name', 'manual-phone'].forEach(id => {
    document.getElementById(id)?.addEventListener('input', () => {
      const phone = document.getElementById('manual-phone').value.trim();
      document.getElementById('manual-call-btn').disabled = !phone;
    });
  });

  document.getElementById('manual-call-btn').addEventListener('click', () => {
    const name = document.getElementById('manual-name').value.trim() || 'Test Candidate';
    const phone = document.getElementById('manual-phone').value.trim();
    if (!phone) return;
    openCallModal({ type: 'manual', name, phone });
  });

  document.getElementById('modal-cancel-btn').addEventListener('click', closeCallModal);
  document.getElementById('call-modal-overlay').addEventListener('click', e => {
    if (e.target === document.getElementById('call-modal-overlay')) closeCallModal();
  });
  document.getElementById('modal-proceed-btn').addEventListener('click', proceedCall);

  // Call history toggle
  let historyLoaded = false;
  let historyOpen = false;
  let historyData = [];
  let historyPeriod = 'all';

  const toggleBtn   = document.getElementById('history-toggle-btn');
  const panel       = document.getElementById('history-panel');
  const chevron     = document.getElementById('history-chevron');
  const historyList = document.getElementById('history-list');
  const badgeEl     = document.getElementById('history-badge');

  function applyHistoryFilters() {
    let list = historyData;
    if (historyPeriod !== 'all') {
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const cutoff = {
        today: today,
        week:  new Date(today.getTime() - 6 * 86400000),
        month: new Date(today.getFullYear(), today.getMonth(), 1),
      }[historyPeriod];
      list = list.filter(a => a.created_at && new Date(a.created_at) >= cutoff);
    }
    renderHistoryRows(list);
  }

  function renderHistoryRows(list) {
    if (!list.length) {
      historyList.innerHTML = `<div class="history-empty">No calls match your filter.</div>`;
      return;
    }
    historyList.innerHTML = list.map(a => {
      const date = a.created_at ? new Date(a.created_at) : null;
      const dateStr = date ? date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
      const timeStr = date ? date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }) : '';
      const name  = a._talent?.name  ?? a.talent_id ?? 'Unknown';
      const phone = a._talent?.phone ?? null;
      return `
        <div class="history-row">
          <div class="history-row-left">
            <div class="history-row-name">${esc(name)}</div>
            ${phone ? `<div class="history-row-phone">${esc(phone)}</div>` : ''}
            <div class="history-row-id">${esc(a.talent_id ?? '')}</div>
          </div>
          <div class="history-row-when">${dateStr}${timeStr ? `<span class="history-row-sep">·</span>${timeStr}` : ''}</div>
        </div>`;
    }).join('');
  }

  panel.querySelectorAll('.filter-pill').forEach(pill => {
    pill.addEventListener('click', () => {
      panel.querySelectorAll('.filter-pill').forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      historyPeriod = pill.dataset.period;
      applyHistoryFilters();
    });
  });

  toggleBtn.addEventListener('click', async () => {
    historyOpen = !historyOpen;
    panel.classList.toggle('history-panel-open', historyOpen);
    toggleBtn.setAttribute('aria-expanded', historyOpen);
    chevron.style.transform = historyOpen ? 'rotate(180deg)' : '';

    if (historyOpen && !historyLoaded) {
      historyLoaded = true;
      historyList.innerHTML = `<div class="history-empty">Loading…</div>`;
      try {
        const res = await fetch('/api/dashboard/assessments');
        const { data, error } = await res.json();
        if (error && (!data || data.length === 0)) throw new Error(error);
        historyData = data ?? [];
        if (badgeEl) badgeEl.textContent = historyData.length || '';
        applyHistoryFilters();
      } catch {
        historyList.innerHTML = `<div class="history-empty">Could not load call history.</div>`;
      }
    }
  });
}

// ═══════════════════════════════════════
//  PROMPT EDITOR
// ═══════════════════════════════════════

let promptLoaded = false;
let promptHasOverride = false;

async function loadPrompt() {
  if (promptLoaded) return;
  promptLoaded = true;
  renderPromptHistory();

  const masterTA    = document.getElementById('master-textarea');
  const secondaryTA = document.getElementById('secondary-textarea');
  const knowledgeTA = document.getElementById('knowledge-textarea');
  const badge = document.getElementById('master-badge');

  masterTA.value = 'Loading…';
  try {
    const res = await fetch('/api/dashboard/prompt');
    const data = await res.json();
    masterTA.value    = data.masterPrompt;
    secondaryTA.value = data.secondary ?? '';
    knowledgeTA.value = data.knowledge ?? '';
    promptHasOverride = data.hasOverride;
    badge.classList.toggle('visible', data.hasOverride);
  } catch {
    masterTA.value = 'Could not load prompt — is the server running?';
  }
}

async function postPrompt(body) {
  const res = await fetch('/api/dashboard/prompt', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!data.ok) throw new Error(data.error || 'Save failed');
  return data;
}

async function saveMasterPrompt() {
  const masterTA    = document.getElementById('master-textarea');
  const secondaryTA = document.getElementById('secondary-textarea');
  const knowledgeTA = document.getElementById('knowledge-textarea');
  const badge = document.getElementById('master-badge');
  const btn = document.getElementById('master-save-btn');

  btn.disabled = true;
  btn.textContent = 'Saving…';
  try {
    await postPrompt({ masterOverride: masterTA.value, secondary: secondaryTA.value, knowledge: knowledgeTA.value });
    promptHasOverride = true;
    badge.classList.add('visible');
    showToast('Master prompt saved');
    await savePromptSnapshot(masterTA.value, secondaryTA.value);
  } catch (err) {
    showToast('Save failed: ' + String(err), true);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Save changes';
  }
}

async function resetMasterPrompt() {
  const masterTA    = document.getElementById('master-textarea');
  const secondaryTA = document.getElementById('secondary-textarea');
  const knowledgeTA = document.getElementById('knowledge-textarea');
  const badge = document.getElementById('master-badge');
  const btn = document.getElementById('master-reset-btn');

  btn.disabled = true;
  try {
    await postPrompt({ masterOverride: null, secondary: secondaryTA.value, knowledge: knowledgeTA.value });
    const res = await fetch('/api/dashboard/prompt');
    const data = await res.json();
    masterTA.value = data.masterPrompt;
    promptHasOverride = false;
    badge.classList.remove('visible');
    showToast('Reset to default');
  } catch (err) {
    showToast('Reset failed: ' + String(err), true);
  } finally {
    btn.disabled = false;
  }
}

async function saveSecondaryPrompt() {
  const masterTA    = document.getElementById('master-textarea');
  const secondaryTA = document.getElementById('secondary-textarea');
  const knowledgeTA = document.getElementById('knowledge-textarea');
  const btn = document.getElementById('secondary-save-btn');

  btn.disabled = true;
  btn.textContent = 'Saving…';
  try {
    await postPrompt({
      masterOverride: promptHasOverride ? masterTA.value : null,
      secondary: secondaryTA.value,
      knowledge: knowledgeTA.value,
    });
    showToast('Secondary prompt saved');
    await savePromptSnapshot(masterTA.value, secondaryTA.value);
  } catch (err) {
    showToast('Save failed: ' + String(err), true);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Save changes';
  }
}

async function saveKnowledgePrompt() {
  const masterTA    = document.getElementById('master-textarea');
  const secondaryTA = document.getElementById('secondary-textarea');
  const knowledgeTA = document.getElementById('knowledge-textarea');
  const btn = document.getElementById('knowledge-save-btn');

  btn.disabled = true;
  btn.textContent = 'Saving…';
  try {
    await postPrompt({
      masterOverride: promptHasOverride ? masterTA.value : null,
      secondary: secondaryTA.value,
      knowledge: knowledgeTA.value,
    });
    showToast('Knowledge base saved');
  } catch (err) {
    showToast('Save failed: ' + String(err), true);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Save changes';
  }
}

async function resetKnowledgePrompt() {
  const masterTA    = document.getElementById('master-textarea');
  const secondaryTA = document.getElementById('secondary-textarea');
  const knowledgeTA = document.getElementById('knowledge-textarea');
  const btn = document.getElementById('knowledge-reset-btn');

  btn.disabled = true;
  try {
    await postPrompt({
      masterOverride: promptHasOverride ? masterTA.value : null,
      secondary: secondaryTA.value,
      knowledge: '',
    });
    const res = await fetch('/api/dashboard/prompt');
    const data = await res.json();
    knowledgeTA.value = data.knowledge ?? '';
    showToast('Knowledge base reset to default');
  } catch (err) {
    showToast('Reset failed: ' + String(err), true);
  } finally {
    btn.disabled = false;
  }
}

function showToast(msg, isError = false) {
  const toast = document.getElementById('prompt-toast');
  toast.textContent = msg;
  toast.className = 'prompt-toast' + (isError ? ' toast-error' : '');
  toast.classList.add('toast-visible');
  clearTimeout(toast._hideTimer);
  toast._hideTimer = setTimeout(() => toast.classList.remove('toast-visible'), 2800);
}

function initPromptEditor() {
  document.getElementById('master-save-btn').addEventListener('click', saveMasterPrompt);
  document.getElementById('master-reset-btn').addEventListener('click', resetMasterPrompt);
  document.getElementById('secondary-save-btn').addEventListener('click', saveSecondaryPrompt);
  document.getElementById('secondary-clear-btn').addEventListener('click', () => {
    document.getElementById('secondary-textarea').value = '';
  });
  document.getElementById('knowledge-save-btn').addEventListener('click', saveKnowledgePrompt);
  document.getElementById('knowledge-reset-btn').addEventListener('click', resetKnowledgePrompt);
}

// ═══════════════════════════════════════
//  PROMPT VERSION HISTORY
// ═══════════════════════════════════════

let promptVersionCache = [];
let phModalIndex = null;
let _restoredContent = null;

async function savePromptSnapshot(master, secondary) {
  const sec = secondary || '';
  if (_restoredContent && master === _restoredContent.master && sec === _restoredContent.secondary) {
    _restoredContent = null;
    showToast('No changes from restored version — save skipped');
    return;
  }
  _restoredContent = null;
  const labelInput = document.getElementById('prompt-version-label');
  const label = labelInput ? labelInput.value.trim() : '';
  try {
    await fetch('/api/dashboard/prompt-versions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ master, secondary: sec, label }),
    });
    if (labelInput) labelInput.value = '';
  } catch {}
  await renderPromptHistory();
}

function buildPhRows(limit) {
  return promptVersionCache.slice(0, limit).map((entry, i) => {
    const d = new Date(entry.created_at);
    const dateStr = d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
    const timeStr = d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
    const vNum = entry.version_number ? `<span class="ph-vnum">v${entry.version_number}</span>` : '';
    const labelTxt = entry.label ? `<span class="ph-entry-label">${esc(entry.label)}</span>` : '';
    const latestBadge = i === 0 ? ' <span class="ph-latest">latest</span>' : '';
    const preview = entry.master.replace(/\n/g, ' ').slice(0, 80);
    return `
      <div class="ph-row">
        <div class="ph-row-left">
          <div class="ph-when">${vNum}${labelTxt}${latestBadge}</div>
          <div class="ph-preview">${dateStr} · ${timeStr} · ${esc(preview)}${entry.master.length > 80 ? '…' : ''}</div>
        </div>
        <div class="ph-row-actions">
          <button class="ph-view-btn" onclick="openPromptVersionModal(${i})">View</button>
          <button class="ph-delete-btn" onclick="deletePromptVersion('${entry.id}', ${i})">Delete</button>
        </div>
      </div>`;
  }).join('');
}

async function renderPromptHistory() {
  const card = document.getElementById('prompt-history-card');
  if (!card) return;
  try {
    const res = await fetch('/api/dashboard/prompt-versions');
    const { data } = await res.json();
    promptVersionCache = data ?? [];
    if (!promptVersionCache.length) {
      card.innerHTML = `<div class="card-desc text-muted">No saves yet — save the prompt to start tracking versions.</div>`;
      return;
    }
    const VISIBLE = 5;
    const total = promptVersionCache.length;
    const hasMore = total > VISIBLE;

    function render(showAll) {
      const rows = buildPhRows(showAll ? total : VISIBLE);
      const toggleBtn = hasMore
        ? `<button class="ph-toggle-btn" onclick="togglePromptHistory(${showAll})">${showAll ? 'Show less' : `Show all ${total} versions`}</button>`
        : '';
      card.innerHTML = rows + toggleBtn;
    }

    render(false);
  } catch {
    card.innerHTML = `<div class="card-desc text-muted">Could not load version history.</div>`;
  }
}

function togglePromptHistory(currentlyShowingAll) {
  const card = document.getElementById('prompt-history-card');
  if (!card) return;
  const VISIBLE = 5;
  const total = promptVersionCache.length;
  const showAll = !currentlyShowingAll;
  const rows = buildPhRows(showAll ? total : VISIBLE);
  const toggleBtn = `<button class="ph-toggle-btn" onclick="togglePromptHistory(${showAll})">${showAll ? 'Show less' : `Show all ${total} versions`}</button>`;
  card.innerHTML = rows + toggleBtn;
}

function openPromptVersionModal(i) {
  const entry = promptVersionCache[i];
  if (!entry) return;
  phModalIndex = i;
  const vLabel = entry.version_number ? `v${entry.version_number}` : '';
  const titleParts = [vLabel, entry.label].filter(Boolean);
  document.getElementById('ph-modal-title').textContent = titleParts.join(' · ') || 'Prompt Version';
  document.getElementById('ph-modal-master').textContent = entry.master;
  const secPre = document.getElementById('ph-modal-secondary');
  const secLabel = document.getElementById('ph-modal-secondary-label');
  if (entry.secondary && entry.secondary.trim()) {
    secPre.textContent = entry.secondary;
    secPre.style.display = '';
    secLabel.style.display = '';
  } else {
    secPre.style.display = 'none';
    secLabel.style.display = 'none';
  }
  document.getElementById('ph-modal-backdrop').style.display = 'flex';
}

function closePromptVersionModal() {
  document.getElementById('ph-modal-backdrop').style.display = 'none';
  phModalIndex = null;
}

function restoreFromModal() {
  const entry = promptVersionCache[phModalIndex];
  if (!entry) return;
  document.getElementById('master-textarea').value = entry.master;
  document.getElementById('secondary-textarea').value = entry.secondary;
  _restoredContent = { master: entry.master, secondary: entry.secondary || '' };
  closePromptVersionModal();
  showToast('Version loaded — edit if needed, then click Save to apply');
}

async function deletePromptVersion(id, i) {
  const entry = promptVersionCache[i];
  const label = entry?.label || (entry?.version_number ? `v${entry.version_number}` : 'this version');
  if (!confirm(`Delete ${label}? This cannot be undone.`)) return;
  try {
    const res = await fetch(`/api/dashboard/prompt-versions/${id}`, { method: 'DELETE' });
    const data = await res.json();
    if (!data.ok) throw new Error(data.error);
    await renderPromptHistory();
  } catch (err) {
    showToast('Delete failed: ' + String(err), true);
  }
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
//  PROVIDERS & MODELS
// ═══════════════════════════════════════

async function providersFetchJSON(url, options) {
  const res = await fetch(url, options);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

function providerKeyHint(provider, keyConfigured) {
  return keyConfigured[provider]
    ? ''
    : `<div class="field-hint" style="color:var(--red)">No API key set for "${esc(provider)}" in .env, calls will fail until one is added.</div>`;
}

function llmProviderCardHtml(llm) {
  const models = llm.suggestedModels[llm.active] || [];
  return `
    <div class="card" data-provider-card="llm">
      <div class="card-title" style="display:flex;align-items:center;justify-content:space-between">
        LLM Provider <span class="provider-val">${esc(llm.active)}</span>
      </div>
      <div class="field-group">
        <div class="field-label">Provider</div>
        <div class="scenario-select-wrap">
          <select id="prov-llm-provider">
            ${llm.options.map(o => `<option value="${esc(o)}" ${o === llm.active ? 'selected' : ''}>${esc(o)}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="field-group" style="margin-bottom:14px">
        <div class="field-label">Model</div>
        <input class="field-input" id="prov-llm-model" list="prov-llm-model-options" value="${esc(llm.model)}">
        <datalist id="prov-llm-model-options">
          ${models.map(m => `<option value="${esc(m)}">`).join('')}
        </datalist>
        <div class="field-hint">Any model slug works, these are just suggestions.</div>
        <div id="prov-llm-keyhint">${providerKeyHint(llm.active, llm.keyConfigured)}</div>
      </div>
      <button class="prompt-btn-save" id="prov-llm-save">Save</button>
    </div>`;
}

function sttProviderCardHtml(stt) {
  return `
    <div class="card" data-provider-card="stt" style="margin-top:14px">
      <div class="card-title" style="display:flex;align-items:center;justify-content:space-between">
        STT <span class="provider-val">${esc(stt.active)}</span>
      </div>
      <div class="card-desc text-muted">Only one STT provider is wired up right now, nothing to switch.</div>
      ${providerKeyHint(stt.active, stt.keyConfigured)}
    </div>`;
}

function ttsProviderCardHtml(tts) {
  return `
    <div class="card" data-provider-card="tts" style="margin-top:14px">
      <div class="card-title" style="display:flex;align-items:center;justify-content:space-between">
        TTS <span class="provider-val">${esc(tts.active)}</span>
      </div>
      <div class="field-group">
        <div class="field-label">Provider</div>
        <div class="scenario-select-wrap">
          <select id="prov-tts-provider">
            ${tts.options.map(o => `<option value="${esc(o)}" ${o === tts.active ? 'selected' : ''}>${esc(o)}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="field-group" style="margin-bottom:14px">
        <div class="field-label">Voice ID</div>
        <input class="field-input" id="prov-tts-voice" value="${esc(tts.voiceId)}">
        <div id="prov-tts-keyhint">${providerKeyHint(tts.active, tts.keyConfigured)}</div>
      </div>
      <button class="prompt-btn-save" id="prov-tts-save">Save</button>
    </div>`;
}

async function loadProviders() {
  const grid = document.getElementById('providers-grid');
  try {
    const d = await providersFetchJSON('/api/dashboard/providers');
    grid.innerHTML = llmProviderCardHtml(d.llm) + sttProviderCardHtml(d.stt) + ttsProviderCardHtml(d.tts);
    wireProviderCards(d);
  } catch (err) {
    grid.innerHTML = `<div class="card"><div class="card-desc text-muted">Failed to load: ${esc(err.message)}</div></div>`;
  }
}

function wireProviderCards(d) {
  // Swapping the provider dropdown swaps the model/voice field's default
  // and suggestions to match, before anything is saved.
  document.getElementById('prov-llm-provider').addEventListener('change', (e) => {
    const provider = e.target.value;
    const models = d.llm.suggestedModels[provider] || [];
    document.getElementById('prov-llm-model').value = provider === d.llm.active ? d.llm.model : (models[0] || '');
    document.getElementById('prov-llm-model-options').innerHTML = models.map(m => `<option value="${esc(m)}">`).join('');
    document.getElementById('prov-llm-keyhint').innerHTML = providerKeyHint(provider, d.llm.keyConfigured);
  });

  document.getElementById('prov-tts-provider').addEventListener('change', (e) => {
    const provider = e.target.value;
    document.getElementById('prov-tts-keyhint').innerHTML = providerKeyHint(provider, d.tts.keyConfigured);
  });

  document.getElementById('prov-llm-save').addEventListener('click', async () => {
    const btn = document.getElementById('prov-llm-save');
    const llmProvider = document.getElementById('prov-llm-provider').value;
    const llmModel = document.getElementById('prov-llm-model').value.trim();
    if (!llmModel) { showToast('Model can\'t be empty', true); return; }
    btn.disabled = true;
    btn.textContent = 'Saving…';
    try {
      await providersFetchJSON('/api/dashboard/providers', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ llmProvider, llmModel }),
      });
      showToast('LLM saved');
      loadProviders();
    } catch (err) {
      showToast(`Failed: ${err.message}`, true);
      btn.disabled = false;
      btn.textContent = 'Save';
    }
  });

  document.getElementById('prov-tts-save').addEventListener('click', async () => {
    const btn = document.getElementById('prov-tts-save');
    const ttsProvider = document.getElementById('prov-tts-provider').value;
    const ttsVoiceId = document.getElementById('prov-tts-voice').value.trim();
    if (!ttsVoiceId) { showToast('Voice ID can\'t be empty', true); return; }
    btn.disabled = true;
    btn.textContent = 'Saving…';
    try {
      await providersFetchJSON('/api/dashboard/providers', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ttsProvider, ttsVoiceId }),
      });
      showToast('TTS saved');
      loadProviders();
    } catch (err) {
      showToast(`Failed: ${err.message}`, true);
      btn.disabled = false;
      btn.textContent = 'Save';
    }
  });
}

// ═══════════════════════════════════════
//  INIT
// ═══════════════════════════════════════

function init() {
  initTabs();
  initSubTabs();
  initCalls();
  initActiveBanner();
  initPromptEditor();
  initCallStatusCard();
  initVoiceTest();
  checkStatus();
  loadConfig();
  setInterval(checkStatus, 30_000);
  setInterval(loadConfig, 60_000);
}

// ═══════════════════════════════════════
//  CALL BRIEF
// ═══════════════════════════════════════

const BRIEF_FIELD_GROUPS = [
  {
    label: 'Role & Experience',
    fields: ['Job function', 'Discipline', 'Current role and title', 'Years of experience', 'Role type', 'Seniority and authority'],
  },
  {
    label: 'Technical Background',
    fields: ['Asset sectors', 'Systems and equipment', 'Project phases', 'Deliverables owned', 'Deliverable authorship level', 'Experience recency'],
  },
  {
    label: 'Tools & Standards',
    fields: ['Tools and software', 'Standards and codes', 'Vendor and platform experience'],
  },
  {
    label: 'Location & Scale',
    fields: ['Regions worked', 'Work environment', 'Project scale'],
  },
  {
    label: 'Credentials',
    fields: ['Certifications and licences'],
  },
  {
    label: 'Availability & Commercial',
    fields: ['Availability', 'Available from', 'Notice period', 'Rate', 'Contract preference', 'Mobility', 'Visa status', 'Work rights'],
  },
];

let briefLoaded = false;
let briefAllCandidates = [];
let briefSelectedFields = [];
let briefCurrentTalentId = null;
let briefFilledFields = [];

function initCallBrief() {
  if (briefLoaded) return;
  briefLoaded = true;

  const sel = document.getElementById('brief-candidate-select');
  const searchEl = document.getElementById('brief-search');

  // Load candidates
  fetch('/api/dashboard/candidates')
    .then(r => r.json())
    .then(({ data }) => {
      briefAllCandidates = data ?? [];
      populateBriefSelect(briefAllCandidates);
    })
    .catch(() => {
      sel.innerHTML = `<option value="">— could not load candidates —</option>`;
    });

  searchEl.addEventListener('input', e => {
    const q = e.target.value.trim().toLowerCase();
    const filtered = q
      ? briefAllCandidates.filter(c => (c.name ?? '').toLowerCase().includes(q))
      : briefAllCandidates;
    populateBriefSelect(filtered);
  });

  sel.addEventListener('change', () => {
    const c = briefAllCandidates.find(x => String(x.id) === sel.value);
    if (c) {
      document.getElementById('brief-candidate-detail').innerHTML = `
        <div class="candidate-detail-row">
          <div class="candidate-name">${esc(c.name ?? 'Unknown')}</div>
          <div class="candidate-meta">${c.phone ? esc(c.phone) : '<span class="text-muted">No phone</span>'}</div>
        </div>`;
      loadBriefForCandidate(c.id);
    } else {
      document.getElementById('brief-candidate-detail').innerHTML = '';
      document.getElementById('brief-config').style.display = 'none';
      document.getElementById('brief-no-candidate').style.display = '';
      briefCurrentTalentId = null;
    }
  });

  document.getElementById('brief-save-btn').addEventListener('click', saveBrief);
  document.getElementById('brief-clear-btn').addEventListener('click', clearBrief);
  initManualContacts();
}

function populateBriefSelect(list) {
  const sel = document.getElementById('brief-candidate-select');
  const prev = sel.value;
  sel.innerHTML = `<option value="">— choose a candidate —</option>` +
    list.map(c => `<option value="${esc(c.id)}">${esc(c.name ?? 'Unknown')}${c.phone ? '' : ' (no phone)'}</option>`).join('');
  if (list.find(c => String(c.id) === prev)) sel.value = prev;
}

async function loadBriefForCandidate(talentId) {
  briefCurrentTalentId = talentId;
  briefSelectedFields = [];

  document.getElementById('brief-config').style.display = '';
  document.getElementById('brief-no-candidate').style.display = 'none';
  document.getElementById('brief-gaps-loading').style.display = '';
  document.getElementById('brief-field-groups').style.display = 'none';
  document.getElementById('brief-custom-questions').value = '';

  // Load gaps and saved brief in parallel
  const [gapsRes, briefRes] = await Promise.allSettled([
    fetch(`/api/dashboard/candidate-gaps/${talentId}`).then(r => r.json()),
    fetch(`/api/dashboard/call-brief/${talentId}`).then(r => r.json()),
  ]);

  briefFilledFields = gapsRes.status === 'fulfilled' ? (gapsRes.value.filled ?? []) : [];
  const savedBrief = briefRes.status === 'fulfilled' ? briefRes.value.brief : { fields: [], customQuestions: '' };

  briefSelectedFields = savedBrief.fields ?? [];
  document.getElementById('brief-custom-questions').value = savedBrief.customQuestions ?? '';

  renderBriefFieldGroups();

  document.getElementById('brief-gaps-loading').style.display = 'none';
  document.getElementById('brief-field-groups').style.display = '';
  updateBriefSelectedSummary();
}

function renderBriefFieldGroups() {
  const container = document.getElementById('brief-field-groups');
  container.innerHTML = BRIEF_FIELD_GROUPS.map(group => {
    const tags = group.fields.map(field => {
      const isMissing = !briefFilledFields.includes(field);
      const isSelected = briefSelectedFields.includes(field);
      return `<button class="brief-field-tag ${isMissing ? 'brief-tag-missing' : 'brief-tag-filled'} ${isSelected ? 'brief-tag-selected' : ''}"
        data-field="${esc(field)}"
        onclick="toggleBriefField(this, '${esc(field)}')"
      >${esc(field)}${isMissing ? ' <span class="brief-missing-dot">●</span>' : ''}</button>`;
    }).join('');
    return `<div class="brief-group">
      <div class="brief-group-label">${esc(group.label)}</div>
      <div class="brief-tags">${tags}</div>
    </div>`;
  }).join('');
}

function toggleBriefField(btn, field) {
  const idx = briefSelectedFields.indexOf(field);
  if (idx === -1) {
    briefSelectedFields.push(field);
    btn.classList.add('brief-tag-selected');
  } else {
    briefSelectedFields.splice(idx, 1);
    btn.classList.remove('brief-tag-selected');
  }
  updateBriefSelectedSummary();
}

function updateBriefSelectedSummary() {
  const wrap = document.getElementById('brief-selected-wrap');
  const tagsEl = document.getElementById('brief-selected-tags');
  if (briefSelectedFields.length === 0) {
    wrap.style.display = 'none';
    return;
  }
  wrap.style.display = '';
  tagsEl.innerHTML = briefSelectedFields.map(f =>
    `<span class="brief-selected-chip">${esc(f)} <button onclick="removeBriefField('${esc(f)}')" class="brief-chip-remove">✕</button></span>`
  ).join('');
}

function removeBriefField(field) {
  briefSelectedFields = briefSelectedFields.filter(f => f !== field);
  // also deselect the tag button
  document.querySelectorAll('.brief-field-tag').forEach(btn => {
    if (btn.dataset.field === field) btn.classList.remove('brief-tag-selected');
  });
  updateBriefSelectedSummary();
}

async function saveBrief() {
  if (!briefCurrentTalentId) return;
  const btn = document.getElementById('brief-save-btn');
  btn.disabled = true;
  btn.textContent = 'Saving…';
  try {
    const res = await fetch(`/api/dashboard/call-brief/${briefCurrentTalentId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fields: briefSelectedFields,
        customQuestions: document.getElementById('brief-custom-questions').value.trim(),
      }),
    });
    const data = await res.json();
    if (!data.ok) throw new Error(data.error);
    showToast('Brief saved');
  } catch (err) {
    showToast('Save failed: ' + String(err), true);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Save Brief';
  }
}

async function clearBrief() {
  if (!briefCurrentTalentId) return;
  briefSelectedFields = [];
  document.getElementById('brief-custom-questions').value = '';
  document.querySelectorAll('.brief-field-tag').forEach(btn => btn.classList.remove('brief-tag-selected'));
  updateBriefSelectedSummary();
  await saveBrief();
}

// ═══════════════════════════════════════
//  MANUAL TEST CONTACTS
// ═══════════════════════════════════════

let manualContacts = [];
let manualFormFields = [];
let manualEditingId = null;

function loadManualContacts() {
  try { manualContacts = JSON.parse(localStorage.getItem('treelance-manual-contacts') ?? '[]'); }
  catch { manualContacts = []; }
}

function saveManualContactsToStorage() {
  localStorage.setItem('treelance-manual-contacts', JSON.stringify(manualContacts));
}

function initManualContacts() {
  loadManualContacts();
  renderManualFieldGroups();
  renderManualContacts();
  document.getElementById('manual-add-btn').addEventListener('click', commitManualContact);
  document.getElementById('manual-cancel-edit-btn').addEventListener('click', cancelManualEdit);
}

function renderManualFieldGroups() {
  const container = document.getElementById('manual-field-groups');
  container.innerHTML = BRIEF_FIELD_GROUPS.map(group => {
    const tags = group.fields.map(field => {
      const isSelected = manualFormFields.includes(field);
      return `<button class="brief-field-tag brief-tag-filled ${isSelected ? 'brief-tag-selected' : ''}"
        data-manual-field="${esc(field)}"
        onclick="toggleManualField(this, '${esc(field)}')"
      >${esc(field)}</button>`;
    }).join('');
    return `<div class="brief-group">
      <div class="brief-group-label">${esc(group.label)}</div>
      <div class="brief-tags">${tags}</div>
    </div>`;
  }).join('');
}

function toggleManualField(btn, field) {
  const idx = manualFormFields.indexOf(field);
  if (idx === -1) { manualFormFields.push(field); btn.classList.add('brief-tag-selected'); }
  else { manualFormFields.splice(idx, 1); btn.classList.remove('brief-tag-selected'); }
  updateManualSelectedSummary();
}

function updateManualSelectedSummary() {
  const wrap = document.getElementById('manual-selected-wrap');
  const tagsEl = document.getElementById('manual-selected-tags');
  if (manualFormFields.length === 0) { wrap.style.display = 'none'; return; }
  wrap.style.display = '';
  tagsEl.innerHTML = manualFormFields.map(f =>
    `<span class="brief-selected-chip">${esc(f)} <button onclick="removeManualFormField('${esc(f)}')" class="brief-chip-remove">✕</button></span>`
  ).join('');
}

function removeManualFormField(field) {
  manualFormFields = manualFormFields.filter(f => f !== field);
  document.querySelectorAll('[data-manual-field]').forEach(btn => {
    if (btn.dataset.manualField === field) btn.classList.remove('brief-tag-selected');
  });
  updateManualSelectedSummary();
}

function commitManualContact() {
  const name = document.getElementById('manual-name').value.trim();
  const phone = document.getElementById('manual-phone').value.trim();
  if (!name || !phone) { showToast('Name and phone are required', true); return; }
  const customQuestions = document.getElementById('manual-custom-questions').value.trim();

  if (manualEditingId !== null) {
    const idx = manualContacts.findIndex(c => c.id === manualEditingId);
    if (idx !== -1) manualContacts[idx] = { id: manualEditingId, name, phone, fields: [...manualFormFields], customQuestions };
    showToast('Contact updated');
    resetManualForm();
  } else {
    manualContacts.push({ id: Date.now(), name, phone, fields: [...manualFormFields], customQuestions });
    showToast('Contact added');
    resetManualForm();
  }
  saveManualContactsToStorage();
  renderManualContacts();
}

function editManualContact(id) {
  const c = manualContacts.find(x => x.id === id);
  if (!c) return;
  manualEditingId = id;
  document.getElementById('manual-name').value = c.name;
  document.getElementById('manual-phone').value = c.phone;
  document.getElementById('manual-custom-questions').value = c.customQuestions ?? '';
  manualFormFields = [...(c.fields ?? [])];
  renderManualFieldGroups();
  updateManualSelectedSummary();
  document.getElementById('manual-form-title').textContent = `Editing: ${c.name}`;
  document.getElementById('manual-add-btn').textContent = 'Save Changes';
  document.getElementById('manual-cancel-edit-btn').style.display = '';
  document.getElementById('manual-add-card').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function cancelManualEdit() {
  manualEditingId = null;
  resetManualForm();
}

function resetManualForm() {
  manualEditingId = null;
  manualFormFields = [];
  document.getElementById('manual-name').value = '';
  document.getElementById('manual-phone').value = '';
  document.getElementById('manual-custom-questions').value = '';
  document.getElementById('manual-form-title').textContent = 'New Contact';
  document.getElementById('manual-add-btn').textContent = 'Add Contact';
  document.getElementById('manual-cancel-edit-btn').style.display = 'none';
  renderManualFieldGroups();
  updateManualSelectedSummary();
}

function deleteManualContact(id) {
  manualContacts = manualContacts.filter(c => c.id !== id);
  saveManualContactsToStorage();
  if (manualEditingId === id) cancelManualEdit();
  renderManualContacts();
  showToast('Contact removed');
}

function renderManualContacts() {
  const container = document.getElementById('manual-contacts-list');
  if (manualContacts.length === 0) {
    container.innerHTML = `<div class="empty-state" style="margin-top:8px;padding:24px 0">
      <div class="empty-icon"><i class="ph-duotone ph-user-plus" aria-hidden="true"></i></div>
      <div class="empty-msg">No manual contacts yet — add one above</div>
    </div>`;
    return;
  }
  container.innerHTML = manualContacts.map(c => {
    const fieldChips = (c.fields ?? []).length
      ? (c.fields ?? []).map(f => `<span class="brief-selected-chip" style="pointer-events:none">${esc(f)}</span>`).join('')
      : '<span class="card-desc" style="font-size:12px">No fields selected</span>';
    const q = c.customQuestions
      ? `<div class="card-desc" style="margin-top:8px;font-size:12px;white-space:pre-wrap">${esc(c.customQuestions)}</div>`
      : '';
    return `<div class="card" style="margin-bottom:10px">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px">
        <div style="flex:1;min-width:0">
          <div class="candidate-name" style="margin-bottom:2px">${esc(c.name)}</div>
          <div class="candidate-meta">${esc(c.phone)}</div>
          <div class="brief-selected-tags" style="margin-top:8px;flex-wrap:wrap">${fieldChips}</div>
          ${q}
        </div>
        <div style="display:flex;flex-direction:column;gap:6px;flex-shrink:0">
          <button class="prompt-btn-ghost" style="padding:6px 14px;font-size:12px" onclick="editManualContact(${c.id})">Edit</button>
          <button class="prompt-btn-ghost" style="padding:6px 14px;font-size:12px;color:#e05555;border-color:#e05555" onclick="deleteManualContact(${c.id})">Remove</button>
        </div>
      </div>
    </div>`;
  }).join('');
}

document.addEventListener('DOMContentLoaded', init);

// ═══════════════════════════════════════
//  VOICE TEST
// ═══════════════════════════════════════

let voiceWs = null;
let micStream = null;
let micAudioCtx = null;
let audioWorkletNode = null;
let voiceSessionActive = false;

// ── Playback queue ───────────────────────────────────────────────
let playbackCtx = null;
let audioQueue = [];
let isPlaying = false;
let currentSource = null;

function ensurePlaybackCtx() {
  if (!playbackCtx || playbackCtx.state === 'closed') {
    playbackCtx = new AudioContext();
  }
  if (playbackCtx.state === 'suspended') playbackCtx.resume();
}

async function enqueueAudio(arrayBuffer) {
  ensurePlaybackCtx();
  try {
    const decoded = await playbackCtx.decodeAudioData(arrayBuffer);
    audioQueue.push(decoded);
    setVoiceStatus('Agent speaking…', 'speaking');
    if (!isPlaying) playNext();
  } catch (e) {
    console.warn('[voice] Could not decode audio:', e);
  }
}

function playNext() {
  if (!audioQueue.length) {
    isPlaying = false;
    currentSource = null;
    if (voiceSessionActive) setVoiceStatus('Listening…', 'listening');
    return;
  }
  isPlaying = true;
  const buffer = audioQueue.shift();
  const src = playbackCtx.createBufferSource();
  src.buffer = buffer;
  src.connect(playbackCtx.destination);
  src.onended = playNext;
  currentSource = src;
  src.start();
}

function clearAudioQueue() {
  audioQueue = [];
  if (currentSource) {
    try { currentSource.stop(); } catch {}
    currentSource = null;
  }
  isPlaying = false;
}

// ── UI helpers ───────────────────────────────────────────────────
function setVoiceStatus(text, state) {
  const el = document.getElementById('voice-status');
  const dot = document.getElementById('voice-status-dot');
  if (el) el.textContent = text;
  if (dot) dot.className = 'voice-status-dot' + (state ? ' vsd-' + state : '');
}

function setMicBtn(label, icon, active) {
  const btn = document.getElementById('voice-mic-btn');
  const lbl = document.getElementById('voice-mic-label');
  const ico = document.getElementById('voice-mic-icon');
  if (lbl) lbl.textContent = label;
  if (ico) ico.innerHTML = icon;
  if (btn) btn.classList.toggle('voice-mic-active', !!active);
}

function appendVoiceLine(role, text) {
  const box = document.getElementById('voice-transcript');
  if (!box) return;
  const empty = box.querySelector('.empty-state');
  if (empty) empty.remove();
  const line = document.createElement('div');
  line.className = 'voice-turn ' + (role === 'agent' ? 'vt-agent' : 'vt-user');
  line.innerHTML = `
    <div class="vt-label">${role === 'agent' ? '🌿 Treelance' : '👤 You'}</div>
    <div class="vt-bubble">${esc(text)}</div>`;
  box.appendChild(line);
  box.scrollTop = box.scrollHeight;
}

// ── Session lifecycle ────────────────────────────────────────────
async function startVoiceSession() {
  const mode = document.querySelector('.voice-mode-btn.active')?.dataset.mode ?? 'custom';
  const name = (document.getElementById('voice-test-name')?.value || '').trim() || 'Test User';
  const talentId = mode === 'db' ? (document.getElementById('voice-candidate-select')?.value || '') : '';

  setVoiceStatus('Requesting mic…', '');
  try {
    micStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
  } catch {
    setVoiceStatus('Mic permission denied', 'error');
    return;
  }

  // Create both AudioContexts here — inside the user gesture chain — so browsers
  // don't block them under the autoplay policy.
  ensurePlaybackCtx();
  micAudioCtx = new AudioContext({ sampleRate: 48000 });

  const wsProto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  voiceWs = new WebSocket(`${wsProto}//${location.host}/browser-voice`);
  voiceWs.binaryType = 'arraybuffer';

  voiceWs.onopen = async () => {
    const startMsg = talentId ? { type: 'start', talentId } : { type: 'start', candidateName: name };
    voiceWs.send(JSON.stringify(startMsg));

    // Set up AudioWorklet mic capture
    await micAudioCtx.audioWorklet.addModule('/dashboard/audio-processor.js');
    const source = micAudioCtx.createMediaStreamSource(micStream);
    audioWorkletNode = new AudioWorkletNode(micAudioCtx, 'audio-processor');
    audioWorkletNode.port.onmessage = (e) => {
      if (voiceWs && voiceWs.readyState === WebSocket.OPEN) {
        voiceWs.send(e.data);
      }
    };
    source.connect(audioWorkletNode);

    voiceSessionActive = true;
    setMicBtn('End Session', '<i class="ph-duotone ph-stop-circle" aria-hidden="true"></i>', true);
    setVoiceStatus('Connecting…', '');

    // Reset transcript
    const box = document.getElementById('voice-transcript');
    if (box) box.innerHTML = '<div class="empty-state"><div class="empty-icon"><i class="ph-duotone ph-waveform" aria-hidden="true"></i></div><div class="empty-msg">Treelance is about to speak…</div></div>';
  };

  voiceWs.onmessage = async (e) => {
    if (e.data instanceof ArrayBuffer) {
      await enqueueAudio(e.data.slice(0));
    } else {
      try {
        const msg = JSON.parse(e.data);
        if (msg.type === 'transcript') {
          appendVoiceLine('user', msg.text);
          setVoiceStatus('Thinking…', 'thinking');
        } else if (msg.type === 'agent') {
          appendVoiceLine('agent', msg.text);
        } else if (msg.type === 'clear') {
          clearAudioQueue();
          setVoiceStatus('Listening…', 'listening');
        } else if (msg.type === 'session_end') {
          setVoiceStatus('Call ended by agent', '');
          setTimeout(stopVoiceSession, 3000);
        }
      } catch {}
    }
  };

  voiceWs.onclose = () => {
    if (voiceSessionActive) stopVoiceSession();
  };

  voiceWs.onerror = () => {
    setVoiceStatus('Connection error', 'error');
    stopVoiceSession();
  };
}

function stopVoiceSession() {
  voiceSessionActive = false;

  if (voiceWs) {
    if (voiceWs.readyState === WebSocket.OPEN) {
      voiceWs.send(JSON.stringify({ type: 'end' }));
    }
    voiceWs.close();
    voiceWs = null;
  }

  if (micStream) {
    micStream.getTracks().forEach(t => t.stop());
    micStream = null;
  }

  if (micAudioCtx) {
    micAudioCtx.close().catch(() => {});
    micAudioCtx = null;
    audioWorkletNode = null;
  }

  clearAudioQueue();
  setMicBtn('Start Session', '<i class="ph-duotone ph-microphone" aria-hidden="true"></i>', false);
  setVoiceStatus('Ready — click to start', '');
}

let voiceCandidatesLoaded = false;

async function loadVoiceCandidates() {
  if (voiceCandidatesLoaded) return;
  voiceCandidatesLoaded = true;
  const sel = document.getElementById('voice-candidate-select');
  if (!sel) return;
  try {
    const res = await fetch('/api/dashboard/candidates');
    const { data } = await res.json();
    const candidates = data ?? [];
    sel.innerHTML = '<option value="">— select a candidate —</option>' +
      candidates.map(c => `<option value="${esc(c.id)}">${esc(c.name ?? c.id)}</option>`).join('');
    sel.addEventListener('change', () => {
      const meta = document.getElementById('voice-candidate-meta');
      if (!meta) return;
      const opt = sel.options[sel.selectedIndex];
      meta.textContent = opt.value ? `ID: ${opt.value}` : '';
    });
  } catch {
    sel.innerHTML = '<option value="">— could not load candidates —</option>';
  }
}

function initVoiceTest() {
  document.getElementById('voice-mic-btn')?.addEventListener('click', () => {
    if (voiceSessionActive) {
      stopVoiceSession();
    } else {
      startVoiceSession();
    }
  });

  // Mode toggle
  document.querySelectorAll('.voice-mode-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.voice-mode-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const isDb = btn.dataset.mode === 'db';
      document.getElementById('voice-custom-row').style.display = isDb ? 'none' : '';
      document.getElementById('voice-db-row').style.display    = isDb ? '' : 'none';
      if (isDb) loadVoiceCandidates();
    });
  });
}
