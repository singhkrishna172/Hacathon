
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


/**
 * Process a list of operations to compute the final state of each task,
 * identifying conflicts and applying independent edits correctly.
 */
export function applyOperations(operations) {
    const taskState = {};
    const conflicts = [];
    const fieldWinners = new Map();

    for (const rawOp of operations) {
        // Map database row format to our application model format
        const op = {
            opId: rawOp.op_id || rawOp.opId,
            taskId: rawOp.task_id || rawOp.taskId,
            field: rawOp.field,
            value: rawOp.value,
            baseVersion: rawOp.base_version !== undefined ? rawOp.base_version : rawOp.baseVersion,
            counter: rawOp.counter,
            clientId: rawOp.client_id || rawOp.clientId,
            createdAt: rawOp.created_at || rawOp.createdAt
        };

        const key = `${op.taskId}:${op.field}`;
        const existingOp = fieldWinners.get(key);

        if (!existingOp) {
            fieldWinners.set(key, op);
        } else {
            if (detectConflict(existingOp, op)) {
                const resolution = resolveConflict(existingOp, op);
                fieldWinners.set(key, resolution.winner);
                conflicts.push(resolution.conflict);
            } else {
                // If not a concurrent conflict, still use tie-breaker logic to find the newest/winner
                const resolution = resolveConflict(existingOp, op);
                fieldWinners.set(key, resolution.winner);
            }
        }
    }

    // Reconstruct the tasks by combining independent field edits
    for (const op of fieldWinners.values()) {
        if (!taskState[op.taskId]) {
            taskState[op.taskId] = {
                task_id: op.taskId,
                client_id: op.clientId,
                created_at: op.createdAt,
                counter: op.counter
            };
        }
        
        // Apply the field value (e.g., title, status, etc.)
        taskState[op.taskId][op.field] = op.value;
        
        // Update task-level metadata to reflect the most recent operation
        if (op.counter > taskState[op.taskId].counter) {
            taskState[op.taskId].counter = op.counter;
            taskState[op.taskId].client_id = op.clientId;
            taskState[op.taskId].created_at = op.createdAt;
        }
    }

    return {
        tasks: Object.values(taskState).sort((a, b) => b.counter - a.counter),
        conflicts,
    };
}
