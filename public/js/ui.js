import { renderMarkdown } from './markdown.js';
import { TYPING_LINES } from './content.js';
import { heartBurst, prefersReducedMotion, shuffle } from './effects.js';

const TYPEWRITER_STEP_MS = 28;
const TOKENS_PER_STEP = 3;

export function createUserMessage(text) {
  const row = document.createElement('div');
  row.className = 'msg user';
  const bubble = document.createElement('div');
  bubble.className = 'bubble';
  // textContent, never innerHTML: what the user typed is never parsed as markup.
  bubble.textContent = text;
  row.append(bubble);
  return row;
}

export function createBotMessage(text, { animate = false, onProgress } = {}) {
  const row = document.createElement('div');
  row.className = 'msg bot';
  row.innerHTML = `
    <div class="msg-avatar" aria-hidden="true">🎀</div>
    <div class="bubble-wrap">
      <div class="bubble"></div>
      <div class="msg-tools">
        <button type="button" class="tool-btn love">💗 suka</button>
        <button type="button" class="tool-btn copy">📋 salin</button>
      </div>
    </div>`;

  const bubble = row.querySelector('.bubble');
  const tools = row.querySelector('.msg-tools');
  const loveButton = row.querySelector('.love');
  const copyButton = row.querySelector('.copy');

  loveButton.addEventListener('click', () => {
    const liked = loveButton.classList.toggle('loved');
    loveButton.textContent = liked ? '💖 disukai' : '💗 suka';
    if (liked) heartBurst(loveButton, 10);
  });

  copyButton.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(text);
      copyButton.textContent = '✅ tersalin';
    } catch {
      copyButton.textContent = '😿 gagal salin';
    }
    setTimeout(() => {
      copyButton.textContent = '📋 salin';
    }, 1600);
  });

  if (animate && !prefersReducedMotion) {
    tools.hidden = true;
    typewrite(bubble, text, {
      onProgress: () => onProgress?.(row),
      onDone: () => {
        tools.hidden = false;
        onProgress?.(row);
      },
    });
  } else {
    bubble.innerHTML = renderMarkdown(text);
  }

  return row;
}

function typewrite(bubble, text, { onProgress, onDone }) {
  const tokens = text.split(/(\s+)/);
  let index = 0;

  const step = () => {
    index = Math.min(tokens.length, index + TOKENS_PER_STEP);
    bubble.innerHTML = renderMarkdown(tokens.slice(0, index).join(''));
    onProgress?.();
    if (index < tokens.length) {
      setTimeout(step, TYPEWRITER_STEP_MS);
    } else {
      bubble.innerHTML = renderMarkdown(text);
      onDone?.();
    }
  };

  step();
}

export function createTypingIndicator() {
  const row = document.createElement('div');
  row.className = 'msg bot typing';
  row.innerHTML = `
    <div class="msg-avatar" aria-hidden="true">🎀</div>
    <div class="bubble"><span class="hearts" aria-hidden="true"><i>♥</i><i>♥</i><i>♥</i></span><span class="typing-text"></span></div>`;

  const label = row.querySelector('.typing-text');
  const lines = shuffle(TYPING_LINES);
  let cursor = 0;
  label.textContent = lines[0];

  const timer = setInterval(() => {
    cursor = (cursor + 1) % lines.length;
    label.textContent = lines[cursor];
  }, 2200);

  return {
    element: row,
    remove() {
      clearInterval(timer);
      row.remove();
    },
  };
}

export function createErrorMessage(message, onRetry) {
  const row = document.createElement('div');
  row.className = 'msg bot error';
  row.innerHTML = `
    <div class="msg-avatar" aria-hidden="true">🥺</div>
    <div class="bubble-wrap"><div class="bubble"><p></p><button type="button" class="retry-btn">🔁 coba lagi</button></div></div>`;

  row.querySelector('p').textContent = message;
  row.querySelector('.retry-btn').addEventListener('click', () => {
    row.remove();
    onRetry();
  });

  return row;
}

export function createToaster(element) {
  let timer;
  return function toast(message) {
    element.textContent = message;
    element.classList.add('show');
    clearTimeout(timer);
    timer = setTimeout(() => element.classList.remove('show'), 2200);
  };
}
