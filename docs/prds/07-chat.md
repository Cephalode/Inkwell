# PRD 7 — Chat as command line (tool-driven generation)

Turbo's chat isn't just RAG Q&A — it's the product's command line: the model
issues tool-calls that trigger every generator. "Make me a quiz on ch. 5" just
works, from anywhere.

## Observed UX (Turbo)
- Floating **Chat** button on every content page.
- Contextual nudges: "Listening to a podcast? Ask me about anything you hear
  in the episode."
- Dashboard composer IS a chat: attach a file, submit, and the assistant both
  converses and acts ("Got your Think Python PDF! Tap Generate Lesson…").
- Threads persist (chatId), support file parts, stream responses.

## Implementation evidence
- `POST chat-production.workers-turbo.ai/chat/create-lesson` (and sibling
  endpoints per action): Vercel AI SDK stream protocol —
  `{chatId, platform_type, id, messages:[{parts:[{type:'file'|'text',…}],
  role, metadata}], trigger:'submit-message'}`; assistant turns stream with
  `finishReason:'tool-calls'`.
- Generation jobs are created BY tool calls inside the chat stream — one
  uniform path for "chat" and "generate".

## Inkwell build
- Our RAG chat agent exists. Add:
  1. **Tools**: expose `generate_quiz(document_id, count, focus)`,
     `generate_flashcards(document_id, count, instructions)`,
     `generate_podcast(document_id)`, `generate_lesson(document_id)` as agent
     tools (server-side function-calling; each enqueues the PRD-1..6 pipelines
     and returns artifact ids). Chat UI renders "✅ Quiz ready — open" cards on
     tool results.
  2. **File parts**: allow attaching an existing doc (or fresh upload) into a
     thread; scope RAG to it for the turn.
  3. **Contextual nudges**: podcast player open → prefill the nudge text
     (static string, not AI).
- Protocol: adopt plain SSE (we're not on Vercel AI SDK); tool-call events map
  1:1.

## Acceptance criteria
- From chat: "make a 15-question quiz focused on chapter 3" produces a quiz
  artifact visible on the doc page, with a chat card linking to it.
- Every generator is triggerable from chat (quiz, flashcards, podcast, lesson).

**Effort:** ~1 week. **Skipped:** multi-doc chat sessions, chat sharing — later.
