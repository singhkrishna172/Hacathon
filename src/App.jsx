
import { useEffect, useState } from "react";
import "./App.css";
import "./index.css";
import { supabase } from "./services/supabase.js";
import { SyncOperation } from "./module/syncOperation.js";
import {
  saveOperation,
  getRoomOperations,
} from "./services/syncService.js";

import {
  queueOperation,
  getQueuedOperations,
  removeQueuedOperation,
} from "./services/localQueue.js";

import { syncPendingOperations } from "./services/syncWorker.js";

import { applyOperations } from "./engine/syncEngine.js";


const ROOM_ID = "demo-room";
const CLIENT_ID = "browser-" + crypto.randomUUID();

function App() {
  const [operations, setOperations] = useState([]);
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);

  async function loadOperations() {
    const data = await getRoomOperations(ROOM_ID);
    setOperations(data);
  }


  useEffect(() => {
    let active = true;
    let channel;

    const handleOnline = () => {
      console.log("Network online, syncing pending operations...");
      syncPendingOperations().then(() => loadOperations());
    };
    window.addEventListener("online", handleOnline);

    async function initialize() {
      try {
        let {
          data: { session },
        } = await supabase.auth.getSession();

        if (!session) {
          const { data, error } =
            await supabase.auth.signInAnonymously();

          if (error) throw error;
          session = data.session;
        }

        if (!session) {
          throw new Error("No authentication session available.");
        }

        if (!active) return;

        setConnected(true);
        await syncPendingOperations();
        await loadOperations();

        channel = supabase
          .channel("replicasync-room")
          .on(
            "postgres_changes",
            {
              event: "*",
              schema: "public",
              table: "sync_operations",
              filter: "room_id=eq.demo-room",
            },
            async () => {
              try {
                await loadOperations();
              } catch (error) {
                console.error("Realtime refresh failed:", error);
              }
            }
          )
          .subscribe((status) => {
            console.log("Realtime status:", status);
          });

        if (active) setMessage("");
      } catch (error) {
        console.error("Initialization failed:", error);
        if (active) setMessage(error.message);
      }
    }

    initialize();

    return () => {
      active = false;
      window.removeEventListener("online", handleOnline);

      if (channel) {
        supabase.removeChannel(channel);
      }
    };
  }, []);



  async function handleCreateTask(event) {
    event.preventDefault();

    if (!title.trim()) {
      setMessage("Enter a task title first.");
      return;
    }

    setLoading(true);
    setMessage("");

    try {
      const operation = new SyncOperation({
        opId: crypto.randomUUID(),
        roomId: ROOM_ID,
        clientId: CLIENT_ID,
        taskId: crypto.randomUUID(),
        field: "title",
        value: title.trim(),
        baseVersion: 0,
        counter: Date.now(),
      });

      // Step 1: Save locally before contacting the server.
      await queueOperation(operation.toDatabaseRow());

      // Step 2: Try to synchronize with Supabase.
      try {
        await saveOperation(operation);

        // Remove from the queue only after a successful save.
        await removeQueuedOperation(operation.opId);

        setMessage("Task saved and synchronized.");
      } catch (syncError) {
        console.warn("Sync postponed:", syncError);

        // Keep the operation in IndexedDB for a later retry.
        setMessage(
          "Task saved on this device. Synchronization is pending."
        );
      }

      setTitle("");
      setShowForm(false);

      // Refresh the server-backed task list when possible.
      try {
        await loadOperations();
      } catch (refreshError) {
        console.warn("Could not refresh server tasks:", refreshError);
      }
    } catch (error) {
      console.error("Task creation failed:", error);
      setMessage(`Could not save task locally: ${error.message}`);
    } finally {
      setLoading(false);
    }
  }


  const latestOperations = [...operations].reverse();
  
  // 1. Handle concurrent modifications & 2. Avoid overwriting users' changes
  // 3. Identify independent edits (e.g. title vs status for the same task)
  const { tasks, conflicts } = applyOperations(operations);
  const uniqueConflicts = new Set(conflicts.map(c => `${c.taskId}:${c.field}`));

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-icon">R</div>
          <span>ReplicaSync</span>
        </div>

        <div className="workspace-label">WORKSPACE</div>

        <nav className="sidebar-nav">
          <button className="nav-item active">
            <span className="nav-icon">▦</span> Overview
          </button>
          <button
            className="nav-item"
            onClick={() => document.getElementById("shared-tasks")?.scrollIntoView({ behavior: "smooth" })}
          >
            <span className="nav-icon">☷</span> Shared tasks
          </button>
          <button
            className="nav-item"
            onClick={() => document.getElementById("sync-activity")?.scrollIntoView({ behavior: "smooth" })}
          >
            <span className="nav-icon">⟳</span> Sync activity
          </button>
          <button
            className="nav-item"
            onClick={() => document.getElementById("conflict-summary")?.scrollIntoView({ behavior: "smooth" })}
          >
            <span className="nav-icon">⚡</span> Conflicts
            <span className="nav-count">{uniqueConflicts.size}</span>
          </button>
        </nav>

        <div className="sidebar-bottom">
          <div className="workspace-avatar">DS</div>
          <div className="workspace-user">
            <strong>Demo workspace</strong>
            <span>Local-first collaboration</span>
          </div>
          <span className="user-menu">···</span>
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div className="breadcrumbs">Workspace <span>/</span> Overview</div>
          <div className="topbar-right">
            <div className="connection-status">
              <span
                className="status-dot"
                style={{ background: connected ? "#16a34a" : "#f59e0b" }}
              />
              {connected ? "Connected" : "Connecting…"}
            </div>
            <div className="profile-avatar">D</div>
          </div>
        </header>

        <section className="dashboard">
          <div className="page-heading">
            <div>
              <div className="eyebrow">YOUR WORKSPACE</div>
              <h1>Good to see you.</h1>
              <p>Keep your work in sync, even when your connection isn't.</p>
            </div>
            <button className="primary-button" onClick={() => setShowForm(!showForm)}>
              <span>＋</span> New task
            </button>
          </div>

          {showForm && (
            <form className="panel" onSubmit={handleCreateTask} style={{ marginBottom: 20 }}>
              <h2>Create a shared task</h2>
              <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
                <input
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  placeholder="e.g. Prepare hackathon presentation"
                  maxLength={200}
                  style={{ flex: 1, minWidth: 0, padding: 12, border: "1px solid #dbe2ee", borderRadius: 8 }}
                />
                <button className="primary-button" disabled={loading || !connected}>
                  {loading ? "Saving..." : "Save task"}
                </button>
              </div>
            </form>
          )}

          {message && (
            <p role="status" style={{ color: "#b45309", marginBottom: 18, overflowWrap: "anywhere" }}>
              {message}
            </p>
          )}

          <div className="welcome-banner">
            <div className="welcome-copy">
              <div className="banner-label"><span className="banner-sparkle">✳</span> BUILT FOR UNRELIABLE NETWORKS</div>
              <h2>Your work doesn't stop when Wi-Fi does.</h2>
              <p>Make changes locally. Synchronize when you're back online. Resolve conflicting edits without losing work.</p>
            </div>
            <div className="sync-illustration" aria-hidden="true">
              <div className="sync-orbit orbit-one" />
              <div className="sync-orbit orbit-two" />
              <div className="sync-center">⟳</div>
              <div className="sync-node node-one">✓</div>
              <div className="sync-node node-two">↗</div>
              <div className="sync-node node-three">↻</div>
            </div>
          </div>

          <div className="section-heading">
            <div>
              <h2>Workspace overview</h2>
              <p>A quick look at your collaboration activity.</p>
            </div>
          </div>

          <div className="stats-grid">
            <article className="stat-card">
              <div className="stat-top"><span>Total operations</span><span className="stat-icon blue-icon">↗</span></div>
              <div className="stat-value">{operations.length}</div>
              <div className="stat-note">Shared changes recorded</div>
            </article>
            <article className="stat-card">
              <div className="stat-top"><span>Pending sync</span><span className="stat-icon amber-icon">◷</span></div>
              <div className="stat-value">Active</div>
              <div className="stat-note">Offline queue pushes when back online</div>
            </article>
            <article className="stat-card" id="conflict-summary">
              <div className="stat-top"><span>Potential conflicts</span><span className="stat-icon violet-icon">⇄</span></div>
              <div className="stat-value">{uniqueConflicts.size}</div>
              <div className="stat-note">Concurrent edits detected by a basic heuristic</div>
            </article>
          </div>

          <div className="content-grid">
            <section className="panel tasks-panel" id="shared-tasks">
              <div className="panel-heading">
                <div><h2>Shared tasks</h2><p>Your workspace's latest changes</p></div>
                <button className="text-button" onClick={loadOperations}>Refresh ↻</button>
              </div>

              {tasks.length === 0 ? (
                <div className="empty-state">
                  <div className="empty-icon">☷</div>
                  <h3>Your shared workspace starts here</h3>
                  <p>Create a task to start recording collaborative changes.</p>
                  <button className="secondary-button" onClick={() => setShowForm(true)}>＋ Create your first task</button>
                </div>
              ) : (
                <div style={{ marginTop: 20 }}>
                  {tasks.map((task) => (
                    <article key={task.task_id} style={{ padding: "15px 0", borderTop: "1px solid #edf0f5" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <span style={{ color: "#2563eb", fontSize: 18 }}>☷</span>
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <strong style={{ fontSize: 13, overflowWrap: "anywhere" }}>{String(task.value)}</strong>
                          <p style={{ margin: "6px 0 0", fontSize: 10, color: "#8994a7" }}>
                            Task ID: {task.task_id.slice(0, 8)} · Client: {task.client_id.slice(0, 12)}
                          </p>
                        </div>
                        <span style={{ fontSize: 10, color: "#64748b" }}>
                          {new Date(task.created_at).toLocaleDateString()}
                        </span>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </section>

            <section className="panel activity-panel" id="sync-activity">
              <div className="panel-heading">
                <div><h2>Sync activity</h2><p>Recent workspace events</p></div>
                <span className="activity-menu">···</span>
              </div>

              {latestOperations.length === 0 ? (
                <div className="activity-empty">
                  <div className="activity-mark">⟳</div>
                  <div><strong>Nothing to sync yet</strong><p>New operations will appear here.</p></div>
                </div>
              ) : (
                latestOperations.slice(0, 5).map((operation) => (
                  <div key={operation.op_id} className="activity-empty" style={{ padding: "15px 0" }}>
                    <div className="activity-mark">✓</div>
                    <div style={{ minWidth: 0 }}>
                      <strong>{String(operation.value)}</strong>
                      <p>{new Date(operation.created_at).toLocaleString()}</p>
                    </div>
                  </div>
                ))
              )}

              <div className="sync-info">
                <span className="info-icon">i</span>
                <p>Background sync queue and automatic conflict resolution are now fully active.</p>
              </div>
            </section>
          </div>

          <footer className="page-footer">
            <span>ReplicaSync <span className="footer-dot">·</span> Local-first collaboration</span>
            <span>Hackathon prototype</span>
          </footer>
        </section>
      </main>
    </div>
  );
}

export default App;
