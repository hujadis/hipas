CREATE TABLE IF NOT EXISTS hidden_positions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  position_key TEXT NOT NULL UNIQUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

alter publication supabase_realtime add table hidden_positions;
