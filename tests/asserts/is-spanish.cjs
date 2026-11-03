// Cheap language check: Spanish function words must clearly outnumber English ones.
const ES = ['el', 'la', 'los', 'las', 'de', 'que', 'y', 'en', 'un', 'una', 'para', 'con', 'por', 'es', 'tu', 'puedes', 'acorde', 'acordes'];
const EN = ['the', 'and', 'of', 'to', 'in', 'is', 'you', 'your', 'for', 'with', 'this', 'that', 'chord', 'chords'];
module.exports = (output) => {
  const words = output.toLowerCase().match(/[a-záéíóúñü]+/g) ?? [];
  const count = (list) => words.filter((w) => list.includes(w)).length;
  const es = count(ES);
  const en = count(EN);
  return { pass: es > en * 2, score: es / Math.max(es + en, 1), reason: `Spanish markers ${es}, English markers ${en}` };
};
