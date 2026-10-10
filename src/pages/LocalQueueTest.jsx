
import { useState } from "react";
import {
    queueOperation,
    getQueuedOperations,
    removeQueuedOperation,
} from "../services/localQueue.js";

export default function LocalQueueTest() {
    const [result, setResult] = useState("Test not run yet");
    const [loading, setLoading] = useState(false);

    async function runTest() {
        setLoading(true);
        setResult("Running test...");

        let testId;

        try {
            testId = "test-" + crypto.randomUUID();

            const operation = {
                op_id: testId,
                room_id: "demo-room",
                client_id: "local-test-client",
                task_id: "test-task-1",
                field: "title",
                value: "Offline queue test",
                base_version: 0,
                counter: Date.now(),
            };

            await queueOperation(operation);

            const queued = await getQueuedOperations();
            const found = queued.find((item) => item.op_id === testId);

            if (!found) {
                throw new Error("Saved operation could not be retrieved.");
            }

            await removeQueuedOperation(testId);

            const remaining = await getQueuedOperations();
            const stillExists = remaining.some(
                (item) => item.op_id === testId
            );

            if (stillExists) {
                throw new Error("Operation was not removed.");
            }

            setResult(
                "PASS: Operation saved, retrieved, and removed successfully."
            );
        } catch (error) {
            setResult("FAIL: " + error.message);
            console.error(error);

            // Clean up the test operation if one was created.
            if (testId) {
                try {
                    await removeQueuedOperation(testId);
                } catch (cleanupError) {
                    console.error("Test cleanup failed:", cleanupError);
                }
            }
        } finally {
            setLoading(false);
        }
    }

    return (
        <main style={{ padding: 32, fontFamily: "sans-serif" }}>
            <h1>ReplicaSync — Local Queue Test</h1>
            <p>Tests saving and retrieving operations in browser storage.</p>

            <button onClick={runTest} disabled={loading}>
                {loading ? "Testing..." : "Run local queue test"}
            </button>

            <p role="status" style={{ marginTop: 20 }}>
                {result}
            </p>
        </main>
    );
}
