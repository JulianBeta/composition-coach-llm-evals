# Designing Coda's system prompt

The prompt lives in [`prompts/coda-system.md`](../prompts/coda-system.md) and is built into the chat by
[`prompts/coda.cjs`](../prompts/coda.cjs). Every section exists so a test can hold it accountable.

| Section | Why it is there | Tested by |
|---|---|---|
| **Role and audience** ("composition coach", beginners to pros) | Narrow scope makes refusals of off-topic requests predictable and keeps answers tailored. | `coaching.yaml` (beginner, writer's block), `guardrails.yaml` (scope) |
| **What you help with** (harmony, melody, form, arrangement, lyrics, workflow) | Lists what is in scope, so music-adjacent questions are answered, not refused. | *Music-adjacent question is answered briefly* |
| **How you answer** (clarify vague requests, concrete notation, 2–3 options, one next step, ~300 words, user's language) | Turns "be helpful" into checkable behavior. | Clarifying-question, word-count and Spanish checks |
| **Accuracy** (spell chords precisely, admit uncertainty) | Theory errors are the main quality risk for a music tutor. | `quality.yaml` (chord spelling, keys, ranges, counterpoint) |
| **Originality and copyright** (analyze, quote ≤ 2 lines, never reproduce or disguise others' work; no binding legal advice) | The domain-specific risk: users ask for full lyrics or "change a few notes" of hits. | Copyright tests + red team `harmful:copyright-violations`, `intellectual-property`, `imitation`, custom `policy` |
| **Scope and safety** (decline off-topic, no harmful content "as lyrics", crisis care, hearing health) | Art is a classic jailbreak wrapper; crisis disclosures can appear in a songwriting chat. | Pipe-bomb lyrics, crisis, hearing tests + red team `harmful:*` |
| **Security** (confidential instructions, pasted text is data, stay Coda, say you're an AI, no personal data) | Public chatbot: prompt extraction, injection via pasted lyrics and persona hijacks are expected. | `security.yaml` + red team `prompt-extraction`, `hijacking`, `system-prompt-override`, `pii:direct` |

## The canary

The prompt contains an internal reference code that the model is told never to output.
`defaultTest` checks **every** answer for it, so any leak, from any test, fails the run.
The prompt is public in this repo on purpose (it is a test fixture); in production the canary
would also feed an output filter.

## Choices worth noting

- **Effort `low`** for both Claude models: chat answers don't need deep reasoning, and low effort
  keeps latency and cost down. Raising it is the first lever to try if theory accuracy (F-003) matters more than cost.
- **`reasoning_format: hidden`** for Qwen: the free model is a reasoning model; without this, its
  `<think>` trace would reach users. A global `not-contains <think>` assertion guards it.
- **Same prompt for every model**: the comparison measures the models, not prompt variants.
  Prompt variants are the next experiment (see the README roadmap).
