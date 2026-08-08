import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Edge functions run with SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY injected
// automatically by the Supabase platform — no manual secret needed for these two.
export const supabaseAdmin = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);
