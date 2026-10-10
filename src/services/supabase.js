import { createClient } from "@supabase/supabase-js";

const supabaseUrl =
  import.meta.env.VITE_SUPABASE_URL ||
  "https://dtnxnccgphyhbjfojsmn.supabase.co";

const supabaseKey =
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  "sb_publishable_iS1RLaMnmcDBZf6AT7-Rjg_koR9U5KL";

if (!supabaseUrl || !supabaseKey) {
  throw new Error(
    "Supabase credentials are missing. Check .env.local"
  );
}

export const supabase = createClient(supabaseUrl, supabaseKey);
export default supabase;
