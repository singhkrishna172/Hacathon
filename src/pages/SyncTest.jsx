
import { useState } from "react";
import { supabase } from "../services/supabase.js";
import { SyncOperation } from "../module/syncOperation.js";
import {
    saveOperation,
    getRoomOperations,
} from "../services/syncService.js";

function SyncTest() {
    const [title, setTitle] = useState("");
    const [operations, setOperations] = useState([]);
    const [message, setMessage] = useState("Connecting to Supabase...");
    const [loading, setLoading] = useState(false);




    // Step 2: Save an operation
    async function handleSave() {
        if (!title.trim()) {
            setMessage("Please enter a task title.");
            return;
        }

// Authentication check removed – proceeding directly.

        setLoading(true);
        setMessage("");

        try {
            const operation = new SyncOperation({
                opId: crypto.randomUUID(),
                roomId: "demo-room",
                clientId: "browser-A",
                taskId: "task-1",
                field: "title",
                value: title.trim(),
                baseVersion: 0,
                counter: Date.now(),
            });

            await saveOperation(operation);

            setTitle("");
            setMessage("Operation saved successfully!");

            await handleLoad();
        } catch (error) {
            console.error("Save operation failed:", error);
            setMessage(`Save failed: ${error.message}`);
        } finally {
            setLoading(false);
        }
    }

    // Step 3: Load operations
    async function handleLoad() {
        try {
            const data = await getRoomOperations("demo-room");
            setOperations(data);

            setMessage(`Loaded ${data.length} operation(s).`);
        } catch (error) {
            console.error("Load operations failed:", error);
            setMessage(`Load failed: ${error.message}`);
        }
    }

    return (
        <main
            style={{
                maxWidth: 700,
                margin: "40px auto",
                padding: 20,
                fontFamily: "Arial, sans-serif",
            }}
        >
            <h1>ReplicaSync</h1>

            <p>
                A local-first collaborative system for
                conflict-aware synchronization.
            </p>



            <div style={{ marginBottom: 16 }}>
                <input
                    type="text"
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                    placeholder="Enter a task title"
                    disabled={loading}
                    style={{
                        padding: 10,
                        width: "60%",
                        maxWidth: 350,
                        marginRight: 8,
                    }}
                />

                <button
                    onClick={handleSave}
                    disabled={loading}
                    style={{ padding: 10 }}
                >
                    {loading ? "Saving..." : "Save Operation"}
                </button>
            </div>

            <button
                onClick={handleLoad}
                disabled={loading}
                style={{ padding: 10 }}
            >
                Load Operations
            </button>

            <p
                role="status"
                style={{ overflowWrap: "anywhere" }}
            >
                {message}
            </p>

            <hr />

            <h2>Saved Operations</h2>

            {operations.length === 0 ? (
                <p>No operations loaded yet.</p>
            ) : (
                operations.map((operation) => (
                    <article
                        key={operation.op_id}
                        style={{
                            border: "1px solid #ccc",
                            borderRadius: 8,
                            padding: 14,
                            marginBottom: 12,
                            overflowWrap: "anywhere",
                        }}
                    >
                        <h3>{String(operation.value)}</h3>

                        <p>Room: {operation.room_id}</p>
                        <p>Task: {operation.task_id}</p>
                        <p>Client: {operation.client_id}</p>
                        <p>Counter: {operation.counter}</p>

                        <small>
                            Operation ID: {operation.op_id}
                        </small>
                    </article>
                ))
            )}
        </main>
    );
}

export default SyncTest;
