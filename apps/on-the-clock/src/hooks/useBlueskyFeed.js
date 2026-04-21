/**
 * useBlueskyFeed — fetches recent posts from the Bluesky allowlist.
 *
 * Flow:
 *   1. On mount: load active handles from public.bluesky_allowlist
 *   2. For each handle: fetch their recent posts via Bluesky public API
 *   3. Merge, dedupe, sort by date, return top N
 *   4. Re-poll every POLL_MS during live draft
 *
 * No auth required — uses public.api.bsky.app which supports CORS.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabase";

const BSKY_BASE = "https://public.api.bsky.app/xrpc";
const POSTS_PER_HANDLE = 5;
const MAX_POSTS = 20;
const POLL_MS_LIVE    = 30_000;   // 30 s during live draft
const POLL_MS_PREDRAFT = 300_000;  // 5 min pre-draft

async function fetchAuthorFeed(handle) {
  try {
    const url = `${BSKY_BASE}/app.bsky.feed.getAuthorFeed?actor=${encodeURIComponent(handle)}&limit=${POSTS_PER_HANDLE}&filter=posts_no_replies`;
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.feed ?? []).map(({ post }) => ({
      uri:         post.uri,
      cid:         post.cid,
      handle:      post.author.handle,
      displayName: post.author.displayName ?? post.author.handle,
      avatar:      post.author.avatar ?? null,
      text:        post.record?.text ?? "",
      createdAt:   post.record?.createdAt ?? post.indexedAt,
      indexedAt:   post.indexedAt,
      likeCount:   post.likeCount ?? 0,
      repostCount: post.repostCount ?? 0,
      url: `https://bsky.app/profile/${post.author.handle}/post/${post.uri.split("/").pop()}`,
    }));
  } catch {
    return [];
  }
}

export function useBlueskyFeed({ isLive = false } = {}) {
  const [posts, setPosts] = useState([]);
  const [handles, setHandles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [lastFetched, setLastFetched] = useState(null);
  const [error, setError] = useState("");
  const pollRef = useRef(null);

  // Load active handles from Supabase
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");

    supabase
      .from("bluesky_allowlist")
      .select("handle, display_name")
      .eq("active", true)
      .then(({ data, error: allowlistError }) => {
        if (cancelled) return;
        if (allowlistError) {
          setError(allowlistError.message);
          setHandles([]);
          setLoading(false);
          return;
        }
        setHandles((data ?? []).map((r) => r.handle));
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const fetchPosts = useCallback(async () => {
    if (!handles.length) {
      setPosts([]);
      setLastFetched(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError("");
    const results = await Promise.all(handles.map(fetchAuthorFeed));
    const seen = new Set();
    const merged = results
      .flat()
      .filter((p) => {
        if (seen.has(p.uri)) return false;
        seen.add(p.uri);
        return true;
      })
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .slice(0, MAX_POSTS);

    setPosts(merged);
    setLastFetched(new Date());
    setLoading(false);
  }, [handles]);

  // Initial fetch + continuous poll (30 s live, 5 min pre-draft)
  useEffect(() => {
    if (!handles.length) {
      if (pollRef.current) clearInterval(pollRef.current);
      setPosts([]);
      setLoading(false);
      return;
    }
    fetchPosts();

    const interval = isLive ? POLL_MS_LIVE : POLL_MS_PREDRAFT;
    pollRef.current = setInterval(fetchPosts, interval);

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [handles, isLive, fetchPosts]);

  return { posts, loading, lastFetched, refresh: fetchPosts, handles, error };
}
