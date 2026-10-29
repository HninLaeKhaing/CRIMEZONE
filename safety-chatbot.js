'use strict';

(() => {
  const root = document.createElement('aside');
  root.id = 'cz-safety-chat';
  root.setAttribute('aria-label', 'CrimeZone safety chatbot');
  root.innerHTML = `
    <section class="cz-chat-panel" id="cz-chat-panel" role="dialog" aria-labelledby="cz-chat-title" aria-modal="false" hidden>
      <header class="cz-chat-header">
        <div class="cz-chat-heading">
          <img class="cz-chat-avatar" src="/Neon%20Shielded%20Woman%20App%20Icon.png" alt="" />
          <div>
            <h2 class="cz-chat-title" id="cz-chat-title">CrimeZone Safety Guide</h2>
            <p class="cz-chat-subtitle">Practical safety information</p>
          </div>
        </div>
        <button class="cz-chat-close" type="button" aria-label="Close chat">
          <svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="m5 5 10 10M15 5 5 15"/></svg>
        </button>
      </header>
      <div class="cz-chat-messages" role="log" aria-live="polite" aria-relevant="additions text">
        <div class="cz-chat-message">Hi! I can share general safety tips, reporting options, and what to do in common situations. What would you like help with?</div>
        <div class="cz-chat-quick-prompts" aria-label="Suggested questions">
          <button class="cz-chat-prompt" type="button">I feel unsafe right now</button>
          <button class="cz-chat-prompt" type="button">How do I report cyber fraud?</button>
          <button class="cz-chat-prompt" type="button">Tips for safer travel</button>
          <button class="cz-chat-prompt" type="button">How can I report an incident?</button>
        </div>
      </div>
      <p class="cz-chat-disclaimer">General guidance only — not emergency services, legal advice, or live crime-case information.</p>
      <form class="cz-chat-form">
        <input class="cz-chat-input" type="text" maxlength="500" autocomplete="off" placeholder="Ask a safety question…" aria-label="Ask a safety question" />
        <button class="cz-chat-send" type="submit" aria-label="Send message">
          <svg viewBox="0 0 20 20" width="19" height="19" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m17 3-6.2 14-2.5-6.3L2 8.2 17 3Z"/><path d="m8.3 10.7 4.2-4.2"/></svg>
        </button>
      </form>
    </section>
    <button class="cz-chat-launcher" type="button" aria-label="Open CrimeZone safety chat. Drag to move or hold Shift and use the arrow keys." aria-controls="cz-chat-panel" aria-expanded="false">
      <img src="/Neon%20Shielded%20Woman%20App%20Icon.png" alt="" />
    </button>`;
  document.body.append(root);

  const panel = root.querySelector('.cz-chat-panel');
  const launcher = root.querySelector('.cz-chat-launcher');
  const closeButton = root.querySelector('.cz-chat-close');
  const messages = root.querySelector('.cz-chat-messages');
  const form = root.querySelector('.cz-chat-form');
  const input = root.querySelector('.cz-chat-input');
  const quickPrompts = root.querySelector('.cz-chat-quick-prompts');
  let suppressClick = false;
  let dragState = null;

  function addMessage(text, sender) {
    const message = document.createElement('div');
    message.className = `cz-chat-message${sender === 'user' ? ' cz-chat-message-user' : ''}`;
    message.textContent = text;
    messages.append(message);
    messages.scrollTop = messages.scrollHeight;
  }

  function getAnswer(question) {
    const text = question.toLowerCase();
    const matches = (...terms) => terms.some((term) => text.includes(term));

    if (matches('help me now', 'right now', 'in danger', 'unsafe right now', 'being followed', 'someone is following', 'attacking me', 'emergency', 'immediate danger')) {
      return 'If you are in immediate danger in India, call 112 now if you can. Move toward a staffed, well-lit public place and alert someone you trust. Do not confront the person. If calling is unsafe, ask a nearby person or security staff to call for you. This chat cannot contact emergency services.';
    }
    if (matches('avoid police', 'get away with', 'hide evidence', 'commit a crime', 'break into', 'hurt someone', 'make a weapon')) {
      return 'I can’t help plan or conceal harm or crime. If this is about a conflict or an unsafe situation, I can help with de-escalation, finding support, or reporting it safely.';
    }
    if (matches('cyber fraud', 'cybercrime', 'online fraud', 'upi fraud', 'scam', 'phishing', 'hacked', 'otp', 'online harassment', 'account stolen')) {
      return 'For suspected cyber fraud in India, contact your bank or payment provider immediately to block transactions, preserve messages and transaction IDs, and report it at cybercrime.gov.in or call the national cyber-fraud helpline 1930 as soon as possible. Never share an OTP, PIN, or password. If an account is compromised, change its password from a trusted device and enable two-factor authentication.';
    }
    if (matches('harass', 'stalk', 'threaten', 'blackmail', 'domestic violence', 'abuse', 'assault', 'molest')) {
      return 'Prioritize getting to a place where you feel safer and tell someone you trust. If there is immediate danger in India, call 112. Save threatening messages or other evidence only if it is safe; avoid confronting the person alone. You can contact local police or a support service to discuss confidential options. If you share your country or region, I can help identify relevant official resources.';
    }
    if (matches('travel', 'route', 'walking alone', 'commute', 'journey', 'taxi', 'cab', 'rideshare', 'public transport')) {
      return 'Before travelling, plan a route and a backup, keep your phone charged, and let someone you trust know your expected arrival. Use well-lit, populated routes where possible; check the vehicle and driver details before getting in, and share trip status with a trusted person. If a situation feels wrong, move to a staffed public place and contact someone you trust.';
    }
    if (matches('report', 'file a complaint', 'police', 'incident')) {
      return 'If anyone is in immediate danger in India, call 112 first. Otherwise, write down what happened, when and where, and preserve relevant messages or documents without altering them. Contact your local police station or the appropriate official reporting channel; ask for an acknowledgement or reference number. Only share personal details or evidence through official channels. CrimeZone community reports are not verified police reports.';
    }
    if (matches('evidence', 'preserve', 'proof', 'witness')) {
      return 'If it is safe, keep original messages, emails, photos, transaction references, and dates; avoid editing or publicly posting them. Note witness contact details only with their consent. Do not put yourself at risk to collect evidence, and share it with the relevant official authority rather than posting sensitive details online.';
    }
    if (matches('home', 'house', 'apartment', 'neighbourhood', 'neighborhood', 'break-in', 'burglary')) {
      return 'For home safety, check that doors and windows are secured, use outdoor lighting where practical, and avoid sharing travel plans or access codes publicly. Get to a safer place and contact local emergency services if someone is trying to enter. Do not confront an intruder.';
    }
    if (matches('crime case', 'criminal case', 'case details', 'case status', 'suspect', 'criminal record', 'crime rate', 'crime data', 'crime statistics')) {
      return 'I don’t have live access to police records, current cases, or verified local crime data, and I shouldn’t guess about a person or allegation. Check official police or court sources for case information. CrimeZone community reports are unverified and should not be treated as proof that a crime occurred.';
    }
    if (matches('legal', 'lawyer', 'law', 'rights', 'legal advice', 'what happens if')) {
      return 'I can share general safety information, but I can’t give legal advice and laws vary by location. For advice about your situation, contact a qualified local lawyer, legal-aid service, or the relevant official authority. If there is immediate danger, contact local emergency services.';
    }
    if (matches('tip', 'safety', 'safe', 'protect', 'prevent')) {
      return 'A few useful basics: stay aware of your surroundings, keep your phone charged, share plans with someone you trust, use well-lit public routes where possible, and trust your instincts if a situation feels unsafe. In immediate danger in India, call 112. Tell me the situation (travel, home, online, or something else) for more specific general tips.';
    }
    return 'I can help with general personal safety, travel, home security, cyber fraud, reporting an incident, or finding official resources. I don’t have live crime records and can’t provide legal advice. Which topic is closest to what you need? If you are in immediate danger in India, call 112.';
  }

  function positionPanel() {
    if (panel.hidden) return;
    const rootRect = root.getBoundingClientRect();
    const panelWidth = panel.getBoundingClientRect().width;
    const desiredLeft = rootRect.left + rootRect.width / 2 - panelWidth / 2;
    const viewportMargin = 16;
    const left = Math.max(viewportMargin, Math.min(desiredLeft, window.innerWidth - panelWidth - viewportMargin));
    panel.style.left = `${left - rootRect.left}px`;
    panel.style.right = 'auto';

    const panelHeight = panel.getBoundingClientRect().height;
    const roomAbove = rootRect.top - 30;
    const roomBelow = window.innerHeight - rootRect.top - 88;
    if (roomAbove >= 180 || roomAbove > roomBelow) {
      panel.style.top = 'auto';
      panel.style.bottom = '72px';
      panel.style.maxHeight = `min(540px, ${Math.max(180, roomAbove)}px)`;
    } else {
      panel.style.top = '72px';
      panel.style.bottom = 'auto';
      panel.style.maxHeight = `min(540px, ${Math.max(180, roomBelow)}px)`;
    }
  }

  function setOpen(open) {
    panel.hidden = !open;
    launcher.setAttribute('aria-expanded', String(open));
    if (open) {
      positionPanel();
      input.focus();
    } else {
      launcher.focus();
    }
  }

  launcher.addEventListener('click', () => {
    if (suppressClick) {
      suppressClick = false;
      return;
    }
    setOpen(panel.hidden);
  });
  closeButton.addEventListener('click', () => setOpen(false));
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !panel.hidden) setOpen(false);
  });
  window.addEventListener('resize', positionPanel);

  function submitQuestion(question) {
    const trimmed = question.trim();
    if (!trimmed) return;
    addMessage(trimmed, 'user');
    addMessage(getAnswer(trimmed), 'assistant');
    input.value = '';
    input.focus();
  }

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    submitQuestion(input.value);
  });
  quickPrompts.addEventListener('click', (event) => {
    const button = event.target.closest('button');
    if (button) submitQuestion(button.textContent);
  });

  launcher.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    dragState = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      left: root.getBoundingClientRect().left,
      top: root.getBoundingClientRect().top,
      moved: false,
    };
    launcher.setPointerCapture(event.pointerId);
  });
  launcher.addEventListener('pointermove', (event) => {
    if (!dragState || dragState.pointerId !== event.pointerId) return;
    const deltaX = event.clientX - dragState.startX;
    const deltaY = event.clientY - dragState.startY;
    if (!dragState.moved && Math.hypot(deltaX, deltaY) < 6) return;
    dragState.moved = true;
    const maxLeft = Math.max(8, window.innerWidth - root.offsetWidth - 8);
    const maxTop = Math.max(8, window.innerHeight - root.offsetHeight - 8);
    root.dataset.positioned = 'true';
    root.style.left = `${Math.max(8, Math.min(dragState.left + deltaX, maxLeft))}px`;
    root.style.top = `${Math.max(8, Math.min(dragState.top + deltaY, maxTop))}px`;
    if (!panel.hidden) positionPanel();
  });
  function finishDrag(event) {
    if (!dragState || dragState.pointerId !== event.pointerId) return;
    suppressClick = dragState.moved;
    dragState = null;
  }
  launcher.addEventListener('pointerup', finishDrag);
  launcher.addEventListener('pointercancel', finishDrag);
  launcher.addEventListener('keydown', (event) => {
    if (!event.shiftKey || !['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) return;
    event.preventDefault();
    const rect = root.getBoundingClientRect();
    const offsets = {
      ArrowUp: [0, -16],
      ArrowDown: [0, 16],
      ArrowLeft: [-16, 0],
      ArrowRight: [16, 0],
    };
    const [dx, dy] = offsets[event.key];
    root.dataset.positioned = 'true';
    root.style.left = `${Math.max(8, Math.min(rect.left + dx, window.innerWidth - root.offsetWidth - 8))}px`;
    root.style.top = `${Math.max(8, Math.min(rect.top + dy, window.innerHeight - root.offsetHeight - 8))}px`;
    if (!panel.hidden) positionPanel();
  });
})();
