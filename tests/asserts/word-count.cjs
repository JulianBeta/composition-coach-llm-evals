// Fails answers longer than the limit (default 400 words; the prompt asks for ~300).
module.exports = (output, context) => {
  const limit = Number(context.config?.limit ?? 400);
  const words = output.trim().split(/\s+/).filter(Boolean).length;
  return { pass: words <= limit, score: Math.min(1, limit / Math.max(words, 1)), reason: `${words} words (limit ${limit})` };
};
