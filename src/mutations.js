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

export function enqueueMutation(action) {
    const expectedGeneration = generation;
    const run = () => {
        if (expectedGeneration !== generation) {
            return invalidatedMutationResult();
        }
        return action();
    };
    const result = tail.then(run, run);
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
}
