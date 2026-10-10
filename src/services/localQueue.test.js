
import {
    queueOperation,
    getQueuedOperations,
    removeQueuedOperation,
} from "./localQueue.js";

async function testLocalQueue() {
    const testOperation = {
        op_id: "test-" + crypto.randomUUID(),
        room_id: "demo-room",
        client_id: "local-test-client",
        task_id: "test-task-1",
        field: "title",
        value: "Offline queue test",
        base_version: 0,
        counter: Date.now(),
    };

    // 1. Save the test operation.
    await queueOperation(testOperation);
    console.log("1. Operation saved locally.");

    // 2. Read it back.
    const queued = await getQueuedOperations();
    const found = queued.find(
        (item) => item.op_id === testOperation.op_id
    );

    if (!found) {
        throw new Error("Test failed: operation was not found.");
    }

    console.log("2. Operation retrieved:", found.value);

    // 3. Remove the test operation.
    await removeQueuedOperation(testOperation.op_id);

    const remaining = await getQueuedOperations();
    const stillExists = remaining.some(
        (item) => item.op_id === testOperation.op_id
    );

    if (stillExists) {
        throw new Error("Test failed: operation was not removed.");
    }

    console.log("3. Operation removed successfully.");
    console.log("Local queue test passed!");
}

testLocalQueue().catch(console.error);
