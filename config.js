// Paste the two values from Supabase: Project Settings -> API.
// The anon key is meant to be public. Your data is protected by the row level security in schema.sql.
window.TPD_CONFIG = {
  SUPABASE_URL: "https://iefeuxfbzfbdsskksuuk.supabase.co",       // e.g. "https://abcdxyz.supabase.co"
  SUPABASE_ANON_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImllZmV1eGZiemZiZHNza2tzdXVrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE0NTExMzksImV4cCI6MjEwNzAyNzEzOX0.2QDWKYGYOrNZsSR4oWx9OG1AXAWBSe0xwu-7JOQrpB0",  // the long "anon public" key
  GOOGLE_LOGIN: true     // set to true after enabling Google in Supabase (see README)
};
