import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

// Client-side Supabase client (singleton)
export const createSupabaseClient = () =>
  createClient(supabaseUrl, supabaseAnonKey)

// Server-side Supabase client (same, used in API routes)
export const createSupabaseServerClient = () =>
  createClient(supabaseUrl, supabaseAnonKey)

// Service role client for admin operations (API routes only)
export const createSupabaseAdmin = () =>
  createClient(
    supabaseUrl,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
