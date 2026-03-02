# Future State Ideas — Sports Closet Tournament Tracker

A shared space for the team to capture ideas as we think through where to take this app. Add anything — big or small, technical or product. Nothing is too early to write down.

---

## Current State (Phase 1 — Complete)
- Static prototype with mock data (2015 tournament)
- Dashboard with personal standing, leverage alerts, leaderboard, race chart
- Matrix view — players × games with sticky headers, sort/filter
- Bracket view — regional brackets with SVG connectors, Final Four tab
- Deployed on Vercel, connected to GitHub

---

## Planned Phases

### Phase 2 — Backend + Real Data
- Supabase database + auth (user accounts, pool creation)
- Bracket submission UI — click to fill out picks before the tournament
- Live scoring against real game results (ESPN API or NCAA data feed)
- Pool admin tools — invite players, manage scoring settings

### Phase 3 — Simulation Engine
- Monte Carlo simulation (10,000+ runs) for win probability
- Real leverage scores based on each player's actual bracket
- Real-time recalculation after each game completes
- Supabase real-time subscriptions to push updates to all connected clients

### Phase 4 — Polish + PWA
- Service worker for offline bracket viewing
- Push notifications for high-leverage game alerts ("Duke just took the lead — your win prob is moving")
- Add-to-homescreen flow for mobile
- Performance optimization for pools with 50+ players

---

## Ideas Backlog

### Product / Features
- **Multiple pools** — support running more than one pool (e.g., office pool vs. friend group)
- **Custom scoring systems** — let the pool admin configure points per round (upsets worth more, etc.)
- **Upset bonus** — extra points for correctly picking a lower seed to win
- **Contrarian report** — highlight players with unique picks that could vault them to the top if they hit
- **"What if" simulator** — let any player explore "what happens to my chances if X team wins tonight"
- **Light mode** — dark mode is default but some users might want a light option
- **Player profile pages** — click any player to see their full bracket, pick history, and win prob over time
- **Pick entry deadline enforcement** — lock brackets at tip-off of the first game
- **Tiebreaker** — championship game total score tiebreaker for end-of-pool ties

### Dashboard
- **Biggest movers card** — who gained/lost the most win probability today
- **"You need to root for" widget** — given your bracket, which teams should you be cheering for tonight
- **Elimination feed** — live ticker when a player's champion or Final Four pick gets knocked out
- **Historical comparison** — how does this year's pool stack up to past years

### Matrix View
- **Heat map mode** — shade cells by consensus (darker = more players picked that team)
- **Divergence highlighting** — when you select yourself, highlight cells where your pick differs from the group
- **Export to CSV** — download the full picks matrix

### Bracket View
- **Compare two brackets** — overlay two players' picks side by side, highlight differences
- **Probability overlay** — show each team's current win probability next to their name in the bracket
- **Animated bracket** — teams advance with a short animation as results come in

### Mobile
- **Bottom navigation** — replace top nav with a thumb-friendly bottom tab bar on mobile
- **Swipe between views** — swipe left/right to move between Dashboard, Matrix, Bracket
- **Score widget** — today's game scores in a scrollable strip at the top of the Dashboard

### Technical
- **Web Workers** — run Monte Carlo simulation client-side to reduce server load
- **Recharts or D3** — richer charting library for the win probability race chart
- **Dark/light theme toggle** — persisted to localStorage
- **Keyboard navigation** — matrix view navigable with arrow keys for power users

---

## Wild Ideas (Longer Term)
- **AI-generated pool recap** — end-of-day summary written in natural language ("Today was brutal for chalk pickers...")
- **Confidence picks mode** — alternative scoring where you assign confidence points to each pick
- **Survivor pool mode** — different game type, pick one team per round, get it wrong and you're out
- **Multi-sport** — generalize the engine for NFL playoffs, World Cup, etc.
- **Slack/Discord bot** — post leverage alerts and score updates directly into a group chat

---

*Add your ideas below — just put your name next to them so we know who to ask for context.*
