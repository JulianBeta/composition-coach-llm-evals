// Builds the chat sent to every model: Coda's system prompt + the user's message.
// Kept as code (not a JSON template) so the multi-line prompt is never re-escaped.
const fs = require('node:fs');
const path = require('node:path');

const SYSTEM = fs.readFileSync(path.join(__dirname, 'coda-system.md'), 'utf8');

module.exports = function coda({ vars }) {
  return [
    { role: 'system', content: SYSTEM },
    { role: 'user', content: vars.question },
  ];
};
