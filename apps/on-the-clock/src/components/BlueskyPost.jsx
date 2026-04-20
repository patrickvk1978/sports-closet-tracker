/**
 * BlueskyPost — a single post card in the center feed.
 * Links out to bsky.app. Avatar falls back to initials.
 */
function timeSince(isoDate) {
  const ms = Date.now() - new Date(isoDate).getTime();
  const m = Math.floor(ms / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

function initials(name = "") {
  return name.trim().split(/\s+/).filter(Boolean)
    .map((w) => w[0]).slice(0, 2).join("").toUpperCase() || "?";
}

export default function BlueskyPost({ post }) {
  return (
    <a
      className="bsky-post"
      href={post.url}
      target="_blank"
      rel="noopener noreferrer"
    >
      <div className="bsky-post-avatar">
        {post.avatar
          ? <img src={post.avatar} alt={post.displayName} />
          : <span>{initials(post.displayName)}</span>
        }
      </div>
      <div className="bsky-post-body">
        <div className="bsky-post-header">
          <span className="bsky-post-name">{post.displayName}</span>
          <span className="bsky-post-handle">@{post.handle}</span>
          <span className="bsky-post-time">{timeSince(post.createdAt)}</span>
        </div>
        <div className="bsky-post-text">{post.text}</div>
        {(post.likeCount > 0 || post.repostCount > 0) && (
          <div className="bsky-post-stats">
            {post.repostCount > 0 && <span>↺ {post.repostCount}</span>}
            {post.likeCount > 0 && <span>♥ {post.likeCount}</span>}
          </div>
        )}
      </div>
    </a>
  );
}
