// Game-screen stylesheets, kept in the entry CSS in the order they had while OnlineApp was a static import.
// styles.css, online.css and responsive.css deliberately override several of these rules by source order
// (same selectors, mobile breakpoints). Letting them ride along with the lazy OnlineApp/App chunks would load
// them after those overrides and silently change the layout, so only the JS is split.
import "./showdown-prep.css";
import "./cinematic.css";
import "./countdown.css";
import "./exit-dialog.css";
import "./final-standings.css";
import "./open-draft.css";
import "./r2-draft-arena.css";
import "./r4-draft-arena.css";
import "./abilities.css";
import "./abilitySelection.css";
