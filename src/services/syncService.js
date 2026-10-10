
import { supabase } from "./supabase.js";

// Save an operation safely, even if it is retried.
export async function saveOperation(operation) {
    const row =
        typeof operation.toDatabaseRow === "function"
            ? operation.toDatabaseRow()
            : operation;

    const { error } = await supabase
        .from("sync_operations")
        .upsert(row, {
            onConflict: "op_id",
            ignoreDuplicates: true,
        });

    if (error) {
        throw error;
    }

    return row;
}

// Get operations for a room.
export async function getRoomOperations(roomId) {
    const { data, error } = await supabase
        .from("sync_operations")
        .select("*")
        .eq("room_id", roomId)
        .order("created_at", { ascending: true });

    if (error) {
        throw error;
    }

    return data;
}
