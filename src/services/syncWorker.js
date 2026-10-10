
import {
    getQueuedOperations,
    removeQueuedOperation,
} from "./localQueue.js";

import { saveOperation } from "./syncService.js";

let isSyncing = false;

export async function syncPendingOperations() {
    // Don't start multiple sync jobs at the same time.
    if (isSyncing || !navigator.onLine) {
        return;
    }

    isSyncing = true;

    try {
        const pendingOperations = await getQueuedOperations();

        for (const operation of pendingOperations) {
            // The connection may disappear during synchronization.
            if (!navigator.onLine) {
                break;
            }

            try {
                await saveOperation(operation);

                // Remove only after the server confirms success.
                await removeQueuedOperation(operation.op_id);

                console.log("Operation synchronized:", operation.op_id);
            } catch (error) {
                console.error(
                    "Operation still pending:",
                    operation.op_id,
                    error
                );

                // Keep the operation in IndexedDB for another attempt.
                // Continue so one failed operation doesn't block the rest.
            }
        }
    } catch (error) {
        console.error("Could not read the local queue:", error);
    } finally {
        isSyncing = false;
    }
}
