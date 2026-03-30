import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

// Server client — uses service role, bypasses RLS
export function createServerClient() {
  return createClient(supabaseUrl, supabaseServiceKey)
}

// Browser client singleton
let browserClient: ReturnType<typeof createClient> | null = null

export function createBrowserClient() {
  if (browserClient) return browserClient
  browserClient = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: true },
  })
  return browserClient
}
