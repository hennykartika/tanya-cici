const HEART_GLYPHS = ['♥', '♡', '✦', '💗', '💖'];
const BACKGROUND_GLYPHS = ['♥', '♡', '✦', '✿', '⋆', '❀'];

export const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
export const hasCoarsePointer = window.matchMedia('(pointer: coarse)').matches;

const pick = (items) => items[Math.floor(Math.random() * items.length)];

export function shuffle(items) {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapWith = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[swapWith]] = [copy[swapWith], copy[index]];
  }
  return copy;
}

export function heartBurst(element, count = 8) {
  if (prefersReducedMotion || !element) return;
  const bounds = element.getBoundingClientRect();
  const originX = bounds.left + bounds.width / 2;
  const originY = bounds.top + bounds.height / 2;

  for (let index = 0; index < count; index += 1) {
    const heart = document.createElement('span');
    heart.className = 'burst';
    heart.textContent = pick(HEART_GLYPHS);
    const angle = (Math.PI * 2 * index) / count + Math.random() * 0.6;
    const distance = 40 + Math.random() * 50;
    heart.style.left = `${originX}px`;
    heart.style.top = `${originY}px`;
    heart.style.setProperty('--dx', `${Math.cos(angle) * distance}px`);
    heart.style.setProperty('--dy', `${Math.sin(angle) * distance - 30}px`);
    heart.style.setProperty('--rot', `${Math.random() * 90 - 45}deg`);
    heart.style.fontSize = `${12 + Math.random() * 10}px`;
    document.body.append(heart);
    setTimeout(() => heart.remove(), 950);
  }
}

export function buildBackground(container) {
  if (prefersReducedMotion || !container) return;
  const count = window.innerWidth < 560 ? 10 : 18;
  for (let index = 0; index < count; index += 1) {
    const glyph = document.createElement('span');
    glyph.textContent = pick(BACKGROUND_GLYPHS);
    glyph.style.left = `${Math.random() * 100}%`;
    glyph.style.fontSize = `${12 + Math.random() * 20}px`;
    glyph.style.animationDuration = `${14 + Math.random() * 16}s`;
    glyph.style.animationDelay = `${-Math.random() * 25}s`;
    container.append(glyph);
  }
}
