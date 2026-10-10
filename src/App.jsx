
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
  const [currentNoteId, setCurrentNoteId] = useState(null);

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



  async function handleCreateNote() {
    setLoading(true);
    setMessage("");

    try {
      const noteId = crypto.randomUUID();
      const fields = {
        title: "Untitled Note",
        description: "",
      };

      for (const [field, value] of Object.entries(fields)) {
        const operation = new SyncOperation({
          opId: crypto.randomUUID(),
          roomId: ROOM_ID,
          clientId: CLIENT_ID,
          taskId: noteId,
          field: field,
          value: value,
          baseVersion: 0,
          counter: Date.now(),
        });

        // Save locally
        await queueOperation(operation.toDatabaseRow());

        // Sync
        try {
          await saveOperation(operation);
          await removeQueuedOperation(operation.opId);
        } catch (syncError) {
          console.warn("Sync postponed:", syncError);
        }
      }

      setCurrentNoteId(noteId);
      try { await loadOperations(); } catch (e) {}
    } catch (error) {
      console.error("Creation failed:", error);
      setMessage(`Could not save locally: ${error.message}`);
    } finally {
      setLoading(false);
    }
  }

  async function handleUpdateNote(field, value) {
    if (!currentNoteId) return;
    
    try {
      const operation = new SyncOperation({
        opId: crypto.randomUUID(),
        roomId: ROOM_ID,
        clientId: CLIENT_ID,
        taskId: currentNoteId,
        field: field,
        value: value,
        baseVersion: 0,
        counter: Date.now(),
      });
      await queueOperation(operation.toDatabaseRow());
      try {
        await saveOperation(operation);
        await removeQueuedOperation(operation.opId);
      } catch (e) {}
      await loadOperations();
    } catch (e) {
      console.error("Update failed:", e);
    }
  }

  async function handleUploadPdf(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!navigator.onLine) {
      alert("You must be online to upload real PDFs.");
      return;
    }

    setLoading(true);
    setMessage("Uploading PDF...");

    try {
      const filePath = `${ROOM_ID}/${crypto.randomUUID()}-${file.name}`;
      const { data, error } = await supabase.storage.from("documents").upload(filePath, file);

      if (error) {
        throw new Error(error.message);
      }

      const { data: publicData } = supabase.storage.from("documents").getPublicUrl(filePath);
      await handleUpdateNote("pdf_url", publicData.publicUrl);
      await handleUpdateNote("pdf_name", file.name);
      
      setMessage("PDF Attached!");
    } catch (err) {
      console.error("Upload error:", err);
      alert(`Upload failed: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }

  async function handleInviteMember() {
    const name = prompt("Enter member name to invite:");
    if (!name) return;

    setLoading(true);
    setMessage(`Inviting ${name}...`);

    try {
      const memberId = crypto.randomUUID();
      const fields = { name, type: 'member', parent_id: 'members_list' };

      for (const [field, value] of Object.entries(fields)) {
        const operation = new SyncOperation({
          opId: crypto.randomUUID(),
          roomId: ROOM_ID,
          clientId: CLIENT_ID,
          taskId: memberId,
          field: field,
          value: value,
          baseVersion: 0,
          counter: Date.now(),
        });
        
        await queueOperation(operation.toDatabaseRow());
        try {
          await saveOperation(operation);
          await removeQueuedOperation(operation.opId);
        } catch (e) {
           console.warn("Member invite sync postponed:", e);
        }
      }
      
      setMessage(`${name} invited successfully.`);
      try {
        await loadOperations();
      } catch (e) {}
    } catch (e) {
      console.error("Invite failed:", e);
    } finally {
      setLoading(false);
    }
  }


  const latestOperations = [...operations].reverse();
  const { tasks: nodes, conflicts } = applyOperations(operations);
  const uniqueConflicts = new Set(conflicts.map(c => `${c.taskId}:${c.field}`));

  // Extract notes (ignore members and pure folder edits from previous logic)
  const notes = nodes.filter(
    (n) => n.type !== 'member' && n.title !== undefined
  );
  
  const currentNote = notes.find(n => n.task_id === currentNoteId);

  // Extract synced members
  const syncedMembers = nodes.filter(n => n.type === 'member');
  // Combine current local user with synced invited users
  const allMembers = [{ task_id: 'admin', name: "You (Admin)" }, ...syncedMembers];

  // Fallback for legacy tasks (which used 'title' instead of 'name')
  const legacyTasks = nodes.filter(n => n.title && !n.name);

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-icon">R</div>
          <span>ReplicaSync</span>
        </div>

        <div className="workspace-label">WORKSPACE</div>

        <div style={{ padding: "16px", borderBottom: "1px solid #edf0f5" }}>
          <button className="primary-button" style={{ width: "100%" }} onClick={handleCreateNote}>
            <span>＋</span> New Note
          </button>
        </div>

        <nav className="sidebar-nav" style={{ padding: "16px" }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#9aa5b6", letterSpacing: 1.3, marginBottom: 10 }}>SHARED NOTES</div>
          
          {notes.length === 0 ? (
            <div style={{ fontSize: 13, color: "#8994a7" }}>No notes yet.</div>
          ) : (
            notes.map(note => (
              <button 
                key={note.task_id}
                className={`nav-item ${currentNoteId === note.task_id ? 'active' : ''}`}
                onClick={() => setCurrentNoteId(note.task_id)}
                style={{ padding: "8px 12px", width: "100%", textAlign: "left", borderRadius: 6, marginBottom: 4, cursor: "pointer", border: "none", background: currentNoteId === note.task_id ? "#eff6ff" : "transparent" }}
              >
                <span className="nav-icon">📄</span> {note.title || 'Untitled Note'}
              </button>
            ))
          )}
        </nav>

        <div style={{ padding: "20px 16px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: "#9aa5b6", letterSpacing: 1.3 }}>MEMBERS</span>
            <button onClick={handleInviteMember} style={{ border: 0, background: "transparent", color: "#2563eb", cursor: "pointer", fontSize: 11, fontWeight: 700 }}>+ Invite</button>
          </div>
          <div style={{ display: "grid", gap: 10 }}>
            {allMembers.map(m => (
              <div key={m.task_id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "#66738a" }}>
                <div style={{ width: 24, height: 24, borderRadius: "50%", background: "#e7efff", color: "#2555b8", display: "grid", placeItems: "center", fontSize: 10, fontWeight: "bold" }}>
                  {m.name ? m.name.charAt(0).toUpperCase() : '?'}
                </div>
                {m.name}
              </div>
            ))}
          </div>
        </div>

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
          <div className="breadcrumbs">
            Workspace <span>/</span> Shared Notes
          </div>
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
            <div style={{ display: "flex", gap: 10 }}>
              <button className="text-button" onClick={loadOperations}>↻ Refresh Sync</button>
            </div>
          </div>

          {currentNote ? (
            <div className="panel" style={{ display: "flex", flexDirection: "column", gap: 20 }}>
              <input 
                type="text" 
                defaultValue={currentNote.title} 
                onBlur={(e) => handleUpdateNote("title", e.target.value)}
                placeholder="Note Title..."
                style={{ fontSize: 24, fontWeight: "bold", border: "none", borderBottom: "2px solid #edf0f5", padding: "10px 0", outline: "none" }}
              />
              
              <textarea 
                defaultValue={currentNote.description || ""}
                onBlur={(e) => handleUpdateNote("description", e.target.value)}
                placeholder="Write your note description here... (Saves automatically when you click outside)"
                style={{ minHeight: 200, fontSize: 15, lineHeight: 1.6, border: "1px solid #edf0f5", borderRadius: 8, padding: 16, outline: "none", resize: "vertical" }}
              />

              <div style={{ background: "#f8fafc", padding: 16, borderRadius: 8, border: "1px solid #edf0f5", display: "flex", alignItems: "center", gap: 16 }}>
                <div>
                  <h4 style={{ margin: "0 0 4px 0", fontSize: 14 }}>Attachments</h4>
                  {currentNote.pdf_url ? (
                    <a href={currentNote.pdf_url} target="_blank" rel="noreferrer" style={{ fontSize: 13, color: "#2563eb", textDecoration: "none", display: "flex", alignItems: "center", gap: 6 }}>
                      📄 {currentNote.pdf_name || 'View Attached PDF'}
                    </a>
                  ) : (
                    <span style={{ fontSize: 13, color: "#8994a7" }}>No PDF attached yet.</span>
                  )}
                </div>
                
                <div style={{ marginLeft: "auto" }}>
                  <label htmlFor="pdf-upload" className="secondary-button" style={{ border: "1px solid #d9e5ff", background: "#fff", color: "#2563eb", cursor: "pointer", display: "inline-block", padding: "8px 16px" }}>
                    <span>↑</span> {loading ? 'Uploading...' : 'Attach PDF'}
                  </label>
                  <input 
                    id="pdf-upload" 
                    type="file" 
                    accept=".pdf,.doc,.docx"
                    onChange={handleUploadPdf}
                    style={{ display: "none" }}
                  />
                </div>
              </div>
            </div>
          ) : (
            <div className="empty-state" style={{ marginTop: 20 }}>
              <div className="empty-icon">📝</div>
              <h3>Select a note</h3>
              <p>Choose a note from the sidebar or create a new one to start writing.</p>
            </div>
          )}

          <div className="content-grid" style={{ marginTop: 40 }}>

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
