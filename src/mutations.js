/**
 * Serialize graph mutations for one extension instance.
 *
 * The graph remains the source of truth; this queue only prevents two local
 * actions from passing the same read-then-write boundary at once. Each action
 * still re-reads the graph when it begins, so an external write observed before
 * mutation is respected as well. This is not a cross-instance lock or CAS.
 */

let tail = Promise.resolve();
let generation = 0;
const pendingMutationStarts = new Set();

// A timer task gives the browser a rendering opportunity after an immediate
// navigation intent has been published. Callers can replace this in tests (or
// use a different host scheduler) without making the mutation queue itself
// aware of the browser. The returned cancellation hook lets a lifecycle reset
// close a not-yet-started wait without leaving its caller pending.
export const scheduleMutationStart = callback => {
    const timerId = setTimeout(callback, 0);
    return () => clearTimeout(timerId);
};

const invalidatedMutationResult = () => ({
    action: 'mutation-invalidated',
    ok: false,
    invalidated: true,
    uncertain: true,
    retryable: true,
    partial: false,
    completed: 0,
    count: 0,
    failed: 1,
    pending: 1,
    pendingTaskUids: [],
    pendingClockUids: [],
    retry: {
        action: 'retry-mutation',
        reason: 'extension-reload',
    },
    notice: 'This action was interrupted by an extension reload before it could be applied. Retry.',
    error: new Error('Mutation was invalidated by an extension reload before it could be applied.'),
});

export function enqueueMutation(
    action,
    { deferStart = false, scheduleStart = scheduleMutationStart } = {}
) {
    const expectedGeneration = generation;
    const run = () => {
        if (expectedGeneration !== generation) {
            return invalidatedMutationResult();
        }
        return action();
    };
    const start = deferStart
        ? () =>
              new Promise((resolve, reject) => {
                  let settled = false;
                  let cancelScheduled = null;
                  const pending = {
                      cancel() {
                          if (settled) return;
                          settled = true;
                          pendingMutationStarts.delete(pending);
                          try {
                              cancelScheduled?.();
                          } catch {
                              // A host scheduler's cancellation failure cannot
                              // make the invalidated mutation wait forever.
                          }
                          resolve(invalidatedMutationResult());
                      },
                  };
                  const settle = callback => {
                      if (settled) return;
                      settled = true;
                      pendingMutationStarts.delete(pending);
                      callback();
                  };
                  pendingMutationStarts.add(pending);
                  try {
                      cancelScheduled = scheduleStart(() =>
                          settle(() => {
                              try {
                                  resolve(run());
                              } catch (error) {
                                  reject(error);
                              }
                          })
                      );
                      if (typeof cancelScheduled !== 'function') cancelScheduled = null;
                  } catch (error) {
                      settle(() => reject(error));
                  }
              })
        : run;
    // The scheduled start is part of the tail, so a later mutation cannot pass
    // the deferred action or interleave with its read-then-write boundary.
    const result = tail.then(start, start);
    // A failed action must not poison the queue for the next user action.
    tail = result.catch(() => undefined);
    return result;
}

export function resetMutationQueue() {
    // Keep the old tail intact. An in-flight graph write must settle before a
    // newly loaded extension instance is allowed to read and mutate the graph.
    // Generation invalidation prevents queued work that has not started from
    // writing after the lifecycle boundary without creating a second queue.
    generation += 1;
    for (const pending of [...pendingMutationStarts]) pending.cancel();
}
