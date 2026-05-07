/* ============================================================
   ROI Master — Chat Widget
   AI-powered mode when AI_Chat_LLM env var is set on Netlify.
   Falls back to smart local regex engine when AI is unavailable.
   ============================================================ */

(function () {
  'use strict';

  const AI_ENDPOINT = '/.netlify/functions/chat-ai';
  const HISTORY_KEY = 'roi_chat_history';
  const MAX_HISTORY = 20; // max messages to store and send
  const DAILY_LIMIT = 30;

  // ── Chat history (persisted to localStorage) ─────────────────
  // Each entry: { role: 'user'|'assistant', content: string }
  let chatHistory = [];

  function loadHistory() {
    try {
      const stored = localStorage.getItem(HISTORY_KEY);
      if (stored) chatHistory = JSON.parse(stored);
    } catch { chatHistory = []; }
  }

  function saveHistory() {
    try {
      // Keep only the last MAX_HISTORY messages
      if (chatHistory.length > MAX_HISTORY) chatHistory = chatHistory.slice(-MAX_HISTORY);
      localStorage.setItem(HISTORY_KEY, JSON.stringify(chatHistory));
    } catch { /* storage full or unavailable */ }
  }

  function pushHistory(role, content, reasoning_content) {
    const entry = { role, content };
    if (reasoning_content) entry.reasoning_content = reasoning_content;
    chatHistory.push(entry);
    saveHistory();
  }

  function clearHistory() {
    chatHistory = [];
    try { localStorage.removeItem(HISTORY_KEY); } catch {}
  }

  // ── Quick question definitions ──────────────────────────────
  const ALL_QUICK_QUESTIONS = [
    { label: 'Best 10-year assets',      key: 'best10yr' },
    { label: 'Highest ROI overall',      key: 'bestROI' },
    { label: 'Top asset class',          key: 'topClass' },
    { label: 'Worst performers',         key: 'worst' },
    { label: 'Average returns',          key: 'avgReturns' },
    { label: 'Most consistent',          key: 'consistent' },
    { label: 'Best 5-year assets',       key: 'best5yr' },
    { label: 'Best 20-year assets',      key: 'best20yr' },
    { label: 'Best 1-year assets',       key: 'best1yr' },
    { label: 'Top stocks',               key: 'topStocks' },
    { label: 'Top ETFs',                 key: 'topETFs' },
    { label: 'Top commodities',          key: 'topCommodities' },
    { label: 'Real estate returns',      key: 'realEstate' },
    { label: 'Hidden gems',              key: 'hiddenGems' },
    { label: 'Biggest surprises',        key: 'surprises' },
    { label: '10x club',                 key: '10xClub' },
    { label: '50x club',                 key: '50xClub' },
    { label: 'Best risk-adjusted',       key: 'riskAdjusted' },
    { label: 'Tech sector leaders',      key: 'techLeaders' },
    { label: 'AI & semiconductor picks', key: 'aiSemis' },
    { label: 'Dividend vs growth',       key: 'divVsGrowth' },
    { label: 'Crypto performance',       key: 'crypto' },
    { label: 'Gold vs stocks',           key: 'goldVsStocks' },
    { label: 'Bonds performance',        key: 'bonds' },
    { label: 'Energy sector',            key: 'energy' },
    { label: 'Healthcare returns',       key: 'healthcare' },
    { label: 'Consumer brands',          key: 'consumer' },
    { label: 'Emerging markets',         key: 'emerging' },
    { label: 'Small cap vs large cap',   key: 'capSize' },
    { label: 'Index funds compared',     key: 'indexFunds' },
    { label: 'Which class compounds best', key: 'bestCompounder' },
    { label: 'Biggest declines',         key: 'bigDeclines' },
    { label: 'Most volatile assets',     key: 'volatile' },
    { label: 'Steady growth picks',      key: 'steadyGrowth' },
    { label: 'Best since 2010',          key: 'since2010' },
  ];

  function pickQuickQuestions() {
    const pool = ALL_QUICK_QUESTIONS.slice();
    const picked = [];
    while (picked.length < 6 && pool.length) {
      const i = Math.floor(Math.random() * pool.length);
      picked.push(pool.splice(i, 1)[0]);
    }
    picked.push({ label: 'Other', key: 'other' });
    return picked;
  }

  const QUICK_QUESTIONS = pickQuickQuestions();

  function refreshQuickPills() {
    if (!pillsSection) return;
    const newSet = pickQuickQuestions();
    const pillsRow = pillsSection.querySelector('.chat-pills-row');
    if (!pillsRow) return;
    pillsRow.innerHTML = '';
    newSet.forEach(q => {
      const pill = el('button', 'chat-pill' + (q.key === 'other' ? ' pill-other' : ''), pillsRow);
      pill.textContent = q.label;
      pill.addEventListener('click', () => handlePill(q));
    });
    // Brief flash animation to signal refresh
    pillsRow.classList.remove('pills-refreshed');
    void pillsRow.offsetWidth;
    pillsRow.classList.add('pills-refreshed');
  }

  // ── TTS (Web Speech API) ─────────────────────────────────────
  let ttsEnabled = false;
  let ttsVoice = null;
  let muteBtn = null;

  const ICON_SOUND = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/></svg>`;
  const ICON_MUTE  = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg>`;

  function initTTS() {
    if (!window.speechSynthesis) return;
    try { if (localStorage.getItem('roi_tts_muted') === '1') ttsEnabled = false; else ttsEnabled = true; } catch(_) { ttsEnabled = true; }

    function pickVoice() {
      const voices = window.speechSynthesis.getVoices();
      if (!voices.length) return;

      // Ranked preference: neural/natural cloud voices first, then quality OS voices
      // Chrome on desktop ships Google neural voices which are the best available
      const PREF = [
        // Google neural (Chrome desktop — best quality)
        v => /google.*english.*female/i.test(v.name),
        v => /google.*uk.*english.*female/i.test(v.name),
        v => /google.*us.*english/i.test(v.name) && !/male/i.test(v.name),
        v => /google.*english/i.test(v.name) && !/male/i.test(v.name),
        // Microsoft neural (Edge / Windows — very natural)
        v => /microsoft.*aria/i.test(v.name),
        v => /microsoft.*jenny/i.test(v.name),
        v => /microsoft.*sonia/i.test(v.name),
        v => /microsoft.*libby/i.test(v.name),
        v => /microsoft.*maisie/i.test(v.name),
        v => /microsoft.*emma/i.test(v.name),
        v => /microsoft.*zira/i.test(v.name),
        // Apple neural (macOS/iOS — warm, natural)
        v => /samantha/i.test(v.name),
        v => /karen/i.test(v.name),
        v => /moira/i.test(v.name),
        v => /serena/i.test(v.name),
        v => /tessa/i.test(v.name),
        v => /fiona/i.test(v.name),
        // Generic female English fallback
        v => /female/i.test(v.name) && /en[-_]GB/i.test(v.lang),
        v => /female/i.test(v.name) && /en[-_]AU/i.test(v.lang),
        v => /female/i.test(v.name) && /en/i.test(v.lang),
        v => /en[-_]GB/i.test(v.lang),
        v => /en[-_]AU/i.test(v.lang),
        v => /en/i.test(v.lang),
      ];
      for (const test of PREF) {
        const match = voices.find(test);
        if (match) { ttsVoice = match; return; }
      }
      ttsVoice = voices[0];
    }

    pickVoice();
    window.speechSynthesis.onvoiceschanged = pickVoice;
  }

  function ttsSpeak(text) {
    if (!ttsEnabled || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const plain = text
      .replace(/\*\*(.+?)\*\*/g, '$1')
      .replace(/\*(.+?)\*/g, '$1')
      .replace(/#+\s*/g, '')
      .replace(/[-•]\s+/g, '')
      .replace(/\d+\.\s+/g, '')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .replace(/`[^`]+`/g, '')
      .replace(/CHART DATA:[\s\S]*/i, '')
      .replace(/\n{2,}/g, '. ')
      .replace(/\n/g, ' ')
      .replace(/\s{2,}/g, ' ')
      .trim();
    if (!plain) return;
    const utt = new SpeechSynthesisUtterance(plain);
    if (ttsVoice) utt.voice = ttsVoice;
    utt.rate  = 1.05;
    utt.pitch = 1.1;
    utt.volume = 0.9;
    window.speechSynthesis.speak(utt);
  }

  // ── DOM refs ─────────────────────────────────────────────────
  let fab, win, body, pillsSection, inputRow, textarea, sendBtn, aiIndicator, aiTooltip, callCounterEl;
  let isOpen = false;
  let lastUserQuestion = '';

  // ── AI availability state ─────────────────────────────────
  // null = not yet probed, true = available, false = unavailable
  let aiAvailable = null;
  let aiProbeInFlight = false;

  // ── Remaining calls state (populated from API responses) ──
  let remainingCalls = null; // null = not yet known

  // ── Inactivity re-engagement ─────────────────────────────────
  // Fires whether or not the chat is open — auto-opens it with the message.
  const INACTIVITY_MS = 20000;
  let inactivityTimer = null;
  let autoMessageSent = false;

  const REENGAGEMENT_PROMPTS = [
    'Still curious? Here are some things I can help you explore:',
    'Not sure where to start? Try one of these questions:',
    'I can dig into the data for you — pick a topic:',
  ];

  // ── Init ─────────────────────────────────────────────────────
  function init() {
    loadHistory();
    initTTS();
    buildDOM();
    attachEvents();
    setTimeout(() => fab.classList.add('ready'), 800);
    probeAI();
    // Start inactivity timer immediately from page load (not just when chat opens)
    inactivityTimer = setTimeout(onInactive, INACTIVITY_MS);
    // Reset timer on any user interaction with the page
    ['click','keydown','scroll','mousemove','touchstart'].forEach(evt => {
      document.addEventListener(evt, () => { if (!autoMessageSent) resetInactivity(); }, { passive: true });
    });
  }

  // ── Probe whether AI backend is reachable ─────────────────
  async function probeAI() {
    if (aiProbeInFlight) return;
    aiProbeInFlight = true;
    try {
      const res = await fetch(AI_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: '__ping__', assetContext: null }),
      });
      const data = await res.json();
      aiAvailable = data.ai_available !== false;
      if (typeof data.remaining_calls === 'number') {
        remainingCalls = data.remaining_calls;
        updateCallCounter();
      }
    } catch {
      aiAvailable = false;
    } finally {
      aiProbeInFlight = false;
      updateAIIndicator();
    }
  }

  function updateAIIndicator() {
    if (!aiIndicator) return;
    if (aiAvailable) {
      aiIndicator.textContent = 'AI';
      aiIndicator.classList.add('ai-on');
      aiIndicator.classList.remove('ai-off');
    } else {
      aiIndicator.textContent = 'Basic';
      aiIndicator.classList.add('ai-off');
      aiIndicator.classList.remove('ai-on');
    }
    updateBadgeTooltip();
    updateCallCounter();
  }

  function updateBadgeTooltip() {
    if (!aiTooltip) return;
    if (aiAvailable) {
      aiTooltip.innerHTML = `Advanced AI mode is active, you are speaking to a real AI LLM`;
    } else {
      aiTooltip.innerHTML = `This chat is smart but not connected to a proper AI LLM. Ask the site owner to connect. Instructions in the GitHub may be <a href="https://www.qaunain.com" target="_blank" rel="noopener">Qaunain Meghjee</a>`;
    }
  }

  function updateCallCounter() {
    if (!callCounterEl) return;
    if (!aiAvailable || remainingCalls === null) {
      callCounterEl.style.display = 'none';
      return;
    }
    callCounterEl.style.display = '';
    const pct = remainingCalls / DAILY_LIMIT;
    const stateClass = pct <= 0 ? ' counter-empty' : pct <= 0.3 ? ' counter-low' : '';
    callCounterEl.className = 'chat-call-counter-bar' + stateClass;
    callCounterEl.innerHTML = `
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
      <span>${remainingCalls} of ${DAILY_LIMIT} AI messages remaining today</span>
      <span class="counter-info-wrap">
        <svg class="counter-info-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
        <span class="counter-info-tooltip"><span class="counter-info-tooltip-inner">Need more AI credits? Contact the <a href="/about" onclick="event.preventDefault();if(window.openAboutModal)openAboutModal()">site owner</a></span></span>
      </span>`;
  }

  function buildDOM() {
    // FAB
    fab = el('button', 'chat-fab', document.body);
    fab.setAttribute('aria-label', 'Open chat assistant');
    fab.innerHTML = `
      <svg class="icon-chat" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
      </svg>
      <svg class="icon-close" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
        <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
      </svg>`;

    // Window
    win = el('div', 'chat-window', document.body);
    win.setAttribute('role', 'dialog');
    win.setAttribute('aria-label', 'ROI Assistant');

    // Header
    const header = el('div', 'chat-header', win);
    header.innerHTML = `
      <div class="chat-header-icon">
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
        </svg>
      </div>
      <div class="chat-header-text">
        <div class="chat-header-title">ROI Assistant</div>
        <div class="chat-header-sub">Ask about assets, data &amp; returns</div>
      </div>`;

    const badgeWrap = el('div', 'chat-badge-wrap', header);
    aiIndicator = el('span', 'chat-ai-badge ai-off', badgeWrap);
    aiIndicator.textContent = '...';
    aiTooltip = el('div', 'chat-badge-tooltip', badgeWrap);
    aiTooltip.innerHTML = 'Checking AI availability…';

    const clearBtn = el('button', 'chat-header-clear', header);
    clearBtn.setAttribute('aria-label', 'Clear conversation');
    clearBtn.title = 'Clear conversation';
    clearBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>`;
    clearBtn.addEventListener('click', () => {
      clearHistory();
      body.innerHTML = '';
      showWelcome();
    });

    // TTS mute toggle
    muteBtn = el('button', 'chat-header-mute', header);
    muteBtn.title = ttsEnabled ? 'Mute voice' : 'Unmute voice';
    muteBtn.setAttribute('aria-label', muteBtn.title);
    muteBtn.innerHTML = ttsEnabled ? ICON_SOUND : ICON_MUTE;
    muteBtn.addEventListener('click', () => {
      ttsEnabled = !ttsEnabled;
      muteBtn.innerHTML = ttsEnabled ? ICON_SOUND : ICON_MUTE;
      muteBtn.title = ttsEnabled ? 'Mute voice' : 'Unmute voice';
      muteBtn.setAttribute('aria-label', muteBtn.title);
      if (!ttsEnabled && window.speechSynthesis) window.speechSynthesis.cancel();
      try { localStorage.setItem('roi_tts_muted', ttsEnabled ? '0' : '1'); } catch(_) {}
    });

    const closeBtn = el('button', 'chat-header-close', header);
    closeBtn.setAttribute('aria-label', 'Close chat');
    closeBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;
    closeBtn.addEventListener('click', closeChat);

    // Call counter sub-row (shown below header when AI is active)
    callCounterEl = el('div', 'chat-call-counter-bar', win);
    callCounterEl.style.display = 'none';

    // Messages body
    body = el('div', 'chat-body', win);

    // Pills section (quick questions)
    pillsSection = el('div', 'chat-pills', win);
    const pillsLabel = el('div', 'chat-pills-label', pillsSection);
    pillsLabel.textContent = 'Quick questions';
    const pillsRow = el('div', 'chat-pills-row', pillsSection);
    QUICK_QUESTIONS.forEach(q => {
      const pill = el('button', 'chat-pill' + (q.key === 'other' ? ' pill-other' : ''), pillsRow);
      pill.textContent = q.label;
      pill.addEventListener('click', () => handlePill(q));
    });

    // Free-type input row — always visible
    inputRow = el('div', 'chat-input-row visible', win);
    textarea = el('textarea', '', inputRow);
    textarea.placeholder = 'Type your question…';
    textarea.rows = 1;
    textarea.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendFreeText(); }
    });
    textarea.addEventListener('input', autoGrow);

    sendBtn = el('button', 'chat-send-btn', inputRow);
    sendBtn.setAttribute('aria-label', 'Send');
    sendBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>`;
    sendBtn.addEventListener('click', sendFreeText);
  }

  function attachEvents() {
    fab.addEventListener('click', toggleChat);
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && isOpen) closeChat(); });
    document.addEventListener('click', e => {
      // If target is no longer in the document (e.g. a pill that was just removed),
      // treat it as an internal click so the chat stays open.
      if (isOpen && document.contains(e.target) && !win.contains(e.target) && !fab.contains(e.target)) closeChat();
    });
    win.addEventListener('click', resetInactivity);
    win.addEventListener('keydown', resetInactivity);
  }

  // ── Open / Close ─────────────────────────────────────────────
  function toggleChat() { isOpen ? closeChat() : openChat(); }

  function openChat() {
    isOpen = true;
    fab.classList.add('open');
    win.classList.add('visible');
    if (body.children.length === 0) {
      if (chatHistory.length > 0) {
        restoreHistoryDOM();
      } else {
        showWelcome();
      }
    }
    resetInactivity();
  }

  function restoreHistoryDOM() {
    chatHistory.forEach(entry => {
      if (entry.role === 'user') {
        const msg = el('div', 'chat-msg user', body);
        msg.textContent = entry.content;
      } else {
        const rawContent = entry.content || '';
        const { clean: displayContent } = splitChartSection(rawContent);
        const msg = el('div', 'chat-msg bot', body);
        msg.innerHTML = formatBotText(displayContent);
        const chartData = extractChartData(rawContent);
        if (chartData) {
          const titleMatch = rawContent.match(/top \d+|best \d+|worst \d+|ranked|comparison|compare|heatmap|categor|class|analys/i);
          const chartTitle = titleMatch ? titleMatch[0].replace(/\b\w/g, c => c.toUpperCase()) : 'Return Comparison';
          const chartWrap = el('div', 'chat-chart-wrap', msg);
          renderChatChart(chartWrap, chartData, chartTitle, getSeedNote(rawContent));
        }
      }
    });
    // Scroll to bottom
    body.scrollTop = body.scrollHeight;
  }

  function closeChat() {
    isOpen = false;
    fab.classList.remove('open');
    win.classList.remove('visible');
    clearInactivity();
  }

  // ── Inactivity timer ─────────────────────────────────────────
  function resetInactivity() {
    clearInactivity();
    if (autoMessageSent) return;
    inactivityTimer = setTimeout(onInactive, INACTIVITY_MS);
  }

  function clearInactivity() {
    if (inactivityTimer) { clearTimeout(inactivityTimer); inactivityTimer = null; }
  }

  function onInactive() {
    autoMessageSent = true;
    const prompt = REENGAGEMENT_PROMPTS[Math.floor(Math.random() * REENGAGEMENT_PROMPTS.length)];
    // Auto-open if closed
    if (!isOpen) openChat();
    showTyping(true);
    setTimeout(() => {
      showTyping(false);
      addBotMsg(prompt, { noChart: true });
      pillsSection.style.display = '';
      pillsSection.classList.remove('pills-pulse');
      void pillsSection.offsetWidth;
      pillsSection.classList.add('pills-pulse');
    }, 800);
  }

  // ── Welcome message ──────────────────────────────────────────
  function showWelcome() {
    addBotMsg('Ask me anything about the assets, returns, or ROI — I\'ll analyse the loaded dataset and answer instantly.', { noChart: true });
  }

  // ── Pill handler ─────────────────────────────────────────────
  async function handlePill(q) {
    resetInactivity();
    if (q.key === 'other') {
      textarea.focus();
      return;
    }
    lastUserQuestion = q.label;
    addUserMsg(q.label);
    pushHistory('user', q.label);
    showTyping(true, aiAvailable);
    setSendDisabled(true);

    let answer = null;
    if (aiAvailable !== false) {
      answer = await fetchAIAnswer(q.label, chatHistory.slice(0, -1));
    }

    showTyping(false);
    setSendDisabled(false);

    if (isRateLimited(answer)) {
      addRateLimitMsg();
      return;
    }

    const pillUsedAI = !!answer;
    if (!answer) {
      answer = answerQuestion(q.key);
    }

    addBotMsg(answer, { aiResponse: pillUsedAI });
    const replyStr = (answer && typeof answer === 'object') ? answer.reply : answer;
    const replyReasoning1 = (answer && typeof answer === 'object') ? answer.reasoning : '';
    pushHistory('assistant', replyStr, replyReasoning1);
    showFollowUpPills(generateFollowUps(q.label, replyStr));
    resetInactivity();
  }

  // ── Client-side input guardrail ───────────────────────────────
  const BLOCKED_INPUT = [
    /ignore (previous|all|your|system|above) (instructions?|prompt|rules?)/i,
    /you are now|pretend (to be|you are)/i,
    /forget (everything|your|all|previous)/i,
    /jailbreak|DAN mode|prompt injection/i,
    /reveal (your|the) (system )?prompt/i,
  ];
  function isBlockedInput(text) {
    return BLOCKED_INPUT.some(p => p.test(text));
  }

  // ── Free text ────────────────────────────────────────────────
  async function sendFreeText() {
    const text = textarea.value.trim();
    if (!text) return;

    if (isBlockedInput(text)) {
      addUserMsg(text);
      textarea.value = '';
      autoGrow.call(textarea);
      const blockedReply = 'I\'m a read-only investment data assistant. I can only answer questions about the assets, returns, and data in the dataset.';
      addBotMsg(blockedReply);
      showFollowUpPills(generateFollowUps('', ''));
      return;
    }

    lastUserQuestion = text;
    addUserMsg(text);
    pushHistory('user', text);
    textarea.value = '';
    autoGrow.call(textarea);
    showTyping(true, aiAvailable);
    setSendDisabled(true);

    let answer = null;

    if (aiAvailable !== false) {
      answer = await fetchAIAnswer(text, chatHistory.slice(0, -1)); // pass history excluding the just-added user msg
    }

    showTyping(false);
    setSendDisabled(false);

    if (isRateLimited(answer)) {
      addRateLimitMsg();
      return;
    }

    // Fall back if AI is unavailable or errored
    const usedAI = !!answer;
    if (!answer) {
      await simulatedDelay(700 + Math.random() * 500);
      answer = answerFreeText(text);
    }

    addBotMsg(answer, { aiResponse: usedAI });
    const replyText = (answer && typeof answer === 'object') ? answer.reply : answer;
    const replyReasoning2 = (answer && typeof answer === 'object') ? answer.reasoning : '';
    pushHistory('assistant', replyText, replyReasoning2);
    showFollowUpPills(generateFollowUps(text, replyText));
    resetInactivity();
  }

  function setSendDisabled(disabled) {
    sendBtn.disabled = disabled;
    textarea.disabled = disabled;
  }

  function showInputRow() {
    // Input row is always visible; just focus the textarea
    textarea.focus();
  }

  // ── AI call ──────────────────────────────────────────────────
  // ── Client-side guardrail: sanitise AI reply before rendering ─
  function sanitiseAIReply(reply) {
    if (!reply || typeof reply !== 'string') return null;
    // Strip HTML tags (AI should never return HTML — text/markdown only)
    let clean = reply.replace(/<[^>]+>/g, '');
    // Strip code blocks that contain anything that looks executable
    clean = clean.replace(/```[\s\S]*?```/g, '[code block removed]');
    clean = clean.replace(/`[^`]{60,}`/g, '[code removed]');
    // Cap length — 1600 tokens ≈ ~6000 chars; never truncate a complete response
    if (clean.length > 5500) clean = clean.slice(0, 5500) + '…';
    return clean.trim() || null;
  }

  // pinnedAssets: optional array of asset objects to use directly (bypasses keyword matching)
  // isChartPrompt: when true, sends pre-aggregated per-class data instead of full asset list
  async function fetchAIAnswer(message, history, pinnedAssets, isChartPrompt) {
    try {
      const assets = getAssets();
      const assetContext = assets
        ? (pinnedAssets
            ? buildPinnedContext(pinnedAssets, assets)
            : isChartPrompt
              ? buildHeatmapContext(assets)
              : buildAssetContext(message, assets))
        : null;

      // Send last 8 exchanges (16 messages) for context without bloating the request
      const conversationHistory = (history || []).slice(-16);

      // Generous timeout — DeepSeek thinking mode can take 15-25s for complex reasoning
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 55000);

      const res = await fetch(AI_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, assetContext, conversationHistory }),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (!res.ok) {
        console.warn('AI endpoint returned', res.status);
        return null;
      }
      const data = await res.json();

      if (data.error) console.warn('AI error:', data.error);

      // Update remaining call counter from server response
      if (typeof data.remaining_calls === 'number') {
        remainingCalls = data.remaining_calls;
        updateCallCounter();
      }

      // IP rate limit exceeded — surface a specific message, don't fall back to local engine
      if (data.rate_limited) {
        return { reply: null, rateLimited: true };
      }

      if (!data.ai_available) {
        aiAvailable = false;
        updateAIIndicator();
        return null;
      }
      const reply = sanitiseAIReply(data.reply);
      const reasoning = typeof data.reasoning === 'string' ? data.reasoning.trim() : '';
      // Return as object so callers can access reasoning separately
      return reply ? { reply, reasoning } : null;
    } catch (err) {
      console.warn('AI fetch failed:', err?.name || err);
      return null;
    }
  }

  // Cached compact dataset string — rebuilt only when the asset array changes
  let _compactDatasetCache = null;
  let _compactDatasetAssets = null;

  // Build a compact per-class aggregated context for heatmap/chart prompts.
  // Sends ~5 rows (one per asset class) instead of 300 raw asset lines,
  // keeping the payload small enough to avoid the 30s Netlify timeout.
  function buildHeatmapContext(assets) {
    const classMap = {};
    assets.forEach(a => {
      const cls = a.section || a.category || a.cat || 'Unknown';
      if (!classMap[cls]) classMap[cls] = { v1: [], v5: [], v10: [], v15: [], v20: [], count: 0 };
      const c = classMap[cls];
      c.count++;
      ['1','5','10','15','20'].forEach(yr => {
        const val = Number(a['v' + yr]);
        if (val && !isNaN(val)) c['v' + yr].push(val);
      });
    });

    const avg = arr => arr.length ? Math.round(arr.reduce((s, v) => s + v, 0) / arr.length) : null;
    const fmt = v => v ? `$${v.toLocaleString()}` : 'N/A';

    const classLines = Object.entries(classMap).map(([cls, c]) => {
      const parts = [
        `1yr=${fmt(avg(c.v1))}`,
        `5yr=${fmt(avg(c.v5))}`,
        `10yr=${fmt(avg(c.v10))}`,
        `15yr=${fmt(avg(c.v15))}`,
        `20yr=${fmt(avg(c.v20))}`,
        `count=${c.count}`,
      ];
      return `${cls}: ${parts.join(' ')}`;
    }).join('\n');

    // Also include top 3 assets per class by 10yr so the AI can name specific examples
    const top3ByClass = {};
    assets.forEach(a => {
      const cls = a.section || a.category || a.cat || 'Unknown';
      if (!top3ByClass[cls]) top3ByClass[cls] = [];
      if (a.v10) top3ByClass[cls].push(a);
    });
    const exampleLines = Object.entries(top3ByClass).map(([cls, arr]) => {
      const sorted = arr.sort((a, b) => Number(b.v10) - Number(a.v10)).slice(0, 3);
      const names = sorted.map(a => `${a.name} 10yr=$${Number(a.v10).toLocaleString()}`).join(', ');
      return `${cls} top examples: ${names}`;
    }).join('\n');

    const assetClasses = Object.keys(classMap);
    return {
      totalAssets: assets.length,
      assetClasses,
      compactDataset: `=== ASSET CLASS AVERAGES (from $1,000 seed) ===\n${classLines}\n\n=== TOP 3 PER CLASS BY 10yr ===\n${exampleLines}`,
      datasetSummary: null,
    };
  }

  // Max assets to send as raw lines in free-text context. Above this, large user datasets
  // would blow the token budget and cause Netlify timeouts.
  const ASSET_LINE_LIMIT = 150;

  function buildAssetContext(message, assets) {
    if (_compactDatasetAssets !== assets) {
      _compactDatasetAssets = assets;
      // If the dataset is large, cap at ASSET_LINE_LIMIT by taking the top assets by 10yr return
      // so the AI still gets the most relevant data, just not every single row.
      const toSerialise = assets.length > ASSET_LINE_LIMIT
        ? [...assets].sort((a, b) => Number(b.v10 || 0) - Number(a.v10 || 0)).slice(0, ASSET_LINE_LIMIT)
        : assets;
      _compactDatasetCache = toSerialise.map(a => {
        const parts = [];
        if (a.v1)  parts.push(`1yr=$${Number(a.v1).toLocaleString()}`);
        if (a.v5)  parts.push(`5yr=$${Number(a.v5).toLocaleString()}`);
        if (a.v10) parts.push(`10yr=$${Number(a.v10).toLocaleString()}`);
        if (a.v15) parts.push(`15yr=$${Number(a.v15).toLocaleString()}`);
        if (a.v20) parts.push(`20yr=$${Number(a.v20).toLocaleString()}`);
        const cat = a.section || a.category || a.cat || '';
        return `${a.name} [${cat}] ${parts.join(' ')}`;
      }).join('\n');
    }

    const assetClasses = [...new Set(assets.map(a => a.section || a.category || a.cat || 'Unknown'))];
    const avg = (yr) => {
      const vals = assets.map(a => a['v' + yr]).filter(v => v && !isNaN(v)).map(Number);
      if (!vals.length) return 'N/A';
      return '$' + Math.round(vals.reduce((s, v) => s + v, 0) / vals.length).toLocaleString();
    };

    return {
      totalAssets: assets.length,
      assetClasses,
      compactDataset: _compactDatasetCache,
      datasetSummary: { avg1yr: avg(1), avg5yr: avg(5), avg10yr: avg(10) },
    };
  }

  // Build context for the compare flow (specific pinned assets highlighted, full dataset included)
  function buildPinnedContext(pinnedAssets, allAssets) {
    const pinnedLines = pinnedAssets.map(a => {
      const parts = [];
      if (a.v1)  parts.push(`1yr=$${Number(a.v1).toLocaleString()}`);
      if (a.v5)  parts.push(`5yr=$${Number(a.v5).toLocaleString()}`);
      if (a.v10) parts.push(`10yr=$${Number(a.v10).toLocaleString()}`);
      if (a.v15) parts.push(`15yr=$${Number(a.v15).toLocaleString()}`);
      if (a.v20) parts.push(`20yr=$${Number(a.v20).toLocaleString()}`);
      const cat = a.section || a.category || a.cat || '';
      return `${a.name} [${cat}] ${parts.join(' ')}`;
    }).join('\n');

    const assetClasses = [...new Set(allAssets.map(a => a.section || a.category || a.cat || 'Unknown'))];
    const avg = (yr) => {
      const vals = allAssets.map(a => a['v' + yr]).filter(v => v && !isNaN(v)).map(Number);
      if (!vals.length) return 'N/A';
      return '$' + Math.round(vals.reduce((s, v) => s + v, 0) / vals.length).toLocaleString();
    };
    // Re-use the full dataset cache
    buildAssetContext('', allAssets);
    return {
      totalAssets: allAssets.length,
      assetClasses,
      pinnedAssets: pinnedLines,
      compactDataset: _compactDatasetCache,
      datasetSummary: { avg1yr: avg(1), avg5yr: avg(5), avg10yr: avg(10) },
    };
  }

  // ── Rate limit message ────────────────────────────────────────
  function getRateLimitMsg() {
    return `Your IP address has exceeded the AI Advanced messages for today. <a href="#about" class="chat-rl-link" onclick="document.getElementById('about-modal')&&document.getElementById('about-modal').classList.add('open')">Contact the site owner here</a> to get access restored.`;
  }

  function isRateLimited(answer) {
    return answer && typeof answer === 'object' && answer.rateLimited === true;
  }

  // ── Answer engine (local regex / smart fallback) ─────────────
  function getAssets() {
    try { if (typeof allData !== 'undefined' && allData) return allData; } catch(e){}
    try { if (typeof DEFAULT_DATA !== 'undefined' && DEFAULT_DATA) return DEFAULT_DATA; } catch(e){}
    if (typeof window.allData !== 'undefined') return window.allData;
    return null;
  }


  function fmt(v) {
    if (v == null || isNaN(v)) return 'N/A';
    return '$' + Number(v).toLocaleString('en-US', { maximumFractionDigits: 0 });
  }
  function fmtX(v) {
    if (v == null || isNaN(v)) return 'N/A';
    return Number(v).toFixed(1) + 'x';
  }

  function answerQuestion(key) {
    const assets = getAssets();
    if (!assets || assets.length === 0) {
      return 'No dataset is loaded yet. Please load a CSV file using the "Load Data" button.';
    }
    switch (key) {
      case 'best10yr':    return best10yr(assets);
      case 'bestROI':     return bestROI(assets);
      case 'topClass':    return topClass(assets);
      case 'worst':       return worstPerformers(assets);
      case 'avgReturns':  return avgReturns(assets);
      case 'consistent':  return mostConsistent(assets);
      case 'best1yr':     return best10yr(assets, 1);
      case 'best5yr':     return best10yr(assets, 5);
      case 'best20yr':    return best10yr(assets, 20);
      default: {
        // For all other keys, derive the answer from the label text
        const label = (ALL_QUICK_QUESTIONS.find(q => q.key === key) || {}).label || key;
        return answerFreeText(label);
      }
    }
  }

  function answerFreeText(text) {
    const assets = getAssets();
    if (!assets || assets.length === 0) {
      return 'No dataset is loaded yet. Load a CSV file first, then ask away.';
    }

    const t = text.toLowerCase();

    // ── Time-period best/top queries ─────────────────────────
    if (/(best|top|highest|greatest|biggest).*(1.?yr?|1.?year|one.?year)/i.test(t)) return best10yr(assets, 1);
    if (/(best|top|highest|greatest|biggest).*(5.?yr?|5.?year|five.?year)/i.test(t)) return best10yr(assets, 5);
    if (/(best|top|highest|greatest|biggest).*(10.?yr?|10.?year|ten.?year)/i.test(t)) return best10yr(assets, 10);
    if (/(best|top|highest|greatest|biggest).*(15.?yr?|15.?year|fifteen.?year)/i.test(t)) return best10yr(assets, 15);
    if (/(best|top|highest|greatest|biggest).*(20.?yr?|20.?year|twenty.?year)/i.test(t)) return best10yr(assets, 20);

    // ── General performance queries ──────────────────────────
    if (/best|top|highest|greatest|biggest/.test(t) && /roi|return|perform|investment/.test(t)) return bestROI(assets);
    if (/worst|bottom|lowest|poorest|terrible/.test(t)) return worstPerformers(assets);
    if (/average|avg|mean|typical/.test(t)) return avgReturns(assets);
    if (/consistent|stable|reliable|steady|safe/.test(t)) return mostConsistent(assets);
    if (/class|section|category|sector/.test(t)) return topClass(assets);

    // ── Count / inventory queries ────────────────────────────
    if (/how many|count|total|number of/.test(t)) {
      const cats = [...new Set(assets.map(a => a.section || a.category || a.cat || 'Unknown'))];
      return `The dataset contains **${assets.length} assets** across **${cats.length} asset classes**: ${cats.join(', ')}.`;
    }

    // ── Detect performance-flavoured intent ───────────────────
    const isPerformanceQ = /(good|bad|great|poor|strong|weak|well|perform|worth|recommend|invest|should i|how (has|did|is)|growth|return)/i.test(t);

    // ── Asset name lookup (full name then word-by-word) ───────
    const byNameLen = [...assets].sort((a, b) => (b.name || '').length - (a.name || '').length);
    for (const asset of byNameLen) {
      const name = (asset.name || '').toLowerCase();
      const tickerMatch = name.match(/\(([^)]+)\)/);
      const ticker = tickerMatch ? tickerMatch[1] : null;
      if (
        (name.length > 2 && t.includes(name)) ||
        (ticker && ticker.length > 1 && t.includes(ticker))
      ) {
        return isPerformanceQ ? assetPerformanceSummary(asset) : assetDetail(asset);
      }
    }

    const words = text.split(/\s+/).filter(w => w.length > 2);
    for (const word of words) {
      const match = assets.find(a => (a.name || '').toLowerCase().includes(word.toLowerCase()));
      if (match) return isPerformanceQ ? assetPerformanceSummary(match) : assetDetail(match);
    }

    // ── Category-scoped best query ───────────────────────────
    const allClasses = [...new Set(assets.map(a => a.section || a.category || a.cat || ''))];
    for (const cls of allClasses) {
      if (cls && t.includes(cls.toLowerCase())) return bestInClass(assets, cls);
    }

    return `I searched **${assets.length} assets** but couldn't find a specific match. Try asking "is Gold a good performer", "best 10-year returns", "worst performers", or name any specific asset.`;
  }

  // ── Follow-up pills ──────────────────────────────────────────
  function generateFollowUps(question, answer) {
    const q = (question || '').toLowerCase();
    const a = (answer || '').toLowerCase();
    const combined = q + ' ' + a;
    const pool = [];

    // ── 1. Extract named assets from the answer (bolded names in **…**) ──────
    const namedAssets = [];
    const boldMatches = answer.matchAll(/\*\*([^*]{3,50})\*\*/g);
    for (const m of boldMatches) {
      const name = m[1].trim();
      // Skip pure number/value strings and common non-asset bold text
      if (!/^\$|^\d|^top|^best|^worst|^avg|^average|^median|^strong|^moderate|^low/i.test(name) && name.length > 3) {
        namedAssets.push(name);
      }
    }
    // Deduplicate named assets (first 4 unique)
    const uniqueAssets = [...new Set(namedAssets)].slice(0, 4);

    // ── 2. Detect which time horizons are in scope ────────────────────────────
    const horizons = [];
    if (/\b1.?yr|\b1.?year|\bone.?year/i.test(combined)) horizons.push(1);
    if (/\b5.?yr|\b5.?year|\bfive.?year/i.test(combined)) horizons.push(5);
    if (/\b10.?yr|\b10.?year|\bten.?year/i.test(combined)) horizons.push(10);
    if (/\b15.?yr|\b15.?year|\bfifteen.?year/i.test(combined)) horizons.push(15);
    if (/\b20.?yr|\b20.?year|\btwenty.?year/i.test(combined)) horizons.push(20);
    const primaryHorizon = horizons[0] || 10;
    const altHorizons = [1, 5, 10, 15, 20].filter(h => !horizons.includes(h));

    // ── 3. Detect asset categories mentioned ─────────────────────────────────
    const inStocks  = /\bstock|equity/i.test(combined);
    const inETF     = /\betf|fund\b/i.test(combined);
    const inCrypto  = /\bbitcoin|\bcrypto|\bbtc|\beth\b|\bethereum/i.test(combined);
    const inGold    = /\bgold|silver|precious metal|commodit/i.test(combined);
    const inRE      = /\breal.?estate|\breit/i.test(combined);
    const inTech    = /\btech|nvidia|amd|intel|semiconductor|software|ai stock/i.test(combined);
    const inESG     = /\besg|ethical|sustain|clean|renewable|green/i.test(combined);
    const inHealth  = /\bhealthcare|pharma|biotech|medical/i.test(combined);
    const inFinance = /\bbank|finance|financial|fintech/i.test(combined);
    const isRanking = /top \d|best \d|worst \d|ranked|rank #/i.test(combined);
    const isCompare = /vs|versus|against|compare|comparison/i.test(combined);
    const isConsist = /consistent|stable|reliable|steady|low variance/i.test(combined);
    const isWorst   = /worst|bottom|lowest|poor/i.test(combined);
    const isAvg     = /average|avg|mean|typical/i.test(combined);

    // ── 4. Build contextual suggestions from what was actually discussed ──────

    // Asset-specific drill-downs (for each named asset in the answer)
    uniqueAssets.forEach((name, i) => {
      if (i === 0) {
        // Primary asset: offer alternate horizons and compare
        const alt = altHorizons[0] || (primaryHorizon === 10 ? 5 : 10);
        pool.push(`How did ${name} perform over ${alt} years?`);
        if (uniqueAssets[1]) pool.push(`Compare ${name} vs ${uniqueAssets[1]}`);
        else if (inCrypto && !name.toLowerCase().includes('gold')) pool.push(`Compare ${name} with Gold`);
        else if (inGold && !name.toLowerCase().includes('bitcoin')) pool.push(`Compare ${name} with Bitcoin`);
        else if (inStocks) pool.push(`Is ${name} the best in its class?`);
      } else if (i === 1) {
        pool.push(`What is ${name}'s 20-year return?`);
      }
    });

    // Horizon alternates — only if a specific horizon was discussed
    if (horizons.length > 0) {
      altHorizons.slice(0, 2).forEach(h => pool.push(`Best assets over ${h} years`));
    }

    // Category drill-downs based on what was mentioned
    if (isRanking && !isWorst) pool.push(`What are the worst ${primaryHorizon}-year performers?`);
    if (isRanking && !inETF)   pool.push(`Best ETFs over ${primaryHorizon} years`);
    if (isWorst) pool.push('What are the top performing assets?', 'Most consistent performers');
    if (isConsist) pool.push(`Highest overall ROI`, `Best ${primaryHorizon}-year returns`);
    if (isAvg) pool.push('Best performers above average', 'Worst performers vs average');
    if (isCompare && uniqueAssets.length >= 2) pool.push(`Which has better 20-year returns?`);

    if (inStocks && !inETF)    pool.push('How do ETFs compare to stocks?', `Best stock over ${primaryHorizon} years`);
    if (inETF && !inStocks)    pool.push('How do ETFs compare to stocks?', 'Best ETF by 10-year return');
    if (inCrypto)              pool.push('Compare crypto with Gold', 'Best 20-year return assets', 'Top asset class overall');
    if (inGold && !inCrypto)   pool.push('Gold vs Bitcoin performance', 'Best commodity by 10yr return');
    if (inRE)                  pool.push('Best REIT performers', 'Real estate vs stocks comparison');
    if (inTech)                pool.push('Best tech stocks by 10yr', 'Tech vs S&P 500 comparison');
    if (inESG)                 pool.push('ESG vs S&P 500 returns', 'Best renewable energy assets');
    if (inHealth)              pool.push('Best biotech by 10yr return', 'Healthcare vs S&P 500');
    if (inFinance)             pool.push('Best financial stocks by return', 'Fintech vs traditional banks');

    // Visualisation context
    if (/chart|visual|graph|plot|donut|scatter|breakdown|distribution|median/i.test(combined))
      pool.push('What does the scatter plot show?', 'Explain the category breakdown chart', 'Top assets by return chart');

    // ── 5. Generic fallbacks (only used to fill remaining slots) ─────────────
    const fallbacks = [
      `Best assets over ${primaryHorizon} years`,
      'Highest overall ROI',
      'Most consistent performers',
      'Average returns across all assets',
      'Worst performing assets',
      'Top asset class by return',
      'Best 20-year assets',
      'Compare Stocks vs ETFs',
      'Best dividend assets',
      'Top tech performers',
      'Safest long-term investments',
    ];

    // Deduplicate and pick 6 from pool then fill with fallbacks
    const seen = new Set();
    const picks = [];
    for (const s of [...pool, ...fallbacks]) {
      if (!seen.has(s) && picks.length < 6) { seen.add(s); picks.push(s); }
    }
    picks.push('Other');
    return picks;
  }

  function showFollowUpPills(suggestions) {
    // Remove any existing follow-up row
    const existing = body.querySelector('.chat-followup-row');
    if (existing) existing.remove();

    const row = el('div', 'chat-followup-row', body);
    const label = el('div', 'chat-followup-label', row);
    label.textContent = 'Follow up:';
    const pills = el('div', 'chat-followup-pills', row);

    suggestions.forEach(text => {
      const pill = el('button', 'chat-followup-pill' + (text === 'Other' ? ' pill-other' : ''), pills);
      pill.textContent = text;
      pill.addEventListener('click', () => {
        row.remove();
        if (text === 'Other') {
          showInputRow();
          textarea.focus();
          return;
        }
        lastUserQuestion = text;
        addUserMsg(text);
        pushHistory('user', text);
        showTyping(true, aiAvailable);
        setTimeout(async () => {
          showTyping(false);
          let answer = null;
          if (aiAvailable !== false) answer = await fetchAIAnswer(text, chatHistory.slice(0, -1));
          if (isRateLimited(answer)) {
            addRateLimitMsg();
            return;
          }
          const followUpUsedAI = !!answer;
          if (!answer) answer = answerFreeText(text);
          addBotMsg(answer, { aiResponse: followUpUsedAI });
          const replyStr = (answer && typeof answer === 'object') ? answer.reply : answer;
          const replyReasoning3 = (answer && typeof answer === 'object') ? answer.reasoning : '';
          pushHistory('assistant', replyStr, replyReasoning3);
          showFollowUpPills(generateFollowUps(text, replyStr));
          resetInactivity();
        }, 500 + Math.random() * 300);
      });
    });

    row.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  // ── Answer helpers ───────────────────────────────────────────

  // Deterministic local comparison of a pinned set of assets across all horizons.
  // Used as a fallback when the AI call fails during a Compare request so the user
  // still gets a response focused on the assets they actually selected.
  function localComparePinned(pinned) {
    const horizons = [['1Y','v1'],['5Y','v5'],['10Y','v10'],['15Y','v15'],['20Y','v20']];
    const seed = (typeof window.seedMultiplier !== 'undefined') ? 1000 * window.seedMultiplier : 1000;

    let out = `Comparison of ${pinned.length} selected assets (from $${seed.toLocaleString()}):\n\n`;

    for (const [label, key] of horizons) {
      const withVal = pinned.filter(a => a[key] && !isNaN(a[key]));
      if (!withVal.length) continue;
      const sorted = [...withVal].sort((a,b) => b[key] - a[key]);
      const top = sorted[0];
      const bot = sorted[sorted.length - 1];
      out += `**${label}** — Best: **${top.name}** ${fmt(top[key])} · Worst: **${bot.name}** ${fmt(bot[key])}\n`;
    }

    // Overall ranking by best available long-horizon value (20>15>10>5>1)
    const scored = pinned.map(a => {
      for (const [,k] of [['20','v20'],['15','v15'],['10','v10'],['5','v5'],['1','v1']]) {
        if (a[k] && !isNaN(a[k])) return { a, v: Number(a[k]), k };
      }
      return { a, v: 0, k: null };
    }).sort((x,y) => y.v - x.v);

    out += `\n**Overall ranking:**\n`;
    scored.forEach((s, i) => {
      out += `${i+1}. **${s.a.name}** — ${fmt(s.v)}${s.k ? ` (${s.k.replace('v','')}yr)` : ''}\n`;
    });

    return out.trim();
  }

  function freeTextChartBlock(type, rows) {
    return `\n\nCHART DATA:\nTYPE:${type}\n${rows.join('\n')}`;
  }

  function best10yr(assets, yr = 10) {
    const key = `v${yr}`;
    const seed = (typeof window.seedMultiplier !== 'undefined') ? 1000 * window.seedMultiplier : 1000;
    const sorted = assets
      .filter(a => a[key] && !isNaN(a[key]))
      .sort((a, b) => b[key] - a[key])
      .slice(0, 7);
    if (!sorted.length) return `No ${yr}-year data available.`;
    const prose = sorted.map((a, i) => `${i + 1}. **${a.name}** — ${fmt(a[key])} (${fmtX(a[key] / seed)})`);
    const chart = sorted.map((a, i) => `${i + 1}. ${a.name} — ${fmt(a[key])}`);
    return `Top assets by ${yr}-year return:\n${prose.join('\n')}` + freeTextChartBlock('ranked', chart);
  }

  function bestROI(assets) {
    const yrs = [20, 15, 10, 5, 1];
    const scored = assets.map(a => {
      let best = 0, bestYr = 0;
      yrs.forEach(y => { const v = a['v' + y]; if (v && !isNaN(v) && v > best) { best = v; bestYr = y; } });
      return { ...a, _best: best, _bestYr: bestYr };
    }).filter(a => a._best > 0).sort((a, b) => b._best - a._best).slice(0, 7);
    const prose = scored.map((a, i) => `${i + 1}. **${a.name}** — ${fmt(a._best)} over ${a._bestYr}yr`);
    const chart = scored.map((a, i) => `${i + 1}. ${a.name} — ${fmt(a._best)}`);
    return `Top overall ROI performers:\n${prose.join('\n')}` + freeTextChartBlock('ranked', chart);
  }

  function topClass(assets) {
    const map = {};
    assets.forEach(a => {
      const cls = a.section || a.category || a.cat || 'Unknown';
      const v = a.v10 || a.v5 || a.v1 || 0;
      if (!map[cls]) map[cls] = { sum: 0, count: 0 };
      if (v && !isNaN(v)) { map[cls].sum += Number(v); map[cls].count++; }
    });
    const sorted = Object.entries(map)
      .filter(([, d]) => d.count > 0)
      .map(([cls, d]) => ({ cls, avg: d.sum / d.count, count: d.count }))
      .sort((a, b) => b.avg - a.avg);
    if (!sorted.length) return 'Could not compute asset class averages.';
    const top = sorted.slice(0, 5);
    const prose = top.map((c, i) => `${i + 1}. **${c.cls}** — avg ${fmt(c.avg)} (${c.count} assets)`);
    const chart = top.map((c, i) => `${i + 1}. ${c.cls} — ${fmt(c.avg)}`);
    return `Asset classes ranked by average 10-year return:\n${prose.join('\n')}` + freeTextChartBlock('donut', chart);
  }

  function worstPerformers(assets) {
    const sorted = assets
      .filter(a => a.v10 && !isNaN(a.v10))
      .sort((a, b) => a.v10 - b.v10)
      .slice(0, 7);
    if (!sorted.length) return 'No 10-year data found.';
    const prose = sorted.map((a, i) => `${i + 1}. **${a.name}** — ${fmt(a.v10)} over 10yr`);
    const chart = sorted.map((a, i) => `${i + 1}. ${a.name} — ${fmt(a.v10)}`);
    return `Bottom performers by 10-year return:\n${prose.join('\n')}` + freeTextChartBlock('ranked', chart);
  }

  function avgReturns(assets) {
    const yrs = [1, 5, 10, 15, 20];
    const points = yrs.map(y => {
      const vals = assets.map(a => a['v' + y]).filter(v => v && !isNaN(v));
      if (!vals.length) return null;
      const avg = Math.round(vals.reduce((s, v) => s + Number(v), 0) / vals.length);
      const med = Math.round(median(vals.map(Number)));
      return { y, avg, med, count: vals.length };
    }).filter(Boolean);
    const prose = points.map(d => `**${d.y}yr** — avg ${fmt(d.avg)}, median ${fmt(d.med)} (${d.count} assets)`);
    const chart = points.map((d, i) => `${i + 1}. ${d.y}yr — ${fmt(d.avg)}`);
    return `Average returns across the dataset:\n${prose.join('\n')}` + freeTextChartBlock('line', chart);
  }

  function mostConsistent(assets) {
    const yrs = [1, 5, 10, 15, 20];
    const scored = assets.map(a => {
      const vals = yrs.map(y => a['v' + y]).filter(v => v && !isNaN(v)).map(Number);
      if (vals.length < 3) return null;
      const mean = vals.reduce((s, v) => s + v, 0) / vals.length;
      const variance = vals.reduce((s, v) => s + (v - mean) ** 2, 0) / vals.length;
      const cv = Math.sqrt(variance) / mean;
      return { ...a, _cv: cv, _mean: mean };
    }).filter(Boolean).sort((a, b) => a._cv - b._cv).slice(0, 7);
    if (!scored.length) return 'Not enough multi-year data to determine consistency.';
    const prose = scored.map((a, i) => `${i + 1}. **${a.name}** — avg ${fmt(a._mean)} with low variance`);
    const chart = scored.map((a, i) => `${i + 1}. ${a.name} — ${fmt(a._mean)}`);
    return `Most consistent performers (low return volatility):\n${prose.join('\n')}` + freeTextChartBlock('ranked', chart);
  }

  function assetDetail(a) {
    const yrs = [1, 5, 10, 15, 20];
    const vals = yrs.map(y => ({ y, v: a['v' + y] })).filter(d => d.v && !isNaN(d.v));
    const prose = vals.map(d => `**${d.y}yr:** ${fmt(d.v)}`);
    const chart = vals.map((d, i) => `${i + 1}. ${d.y}yr — ${fmt(d.v)}`);
    const cls = a.section || a.category || a.cat || 'Unknown';
    const base = `**${a.name}** (${cls})\n${prose.length ? prose.join(' · ') : 'No return data available.'}`;
    return base + (chart.length >= 2 ? freeTextChartBlock('line', chart) : '');
  }

  function assetPerformanceSummary(a) {
    const cls = a.section || a.category || a.cat || 'Unknown';
    const yrs = [1, 5, 10, 15, 20];
    const vals = yrs.map(y => ({ y, v: a['v' + y] })).filter(d => d.v && !isNaN(d.v));
    if (!vals.length) return `No return data is available for **${a.name}**.`;

    const seed = (typeof window.seedMultiplier !== 'undefined') ? 1000 * window.seedMultiplier : 1000;
    const best = vals.reduce((b, d) => d.v > b.v ? d : b, vals[0]);
    const multiplier = (best.v / seed).toFixed(1);

    const returnLines = vals.map(d => `**${d.y}yr:** ${fmt(d.v)} (${fmtX(d.v / seed)})`).join(' · ');

    let verdict;
    if (best.v > seed * 10) verdict = `Strong performer — **${multiplier}x** return over ${best.y} years based on a $${seed.toLocaleString()} investment.`;
    else if (best.v > seed * 3) verdict = `Moderate performer — **${multiplier}x** return over ${best.y} years.`;
    else verdict = `Low performer relative to the dataset — only **${multiplier}x** over ${best.y} years.`;

    const chart = vals.map((d, i) => `${i + 1}. ${d.y}yr — ${fmt(d.v)}`);
    return `**${a.name}** (${cls})\n${returnLines}\n\n${verdict}` +
      (chart.length >= 2 ? freeTextChartBlock('line', chart) : '');
  }

  function bestInClass(assets, cls) {
    const filtered = assets.filter(a =>
      (a.section || a.category || a.cat || '').toLowerCase() === cls.toLowerCase()
    );
    if (!filtered.length) return `No assets found in the **${cls}** category.`;
    const sorted = filtered.filter(a => a.v10 && !isNaN(a.v10)).sort((a, b) => b.v10 - a.v10).slice(0, 7);
    if (!sorted.length) return `No 10-year data available for **${cls}** assets.`;
    const prose = sorted.map((a, i) => `${i + 1}. **${a.name}** — ${fmt(a.v10)} (10yr)`);
    const chart = sorted.map((a, i) => `${i + 1}. ${a.name} — ${fmt(a.v10)}`);
    return `Top performers in **${cls}**:\n${prose.join('\n')}` + freeTextChartBlock('ranked', chart);
  }

  function median(arr) {
    const s = [...arr].sort((a, b) => a - b);
    const mid = Math.floor(s.length / 2);
    return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
  }

  function simulatedDelay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // ── UI helpers ───────────────────────────────────────────────
  let typingEl = null;

  function playBeep() {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      // Two-note "ding-ding" — like iMessage / WhatsApp receive tone
      const notes = [
        { freq: 1046.5, start: 0,    dur: 0.12 },  // C6
        { freq: 1318.5, start: 0.13, dur: 0.16 },  // E6
      ];
      notes.forEach(({ freq, start, dur }) => {
        const osc  = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, ctx.currentTime + start);
        gain.gain.setValueAtTime(0, ctx.currentTime + start);
        gain.gain.linearRampToValueAtTime(0.10, ctx.currentTime + start + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + start + dur);
        osc.start(ctx.currentTime + start);
        osc.stop(ctx.currentTime + start + dur + 0.02);
      });
    } catch { /* audio not available */ }
  }

  function formatBotText(text) {
    const lines = text.split('\n');
    let html = '';
    let inList = false;
    let listType = '';

    const closeList = () => {
      if (inList) { html += listType === 'ol' ? '</ol>' : '</ul>'; inList = false; listType = ''; }
    };

    const inlineFormat = (s) =>
      s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
       .replace(/\*(.+?)\*/g, '<em>$1</em>')
       .replace(/`([^`]+)`/g, '<code>$1</code>');

    lines.forEach(raw => {
      const line = raw.trimEnd();
      if (!line.trim()) { closeList(); html += '<div class="chat-spacer"></div>'; return; }

      // Numbered list  "1. text"
      const numMatch = line.match(/^(\d+)\.\s+(.+)/);
      if (numMatch) {
        if (!inList || listType !== 'ol') { closeList(); html += '<ol class="chat-ol">'; inList = true; listType = 'ol'; }
        html += `<li>${inlineFormat(numMatch[2])}</li>`;
        return;
      }

      // Bullet list  "- text" or "• text"
      const bulletMatch = line.match(/^[-•]\s+(.+)/);
      if (bulletMatch) {
        if (!inList || listType !== 'ul') { closeList(); html += '<ul class="chat-ul">'; inList = true; listType = 'ul'; }
        html += `<li>${inlineFormat(bulletMatch[1])}</li>`;
        return;
      }

      closeList();

      // Markdown heading  "### text" or "## text"
      const hMatch = line.match(/^#{1,3}\s+(.+)/);
      if (hMatch) { html += `<div class="chat-section-head">${inlineFormat(hMatch[1])}</div>`; return; }

      // Standalone label ending with colon — e.g. "Top 5 assets by 10-year return:"
      // Must be a short line (≤60 chars), no sentence punctuation mid-line, no $ value
      const labelOnly = line.match(/^([^:$\n]{4,55}):$/);
      if (labelOnly && !/[.,;]/.test(labelOnly[1])) {
        html += `<div class="chat-section-head">${inlineFormat(labelOnly[1])}:</div>`;
        return;
      }

      // Lines that are ONLY bold text (e.g. "**Key Point**") — render as a mini heading
      const boldOnly = line.match(/^\*\*([^*]+)\*\*[.:—–]?\s*$/);
      if (boldOnly) { html += `<div class="chat-section-head">${boldOnly[1]}</div>`; return; }

      html += `<p class="chat-p">${inlineFormat(line)}</p>`;
    });
    closeList();
    return html;
  }

  // ── In-chat chart rendering ──────────────────────────────────

  // Strip the CHART DATA: section from text before display, return cleaned text + extracted section
  function splitChartSection(text) {
    const marker = /\n?CHART DATA:\s*\n/i;
    const match = text.match(marker);
    if (!match) return { clean: text, chartSection: null };
    const idx = match.index;
    const clean = text.slice(0, idx).trim();
    const chartSection = text.slice(idx + match[0].length).trim();
    return { clean, chartSection };
  }

  function extractChartData(text, questionHint) {
    // Helper: extract the largest dollar value anywhere in a string
    function extractValue(str) {
      // Match dollar values: optional ~, digits with commas, optional decimal, optional k/m/b suffix at word boundary
      const matches = [...str.matchAll(/~?\$\s*([\d,]+(?:\.\d+)?)\s*([kKmMbB](?![a-zA-Z]))?/g)];
      let best = 0;
      for (const m of matches) {
        let v = parseFloat(m[1].replace(/,/g, ''));
        const suffix = (m[2] || '').toLowerCase();
        if (suffix === 'k') v *= 1000;
        else if (suffix === 'm') v *= 1000000;
        else if (suffix === 'b') v *= 1000000000;
        if (v > best) best = v;
      }
      return best > 0 ? Math.round(best) : 0;
    }

    function extractName(raw) {
      let s = raw.replace(/^(\d+[\.\)]|[-•])\s+/, '').trim();
      s = s.replace(/\*\*/g, '').replace(/\*/g, '');
      s = s.replace(/\s*[—–]\s.*$/, '').replace(/\s*:.*$/, '');
      s = s.replace(/\s*\([A-Z0-9.]{1,8}\)\s*$/, '').trim();
      return s;
    }

    // ── Priority 1: explicit CHART DATA: section from AI ────────────────────
    const { chartSection } = splitChartSection(text);
    if (chartSection) {
      // Detect optional TYPE: directive on first non-blank line
      const sectionLines = chartSection.split('\n').map(l => l.trim()).filter(Boolean);
      let vizType = 'ranked';
      let dataLines = sectionLines;
      const typeMatch = sectionLines[0] && sectionLines[0].match(/^TYPE:\s*(\w+)/i);
      if (typeMatch) {
        vizType = typeMatch[1].toLowerCase();
        dataLines = sectionLines.slice(1);
      }

      // ── Client-side type override ──────────────────────────────────────────
      // If the AI picked TYPE:ranked but we can infer a better type from the
      // question text or the data shape, upgrade it here.
      if (vizType === 'ranked') {
        const q = (questionHint || '').toLowerCase();
        const numberedLines = dataLines.filter(l => /^\d+[\.\)]/.test(l));
        // Time series: at least half the numbered lines contain a horizon label
        const horizonLineCount = numberedLines.filter(l => /\b(1y|5y|10y|15y|20y|1yr|5yr|10yr|15yr|20yr)\b/i.test(l)).length;
        const hasTimeSeries = numberedLines.length >= 2 && horizonLineCount >= Math.ceil(numberedLines.length / 2);
        const hasPipeRows = dataLines.filter(l => !(/^HEADERS?:/i.test(l)) && l.includes('|')).length >= 2;
        const isCategoryQ = /\b(category|categor|sector|class|breakdown|composition|split|proportion|share|allocation|portfolio|pie|which (type|kind|class))\b/i.test(q);
        const isTimeQ = /\b(over time|trajectory|growth|across (horizon|year|time|period)|each (year|horizon)|time.series)\b/i.test(q);
        const isSingleAsset = /\b(how (did|has|is)|growth of|trajectory of|show me|detail|history|performance|return[s]? of|what (did|has|are|were)|tell me about)\b/i.test(q) && numberedLines.length <= 7;
        const isCompareQ = /\b(compar|versus|vs\.?|vs |against|side.by.side|both|all (assets|of them))\b/i.test(q);

        if (hasPipeRows) {
          vizType = isCompareQ ? 'grouped' : 'table';
        } else if (hasTimeSeries) {
          vizType = 'line';
        } else if (isCategoryQ) {
          vizType = 'donut';
        } else if ((isTimeQ || isSingleAsset) && numberedLines.length >= 2) {
          vizType = 'line';
        }
      }

      // ── GROUPED (comparison) viz ───────────────────────────────
      if (vizType === 'grouped' || vizType === 'comparison') {
        // Format: HEADERS: Label | GroupA | GroupB
        //         Row | $valA | $valB
        const headerLine = dataLines.find(l => /^HEADERS?:/i.test(l));
        let labelA = 'Group A', labelB = 'Group B';
        let headerCols = null;
        if (headerLine) {
          headerCols = headerLine.replace(/^HEADERS?:\s*/i, '').split('|').map(s => s.trim());
          if (headerCols[1]) labelA = headerCols[1];
          if (headerCols[2]) labelB = headerCols[2];
        }

        // Safety net: if AI used grouped but included 3+ series, treat as table
        const samplePipeRow = dataLines.find(l => !(/^HEADERS?:/i.test(l)) && l.includes('|'));
        const seriesCount = samplePipeRow ? samplePipeRow.split('|').length - 1 : 2;
        if (seriesCount >= 3) {
          vizType = 'table';
          // fall through to table branch below
        } else {
          const gRows = [];
          for (const raw of dataLines) {
            if (/^HEADERS?:/i.test(raw)) continue;
            if (!raw.includes('|')) continue;
            const cells = raw.split('|').map(c => c.trim().replace(/\*\*/g, ''));
            if (cells.length < 3) continue;
            const rowLabel = cells[0].replace(/^\d+[\.\)]\s*/, '').trim();
            const valA = extractValue(cells[1]) || parseFloat(cells[1].replace(/[^0-9.]/g, '')) || 0;
            const valB = extractValue(cells[2]) || parseFloat(cells[2].replace(/[^0-9.]/g, '')) || 0;
            if (!rowLabel || (valA === 0 && valB === 0)) continue;
            gRows.push({ label: rowLabel, valA, valB });
          }
          return gRows.length >= 2 ? { type: 'grouped', labelA, labelB, rows: gRows } : null;
        }
      }

      // ── TABLE viz ─────────────────────────────────────────────
      if (vizType === 'table') {
        const headerLine = dataLines.find(l => /^HEADERS?:/i.test(l));
        const headers = headerLine
          ? headerLine.replace(/^HEADERS?:\s*/i, '').split('|').map(h => h.trim()).filter(Boolean)
          : null;
        const rows = [];
        for (const raw of dataLines) {
          if (/^HEADERS?:/i.test(raw)) continue;
          if (!raw.includes('|')) continue;
          const cells = raw.split('|').map(c => c.trim().replace(/\*\*/g, ''));
          if (cells.length >= 2) rows.push(cells);
        }
        // Return table if we have rows, otherwise null — never fall through to bar chart
        return rows.length >= 1 ? { type: 'table', headers, rows } : null;
      }

      // ── DONUT viz ──────────────────────────────────────────────
      if (vizType === 'donut' || vizType === 'pie') {
        const items = [];
        for (const raw of dataLines) {
          if (!/^\d+[\.\)]/.test(raw) && !/^[-•]/.test(raw)) continue;
          // Accept dollar values OR plain numbers OR percentages
          let val = extractValue(raw);
          if (!val) {
            const pctMatch = raw.match(/([\d,]+(?:\.\d+)?)%/);
            if (pctMatch) val = parseFloat(pctMatch[1].replace(/,/g, ''));
          }
          if (!val || val < 0.1) continue;
          const name = extractName(raw);
          if (!name || name.length < 2) continue;
          if (!items.find(x => x.name === name) && items.length < 10) items.push({ name, val });
        }
        return items.length >= 2 ? { type: 'donut', items } : null;
      }

      // ── LINE viz ───────────────────────────────────────────────
      if (vizType === 'line') {
        // New multi-series format: SERIES: Name\n horizon — $val\n ...
        const hasSeriesBlocks = dataLines.some(l => /^SERIES:/i.test(l));

        if (hasSeriesBlocks) {
          const series = [];
          let current = null;
          for (const raw of dataLines) {
            const seriesMatch = raw.match(/^SERIES:\s*(.+)/i);
            if (seriesMatch) {
              current = { name: seriesMatch[1].trim(), points: [] };
              series.push(current);
              continue;
            }
            if (!current) continue;
            let val = extractValue(raw);
            if (!val) {
              const numMatch = raw.match(/[\s—–:]\s*([\d,]+(?:\.\d+)?)\s*([xX]?)$/);
              if (numMatch) val = parseFloat(numMatch[1].replace(/,/g, ''));
            }
            if (!val || val < 0.01) continue;
            // Extract horizon label: "1yr", "5yr" etc from start of line
            const horizonMatch = raw.match(/^(\d+\s*yr|\d+\s*y)\b/i);
            const label = horizonMatch ? horizonMatch[0].replace(/\s+/, '') : extractName(raw);
            if (!label) continue;
            current.points.push({ label, val });
          }
          const validSeries = series.filter(s => s.points.length >= 2);
          if (validSeries.length >= 1) return { type: 'line', series: validSeries };
          // Single-point series — show as ranked bar (each series name + its value)
          const singleItems = series.filter(s => s.points.length === 1).map(s => ({
            name: s.name || s.points[0].label,
            val: s.points[0].val
          }));
          if (singleItems.length >= 1) return { type: 'ranked', items: singleItems };
        }

        // Legacy single-series format: numbered/bulleted lines
        const points = [];
        for (const raw of dataLines) {
          if (!/^\d+[\.\)]/.test(raw) && !/^[-•]/.test(raw)) continue;
          let val = extractValue(raw);
          if (!val) {
            const numMatch = raw.match(/[\s—–:]\s*([\d,]+(?:\.\d+)?)\s*([xX]?)$/);
            if (numMatch) val = parseFloat(numMatch[1].replace(/,/g, ''));
          }
          if (!val || val < 0.01) continue;
          const name = extractName(raw);
          if (!name || name.length < 1) continue;
          points.push({ label: name, val });
        }
        if (points.length >= 2) return { type: 'line', series: [{ name: null, points }] };
        if (points.length === 1) return { type: 'ranked', items: [{ name: points[0].label, val: points[0].val }] };
        return null;
      }

      // ── Default: ranked bar ────────────────────────────────────
      const items = [];
      for (const raw of dataLines) {
        if (!/^\d+[\.\)]/.test(raw) && !/^[-•]/.test(raw)) continue;
        const val = extractValue(raw);
        if (val < 100) continue;
        const name = extractName(raw);
        if (!name || name.length < 3) continue;
        if (!items.find(x => x.name === name) && items.length < 10) items.push({ name, val });
      }
      // Once we have a CHART DATA section, always return from here — never fall through to prose scan
      return items.length >= 2 ? { type: 'ranked', items } : null;
    }

    // ── Priority 2: prose time-series scan (single or multi-asset over horizons) ─
    // Handles patterns like:
    //   "$7,000 over 10 years"  "$32,000 at 20yr"  "grew to $32,000 at 20yr"
    //   "$1,120 at 1yr ... $32,000 at 20yr"  "returned $16,000 over 15yr"
    {
      const horizonOrder = ['1yr','5yr','10yr','15yr','20yr'];
      const horizonMap = { '1':1, '5':5, '10':10, '15':15, '20':20 };

      // Pattern: $X,XXX at/over/by/for N yr/year OR N yr/year: $X,XXX
      const horizonValRe = /\$\s*([\d,]+)(?:\s+(?:at|over|by|for)\s+(\d+)\s*(?:yr|year)|\s+(?:(?:at|over|by|for)\s+)?(\d+)\s*(?:yr|year))|(\d+)\s*(?:yr|year)[^.]*?\$\s*([\d,]+)/gi;

      // Also catch simple "at Nyr" pattern: $X at Nyr
      const atHorizonRe = /\$\s*([\d,]+)\s+(?:at|over|by|for|in)\s+(\d+)\s*[-–]?\s*(?:yr|year)/gi;
      // And "Nyr[: ]$X" pattern
      const horizonFirstRe = /\b(\d+)\s*[-–]?\s*(?:yr|year)s?[:\s]+\$\s*([\d,]+)/gi;
      // And "grew to $X at Nyr" / "returned $X over N years"
      const grewToRe = /(?:grew to|reached|returned?|hit|was|is|stands? at|surged? to|compounded? to|ends? at|finish(?:es)? at)\s+\$\s*([\d,]+)[^.,(]*?(?:at|over|by|after|in)\s+(\d+)\s*[-–]?\s*(?:yr|year)/gi;

      const found = {};

      const scanForHorizons = (src) => {
        // Always keep LARGEST value per horizon to avoid keeping seed capital ($1,000)
        const set = (key, val) => {
          if (horizonOrder.includes(key) && val > 0 && (!found[key] || val > found[key])) found[key] = val;
        };
        let m;
        // "returned/grew $X from a $Y investment over N years"
        const re0 = /(?:returned?|grew)\s+\$\s*([\d,]+)\s+from\s+(?:a\s+)?\$[\d,]+[^.\n]{0,20}?over\s+(\d+)\s*(?:yr|year)/gi;
        while ((m = re0.exec(src)) !== null) set(m[2]+'yr', parseFloat(m[1].replace(/,/g,'')));
        // "turned $X into $Y over N years" (value-first)
        const re6 = /turned?\s+\$[\d,]+\s+into\s+\$\s*([\d,]+)[^.\n]{0,40}?(?:over|in|at|after)\s+(\d+)\s*(?:yr|year)/gi;
        while ((m = re6.exec(src)) !== null) set(m[2]+'yr', parseFloat(m[1].replace(/,/g,'')));
        // "over N years ... turned $X into $Y" (year-first)
        const re7 = /(?:over|in|after)\s+(\d+)\s*(?:yr|year)[^.\n]{0,60}?turned?\s+\$[\d,]+\s+into\s+\$\s*([\d,]+)/gi;
        while ((m = re7.exec(text)) !== null) set(m[1]+'yr', parseFloat(m[2].replace(/,/g,'')));
        // "Nyr ($X)" or "at 10yr ($3,500)" — value in parens after horizon
        const re8 = /\b(\d+)\s*[-–]?\s*(?:yr|year)s?\s*\(\s*\$\s*([\d,]+)\s*\)/gi;
        while ((m = re8.exec(src)) !== null) set(m[1]+'yr', parseFloat(m[2].replace(/,/g,'')));
        // "by 10yr" / "at 10yr" / "surged to $X by 10yr"
        const re9 = /\$\s*([\d,]+)\s+(?:by|at)\s+(\d+)\s*[-–]?\s*(?:yr|year)/gi;
        while ((m = re9.exec(src)) !== null) set(m[2]+'yr', parseFloat(m[1].replace(/,/g,'')));
        // "N-year return reached/hit $X"
        const re5 = /\b(\d+)[-\s](?:yr|year)\w*\s+(?:return\w*\s+)?(?:reached?|hit|was|is|grew?\s+to|surged?\s+to|compounded?\s+to|returned?)\s+\$\s*([\d,]+)/gi;
        while ((m = re5.exec(src)) !== null) set(m[1]+'yr', parseFloat(m[2].replace(/,/g,'')));
        // "Nyr: $X" or "N-year: $X"
        const re3 = /\b(\d+)\s*[-–]?\s*(?:yr|year)s?[\s:,]+\$\s*([\d,]+)/gi;
        while ((m = re3.exec(src)) !== null) set(m[1]+'yr', parseFloat(m[2].replace(/,/g,'')));
        // "$X over/at/in Nyr" — most common, run last so it wins ties
        const re1 = /\$\s*([\d,]+)\s*(?:\([^)]*\))?\s*(?:at|over|by|for|in)\s+(\d+)\s*[-–]?\s*(?:yr|year)/gi;
        while ((m = re1.exec(src)) !== null) set(m[2]+'yr', parseFloat(m[1].replace(/,/g,'')));
      };

      scanForHorizons(text);

      const points = horizonOrder.filter(k => found[k]).map(k => ({ label: k, val: found[k] }));
      if (points.length >= 2) {
        return { type: 'line', series: [{ name: null, points }] };
      }
    }

    // ── Priority 2b: scan bullets for asset names + dollar values (ranked) ──────
    const lines = text.split('\n');
    const items = [];
    const PROSE_STOP = /^(the|a|an|across|at|by|and|or|in|on|for|of|yr|year|return|invest|over|most|top|best|worst|all|every|with|this|that|these|those|from|its|so|is|are|was|were|will|has|have|had|be|been|being|they|their|there|then|when|where|which|what|how|why|who|than|more|less|both|each|other|total|gain|since|while|also|even|only|just|not|no|any|our|we|you|your|him|her|it|up|down|out|into|about|like|such|per|as|if|asia|europe|out)$/i;

    // Extract asset name from a prose bullet — looks for bold (**Name**) or ticker (NAME) first
    function extractProseName(line) {
      // Bold text: **Name** or **Name (TICK)**
      const boldMatch = line.match(/\*\*([^*]{2,35}?)\*\*/);
      if (boldMatch) {
        let n = boldMatch[1].replace(/\s*\([A-Z0-9.]{1,8}\)\s*$/, '').trim();
        if (n.length >= 2 && !PROSE_STOP.test(n)) return n;
      }
      // Ticker pattern: WORD (TICK) at start of content
      const tickerMatch = line.replace(/^[-•\d.\)]\s*/, '').match(/^([A-Z][a-zA-Z\s&.,']{1,30}?)\s*\([A-Z]{1,6}\)/);
      if (tickerMatch) return tickerMatch[1].trim();
      // Fallback: extractName
      return extractName(line);
    }

    for (const raw of lines) {
      const line = raw.trim();
      if (!line) continue;
      if (!/^\d+[\.\)]\s+/.test(line) && !/^[-•]\s+/.test(line)) continue;
      // Accept dollar values OR plain counts like "150 assets" / "(30)"
      let val = extractValue(line);
      if (!val || val < 5) {
        const countMatch = line.match(/\b(\d+)\s*(?:assets?|stocks?|funds?|items?|entries|bonds?|holdings?)?\b/i);
        if (countMatch) val = parseInt(countMatch[1], 10);
      }
      if (!val || val < 5) continue;
      const name = extractProseName(line);
      if (!name || name.length < 3) continue;
      if (PROSE_STOP.test(name)) continue;
      if (!items.find(x => x.name === name) && items.length < 10) {
        items.push({ name, val });
      }
    }

    if (items.length >= 2) return { type: 'ranked', items };

    // ── Priority 3: comparison table (lines with "vs") ────────────────────────
    const rows = [];
    let labelA = '', labelB = '';
    for (const raw of lines) {
      const line = raw.trim();
      if (!/\bvs\.?\b/i.test(line)) continue;
      const m = line.match(/\*{0,2}([^*—\n]{1,20})\*{0,2}\s*[—–:]\s*(.+?)\bvs\.?\s*(.+)/i);
      if (!m) continue;
      const rowLabel = m[1].replace(/\*\*/g, '').replace(/:$/, '').trim();
      const sideA = extractValue(m[2]);
      const sideB = extractValue(m[3]);
      if (sideA < 100 || sideB < 100) continue;
      if (!labelA) {
        const mA = m[2].match(/([A-Z][a-zA-Z\s]{1,15}?)(?:\s*(?:avg|average))?\s*[:$]/);
        const mB = m[3].match(/([A-Z][a-zA-Z\s]{1,15}?)(?:\s*(?:avg|average))?\s*[:$]/);
        labelA = mA ? mA[1].trim() : 'Group A';
        labelB = mB ? mB[1].trim() : 'Group B';
      }
      rows.push({ label: rowLabel, valA: sideA, valB: sideB });
    }
    if (rows.length >= 2) return { type: 'grouped', labelA, labelB, rows };

    return null;
  }

  // Two fixed colours for grouped/comparison charts
  const GROUP_COLOR_A = '#2563eb'; // blue  — first comparator
  const GROUP_COLOR_B = '#059669'; // green — second comparator

  // Palette: distinct colours for ranked (single-series) charts
  const CHART_PALETTE = [
    '#2563eb','#0891b2','#059669','#d97706','#dc2626',
    '#7c3aed','#db2777','#0284c7','#65a30d','#b45309',
  ];

  function fmtDollar(v) {
    if (v >= 1000000) return '$' + (v / 1000000).toFixed(1) + 'M';
    if (v >= 1000)    return '$' + (v / 1000).toFixed(0) + 'k';
    return '$' + v;
  }

  function drawRoundRect(ctx, x, y, w, h, r) {
    if (ctx.roundRect) { ctx.roundRect(x, y, w, h, r); return; }
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  function renderChatChart(container, chartData, chartTitle, seedNote) {
    if (!chartData) return;
    if (chartData.type === 'grouped') {
      renderGroupedChart(container, chartData, chartTitle, seedNote);
    } else if (chartData.type === 'table') {
      renderChatTable(container, chartData, chartTitle);
    } else if (chartData.type === 'donut') {
      renderDonutChart(container, chartData.items, chartTitle);
    } else if (chartData.type === 'line') {
      renderLineChart(container, chartData.series, chartTitle, seedNote);
    } else {
      renderRankedChart(container, chartData.items, chartTitle, seedNote);
    }
    attachDownloadOverlay(container, chartTitle || 'roi-chart');
  }

  // ── Download overlay (hover-to-reveal save button) ───────────────────────
  function attachDownloadOverlay(container, chartTitle) {
    container.classList.add('chat-viz-downloadable');

    const btn = document.createElement('button');
    btn.className = 'chat-viz-dl-btn';
    btn.setAttribute('aria-label', 'Download chart');
    btn.title = 'Download as image';
    btn.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>`;

    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      downloadViz(container, chartTitle);
    });

    container.appendChild(btn);
  }

  function downloadViz(container, chartTitle) {
    // Prefer the canvas directly if one exists
    const canvas = container.querySelector('canvas');
    if (canvas) {
      const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
      const bgColor = isDark ? '#111623' : '#ffffff';
      const flat = document.createElement('canvas');
      flat.width  = canvas.width;
      flat.height = canvas.height;
      const flatCtx = flat.getContext('2d');
      flatCtx.fillStyle = bgColor;
      flatCtx.fillRect(0, 0, flat.width, flat.height);
      flatCtx.drawImage(canvas, 0, 0);
      const link = document.createElement('a');
      link.download = sanitiseFilename(chartTitle) + '.png';
      link.href = flat.toDataURL('image/png');
      link.click();
      return;
    }

    // For HTML tables: render to an offscreen canvas
    const tableEl = container.querySelector('.chat-table');
    if (!tableEl) return;

    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const FONT = `-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
    const bgColor    = isDark ? '#111623' : '#ffffff';
    const borderCol  = isDark ? '#1f2740' : '#e2e5ef';
    const headBg     = isDark ? '#161c2d' : '#f5f7fb';
    const textColor  = isDark ? '#e2e6f0' : '#0f1523';
    const mutedColor = isDark ? '#7986a0' : '#5c6478';
    const altRowBg   = isDark ? '#161c2d' : '#f5f7fb';

    const rows = [...tableEl.querySelectorAll('tr')];
    const COL_PAD = 14;
    const ROW_H   = 26;
    const TITLE_H = chartTitle ? 30 : 0;
    const PAD     = 12;

    // Measure columns
    const offC = document.createElement('canvas');
    const offCtx = offC.getContext('2d');
    offCtx.font = `600 11px ${FONT}`;
    const colWidths = [];
    rows.forEach(row => {
      [...row.cells].forEach((cell, ci) => {
        const w = offCtx.measureText(cell.textContent.trim()).width + COL_PAD * 2;
        colWidths[ci] = Math.max(colWidths[ci] || 0, w);
      });
    });

    const totalW = colWidths.reduce((s, w) => s + w, 0) + PAD * 2;
    const totalH = TITLE_H + rows.length * ROW_H + PAD * 2;

    const finalCanvas = document.createElement('canvas');
    const ratio = window.devicePixelRatio || 1;
    finalCanvas.width  = totalW * ratio;
    finalCanvas.height = totalH * ratio;
    const ctx = finalCanvas.getContext('2d');
    ctx.scale(ratio, ratio);

    // Background
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, totalW, totalH);

    // Title
    if (chartTitle) {
      ctx.font = `700 12px ${FONT}`;
      ctx.fillStyle = textColor;
      ctx.textBaseline = 'middle';
      ctx.fillText(chartTitle, PAD, TITLE_H / 2);
    }

    // Rows
    rows.forEach((row, ri) => {
      const isHead = row.parentElement.tagName === 'THEAD';
      const ry = TITLE_H + PAD + ri * ROW_H;

      // Row background
      ctx.fillStyle = isHead ? headBg : (ri % 2 === 1 ? altRowBg : bgColor);
      ctx.fillRect(PAD, ry, totalW - PAD * 2, ROW_H);

      // Bottom border
      ctx.strokeStyle = borderCol;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(PAD, ry + ROW_H);
      ctx.lineTo(totalW - PAD, ry + ROW_H);
      ctx.stroke();

      let cx = PAD;
      [...row.cells].forEach((cell, ci) => {
        const cw = colWidths[ci];
        const isFirst = ci === 0;
        ctx.font = isHead ? `700 10px ${FONT}` : (isFirst ? `500 11px ${FONT}` : `600 11px ${FONT}`);
        ctx.fillStyle = isHead ? mutedColor : textColor;
        ctx.textAlign = isFirst ? 'left' : 'right';
        ctx.textBaseline = 'middle';
        const tx = isFirst ? cx + COL_PAD : cx + cw - COL_PAD;
        ctx.fillText(cell.textContent.trim(), tx, ry + ROW_H / 2);
        cx += cw;
      });
    });

    const link = document.createElement('a');
    link.download = sanitiseFilename(chartTitle) + '.png';
    link.href = finalCanvas.toDataURL('image/png');
    link.click();
  }

  function sanitiseFilename(s) {
    return (s || 'chart').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'chart';
  }

  // ── Grouped (comparison) chart — two coloured bars per row ───────────────
  function renderGroupedChart(container, data, chartTitle, seedNote) {
    const { labelA, labelB, rows } = data;
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';

    const BAR_H   = 16; // height of each individual bar
    const BAR_GAP = 3;  // gap between the two bars in a group
    const ROW_GAP = 10; // gap between groups
    const LABEL_W = 52;
    const VAL_W   = 50;
    const BAR_MAX = 170;
    const PAD     = 14;
    const LEGEND_H = 22;
    const TITLE_H  = chartTitle ? 28 : 0;
    const GROUP_H  = BAR_H * 2 + BAR_GAP;
    const W = LABEL_W + BAR_MAX + VAL_W + PAD * 2;
    const H = TITLE_H + LEGEND_H + rows.length * (GROUP_H + ROW_GAP) - ROW_GAP + PAD * 2;

    const canvas = document.createElement('canvas');
    const ratio  = window.devicePixelRatio || 1;
    canvas.width  = W * ratio;
    canvas.height = H * ratio;
    canvas.style.width  = W + 'px';
    canvas.style.height = H + 'px';
    canvas.className = 'chat-chart-canvas';

    const ctx = canvas.getContext('2d');
    ctx.scale(ratio, ratio);

    const maxVal = Math.max(...rows.flatMap(r => [r.valA, r.valB]));
    const textColor  = isDark ? '#cbd5e1' : '#334155';
    const titleColor = isDark ? '#e2e6f0' : '#0f1523';
    const trackFill  = isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)';

    ctx.clearRect(0, 0, W, H);
    const FONT = `-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;

    // Title
    if (chartTitle) {
      ctx.font = `700 12px ${FONT}`;
      ctx.fillStyle = titleColor;
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'left';
      ctx.fillText(chartTitle, PAD, TITLE_H / 2);
    }

    // Legend
    const legendY = TITLE_H + 4;
    const legendItems = [[GROUP_COLOR_A, labelA], [GROUP_COLOR_B, labelB]];
    let lx = PAD + LABEL_W;
    legendItems.forEach(([color, lbl]) => {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.roundRect ? ctx.roundRect(lx, legendY + 5, 10, 10, 2) : ctx.rect(lx, legendY + 5, 10, 10);
      ctx.fill();
      ctx.font = `500 10.5px ${FONT}`;
      ctx.fillStyle = textColor;
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'left';
      ctx.fillText(lbl, lx + 13, legendY + 10);
      lx += 13 + ctx.measureText(lbl).width + 14;
    });

    // Rows
    const bx = PAD + LABEL_W;
    rows.forEach((row, i) => {
      const gy = TITLE_H + LEGEND_H + PAD + i * (GROUP_H + ROW_GAP);

      // Row label (centre-aligned vertically across both bars)
      ctx.font = `600 11px ${FONT}`;
      ctx.fillStyle = textColor;
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'right';
      const lbl = row.label.length > 6 ? row.label.slice(0, 5) + '…' : row.label;
      ctx.fillText(lbl, PAD + LABEL_W - 6, gy + GROUP_H / 2);

      [[row.valA, GROUP_COLOR_A], [row.valB, GROUP_COLOR_B]].forEach(([val, color], si) => {
        const by = gy + si * (BAR_H + BAR_GAP);
        const barW = Math.max(4, Math.round((val / maxVal) * BAR_MAX));

        // Track
        ctx.beginPath();
        drawRoundRect(ctx, bx, by, BAR_MAX, BAR_H, 3);
        ctx.fillStyle = trackFill;
        ctx.fill();

        // Bar
        ctx.beginPath();
        drawRoundRect(ctx, bx, by, barW, BAR_H, 3);
        ctx.fillStyle = color;
        ctx.globalAlpha = 0.9;
        ctx.fill();
        ctx.globalAlpha = 1;

        // Value
        ctx.font = `600 10.5px ${FONT}`;
        ctx.fillStyle = color;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(fmtDollar(val), bx + barW + 4, by + BAR_H / 2);
      });
    });

    container.appendChild(canvas);
    if (seedNote) {
      const note = document.createElement('div');
      note.className = 'chat-chart-note';
      note.textContent = seedNote;
      container.appendChild(note);
    }
  }

  // ── Ranked (single-series) chart ─────────────────────────────────────────
  function renderRankedChart(container, items, chartTitle, seedNote) {
    if (!items || !items.length) return;
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const BAR_H   = 22;
    const GAP     = 8;
    const LABEL_W = 118;
    const VAL_W   = 58;
    const BAR_MAX = 180;
    const PAD     = 14;
    const TITLE_H = chartTitle ? 28 : 0;
    const W = LABEL_W + BAR_MAX + VAL_W + PAD * 2;
    const H = TITLE_H + items.length * (BAR_H + GAP) - GAP + PAD * 2;

    const canvas = document.createElement('canvas');
    const ratio  = window.devicePixelRatio || 1;
    canvas.width  = W * ratio;
    canvas.height = H * ratio;
    canvas.style.width  = W + 'px';
    canvas.style.height = H + 'px';
    canvas.className = 'chat-chart-canvas';

    const ctx = canvas.getContext('2d');
    ctx.scale(ratio, ratio);

    const maxVal = Math.max(...items.map(d => d.val));
    const textColor  = isDark ? '#cbd5e1' : '#334155';
    const titleColor = isDark ? '#e2e6f0' : '#0f1523';
    const FONT = `-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;

    ctx.clearRect(0, 0, W, H);

    if (chartTitle) {
      ctx.font = `700 12px ${FONT}`;
      ctx.fillStyle = titleColor;
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'left';
      ctx.fillText(chartTitle, PAD, TITLE_H / 2);
    }

    items.forEach((item, i) => {
      const y = TITLE_H + PAD + i * (BAR_H + GAP);
      const barW = Math.max(4, Math.round((item.val / maxVal) * BAR_MAX));
      const color = CHART_PALETTE[i % CHART_PALETTE.length];

      ctx.font = `500 11px ${FONT}`;
      ctx.fillStyle = i === 0 ? titleColor : textColor;
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'right';
      const label = item.name.length > 17 ? item.name.slice(0, 15) + '…' : item.name;
      ctx.fillText(label, PAD + LABEL_W - 6, y + BAR_H / 2);

      const bx = PAD + LABEL_W;
      ctx.beginPath();
      drawRoundRect(ctx, bx, y, BAR_MAX, BAR_H, 4);
      ctx.fillStyle = isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)';
      ctx.fill();

      ctx.beginPath();
      drawRoundRect(ctx, bx, y, barW, BAR_H, 4);
      ctx.fillStyle = color;
      ctx.globalAlpha = i === 0 ? 1 : 0.72 + 0.06 * (1 - i / items.length);
      ctx.fill();
      ctx.globalAlpha = 1;

      ctx.font = i === 0 ? `700 11px ${FONT}` : `600 11px ${FONT}`;
      ctx.fillStyle = color;
      ctx.textAlign = 'left';
      ctx.fillText(fmtDollar(item.val), bx + barW + 5, y + BAR_H / 2);
    });

    container.appendChild(canvas);

    if (seedNote) {
      const note = document.createElement('div');
      note.className = 'chat-chart-note';
      note.textContent = seedNote;
      container.appendChild(note);
    }
  }

  // ── Table renderer ──────────────────────────────────────────────────────────
  function renderChatTable(container, chartData, chartTitle) {
    const { headers, rows } = chartData;
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';

    const wrap = document.createElement('div');
    wrap.className = 'chat-table-wrap';

    if (chartTitle) {
      const titleEl = document.createElement('div');
      titleEl.className = 'chat-table-title';
      titleEl.textContent = chartTitle;
      wrap.appendChild(titleEl);
    }

    const tableEl = document.createElement('table');
    tableEl.className = 'chat-table';

    if (headers && headers.length) {
      const thead = document.createElement('thead');
      const tr = document.createElement('tr');
      headers.forEach((h, i) => {
        const th = document.createElement('th');
        th.textContent = h;
        th.className = i === 0 ? 'chat-th chat-th-label' : 'chat-th chat-th-val';
        tr.appendChild(th);
      });
      thead.appendChild(tr);
      tableEl.appendChild(thead);
    }

    const tbody = document.createElement('tbody');
    rows.forEach((cells, ri) => {
      const tr = document.createElement('tr');
      tr.className = ri % 2 === 0 ? 'chat-tr' : 'chat-tr chat-tr-alt';
      cells.forEach((cell, ci) => {
        const td = document.createElement('td');
        const isDollar = /^\$[\d,]+/.test(cell);
        const isNum = /^[\d,]+(\.\d+)?[x%]?$/.test(cell.replace(/^\$/, ''));
        td.className = ci === 0 ? 'chat-td chat-td-label' : 'chat-td chat-td-val';
        // Colour-code values: green for high returns, red for negatives
        if (ci > 0 && isDollar) {
          const raw = parseFloat(cell.replace(/[$,]/g, ''));
          const seed = (typeof window.seedMultiplier !== 'undefined') ? 1000 * window.seedMultiplier : 1000;
          if (raw >= seed * 5) td.classList.add('chat-td-high');
          else if (raw <= seed * 0.8) td.classList.add('chat-td-low');
        }
        td.textContent = cell;
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });

    tableEl.appendChild(tbody);
    wrap.appendChild(tableEl);
    container.appendChild(wrap);
  }

  // ── Donut chart renderer ────────────────────────────────────────────────────
  function renderDonutChart(container, items, chartTitle) {
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const FONT = `-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;

    const total = items.reduce((s, d) => s + d.val, 0);
    if (!total) return;

    const SIZE = 148;
    const LEGEND_ROW_H = 20;
    const PAD = 12;
    const TITLE_H = chartTitle ? 26 : 0;
    const legendH = items.length * LEGEND_ROW_H + 4;
    const LEGEND_W = 148;
    const W = SIZE + PAD * 2 + LEGEND_W;
    const H = Math.max(SIZE, legendH) + TITLE_H + PAD * 2;

    const canvas = document.createElement('canvas');
    const ratio = window.devicePixelRatio || 1;
    canvas.width  = W * ratio;
    canvas.height = H * ratio;
    canvas.style.width  = W + 'px';
    canvas.style.height = H + 'px';
    canvas.className = 'chat-chart-canvas';
    const ctx = canvas.getContext('2d');
    ctx.scale(ratio, ratio);

    const textColor  = isDark ? '#cbd5e1' : '#334155';
    const mutedColor = isDark ? '#64748b' : '#94a3b8';
    const titleColor = isDark ? '#e2e6f0' : '#0f1523';
    const bgColor    = isDark ? '#111623' : '#ffffff';

    ctx.clearRect(0, 0, W, H);

    if (chartTitle) {
      ctx.font = `700 12px ${FONT}`;
      ctx.fillStyle = titleColor;
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'left';
      ctx.fillText(chartTitle, PAD, TITLE_H / 2);
    }

    const cx = PAD + SIZE / 2;
    const cy = TITLE_H + PAD + SIZE / 2;
    const outerR = SIZE / 2 - 4;
    const innerR = outerR * 0.52;
    let startAngle = -Math.PI / 2;

    // Draw slices
    items.forEach((item, i) => {
      const slice = (item.val / total) * Math.PI * 2;
      const color = CHART_PALETTE[i % CHART_PALETTE.length];

      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, outerR, startAngle, startAngle + slice);
      ctx.closePath();
      ctx.fillStyle = color;
      ctx.globalAlpha = i === 0 ? 1 : 0.82 + 0.04 * (1 - i / items.length);
      ctx.fill();
      ctx.globalAlpha = 1;

      ctx.beginPath();
      ctx.arc(cx, cy, outerR, startAngle, startAngle + slice);
      ctx.strokeStyle = bgColor;
      ctx.lineWidth = 1.5;
      ctx.stroke();

      startAngle += slice;
    });

    // Donut hole
    ctx.beginPath();
    ctx.arc(cx, cy, innerR, 0, Math.PI * 2);
    ctx.fillStyle = bgColor;
    ctx.fill();

    // Centre: show top item name and its share
    const topItem = items[0];
    const topPct = ((topItem.val / total) * 100).toFixed(0);
    ctx.font = `700 13px ${FONT}`;
    ctx.fillStyle = CHART_PALETTE[0];
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(topPct + '%', cx, cy - 7);
    ctx.font = `500 9px ${FONT}`;
    ctx.fillStyle = mutedColor;
    const centreLabel = topItem.name.length > 10 ? topItem.name.slice(0, 9) + '…' : topItem.name;
    ctx.fillText(centreLabel, cx, cy + 7);

    // Legend: name left, value + pct right
    const lx = PAD + SIZE + 10;
    const lyStart = TITLE_H + PAD + Math.max(0, (SIZE - legendH) / 2);
    items.forEach((item, i) => {
      const ly = lyStart + i * LEGEND_ROW_H;
      const color = CHART_PALETTE[i % CHART_PALETTE.length];
      const pct = ((item.val / total) * 100).toFixed(1);
      const valLabel = item.val >= 1000 ? fmtDollar(Math.round(item.val)) : pct + '%';

      // Colour dot
      ctx.beginPath();
      ctx.arc(lx + 5, ly + 10, 4, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.globalAlpha = i === 0 ? 1 : 0.8;
      ctx.fill();
      ctx.globalAlpha = 1;

      // Asset name
      ctx.font = i === 0 ? `600 10.5px ${FONT}` : `500 10.5px ${FONT}`;
      ctx.fillStyle = i === 0 ? titleColor : textColor;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      const label = item.name.length > 13 ? item.name.slice(0, 11) + '…' : item.name;
      ctx.fillText(label, lx + 13, ly + 10);

      // Value on the right (dollar if large, percent otherwise)
      ctx.font = `600 10px ${FONT}`;
      ctx.fillStyle = color;
      ctx.textAlign = 'right';
      ctx.fillText(valLabel, W - PAD, ly + 10);
    });

    container.appendChild(canvas);
  }

  // ── Line chart renderer — supports multiple series ──────────────────────────
  function renderLineChart(container, seriesArr, chartTitle, seedNote) {
    if (!seriesArr || !seriesArr.length) return;

    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const FONT = `-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
    const multiSeries = seriesArr.length > 1;

    const LEGEND_H = multiSeries ? 18 * Math.ceil(seriesArr.length / 3) + 6 : 0;
    const PAD_L  = 54;
    const PAD_R  = 14;
    const PAD_T  = chartTitle ? 30 : 12;
    const PAD_B  = 28;
    const W = 340;
    const H = 160 + LEGEND_H;
    const chartW = W - PAD_L - PAD_R;
    const chartH = H - PAD_T - PAD_B - LEGEND_H;

    const canvas = document.createElement('canvas');
    const ratio = window.devicePixelRatio || 1;
    canvas.width  = W * ratio;
    canvas.height = H * ratio;
    canvas.style.width  = W + 'px';
    canvas.style.height = H + 'px';
    canvas.className = 'chat-chart-canvas';
    const ctx = canvas.getContext('2d');
    ctx.scale(ratio, ratio);

    const textColor  = isDark ? '#94a3b8' : '#64748b';
    const titleColor = isDark ? '#e2e6f0' : '#0f1523';
    const gridColor  = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)';

    // Series colours — reuse chart palette
    const SERIES_COLORS = ['#2563eb','#059669','#d97706','#dc2626','#0891b2','#db2777'];

    ctx.clearRect(0, 0, W, H);

    if (chartTitle) {
      ctx.font = `700 12px ${FONT}`;
      ctx.fillStyle = titleColor;
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'left';
      ctx.fillText(chartTitle, PAD_L, PAD_T / 2);
    }

    // Compute global min/max across all series
    const allVals = seriesArr.flatMap(s => s.points.map(p => p.val));
    const maxVal = Math.max(...allVals);
    const minVal = Math.min(...allVals);
    const range  = maxVal - minVal || 1;

    // Use the first series' x-axis labels (horizons should be aligned)
    const xLabels = seriesArr[0].points.map(p => p.label);
    const numPts  = xLabels.length;

    const toX = (i) => PAD_L + (numPts <= 1 ? chartW / 2 : (i / (numPts - 1)) * chartW);
    const toY = (v) => PAD_T + chartH - ((v - minVal) / range) * chartH;

    // Grid lines (3)
    [0, 0.5, 1].forEach(t => {
      const gv = minVal + t * range;
      const gy = toY(gv);
      ctx.beginPath();
      ctx.moveTo(PAD_L, gy);
      ctx.lineTo(PAD_L + chartW, gy);
      ctx.strokeStyle = gridColor;
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.font = `500 9px ${FONT}`;
      ctx.fillStyle = textColor;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.fillText(fmtDollar(Math.round(gv)), PAD_L - 4, gy);
    });

    // Draw each series
    seriesArr.forEach((s, si) => {
      const color = SERIES_COLORS[si % SERIES_COLORS.length];
      const pts   = s.points;
      if (!pts.length) return;

      // Area fill (only for single series to avoid clutter)
      if (!multiSeries) {
        const areaTop = isDark ? 'rgba(37,99,235,0.25)' : 'rgba(37,99,235,0.12)';
        const grad = ctx.createLinearGradient(0, PAD_T, 0, PAD_T + chartH);
        grad.addColorStop(0, areaTop);
        grad.addColorStop(1, 'rgba(37,99,235,0)');
        ctx.beginPath();
        ctx.moveTo(toX(0), toY(pts[0].val));
        pts.forEach((p, i) => { if (i > 0) ctx.lineTo(toX(i), toY(p.val)); });
        ctx.lineTo(toX(pts.length - 1), PAD_T + chartH);
        ctx.lineTo(toX(0), PAD_T + chartH);
        ctx.closePath();
        ctx.fillStyle = grad;
        ctx.fill();
      }

      // Line
      ctx.beginPath();
      ctx.moveTo(toX(0), toY(pts[0].val));
      pts.forEach((p, i) => { if (i > 0) ctx.lineTo(toX(i), toY(p.val)); });
      ctx.strokeStyle = color;
      ctx.lineWidth = multiSeries ? 1.8 : 2;
      ctx.lineJoin = 'round';
      ctx.stroke();

      // Dots
      pts.forEach((p, i) => {
        const x = toX(i);
        const y = toY(p.val);
        ctx.beginPath();
        ctx.arc(x, y, 3, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();
        ctx.strokeStyle = isDark ? '#111623' : '#ffffff';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      });
    });

    // X-axis labels (shared)
    xLabels.forEach((lbl, i) => {
      ctx.font = `500 9px ${FONT}`;
      ctx.fillStyle = textColor;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      const short = lbl.length > 5 ? lbl.slice(0, 4) + '…' : lbl;
      ctx.fillText(short, toX(i), PAD_T + chartH + 4);
    });

    // Legend for multi-series
    if (multiSeries) {
      const legendY = PAD_T + chartH + PAD_B - 4;
      let lx = PAD_L;
      let ly = legendY;
      const rowMaxWidth = W - PAD_L - PAD_R;
      seriesArr.forEach((s, si) => {
        if (!s.name) return;
        const color = SERIES_COLORS[si % SERIES_COLORS.length];
        ctx.font = `500 9.5px ${FONT}`;
        const labelW = ctx.measureText(s.name).width + 22;
        if (lx + labelW > PAD_L + rowMaxWidth && lx > PAD_L) {
          lx = PAD_L;
          ly += 16;
        }
        // Colour swatch
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.roundRect ? ctx.roundRect(lx, ly + 2, 10, 6, 2) : ctx.rect(lx, ly + 2, 10, 6);
        ctx.fill();
        // Label
        ctx.fillStyle = textColor;
        ctx.textBaseline = 'middle';
        ctx.textAlign = 'left';
        ctx.fillText(s.name, lx + 13, ly + 5);
        lx += labelW;
      });
    }

    container.appendChild(canvas);

    if (seedNote) {
      const note = document.createElement('div');
      note.className = 'chat-chart-note';
      note.textContent = seedNote;
      container.appendChild(note);
    }
  }

  function getSeedNote(text) {
    // Try to detect which horizon(s) are referenced in the text
    const horizons = [];
    if (/\b20.?yr|\b20.?year/i.test(text)) horizons.push('20yr');
    else if (/\b15.?yr|\b15.?year/i.test(text)) horizons.push('15yr');
    else if (/\b10.?yr|\b10.?year/i.test(text)) horizons.push('10yr');
    else if (/\b5.?yr|\b5.?year/i.test(text)) horizons.push('5yr');
    else if (/\b1.?yr|\b1.?year/i.test(text)) horizons.push('1yr');
    const seed = (typeof window.seedMultiplier !== 'undefined')
      ? Math.round(1000 * window.seedMultiplier).toLocaleString()
      : '1,000';
    const horizonStr = horizons.length ? `over ${horizons[0]}` : 'across shown horizons';
    return `Based on a $${seed} seed investment ${horizonStr}`;
  }

  function addRateLimitMsg() {
    const msg = el('div', 'chat-msg bot chat-msg-rate-limit', body);
    msg.innerHTML = `
      <div class="chat-rl-icon">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
      </div>
      <div class="chat-rl-text">
        <strong>Daily AI limit reached</strong><br>
        Your IP address has exceeded the AI Advanced messages for today.
        <a href="#about" class="chat-rl-link">Contact the site owner here</a>
        to get access restored.
      </div>`;
    const rlLink = msg.querySelector('.chat-rl-link');
    if (rlLink) {
      rlLink.addEventListener('click', (e) => {
        e.preventDefault();
        closeChat();
        // Try to open the about modal if it exists on the page
        const aboutModal = document.getElementById('about-modal') || document.querySelector('[data-modal="about"]');
        if (aboutModal) {
          aboutModal.classList.add('open');
          aboutModal.setAttribute('aria-hidden', 'false');
        } else {
          // Fallback: scroll to about section or navigate
          const aboutSection = document.getElementById('about') || document.querySelector('[data-section="about"]');
          if (aboutSection) aboutSection.scrollIntoView({ behavior: 'smooth' });
        }
      });
    }
    msg.scrollIntoView({ behavior: 'smooth', block: 'start' });
    remainingCalls = 0;
    updateCallCounter();
  }

  function addBotMsg(input, opts) {
    // Accept either a plain string or {reply, reasoning} object from fetchAIAnswer
    const rawText   = (input && typeof input === 'object') ? (input.reply || '') : (input || '');
    const reasoning = (input && typeof input === 'object' && input.reasoning) ? input.reasoning : '';
    const noChart   = !!(opts && opts.noChart);
    const aiResponse = !!(opts && opts.aiResponse);

    // Split off the CHART DATA: section so it doesn't appear in the displayed message
    const { clean: text, chartSection } = splitChartSection(rawText);

    const msg = el('div', 'chat-msg bot', body);

    // Render collapsible reasoning block if thinking content was returned
    if (reasoning) {
      const thinkWrap = el('div', 'chat-think-wrap', msg);
      const thinkHeader = el('button', 'chat-think-header', thinkWrap);
      thinkHeader.setAttribute('aria-expanded', 'false');
      thinkHeader.innerHTML = `<svg class="chat-think-chevron" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg><span>View reasoning</span>`;
      const thinkBody = el('div', 'chat-think-body', thinkWrap);
      // Show a trimmed, readable version of the raw reasoning chain
      const trimmed = reasoning.length > 800 ? reasoning.slice(0, 800) + '…' : reasoning;
      thinkBody.textContent = trimmed;
      thinkHeader.addEventListener('click', () => {
        const open = thinkHeader.getAttribute('aria-expanded') === 'true';
        thinkHeader.setAttribute('aria-expanded', String(!open));
        thinkBody.classList.toggle('open', !open);
        thinkHeader.querySelector('span').textContent = open ? 'View reasoning' : 'Hide reasoning';
      });
    }

    const textEl = el('div', 'chat-msg-text', msg);
    textEl.innerHTML = formatBotText(text);

    // Attempt to draw an inline chart — skip for intro/re-engagement messages
    if (!noChart) {
      let chartData = extractChartData(rawText, lastUserQuestion);

      // Fallback chart: only for local (non-AI) responses. When the AI is connected
      // but omits or mis-formats the CHART DATA block, use a generic top-assets chart.
      // (Prose-derived charts from extractChartData are still shown for AI responses.)
      if (!chartData && !aiResponse) {
        const fallbackAssets = getAssets();
        if (fallbackAssets && fallbackAssets.length >= 2) {
          const top = fallbackAssets
            .filter(a => a.v10 && !isNaN(a.v10))
            .sort((a, b) => b.v10 - a.v10)
            .slice(0, 7);
          if (top.length >= 2) {
            chartData = { type: 'ranked', items: top.map(a => ({ name: a.name, val: Number(a.v10) })) };
          }
        }
      }

      if (chartData) {
        let chartTitle;
        if (chartData.type === 'line') {
          // For line charts, use the series name or derive from the question
          const seriesName = chartData.series && chartData.series[0] && chartData.series[0].name;
          chartTitle = seriesName || (lastUserQuestion
            ? lastUserQuestion.replace(/^(how|show|what|tell me about|give me)\s+(did|has|is|are|were)?\s*/i, '').replace(/[?!.]+$/, '').replace(/\b\w/g, c => c.toUpperCase()).slice(0, 40)
            : 'Returns Over Time');
        } else {
          const titleMatch = (lastUserQuestion + ' ' + text).match(/top \d+|best \d+|worst \d+|ranked|comparison|compare|breakdown|category|class|horizon|growth|trend/i);
          chartTitle = titleMatch ? titleMatch[0].replace(/\b\w/g, c => c.toUpperCase()) : 'Top 10yr Returns';
        }
        const chartWrap = el('div', 'chat-chart-wrap', msg);
        renderChatChart(chartWrap, chartData, chartTitle, getSeedNote(text));
      }
    }

    // Scroll so the TOP of the new message is visible
    msg.scrollIntoView({ behavior: 'smooth', block: 'start' });
    playBeep();
    ttsSpeak(text);
    refreshQuickPills();
  }

  function addUserMsg(text) {
    const msg = el('div', 'chat-msg user', body);
    msg.textContent = text;
    msg.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function showTyping(show, isAI) {
    if (show) {
      if (isAI) {
        // AI thinking mode — pulsing brain indicator
        typingEl = el('div', 'chat-thinking', body);
        typingEl.innerHTML = `
          <div class="chat-thinking-icon">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><circle cx="12" cy="12" r="10"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
          </div>
          <div class="chat-thinking-text">
            <span class="chat-thinking-label">Thinking</span><span class="chat-thinking-dots"><span>.</span><span>.</span><span>.</span></span>
          </div>`;
      } else {
        typingEl = el('div', 'chat-typing', body);
        typingEl.innerHTML = '<span></span><span></span><span></span>';
      }
      body.scrollTop = body.scrollHeight;
    } else if (typingEl) {
      typingEl.remove();
      typingEl = null;
    }
  }

  function autoGrow() {
    textarea.style.height = 'auto';
    textarea.style.height = Math.min(textarea.scrollHeight, 110) + 'px';
  }

  function el(tag, cls, parent) {
    const e = document.createElement(tag);
    if (cls) e.className = cls.trim();
    if (parent) parent.appendChild(e);
    return e;
  }

  // ── Public API ───────────────────────────────────────────────
  // Exposed so other scripts (e.g. app.js) can open the chat and fire a prompt programmatically.
  // opts.pinnedAssets: optional array of raw asset objects to use as context (bypasses keyword matching)
  // opts.chartPrompt: true when triggered from a data-viz Analyse button — skips keyword fallback on AI failure
  window.openChatWithPrompt = async function(displayText, promptText, opts) {
    if (!win) return; // not yet initialised
    // opts can be an array (legacy pinnedAssets) or an object with named options
    const pinnedAssets = Array.isArray(opts) ? opts : (opts && opts.pinnedAssets) || null;
    const isChartPrompt = opts && !Array.isArray(opts) && opts.chartPrompt === true;

    // Use promptText as the AI query if provided; displayText is shown in the bubble
    const aiQuery = promptText || displayText;
    const userDisplay = displayText || promptText;

    // Defer past the current click event so the click-outside handler doesn't immediately close us
    await new Promise(r => setTimeout(r, 50));
    if (!isOpen) openChat();

    // Small delay so the chat window renders before message appears
    await new Promise(r => setTimeout(r, 150));

    if (isBlockedInput(aiQuery)) return;
    lastUserQuestion = aiQuery;
    addUserMsg(userDisplay);
    pushHistory('user', aiQuery);
    showTyping(true, aiAvailable);
    setSendDisabled(true);

    let answer = null;
    // Try AI whenever it's not explicitly unavailable (null = not-yet-probed, still worth trying)
    const aiWasAttempted = aiAvailable !== false;
    if (aiWasAttempted) answer = await fetchAIAnswer(aiQuery, chatHistory.slice(0, -1), pinnedAssets || null, isChartPrompt);

    showTyping(false);
    setSendDisabled(false);

    if (isRateLimited(answer)) {
      addRateLimitMsg();
      return;
    }

    const triggerUsedAI = !!answer;

    if (!answer) {
      if (pinnedAssets && pinnedAssets.length) {
        // Compare flow: use deterministic local comparison rather than keyword-matching a complex prompt
        answer = localComparePinned(pinnedAssets);
      } else if (isChartPrompt && aiWasAttempted) {
        // AI was connected but returned nothing for this chart prompt — keyword matching would
        // produce a misleading canned response. Ask the user to retry instead.
        answer = 'The AI did not return a response for this question. Please try again in a moment.';
      } else {
        answer = answerFreeText(aiQuery);
      }
    }

    addBotMsg(answer, { aiResponse: triggerUsedAI });
    const replyStr = (answer && typeof answer === 'object') ? answer.reply : answer;
    const replyReasoning4 = (answer && typeof answer === 'object') ? answer.reasoning : '';
    pushHistory('assistant', replyStr, replyReasoning4);
    showFollowUpPills(generateFollowUps(aiQuery, replyStr));
    resetInactivity();
  };

  // ── Bootstrap ────────────────────────────────────────────────
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
