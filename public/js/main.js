import { sendChat } from './api.js';
import { DEFAULT_VIBE, PLACEHOLDERS, QUESTION_POOL, STATUS_BUSY, STATUS_IDLE, VIBE_TOASTS } from './content.js';
import { buildBackground, hasCoarsePointer, heartBurst, shuffle } from './effects.js';
import { loadState, saveState } from './storage.js';
import {
  createBotMessage,
  createErrorMessage,
  createToaster,
  createTypingIndicator,
  createUserMessage,
} from './ui.js';

const MAX_MESSAGE_CHARS = 1000;
const CHIPS_DESKTOP = 6;
const CHIPS_MOBILE = 4;

const elements = {
  chat: document.querySelector('#chat'),
  messages: document.querySelector('#messages'),
  welcome: document.querySelector('#welcome'),
  chips: document.querySelector('#chips'),
  shuffleButton: document.querySelector('#shuffleBtn'),
  form: document.querySelector('#composer'),
  input: document.querySelector('#input'),
  sendButton: document.querySelector('#sendBtn'),
  resetButton: document.querySelector('#resetBtn'),
  gate: document.querySelector('#gate'),
  gateCard: document.querySelector('#gateCard'),
  guestBadge: document.querySelector('#guestBadge'),
  headerAvatar: document.querySelector('#headerAvatar'),
  statusText: document.querySelector('#statusText'),
  toast: document.querySelector('#toast'),
  background: document.querySelector('#bgDeco'),
};

const toast = createToaster(elements.toast);
const stored = loadState();

const state = {
  messages: stored.messages,
  vibe: VIBE_TOASTS[stored.vibe] ? stored.vibe : DEFAULT_VIBE,
  gate: stored.gate,
  busy: false,
};

const persist = () => saveState({ messages: state.messages, vibe: state.vibe, gate: state.gate });

/* ------------------------------ scrolling ------------------------------ */

const isNearBottom = () =>
  elements.chat.scrollHeight - elements.chat.scrollTop - elements.chat.clientHeight < 120;

function scrollToBottom({ force = false } = {}) {
  if (force || isNearBottom()) elements.chat.scrollTop = elements.chat.scrollHeight;
}

/**
 * Follows a streaming reply but stops once the question that triggered it would
 * scroll off the top, so long answers stay readable from their first line.
 */
function followReply(row) {
  const anchor = row.previousElementSibling ?? row;
  const offset =
    anchor.getBoundingClientRect().top - elements.chat.getBoundingClientRect().top + elements.chat.scrollTop;
  const target = Math.min(elements.chat.scrollHeight - elements.chat.clientHeight, offset - 12);
  if (target > elements.chat.scrollTop) elements.chat.scrollTop = target;
}

/* ------------------------------ rendering ------------------------------ */

function renderChips() {
  const count = window.innerWidth < 560 ? CHIPS_MOBILE : CHIPS_DESKTOP;
  elements.chips.replaceChildren();

  for (const [index, question] of shuffle(QUESTION_POOL).slice(0, count).entries()) {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'chip';
    chip.textContent = question;
    chip.style.animationDelay = `${index * 50}ms`;
    chip.addEventListener('click', () => submitMessage(question, chip));
    elements.chips.append(chip);
  }
}

function renderConversation() {
  elements.messages.replaceChildren();
  elements.welcome.hidden = state.messages.length > 0;

  for (const message of state.messages) {
    elements.messages.append(
      message.role === 'user' ? createUserMessage(message.text) : createBotMessage(message.text),
    );
  }

  if (state.messages.at(-1)?.role === 'user') {
    elements.messages.append(
      createErrorMessage('Pertanyaan terakhirmu belum sempat dijawab nih.', requestReply),
    );
  }

  if (state.messages.length > 0) scrollToBottom({ force: true });
  else elements.chat.scrollTop = 0;
}

function setBusy(busy) {
  state.busy = busy;
  elements.sendButton.disabled = busy;
  elements.chat.setAttribute('aria-busy', String(busy));
  elements.statusText.textContent = busy ? STATUS_BUSY : STATUS_IDLE;
}

function bounceAvatar() {
  elements.headerAvatar.classList.remove('bounce');
  void elements.headerAvatar.offsetWidth;
  elements.headerAvatar.classList.add('bounce');
}

/* ------------------------------ messaging ------------------------------ */

async function requestReply() {
  setBusy(true);
  const typing = createTypingIndicator();
  elements.messages.append(typing.element);
  scrollToBottom({ force: true });

  try {
    const { reply } = await sendChat({
      messages: state.messages,
      vibe: state.vibe,
      guest: state.gate === 'guest',
    });

    state.messages.push({ role: 'bot', text: reply });
    persist();
    typing.remove();

    // The typewriter reports progress with its own row, which is what keeps the
    // question anchored while a long answer is still being revealed.
    elements.messages.append(createBotMessage(reply, { animate: true, onProgress: followReply }));
    bounceAvatar();
  } catch (error) {
    typing.remove();
    elements.messages.append(createErrorMessage(error.message, requestReply));
    scrollToBottom({ force: true });
  } finally {
    setBusy(false);
    if (!hasCoarsePointer) elements.input.focus();
  }
}

