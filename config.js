// Paste the two values from Supabase: Project Settings -> API.
// The anon key is meant to be public. Your data is protected by the row level security in schema.sql.
window.TPD_CONFIG = {
  SUPABASE_URL: "",       // e.g. "https://abcdxyz.supabase.co"
  SUPABASE_ANON_KEY: "",  // the long "anon public" key
  GOOGLE_LOGIN: false     // set to true after enabling Google in Supabase (see README)
};
