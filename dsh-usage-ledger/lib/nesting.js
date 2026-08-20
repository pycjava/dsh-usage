/**
 * Innermost-delegation tracking for the `llm/stream` waterfall.
 *
 * A delegating wrapper provider (modlens' `(modlens vision)` twin, and any
 * provider that forwards to a real upstream) registers a facade route whose
 * `stream()` re-enters `ctx.llm.stream(...)` for the actual call. Both the
 * facade dispatch and the delegated dispatch cross the same `llm/stream`
 * waterfall and carry the same upstream usage chunk, so recording each
 * dispatch independently counts the same physical call twice — once under the
 * facade provider and once under the real provider.
 *
 * This module tracks nesting on the async execution stack so that only the
 * *innermost* dispatch of a chain is recorded — the one that never delegates,
 * i.e. the real provider call. `markDelegated()` runs as the very first step
 * of an `llm/stream` listener: when a nested `ctx.llm.stream` dispatch is
 * created while an enclosing dispatch is being consumed, it flips that
 * enclosing dispatch's `delegated` flag. `consumeInner()` consumes one
 * dispatch's stream inside a context of its own and reports `{ delegated }`
 * at the end; the caller skips recording when the flag is set. Top-level calls
 * and the innermost call of a chain never set it, so they record exactly once.
 *
 * Concurrency-safe: `AsyncLocalStorage` scopes the flag to the async call
 * stack, so parallel top-level calls (e.g. concurrent subagents) do not leak
 * delegation across one another.
 *
 * @module dsh-usage-ledger/nesting
 */

import { AsyncLocalStorage } from 'node:async_hooks'

/** The per-dispatch context of one `llm/stream` invocation. */
const storage = new AsyncLocalStorage()

/** A fresh dispatch context: not known to be a delegation. */
const freshStore = () => ({ delegated: false })

/**
 * Call from an `llm/stream` listener as the very first step. If this dispatch
 * was created while an enclosing dispatch is being consumed, it is a
 * delegation to this (inner) call, and the enclosing dispatch must not record
 * the same physical usage.
 */
export function markDelegated() {
  const parent = storage.getStore()
  if (parent !== undefined) parent.delegated = true
}

/**
 * Consume one dispatch's inner stream while tracking delegation.
 *
 * Every `next()` of the iterator runs inside this dispatch's own context, so
 * any nested `ctx.llm.stream` created during iteration calls `markDelegated()`
 * against this dispatch's store. `onDone` receives the finished store — with
 * `delegated === true` this call forwarded to an inner call, which is the one
 * that must record; with `delegated === false` this dispatch never delegated
 * and is the innermost, so it must record.
 *
 * `onDone` always runs exactly once, even when the consumer stops early
 * (abort / early return), matching the waterfall's record-on-stream-end
 * contract.
 *
 * @param inner - the stream the rest of the waterfall produced.
 * @param onDone - `(store) => void`, called after the stream ends.
 * @returns the chunk stream.
 */
export async function* consumeInner(inner, onDone) {
  const store = freshStore()
  const iterator =
    typeof inner?.[Symbol.asyncIterator] === 'function'
      ? inner[Symbol.asyncIterator]()
      : typeof inner?.[Symbol.iterator] === 'function'
        ? inner[Symbol.iterator]()
        : undefined
  if (iterator === undefined) {
    onDone(store)
    return
  }
  try {
    for (;;) {
      const result = await storage.run(store, () => iterator.next())
      if (result.done === true) break
      yield result.value
    }
  } finally {
    onDone(store)
  }
}
