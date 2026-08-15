/**
 * Serialize graph mutations for one extension instance.
 *
 * The graph remains the source of truth; this queue only prevents two local
 * actions from passing the same read-then-write boundary at once. Each action
 * still re-reads the graph when it begins, so a write from another instance is
 * respected as well.
 */

let tail = Promise.resolve();

export function enqueueMutation(action) {
    const result = tail.then(action, action);
    // A failed action must not poison the queue for the next user action.
    tail = result.catch(() => undefined);
    return result;
}

export function resetMutationQueue() {
    tail = Promise.resolve();
}
