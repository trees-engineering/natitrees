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
        <div class="recent-name">${esc(a.talent_id ?? 'Unknown candidate')}</div>
        <div class="recent-meta">
          <span>${a.created_at ? relativeTime(new Date(a.created_at)) : '—'}</span>
          <span class="assessment-tag tag-voice">${esc(a.channel ?? 'voice')}</span>
        </div>
      </div>
    `).join('');
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
      const name = t._talent?.name ?? t.talent_id ?? 'Unknown';
      const lines = parseTranscript(t.transcript);
      const snippet = t.ai_summary
        ? `<div class="tx-snippet">${esc(t.ai_summary.length > 110 ? t.ai_summary.slice(0, 110) + '…' : t.ai_summary)}</div>`
        : '';
      return `
        <div class="tx-card" id="tx-${i}">
          <button class="tx-header" onclick="toggleTranscript(${i})">
            <div class="tx-header-left">
              <div class="tx-name">${esc(name)}</div>
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
let activeCall = null; // { callSid, name }
let transcriptPollTimer = null;

function setActiveCall(callSid, name) {
  activeCall = { callSid, name };
  document.getElementById('active-call-name').textContent = name;
  document.getElementById('active-call-banner').classList.add('visible');
}

function clearActiveCall() {
  activeCall = null;
  document.getElementById('active-call-banner').classList.remove('visible');
  closeTranscriptModal();
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
  pollTranscript();
  transcriptPollTimer = setInterval(pollTranscript, 2000);
}

function closeTranscriptModal() {
  document.getElementById('transcript-modal-overlay').classList.remove('visible');
  clearInterval(transcriptPollTimer);
  transcriptPollTimer = null;
}

async function pollTranscript() {
  if (!activeCall) return;
  try {
    const res = await fetch(`/api/dashboard/call-transcript/${activeCall.callSid}`);
    if (res.status === 404) { clearActiveCall(); return; }
    const { transcript } = await res.json();
    renderTranscript(transcript ?? []);
  } catch {}
}

function renderTranscript(lines) {
  const body = document.getElementById('transcript-modal-body');
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

  // Recover active call on page load
  fetch('/api/dashboard/active-calls')
    .then(r => r.json())
    .then(({ calls }) => {
      if (calls && calls.length > 0) setActiveCall(calls[0].callSid, calls[0].candidateName);
    })
    .catch(() => {});
}

// ═══════════════════════════════════════
//  LIVE CALL STATUS (OVERVIEW CARD)
// ═══════════════════════════════════════

let liveCallTracked = null; // { callSid, name, startedAt }

function initCallStatusCard() {
  pollCallStatus();
  setInterval(pollCallStatus, 5000);
  setInterval(updateCallClock, 1000);
}

async function pollCallStatus() {
  const card = document.getElementById('live-call-card');
  if (!card) return;
  try {
    const res = await fetch('/api/dashboard/active-calls');
    const { calls } = await res.json();
    if (!calls || calls.length === 0) {
      liveCallTracked = null;
      card.innerHTML = `
        <div class="live-call-idle">
          <div class="live-call-idle-dot"></div>
          <span class="live-call-idle-text">No active call</span>
        </div>`;
    } else {
      const c = calls[0];
      if (!liveCallTracked || liveCallTracked.callSid !== c.callSid) {
        liveCallTracked = { callSid: c.callSid, name: c.candidateName, startedAt: Date.now() };
      }
      card.innerHTML = `
        <div class="live-call-active">
          <div class="live-call-pulse"></div>
          <div class="live-call-info">
            <div class="live-call-name">${esc(c.candidateName)}</div>
            <div class="live-call-meta">In progress · <span id="live-call-elapsed">00:00</span></div>
          </div>
          <button class="live-call-goto-btn" onclick="switchTab('calls')">View</button>
        </div>`;
      updateCallClock();
    }
  } catch {
    // silently keep last state
  }
}

function updateCallClock() {
  if (!liveCallTracked) return;
  const el = document.getElementById('live-call-elapsed');
  if (!el) return;
  const secs = Math.floor((Date.now() - liveCallTracked.startedAt) / 1000);
  const mm = String(Math.floor(secs / 60)).padStart(2, '0');
  const ss = String(secs % 60).padStart(2, '0');
  el.textContent = `${mm}:${ss}`;
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

  const masterTA = document.getElementById('master-textarea');
  const secondaryTA = document.getElementById('secondary-textarea');
  const badge = document.getElementById('master-badge');

  masterTA.value = 'Loading…';
  try {
    const res = await fetch('/api/dashboard/prompt');
    const data = await res.json();
    masterTA.value = data.masterPrompt;
    secondaryTA.value = data.secondary ?? '';
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
  const masterTA = document.getElementById('master-textarea');
  const secondaryTA = document.getElementById('secondary-textarea');
  const badge = document.getElementById('master-badge');
  const btn = document.getElementById('master-save-btn');

  btn.disabled = true;
  btn.textContent = 'Saving…';
  try {
    await postPrompt({ masterOverride: masterTA.value, secondary: secondaryTA.value });
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
  const masterTA = document.getElementById('master-textarea');
  const secondaryTA = document.getElementById('secondary-textarea');
  const badge = document.getElementById('master-badge');
  const btn = document.getElementById('master-reset-btn');

  btn.disabled = true;
  try {
    await postPrompt({ masterOverride: null, secondary: secondaryTA.value });
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
  const masterTA = document.getElementById('master-textarea');
  const secondaryTA = document.getElementById('secondary-textarea');
  const btn = document.getElementById('secondary-save-btn');

  btn.disabled = true;
  btn.textContent = 'Saving…';
  try {
    await postPrompt({
      masterOverride: promptHasOverride ? masterTA.value : null,
      secondary: secondaryTA.value,
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
}

// ═══════════════════════════════════════
//  PROMPT VERSION HISTORY
// ═══════════════════════════════════════

let promptVersionCache = [];

async function savePromptSnapshot(master, secondary) {
  try {
    await fetch('/api/dashboard/prompt-versions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ master, secondary: secondary || '' }),
    });
  } catch {}
  await renderPromptHistory();
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
    card.innerHTML = promptVersionCache.map((entry, i) => {
      const d = new Date(entry.created_at);
      const dateStr = d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
      const timeStr = d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
      const preview = entry.master.replace(/\n/g, ' ').slice(0, 90);
      return `
        <div class="ph-row">
          <div class="ph-row-left">
            <div class="ph-when">${dateStr} · ${timeStr}${i === 0 ? ' <span class="ph-latest">latest</span>' : ''}</div>
            <div class="ph-preview">${esc(preview)}${entry.master.length > 90 ? '…' : ''}</div>
          </div>
          <button class="ph-restore-btn" onclick="restorePromptVersion(${i})">Restore</button>
        </div>`;
    }).join('');
  } catch {
    card.innerHTML = `<div class="card-desc text-muted">Could not load version history.</div>`;
  }
}

function restorePromptVersion(i) {
  const entry = promptVersionCache[i];
  if (!entry) return;
  document.getElementById('master-textarea').value = entry.master;
  document.getElementById('secondary-textarea').value = entry.secondary;
  showToast('Version loaded — edit if needed, then click Save to apply');
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
  initCalls();
  initActiveBanner();
  initPromptEditor();
  initCallStatusCard();
  checkStatus();
  loadConfig();
  setInterval(checkStatus, 30_000);
  setInterval(loadConfig, 60_000);
}

document.addEventListener('DOMContentLoaded', init);
