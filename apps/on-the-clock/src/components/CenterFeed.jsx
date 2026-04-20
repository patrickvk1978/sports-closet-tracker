/**
 * CenterFeed — middle column content during live draft.
 * Currently: Bluesky allowlist feed.
 * Structured so future card types (pool events, admin notes) slot in alongside.
 */
import BlueskyPost from "./BlueskyPost";
import { useBlueskyFeed } from "../hooks/useBlueskyFeed";

export default function CenterFeed({ isLive = false }) {
  const { posts, loading, lastFetched, refresh } = useBlueskyFeed({ isLive });

  return (
    <div className="cf-wrap">
      <div className="cf-header">
        <div className="cf-title">
          <span className="cf-bsky-logo">🦋</span>
          Around the Draft
        </div>
        <div className="cf-header-right">
          {lastFetched && (
            <span className="cf-last-fetched">
              {lastFetched.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </span>
          )}
          <button className="cf-refresh-btn" type="button" onClick={refresh} title="Refresh feed">
            ↺
          </button>
        </div>
      </div>

      <div className="cf-posts">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="bsky-post-skeleton">
              <div className="skeleton-block" style={{ width: 36, height: 36, borderRadius: 18, flexShrink: 0 }} />
              <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
                <div className="skeleton-line" style={{ width: "55%" }} />
                <div className="skeleton-line" style={{ width: "90%" }} />
                <div className="skeleton-line" style={{ width: "75%" }} />
              </div>
            </div>
          ))
        ) : posts.length === 0 ? (
          <div className="cf-empty">
            <div className="cf-empty-icon">🦋</div>
            <div className="cf-empty-msg">No posts yet — check back once the draft kicks off.</div>
          </div>
        ) : (
          posts.map((post) => <BlueskyPost key={post.uri} post={post} />)
        )}
      </div>

      <div className="cf-footer">
        Powered by <a href="https://bsky.app" target="_blank" rel="noopener noreferrer">Bluesky</a>
        {" · "}
        <a href="https://bsky.app" target="_blank" rel="noopener noreferrer">Open app →</a>
      </div>
    </div>
  );
}
