import { useCallback, useEffect, useState } from "react";
import { draftDb, supabase } from "../lib/supabase";
import { useAuth } from "./useAuth";
import { usePool } from "./usePool";

export function usePoolChat() {
  const { session, profile } = useAuth();
  const { pool, memberList } = usePool();
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);

  const poolId = pool?.id ?? null;
  const userId = session?.user?.id ?? profile?.id ?? null;

  const nameById = new Map(memberList.map((member) => [member.id, member.name]));

  const load = useCallback(async () => {
    if (!poolId) {
      setMessages([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data } = await draftDb
      .from("pool_chat_messages")
      .select("id, pool_id, user_id, body, created_at")
      .eq("pool_id", poolId)
      .order("created_at", { ascending: false })
      .limit(40);

    setMessages((data ?? []).reverse());
    setLoading(false);
  }, [poolId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!poolId) return undefined;
    const channel = supabase
      .channel(`pool-chat-${poolId}`)
      .on("postgres_changes", {
        event: "INSERT",
        schema: "draft",
        table: "pool_chat_messages",
        filter: `pool_id=eq.${poolId}`,
      }, (payload) => {
        setMessages((prev) => [...prev.slice(-39), payload.new]);
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [poolId]);

  async function sendMessage(body) {
    const trimmed = body.trim();
    if (!poolId || !userId || !trimmed) return { error: "Message required" };
    return draftDb.from("pool_chat_messages").insert({
      pool_id: poolId,
      user_id: userId,
      body: trimmed.slice(0, 500),
    });
  }

  return {
    messages: messages.map((message) => ({
      ...message,
      authorName: nameById.get(message.user_id) ?? "Member",
      isCurrentUser: message.user_id === userId,
    })),
    loading,
    sendMessage,
  };
}
