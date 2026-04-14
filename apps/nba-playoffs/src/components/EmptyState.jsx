export default function EmptyState({ icon = "📋", title, body, action }) {
  return (
    <div className="empty-state">
      <div className="empty-state-icon">{icon}</div>
      {title ? <strong>{title}</strong> : null}
      {body ? <p>{body}</p> : null}
      {action ?? null}
    </div>
  );
}
