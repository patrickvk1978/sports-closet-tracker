import { Link } from 'react-router-dom'

const PRIORITY_CLASS = {
  high:   'commentary-card--high',
  medium: 'commentary-card--medium',
  low:    'commentary-card--low',
}

/**
 * Renders a single commentary output card.
 * Works for any game type — data comes from commentary_outputs table.
 *
 * @param {import('@sports/shared/types').CommentaryOutput} commentary
 */
export default function CommentaryCard({ commentary }) {
  const { headline, body, action_label, action_target, priority = 'medium', tags = [] } = commentary

  return (
    <div className={`commentary-card ${PRIORITY_CLASS[priority] ?? ''}`}>
      <p className="commentary-card__headline">{headline}</p>
      {body && <p className="commentary-card__body">{body}</p>}
      {tags.length > 0 && (
        <div className="commentary-card__tags">
          {tags.map(tag => (
            <span key={tag} className="commentary-card__tag">{tag}</span>
          ))}
        </div>
      )}
      {action_label && action_target && (
        <Link to={action_target} className="commentary-card__action">
          {action_label} →
        </Link>
      )}
    </div>
  )
}
