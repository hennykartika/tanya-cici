/**
 * Offline provider used by tests and by `PROVIDER=mock`.
 *
 * It keeps the UI fully workable without an API key and without sending a
 * single byte to a third party, which is also how front-end changes are
 * reviewed locally.
 */
const CANNED = [
  {
    match: /baju|lemari|outfit/i,
    reply: [
      'Ini keluhan sejuta umat, bestie.',
      '',
      'Lemarimu nggak kosong, yang kosong itu **ide outfit**-nya. Makin banyak pilihan, makin lama mutusinnya, ujungnya balik ke baju yang itu-itu lagi.',
      '',
      '- Siapkan 3-5 set andalan, foto, simpan di satu album',
      '- Gantung baju yang jarang dipakai di barisan depan',
      '- Tiap beli baju, cek dulu bisa dipadukan dengan minimal 3 baju lain',
      '',
      'Jadi kamu bukan kurang baju, cuma butuh keputusan yang sudah dibuat dari semalam.',
    ].join('\n'),
  },
  {
    match: /juta|duit|uang|budget/i,
    reply: [
      'Oke, kita hitung pakai dua versi.',
      '',
      'Versi hati: 1 juta masuk tabungan, **500 ribu** sisanya dianggap "uang bonus". Di psikologi ini mirip mental accounting, uang yang sama diberi label berbeda.',
      '',
      'Versi realistis, aturan 50/30/20:',
      '- 750 ribu kebutuhan',
      '- 450 ribu keinginan',
      '- 300 ribu tabungan',
      '',
      'Dua-duanya sah, tinggal pilih mana yang bikin kamu tenang pas akhir bulan.',
    ].join('\n'),
  },
];

const FALLBACK = [
  'Mode demo aktif, jadi Cici jawab pakai contoh yang sudah disiapkan.',
  '',
  'Isi jawaban aslinya baru muncul kalau `PROVIDER=gemini` dan API key sudah dipasang.',
].join('\n');

export function createMockProvider({ latencyMs = 0 } = {}) {
  return {
    name: 'mock',
    async generate({ messages }) {
      if (latencyMs > 0) await new Promise((resolve) => setTimeout(resolve, latencyMs));
      const lastUserMessage = messages.at(-1)?.text ?? '';
      const canned = CANNED.find((entry) => entry.match.test(lastUserMessage));
      return {
        text: canned?.reply ?? FALLBACK,
        model: 'mock',
        usage: { promptTokens: 0, responseTokens: 0 },
      };
    },
  };
}
