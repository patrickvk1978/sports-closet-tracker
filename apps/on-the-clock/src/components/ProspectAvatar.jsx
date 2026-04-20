/**
 * ProspectAvatar — resolves a prospect photo against the public manifest.
 *
 * Usage:
 *   <ProspectAvatar prospect={prospect} size="md" />
 *
 * Resolution order:
 *   1. manifest hit by prospect id
 *   2. manifest hit by normalized name (from /prospect-headshots/2026/manifest.json)
 *   3. direct id path fallback
 *   4. slugified-name fallback (tries /prospect-headshots/2026/{slug}.png directly)
 *   5. monogram tile with the prospect's initials
 *
 * The manifest is fetched once, cached in module scope. Size variants map
 * to .pa-avatar.sm | .md | .lg | .xl via index.css.
 */
import { useEffect, useState } from "react";

const MANIFEST_URL = "/prospect-headshots/2026/manifest.json";

// Module-level cache — one fetch per page load
let manifestPromise = null;
let manifestLookup = null; // Map<prospectId|normalizedName, path>

function normalizeName(name = "") {
  return name
    .toLowerCase()
    .replace(/\./g, "")
    .replace(/'/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-");
}

function loadManifest() {
  if (manifestPromise) return manifestPromise;
  manifestPromise = fetch(MANIFEST_URL)
    .then((r) => (r.ok ? r.json() : []))
    .then((entries) => {
      const map = new Map();
      for (const entry of entries ?? []) {
        if (entry?.name && entry?.path) {
          map.set(normalizeName(entry.name), entry.path);
        }
        if (entry?.id && entry?.path) {
          map.set(entry.id, entry.path);
        }
      }
      manifestLookup = map;
      return map;
    })
    .catch(() => {
      manifestLookup = new Map();
      return manifestLookup;
    });
  return manifestPromise;
}

function initials(name = "") {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "—";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function resolveAvatarPath(prospect, map) {
  if (!prospect) return null;

  if (prospect.id && map?.get(prospect.id)) {
    return map.get(prospect.id);
  }

  const normalized = prospect.name ? normalizeName(prospect.name) : null;
  if (normalized && map?.get(normalized)) {
    return map.get(normalized);
  }

  if (prospect.id) {
    return `/prospect-headshots/2026/${prospect.id}.png`;
  }

  if (normalized) {
    return `/prospect-headshots/2026/${normalized}.png`;
  }

  return null;
}

export default function ProspectAvatar({ prospect, size = "md", className = "" }) {
  const [src, setSrc] = useState(() => {
    if (!prospect || !manifestLookup) return null;
    return resolveAvatarPath(prospect, manifestLookup);
  });
  const [errored, setErrored] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setErrored(false);
    if (!prospect?.name && !prospect?.id) { setSrc(null); return; }

    // Try cached manifest first
    if (manifestLookup) {
      setSrc(resolveAvatarPath(prospect, manifestLookup));
      return;
    }

    // Load manifest then resolve
    loadManifest().then((map) => {
      if (cancelled) return;
      setSrc(resolveAvatarPath(prospect, map));
    });

    return () => { cancelled = true; };
  }, [prospect?.id, prospect?.name]);

  const showImage = src && !errored;
  const label = initials(prospect?.name);

  return (
    <div className={`pa-avatar ${size} ${showImage ? "has-image" : "monogram"} ${className}`}>
      {showImage ? (
        <img
          src={src}
          alt={prospect?.name ?? ""}
          onError={() => setErrored(true)}
          loading="lazy"
          draggable={false}
        />
      ) : (
        <span className="pa-initials">{label}</span>
      )}
    </div>
  );
}
