
/**
 * Detect whether two operations conflict.
 *
 * For our MVP, two operations conflict when:
 * 1. They edit the same task.
 * 2. They edit the same field.
 * 3. They were based on the same version.
 * 4. They have different operation IDs.
 */

export function detectConflict(operationA, operationB) {
    const sameTask = operationA.taskId === operationB.taskId;
    const sameField = operationA.field === operationB.field;
    const sameBaseVersion =
        operationA.baseVersion === operationB.baseVersion;
    const differentOperations = operationA.opId !== operationB.opId;

    return (
        sameTask &&
        sameField &&
        sameBaseVersion &&
        differentOperations
    );
}


/**
 * Select a deterministic winner between two operations.
 * Higher counter wins. If counters match, clientId breaks the tie.
 */
export function resolveConflict(operationA, operationB) {
    const aWins =
        operationA.counter > operationB.counter ||
        (operationA.counter === operationB.counter &&
            operationA.clientId.localeCompare(operationB.clientId) > 0);

    const winner = aWins ? operationA : operationB;
    const loser = aWins ? operationB : operationA;

    return {
        winner,
        conflict: {
            taskId: winner.taskId,
            field: winner.field,
            winningValue: winner.value,
            losingValue: loser.value,
            winningOperationId: winner.opId,
            losingOperationId: loser.opId,
            reason: "Concurrent edits detected; deterministic tie-break applied.",
        },
    };
}
