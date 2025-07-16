-- Add new columns to tracked_positions table
ALTER TABLE tracked_positions ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active' CHECK (status IN ('active', 'new', 'closed'));
ALTER TABLE tracked_positions ADD COLUMN IF NOT EXISTS closed_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE tracked_positions ADD COLUMN IF NOT EXISTS final_pnl DECIMAL;
ALTER TABLE tracked_positions ADD COLUMN IF NOT EXISTS holding_duration_minutes INTEGER;
ALTER TABLE tracked_positions ADD COLUMN IF NOT EXISTS last_updated TIMESTAMP WITH TIME ZONE DEFAULT NOW();
ALTER TABLE tracked_positions ADD COLUMN IF NOT EXISTS position_key TEXT;

-- Create position_history table for comprehensive tracking
CREATE TABLE IF NOT EXISTS position_history (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  address TEXT NOT NULL,
  asset TEXT NOT NULL,
  size DECIMAL NOT NULL,
  entry_price DECIMAL NOT NULL,
  exit_price DECIMAL,
  side TEXT NOT NULL CHECK (side IN ('LONG', 'SHORT')),
  leverage DECIMAL,
  pnl DECIMAL,
  pnl_percentage DECIMAL,
  holding_duration_minutes INTEGER,
  opened_at TIMESTAMP WITH TIME ZONE NOT NULL,
  closed_at TIMESTAMP WITH TIME ZONE,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'closed')),
  position_key TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_tracked_positions_status ON tracked_positions(status);
CREATE INDEX IF NOT EXISTS idx_tracked_positions_address ON tracked_positions(address);
CREATE INDEX IF NOT EXISTS idx_tracked_positions_created_at ON tracked_positions(created_at);
CREATE INDEX IF NOT EXISTS idx_position_history_address ON position_history(address);
CREATE INDEX IF NOT EXISTS idx_position_history_status ON position_history(status);
CREATE INDEX IF NOT EXISTS idx_position_history_closed_at ON position_history(closed_at);
CREATE INDEX IF NOT EXISTS idx_position_history_position_key ON position_history(position_key);

-- Enable realtime for new table
alter publication supabase_realtime add table position_history;

-- Update existing tracked positions to have position_key
UPDATE tracked_positions 
SET position_key = address || '-' || asset 
WHERE position_key IS NULL;

-- Make position_key NOT NULL after updating existing records
ALTER TABLE tracked_positions ALTER COLUMN position_key SET NOT NULL;

-- Add unique constraint on position_key
ALTER TABLE tracked_positions ADD CONSTRAINT unique_position_key UNIQUE (position_key);