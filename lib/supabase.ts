import { createClient, SupabaseClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

// Singleton — one client instance to avoid storage lock conflicts
let clientInstance: SupabaseClient | null = null

export const createSupabaseClient = () => {
  if (typeof window === 'undefined') {
    // Server-side: always create fresh
    return createClient(supabaseUrl, supabaseAnonKey)
  }
  if (!clientInstance) {
    clientInstance = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: true,
        storageKey: 'slicer-auth',
        storage: window.localStorage,
        autoRefreshToken: true,
        detectSessionInUrl: false,
      },
    })
  }
  return clientInstance
}

// Server-side client (no singleton needed)
export const createSupabaseServerClient = () =>
  createClient(supabaseUrl, supabaseAnonKey)

// Service role client for admin operations (API routes only)
export const createSupabaseAdmin = () =>
  createClient(
    supabaseUrl,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