function submitMessage(text, originElement) {
  const trimmed = String(text ?? '').trim();
  if (!trimmed || state.busy) return;

  for (const staleError of elements.messages.querySelectorAll('.msg.error')) staleError.remove();

  state.messages.push({ role: 'user', text: trimmed.slice(0, MAX_MESSAGE_CHARS) });
  persist();

  elements.welcome.hidden = true;
  elements.messages.append(createUserMessage(trimmed));
  heartBurst(originElement ?? elements.sendButton, 8);
  elements.input.value = '';
  autoResizeInput();
  requestReply();
}

/* ------------------------------ composer ------------------------------ */

function autoResizeInput() {
  elements.input.style.height = 'auto';
  elements.input.style.height = `${Math.min(elements.input.scrollHeight, 140)}px`;
}

elements.input.addEventListener('input', autoResizeInput);
elements.input.addEventListener('keydown', (event) => {
  // On touch keyboards Enter should insert a newline, not send.
  if (event.key === 'Enter' && !event.shiftKey && !hasCoarsePointer && !event.isComposing) {
    event.preventDefault();
    submitMessage(elements.input.value);
  }
});
elements.form.addEventListener('submit', (event) => {
  event.preventDefault();
  submitMessage(elements.input.value);
});

let placeholderIndex = 0;
setInterval(() => {
  if (document.activeElement === elements.input || elements.input.value) return;
  placeholderIndex = (placeholderIndex + 1) % PLACEHOLDERS.length;
  elements.input.placeholder = PLACEHOLDERS[placeholderIndex];
}, 4000);

elements.shuffleButton.addEventListener('click', (event) => {
  renderChips();
  heartBurst(event.currentTarget, 6);
});

elements.resetButton.addEventListener('click', () => {
  if (state.busy) return;
  if (state.messages.length > 0 && !window.confirm('Mulai obrolan baru? Chat yang sekarang bakal hilang.')) return;
  state.messages = [];
  persist();
  renderChips();
  renderConversation();
  toast('✨ Lembaran baru, bestie!');
});

/* -------------------------------- vibe -------------------------------- */

function applyVibe(vibe, { announce = false } = {}) {
  state.vibe = vibe;
  document.body.dataset.vibe = vibe;
  for (const button of document.querySelectorAll('.vibes [data-vibe]')) {
    button.setAttribute('aria-checked', String(button.dataset.vibe === vibe));
  }
  if (announce) toast(VIBE_TOASTS[vibe]);
  persist();
}

for (const button of document.querySelectorAll('.vibes [data-vibe]')) {
  button.addEventListener('click', () => {
    if (button.dataset.vibe === state.vibe) return;
    applyVibe(button.dataset.vibe, { announce: true });
    heartBurst(button, 6);
  });
}

/* -------------------------------- gate -------------------------------- */

function showGateStep(step) {
  for (const element of elements.gate.querySelectorAll('.gate-step')) {
    element.hidden = element.dataset.step !== step;
  }
  elements.gate.querySelector('.gate-step:not([hidden]) button')?.focus();
}

function closeGate(choice) {
  state.gate = choice;
  elements.guestBadge.hidden = choice !== 'guest';
  persist();
  elements.gate.hidden = true;
  toast(choice === 'guest' ? '📚 Selamat belajar, calon cowok peka!' : '💖 Welcome, bestie!');
  if (!hasCoarsePointer) elements.input.focus();
}

elements.gate.addEventListener('click', (event) => {
  const button = event.target.closest('[data-gate]');
  if (!button) return;

  if (button.dataset.gate === 'girl') {
    heartBurst(button, 12);
    closeGate('girl');
  } else if (button.dataset.gate === 'notgirl') {
    elements.gateCard.classList.remove('shake');
    void elements.gateCard.offsetWidth;
    elements.gateCard.classList.add('shake');
    showGateStep('guest');
  } else {
    closeGate('guest');
  }
});

// Keyboard focus stays inside the dialog while it is open.
elements.gate.addEventListener('keydown', (event) => {
  if (event.key !== 'Tab') return;
  const focusable = [...elements.gate.querySelectorAll('.gate-step:not([hidden]) button')];
  if (focusable.length === 0) return;

  const first = focusable[0];
  const last = focusable.at(-1);
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
});

/* ------------------------------ bootstrap ------------------------------ */

applyVibe(state.vibe);
elements.guestBadge.hidden = state.gate !== 'guest';
buildBackground(elements.background);
renderChips();
renderConversation();

if (!state.gate) {
  elements.gate.hidden = false;
  showGateStep('ask');
}
