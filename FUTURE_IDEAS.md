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
- **Confidence pick scoring** — Option for users to rank the games in each round based on level of confidence, e.g., in round one, I assign Duke beating the 16-seed 32 points, and SMU beating the 8-seed 1 point.
- **Expected Score** — Use historical win probability numbers to calculate total Expected Score (by round, overall)
- **Expected Score versus Actual Score** - Another metric to follow.

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

## Bracket Archetype Personas

Analyze each player's bracket picking style and assign them a college basketball persona based on famous characters and moments. Could show up on their profile, in the leaderboard, or as a fun onboarding result ("Your bracket style is...").

| Style | Persona | Why It Works |
|---|---|---|
| Maximum chalk | **Coach K** | Blue blood royalty — always expects the best teams to win |
| Upset chaos | **Sister Jean** | Pure faith, miracles happen, Loyola-Chicago energy |
| One team carry | **Christian Laettner** | Everything rides on one moment, one team, one shot |
| Contrarian | **The Gonzaga Believer** | Before they were a 1-seed, picking them was insane — nobody sees what you see |
| Balanced / smart | **Jay Wright** | Villanova ran the most complete brackets — no weakness anywhere |
| Cinderella believer | **UMBC** | The first 16-over-1 — you think the impossible is possible |
| Heavy favorite lean | **Kentucky Blue** | Big programs, top seeds, recruiting rankings = championships |
| Boom or bust | **Bo Kimble** | The left-handed free throw — all heart, all or nothing, legendary if it hits |
| Hedge everything | **Jim Boeheim** | Syracuse zone — protect everything, concede nothing easy, grind out a top 10 |
| Regional homer | **Dick Vitale** | "ARE YOU SERIOUS?!" Passion for your guys clouds all judgment |
| Copycat / chalk consensus | **The Bracket Obama** | Remember when Obama filled out a bracket on ESPN? Safe, polished, very public |
| Wildcard | **The Mascot** | Like a random mascot rushing the court — nobody knows what's coming or why |

*Implementation idea: compute the archetype from each player's bracket data (seed distribution of picks, upset rate, chalk %) and display it as a badge. Could be funny and shareable.*

---

## Distinguishing Features

Ideas that could set this apart from every other bracket app.

### Hedge Bet Alert
When your champion or Final Four pick is playing tonight and still alive, calculate the optimal hedge bet. "You have Duke to win it all. They're -180 tonight. Betting $47 on Michigan St locks in a net positive regardless of outcome." Pulls live odds from DraftKings/FanDuel, shows the exact dollar amount and guaranteed return. Nobody else does this.

### The Reaper
One team each round that, if eliminated, would simultaneously destroy the most players' championship hopes. "If Kentucky loses tonight, 9 of 15 players lose their champion pick." Creates a shared villain/hero dynamic — the whole pool watches the same game together. Could trigger a push notification when The Reaper plays.

### Sweat Index
A live leaderboard during games ranked by who's sweating most — calculated from leverage score × proximity to the lead. The person with the highest stake in a live game floats to the top. Fun to watch in real time during game nights together.

### Chaos Meter
A tournament-wide volatility score tracking how upset-heavy this year has been vs. historical averages. Updates after every game. Shows which players are positioned to benefit from continued chaos vs. which ones need chalk to run. Gives narrative context to the whole tournament.

### Bracket Autopsy
A personal post-mortem for each player after they're eliminated — the story of how their bracket died:
- **The death moment** — the exact game and date their chances collapsed
- **The fork in the road** — the single pick that, if corrected, would have kept them in contention
- **Their peak** — "You were in 1st place after the Round of 32. Here's what happened after that."
- **Points left on the table** — not against a perfect bracket, but against their own potential ("You correctly picked 11 of 12 Final Four teams through the Sweet 16 — your bracket was elite until that one miss")

Shareable at the end of the tournament.

---

## Wild Ideas (Longer Term)
- **AI-generated pool recap** — end-of-day summary written in natural language ("Today was brutal for chalk pickers...")
- **Confidence picks mode** — alternative scoring where you assign confidence points to each pick
- **Survivor pool mode** — different game type, pick one team per round, get it wrong and you're out
- **Multi-sport** — generalize the engine for NFL playoffs, World Cup, etc.
- **Slack/Discord bot** — post leverage alerts and score updates directly into a group chat
- **Opportunity to edit brackets each week** — thinking about an alternative way of doing brackets that allows for making new selections every Monday through Thursday afternoon. Might engage folks who would otherwise be eliminated. Perhaps reward entries with more points for getting selections correct earlier. 

---

*Add your ideas below — just put your name next to them so we know who to ask for context.*

### Bracket Selection Interface
- Clicking on team -> win probability imported from trusted site (DK Sportsbook? CBS?)
- Information on game theory-based recommendations based on win probabilities and pool size
