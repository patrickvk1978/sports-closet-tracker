/**
 * discover-bluesky.mjs
 *
 * Discovers active Bluesky accounts posting about the NFL Draft.
 * Casts a wide net — searches multiple terms, aggregates unique posters,
 * ranks by post frequency + recency.
 *
 * Usage:
 *   node scripts/discover-bluesky.mjs
 *
 * Output:
 *   - Top accounts by post count (good allowlist candidates)
 *   - Known reporter lookup results
 *   - Copy-paste allowlist array for useBlueskyFeed.js
 */

const BASE = "https://public.api.bsky.app/xrpc";

// Cast a wide net — will hit all of these
const SEARCH_TERMS = [
  "NFL Draft",
  "NFLDraft",
  "#NFLDraft",
  "NFL mock draft",
  "first round pick",
  "on the clock NFL",
  "trade up NFL",
  "draft pick NFL",
  "NFL combine",
  "Scouting combine",
];

// Known reporters/analysts to look up directly by name
const KNOWN_NAMES = [
  "Adam Schefter",
  "Ian Rapoport",
  "Tom Pelissero",
  "Mike Garafolo",
  "Jeremy Fowler",
  "Mina Kimes",
  "Albert Breer",
  "Dianna Russini",
  "Daniel Jeremiah",
  "Mel Kiper",
  "Todd McShay",
  "Peter Schrager",
  "Jordan Schultz",
  "Field Yates",
  "Dov Kleiman",
  "Benjamin Allbright",
  "Matt Miller",
  "Steve Palazzolo",
  "Seth Walder",
  "Marcus Mosher",
  "Dane Brugler",
  "Ryan Wilson",
  "Chris Trapasso",
  "Charlie Campbell",
  "Eric Edholm",
  "Jeff McLane",
  "Jonathan Jones",
  "Josina Anderson",
  "Charles Robinson",
  "Jason La Canfora",
  "Mike Silver",
  "Jay Glazer",
  "Diana Russini",
  "Nick Shook",
  "Turron Davenport",
  "Mike Reiss",
  "Rich Campbell",
  "John Keim",
  "Nicki Jhabvala",
];

async function get(endpoint, params = {}) {
  const url = new URL(`${BASE}/${endpoint}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url.toString(), {
    headers: { "Accept": "application/json" },
  });
  if (!res.ok) throw new Error(`${endpoint} → ${res.status}`);
  return res.json();
}

async function searchPosts(query, limit = 25) {
  try {
    const data = await get("app.bsky.feed.searchPosts", {
      q: query,
      limit,
      sort: "latest",
    });
    return data.posts ?? [];
  } catch {
    return [];
  }
}

async function searchActors(query, limit = 5) {
  try {
    const data = await get("app.bsky.actor.searchActors", { q: query, limit });
    return data.actors ?? [];
  } catch {
    return [];
  }
}

function timeSince(isoDate) {
  const ms = Date.now() - new Date(isoDate).getTime();
  const h = Math.floor(ms / 3600000);
  if (h < 1) return `${Math.floor(ms / 60000)}m ago`;
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

// ── Main ──────────────────────────────────────────────────────────────────────

console.log("🔍 Searching Bluesky for NFL Draft activity...\n");

// 1. Search posts — aggregate unique posters
const authorMap = new Map(); // did → { handle, displayName, postCount, latestPost }

for (const term of SEARCH_TERMS) {
  process.stdout.write(`  Searching "${term}"... `);
  const posts = await searchPosts(term, 30);
  console.log(`${posts.length} posts`);

  for (const post of posts) {
    const a = post.author;
    if (!a?.did) continue;
    const existing = authorMap.get(a.did);
    const postDate = post.indexedAt ?? post.record?.createdAt;
    if (existing) {
      existing.postCount++;
      if (postDate > existing.latestPost) existing.latestPost = postDate;
    } else {
      authorMap.set(a.did, {
        handle: a.handle,
        displayName: a.displayName ?? a.handle,
        postCount: 1,
        latestPost: postDate,
        did: a.did,
      });
    }
  }

  // Small delay to be polite
  await new Promise(r => setTimeout(r, 150));
}

// 2. Direct actor lookup for known names
console.log("\n🎙️  Looking up known reporters...\n");
const foundReporters = [];

for (const name of KNOWN_NAMES) {
  const actors = await searchActors(name, 3);
  // Take the first result whose display name is a close match
  const match = actors.find(a =>
    a.displayName?.toLowerCase().includes(name.split(" ")[1]?.toLowerCase() ?? "") ||
    a.handle?.toLowerCase().includes(name.split(" ")[1]?.toLowerCase() ?? "")
  ) ?? actors[0];

  if (match) {
    const lastPost = match.indexedAt ?? null;
    const verified = match.verification ?? null;
    foundReporters.push({
      name,
      handle: match.handle,
      displayName: match.displayName,
      did: match.did,
      followersCount: match.followersCount ?? 0,
      postsCount: match.postsCount ?? 0,
    });
    process.stdout.write(`  ✓ ${name.padEnd(22)} → @${match.handle} (${(match.followersCount ?? 0).toLocaleString()} followers)\n`);
  } else {
    process.stdout.write(`  ✗ ${name} — not found\n`);
  }
  await new Promise(r => setTimeout(r, 100));
}

// ── Results ───────────────────────────────────────────────────────────────────

const topPosters = [...authorMap.values()]
  .sort((a, b) => b.postCount - a.postCount || b.latestPost?.localeCompare(a.latestPost ?? "") )
  .slice(0, 40);

console.log("\n\n══════════════════════════════════════════");
console.log("  TOP ACCOUNTS BY NFL DRAFT POST VOLUME");
console.log("══════════════════════════════════════════\n");

topPosters.forEach((a, i) => {
  console.log(
    `${String(i + 1).padStart(2)}. ${a.displayName.padEnd(28)} @${a.handle.padEnd(30)} ${String(a.postCount).padStart(2)} posts  ${timeSince(a.latestPost)}`
  );
});

console.log("\n\n══════════════════════════════════════════");
console.log("  KNOWN REPORTERS FOUND (sorted by followers)");
console.log("══════════════════════════════════════════\n");

foundReporters
  .sort((a, b) => b.followersCount - a.followersCount)
  .forEach(r => {
    console.log(`  @${r.handle.padEnd(32)} ${r.displayName.padEnd(24)} ${r.followersCount.toLocaleString()} followers`);
  });

// ── Allowlist output ──────────────────────────────────────────────────────────

// Combine: known reporters with >100 followers + top posters appearing in both
const allowlistCandidates = new Set([
  ...foundReporters.filter(r => r.followersCount > 100).map(r => r.handle),
  ...topPosters.slice(0, 20).map(a => a.handle),
]);

console.log("\n\n══════════════════════════════════════════");
console.log("  COPY-PASTE ALLOWLIST (review before using)");
console.log("══════════════════════════════════════════\n");
console.log("const BLUESKY_ALLOWLIST = [");
for (const handle of allowlistCandidates) {
  console.log(`  "${handle}",`);
}
console.log("];\n");

console.log("Done. Review the list above — remove bots/irrelevant accounts before pasting into useBlueskyFeed.js.\n");
