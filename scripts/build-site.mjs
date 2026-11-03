// Builds the GitHub Pages site: an index with the model comparison plus the full Promptfoo
// HTML reports. Uses fresh CI results when present, otherwise the committed baseline.
// Usage: node scripts/build-site.mjs <eval.json> <eval.html> [redteam.json] [redteam.html]
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { marked } from 'marked';

const [evalJson, evalHtml, rtJson, rtHtml] = process.argv.slice(2);
mkdirSync('site', { recursive: true });
const summarize = (file) => execFileSync('node', ['scripts/summarize.mjs', file], { encoding: 'utf8' });

const sections = [];
copyFileSync(evalHtml, 'site/eval.html');
sections.push(`<h2>Evals <a href="eval.html">full report →</a></h2>`, marked.parse(summarize(evalJson).replace(/^# .*\n/, '')));
if (rtJson && existsSync(rtJson)) {
  copyFileSync(rtHtml, 'site/redteam.html');
  sections.push(`<h2>Red team <a href="redteam.html">full report →</a></h2>`, marked.parse(summarize(rtJson).replace(/^# .*\n/, '')));
}

writeFileSync(
  'site/index.html',
  `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Coda · LLM evals & red team</title>
<style>
  :root { --ink:#011627; --fuchsia:#ff3366; --sea:#2ec4b6; --snow:#f6f7f8; --blue:#20a4f3; }
  body { margin:0; background:var(--ink); color:var(--snow); font:16px/1.6 system-ui, sans-serif; }
  main { max-width: 1000px; margin: 0 auto; padding: 2.5rem 1.25rem 4rem; }
  h1 { font-size: 2.2rem; margin: 0 0 .25rem; } h1 span { color: var(--fuchsia); }
  h2 { margin-top: 2.5rem; border-bottom: 2px solid var(--fuchsia); padding-bottom: .3rem; }
  h2 a, a { color: var(--blue); font-size: 1rem; } p.lead { color: #a7b4c4; }
  table { width: 100%; border-collapse: collapse; margin: 1rem 0; font-size: .92rem; display: block; overflow-x: auto; }
  th, td { padding: .45rem .6rem; border-bottom: 1px solid #1b3d5f; text-align: left; } th { color: var(--sea); }
  .badge { display:inline-block; background: var(--fuchsia); color: var(--ink); font-weight: 700; border-radius: 999px; padding: .1rem .7rem; font-size: .8rem; }
</style></head><body><main>
<p><span class="badge">In progress</span></p>
<h1>Coda <span>·</span> LLM evals &amp; red team</h1>
<p class="lead">A music-composition coach chatbot tested with Promptfoo: Claude Haiku 5.5 (small), Claude Sonnet 5.5 (medium) and Qwen 3.8 27B (free, Groq). Quality, guardrails, LLM-as-a-judge rubrics and red teaming. <a href="https://github.com/JulianBeta/composition-coach-llm-evals">Source on GitHub</a>.</p>
${sections.join('\n')}
<p class="lead">Built by <a href="https://julianbeta.github.io">Julian Betancourt Cuervo</a>.</p>
</main></body></html>`,
);
console.log('site/ built');
