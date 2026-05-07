-- Migration 005: Fix match_chunks to correctly JOIN with trained_files
-- The previous version may have had a JOIN issue causing 0 results.
-- This version uses a LEFT JOIN so chunks are always returned even if
-- the trained_files row is missing, and falls back to metadata JSONB.

-- Must drop first because return type is changing
DROP FUNCTION IF EXISTS match_chunks(vector, double precision, integer);

CREATE OR REPLACE FUNCTION match_chunks (
  query_embedding vector(1536),
  match_threshold float DEFAULT 0.0,
  match_count int DEFAULT 8
)
RETURNS TABLE (
  id bigint,
  content text,
  metadata jsonb,
  similarity float,
  filename text,
  uploaded_at timestamptz,
  file_description text
)
LANGUAGE sql STABLE
AS $$
  SELECT
    c.id,
    c.content,
    c.metadata,
    1 - (c.embedding <=> query_embedding) AS similarity,
    COALESCE(tf.filename, c.metadata->>'filename') AS filename,
    COALESCE(tf.uploaded_at, (c.metadata->>'uploaded_at')::timestamptz) AS uploaded_at,
    tf.description AS file_description
  FROM chunks_table c
  LEFT JOIN trained_files tf ON tf.id = c.file_id
  WHERE 1 - (c.embedding <=> query_embedding) > match_threshold
  ORDER BY c.embedding <=> query_embedding
  LIMIT match_count;
$$;
