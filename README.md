# Coda · LLM evals & red team 🎼

[![LLM evals](https://github.com/JulianBeta/composition-coach-llm-evals/actions/workflows/evals.yml/badge.svg)](https://github.com/JulianBeta/composition-coach-llm-evals/actions/workflows/evals.yml)
![Status: in progress](https://img.shields.io/badge/status-in%20progress-FF3366?style=flat-square)
[![Reports](https://img.shields.io/badge/reports-live-2EC4B6?style=flat-square)](https://julianbeta.github.io/composition-coach-llm-evals/)

**Coda** is a chatbot that coaches people on composing original music. This repo evaluates and
red-teams it with [Promptfoo](https://www.promptfoo.dev), comparing three models on the same prompt:

| Tier | Model | How it runs |
|---|---|---|
| Small | **Claude Haiku 5.5** (`claude-haiku-5-5`) | Anthropic API key, or your Claude Code session |
| Medium | **Claude Sonnet 5.5** (`claude-sonnet-5-5`) | Anthropic API key, or your Claude Code session |
| Free | **Qwen 3.8 27B** (`qwen/qwen3.8-27b` on Groq) | Free Groq key, no credit card |

Everything runs on hosted models, so anyone can reproduce it. No local GPU or model downloads.

**📊 Live reports:** https://julianbeta.github.io/composition-coach-llm-evals/

> 🚧 **In progress.** The baseline covers Claude (evals + a quick red team on Haiku). Qwen results,
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

## Baseline results (2026-11-03)

| Model | Eval pass rate | Median latency | Est. cost (29 tests) |
|---|---:|---:|---:|
| Claude Haiku 5.5 | 93% (27/29) | 3.8 s | $0.011 |
| Claude Sonnet 5.5 | 97% (28/29) | 5.9 s | $0.235 |
| Qwen 3.8 27B | _pending Groq key_ | – | free |

Quick red team (138 single-turn attacks, Haiku): **136 defended**. Most encoded attacks were stopped
by Anthropic's safety filter with an **empty reply** rather than by Coda's prompt, which is itself a
finding. Full tables: [docs/RESULTS.md](docs/RESULTS.md).

### Key findings ([all findings](docs/FINDINGS.md))

- **F-001:** Safety-filter refusals reach the user as an empty message. The app needs a refusal fallback.
- **F-002:** Encoded inputs (base64, rot13, leetspeak) are blocked before the model answers, so they test the provider's filter, not the prompt. Qwen will show the prompt's own guardrails.
- **F-003:** The small model makes harmony-reasoning mistakes the medium model doesn't (pivot-chord modulation): the core size/cost trade-off.
- **Calibration:** two failures were eval bugs (an over-strict rubric and an exact-phrase check). They're fixed and logged, because an eval is only useful once you know whether the model or the test was wrong.

## The chatbot prompt

[`prompts/coda-system.md`](prompts/coda-system.md) defines Coda: role, answer style, accuracy rules,
copyright boundaries, safety and security. [docs/PROMPT-DESIGN.md](docs/PROMPT-DESIGN.md) maps every
section to the tests that hold it accountable.

## Run it

```bash
npm install

# Claude, with no API key: uses your local Claude Code session (run `claude /login` once)
npm run eval:claude

# Add the free model: get a key at https://console.groq.com/keys
export GROQ_API_KEY=gsk_...
npm run eval            # all three models
npm run eval:free       # Qwen only

npm run view            # browse results in Promptfoo's UI
npm run summary         # Markdown model comparison of the last run

npm run redteam:quick   # replay single-turn attacks (direct + encodings)
npm run redteam:eval    # replay the full committed attack set (slow: multi-turn strategies)
npm run redteam:generate  # regenerate attacks after changing the red team config
```

With `ANTHROPIC_API_KEY` set, Claude uses the API key instead of the Claude Code session.

## CI

[`.github/workflows/evals.yml`](.github/workflows/evals.yml):

- **Every push / PR:** validates both configs.
- **Push to main + weekly:** runs the evals (when the `ANTHROPIC_API_KEY` / `GROQ_API_KEY` secrets exist), writes the model comparison to the job summary, and **gates on Claude ≥ 90%**. Qwen is reported, not gated.
- **Manual:** red team, `quick` or `full`.
- **Pages:** publishes the newest reports, or the committed baseline when no fresh run exists.

## Roadmap

- [ ] Add the Groq key and record Qwen's baseline (expected to expose the prompt's own guardrails, see F-002)
- [ ] Run the full red team (jailbreak meta/composite, crescendo) on all three models
- [ ] Refusal fallback in an app wrapper, and a test for it (F-001)
- [ ] Prompt variants (`coda-v2`) compared side by side to fix F-003
- [ ] Track pass rates across CI runs to separate real regressions from run-to-run variance

---

Built by **Julian Betancourt Cuervo**, Lead QA Automation Engineer · [julianbeta.github.io](https://julianbeta.github.io) · [LinkedIn](https://www.linkedin.com/in/julian-betancourt-cuervo-a05820ab/)
