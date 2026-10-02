-- Allow authenticated users to receive Realtime broadcasts on loxone-live-* topics.
-- Without this policy, realtime.messages (RLS enabled, 0 policies) blocks all reads
-- and the channel is closed by the server shortly after SUBSCRIBED.
CREATE POLICY "Authenticated can read loxone-live broadcast topics"
ON realtime.messages
FOR SELECT
TO authenticated
USING (
  realtime.topic() LIKE 'loxone-live-%'
);