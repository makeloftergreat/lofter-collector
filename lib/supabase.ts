import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://ncvhslfqibhljwugqnww.supabase.co";
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "sb_publishable_UCDr_KBV6c1iWNiqU9h5OQ_RU6CHhYa";

export const supabase = createClient(supabaseUrl, supabaseKey);
