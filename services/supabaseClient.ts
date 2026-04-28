
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://scsmogcniirayhzvteqy.supabase.co';
// Anon JWT key — safe for browser use, required by supabase-js 2.x for unauthenticated edge function calls
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNjc21vZ2NuaWlyYXloenZ0ZXF5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg5ODU4MDQsImV4cCI6MjA4NDU2MTgwNH0.m0AyRNnniQpA6QUWbLueZpOGX0-2WPsT-c3AcETXXcg';

// Hoofd-client — gebruikt user session JWT als de gebruiker is ingelogd
export const supabase = createClient(supabaseUrl, supabaseKey);

// Edge function client — stuurt altijd de anon key mee, ook als de gebruiker is ingelogd.
// supabase-js vervangt anders automatisch de Authorization header met de user JWT,
// waardoor edge functions een 401 teruggeven.
export const supabaseFunctions = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false, autoRefreshToken: false },
  global: { headers: { Authorization: `Bearer ${supabaseKey}` } },
});
