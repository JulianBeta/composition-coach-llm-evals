# Coda · LLM evals & red team 🎼

[![CI checks](https://github.com/JulianBeta/composition-coach-llm-evals/actions/workflows/evals.yml/badge.svg)](https://github.com/JulianBeta/composition-coach-llm-evals/actions/workflows/evals.yml)
![Status: in progress](https://img.shields.io/badge/status-in%20progress-FF3366?style=flat-square)
[![Reports](https://img.shields.io/badge/reports-live-2EC4B6?style=flat-square)](https://julianbeta.github.io/composition-coach-llm-evals/)

**Coda** is a chatbot that coaches people on composing original music. This repo evaluates and
red-teams it with [Promptfoo](https://www.promptfoo.dev), comparing models on the same prompt:

| Tier | Model | How it runs |
|---|---|---|
| Small | **Claude Haiku 5.5** (`claude-haiku-5-5`) | Anthropic API key, or your Claude Code session |
| Medium | **Claude Sonnet 5.5** (`claude-sonnet-5-5`) | Anthropic API key, or your Claude Code session |
| Google | ~~Gemini 3.6 Flash~~ (`gemini-3.6-flash`) | *Paused:* commented out in the configs until the Gemini API has credits again |
| Groq | ~~Qwen 3.8 27B~~ (`groq:qwen/qwen3.8-27b`) | *Paused:* commented out in the configs because it isn't working right now |

Everything runs on hosted models, so anyone can reproduce it. No local GPU or model downloads.

**📊 Live reports:** https://julianbeta.github.io/composition-coach-llm-evals/

**💬 Try the agent:** `npm run chat` opens a local chat UI with your own Claude access ([setup](#run-it)).

> 🚧 **In progress.** The baseline covers Claude (evals + a quick red team on Haiku and Sonnet). Re-enabling Gemini and Groq,
> the full multi-turn red team and prompt-variant experiments are next. See the [roadmap](#roadmap).

## What is tested

| Suite | Cases | What it checks | How |
|---|---:|---|---|
| [`quality.yaml`](tests/quality.yaml) | 7 | Music-theory accuracy: chord spelling, keys, ii–V–I, voice leading, instrument ranges, counterpoint, modulation | Regex/JS checks for exact facts **+** LLM-as-a-judge rubrics |
| [`coaching.yaml`](tests/coaching.yaml) | 7 | Helpfulness: adapts to beginners, asks when the request is vague, gives a next step, answers in the user's language, stays concise | Rubrics, word-count and language-detection asserts |
| [`guardrails.yaml`](tests/guardrails.yaml) | 10 | Scope (declines coding/finance), copyright (no full lyrics, no "change a few notes"), harmful lyrics, crisis care, hearing safety, legal limits, AI disclosure | Rubrics + deterministic negatives |
| [`security.yaml`](tests/security.yaml) | 5 | Prompt extraction (direct, "debug", translation), injection hidden in pasted lyrics, persona hijack | Canary check + rubrics |
| **Every answer** | – | Never leaks the prompt's canary code; never shows a `<think>` trace | Global `defaultTest` asserts |
| [Red team](redteam/promptfooconfig.yaml) | 376 attacks | 17 plugins (prompt extraction, hijacking, copyright, imitation, self-harm, hate, hallucination, over-reliance, PII, a custom lyrics policy…) × strategies (jailbreak meta/composite, base64, leetspeak, rot13, multi-turn crescendo) | Generated once and committed in [`redteam/redteam.yaml`](redteam/redteam.yaml) so every run replays the same attacks |

**LLM-as-a-judge:** Claude Sonnet 5.5 grades the rubrics for every model. It also grades its own
answers, so self-preference bias is possible. Swap the judge with `npx promptfoo eval --grader <provider>`.

## Baseline results (2026-11-15)

Claude only. Gemini and Groq are paused (see the model table above).

| Model | Eval pass rate | Median latency | Est. cost (29 tests) |
|---|---:|---:|---:|
| Claude Haiku 5.5 | 93% (27/29) | 3.5 s | $0.011 |
| Claude Sonnet 5.5 | 93% (27/29) | 5.9 s | $0.238 |

Quick red team (138 single-turn attacks per model, Haiku and Sonnet): **all 276 defended**. Many
encoded attacks were stopped by Anthropic's safety filter with an **empty reply** rather than by
Coda's prompt (Haiku 102/138, Sonnet 74/138), which is itself a finding. Full tables: [docs/RESULTS.md](docs/RESULTS.md).

### Key findings ([all findings](docs/FINDINGS.md))

- **F-001:** Safety-filter refusals reach the user as an empty message. The app needs a refusal fallback.
- **F-002:** Encoded inputs (base64, rot13, leetspeak) are blocked before the model answers, so they test the provider's filter, not the prompt. Gemini will show whether another provider's filter behaves the same.
- **F-003:** The small model makes harmony-reasoning mistakes the medium model doesn't (pivot-chord modulation): the core size/cost trade-off.
- **Calibration:** two failures were eval bugs (an over-strict rubric and an exact-phrase check). They're fixed and logged, because an eval is only useful once you know whether the model or the test was wrong.

## The chatbot prompt

[`prompts/coda-system.md`](prompts/coda-system.md) defines Coda: role, answer style, accuracy rules,
copyright boundaries, safety and security. [docs/PROMPT-DESIGN.md](docs/PROMPT-DESIGN.md) maps every
section to the tests that hold it accountable.

## Run it

You need [Node.js](https://nodejs.org) 20.12 or newer and **your own** access to Claude. Nothing
here ships with keys: every model call is made with your credentials.

```bash
git clone https://github.com/JulianBeta/composition-coach-llm-evals.git
cd composition-coach-llm-evals
npm install
npm test                # sanity check: unit tests, no keys and no model calls
```

### 1. Set up your Claude access (pick one)

| Option | Steps | Cost |
|---|---|---|
| **Claude Code session** | Install [Claude Code](https://claude.com/claude-code) and run `claude /login` once. | Uses your Claude plan |
| **Your own Anthropic API key** | Create a key at [console.anthropic.com](https://console.anthropic.com/settings/keys), then `cp .env.example .env` and set `ANTHROPIC_API_KEY=...` in `.env`. | Billed per token to your account |

If `ANTHROPIC_API_KEY` is set, it is used. Otherwise everything falls back to your Claude Code
session. `.env` is gitignored. Never commit it or paste keys into issues.

### 2. Chat with Coda

```bash
npm run chat            # then open http://localhost:3000
```

A small local chat page that talks to Coda with the same system prompt
([`prompts/coda-system.md`](prompts/coda-system.md)) and model settings as the evals. Pick
Claude Haiku 5.5 or Claude Sonnet 5.5 from the dropdown. The terminal shows which login it is using.
The server listens on `localhost` only, because it spends your credentials. Set `PORT=4000` to use another port.

### 3. Run the evals and red team

```bash
npm run eval:smoke      # 4 tests on Haiku: quick check that your access works
npm run eval            # all 29 tests on every active model (Claude Haiku + Sonnet)
npm run view            # browse results in Promptfoo's UI
npm run summary         # Markdown model comparison of the last run

npm run redteam:quick   # replay single-turn attacks (direct + encodings)
npm run redteam:eval    # replay the full committed attack set (slow: multi-turn strategies)
npm run redteam:generate  # regenerate attacks after changing the red team config
```

Rough cost with an API key: a full `npm run eval` is about **$0.40** (both models + the Sonnet judge),
and `redteam:quick` about **$1.50**. See [docs/RESULTS.md](docs/RESULTS.md) for the per-model breakdown.

### Other models (paused)

Gemini and Groq are commented out in [`promptfooconfig.yaml`](promptfooconfig.yaml) and
[`redteam/redteam.yaml`](redteam/redteam.yaml). To try one with your own key, uncomment its block
and set `GOOGLE_API_KEY` or `GROQ_API_KEY` in `.env` (links in [`.env.example`](.env.example)).
They are used by the evals only. The chat UI offers the Claude models.

## CI

[`.github/workflows/evals.yml`](.github/workflows/evals.yml):

CI costs nothing to run: **it does not call any model**, so a green badge means the configs and
reporting scripts are healthy, not that the evals passed.

- **Every push / PR:** runs the reporting scripts' unit tests and validates both configs.
- **Evals and red team:** run locally through a Claude Code session, then get committed to
  [`reports/baseline/`](reports/baseline). There is deliberately no `ANTHROPIC_API_KEY` secret, because the API
  bills separately and Sonnet judges every model. The eval and red-team jobs stay in the workflow but
  skip or stop without that key. If it's ever added, evals run on push to main and weekly, and **gate on Claude ≥ 90%**.
- **Pages:** publishes the committed baseline on every push to main.

## Roadmap

- [ ] Add a Google Gemini model as the third option and record its baseline (see F-002)
- [ ] Run the full red team (jailbreak meta/composite, crescendo) on all three models
- [ ] Refusal fallback in an app wrapper, and a test for it (F-001)
- [ ] Prompt variants (`coda-v2`) compared side by side to fix F-003
- [ ] Track pass rates across CI runs to separate real regressions from run-to-run variance

---

Built by **Julian Betancourt Cuervo**, Lead QA Automation Engineer · [julianbeta.github.io](https://julianbeta.github.io) · [LinkedIn](https://www.linkedin.com/in/julian-betancourt-cuervo-a05820ab/)
