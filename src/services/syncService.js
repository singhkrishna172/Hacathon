
import { supabase } from "./supabase.js";

// Save one operation to Supabase
export async function saveOperation(operation) {
    const { data, error } = await supabase
        .from("sync_operations")
        .insert(operation.toDatabaseRow())
        .select()
        .single();

    if (error) {
        throw error;
    }

    return data;
}

// Get operations for a room
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
