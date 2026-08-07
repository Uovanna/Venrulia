import React from "react";
import { ICON_SPRITE, ICON_IDS } from "./icons-sprite.js";
import { EMOJI_ICON, stripVS } from "../design/emoji-map.mjs";

/* ============================================================================
   THE ICON SWAP
   ----------------------------------------------------------------------------
   886 emoji occurrences across 165 distinct glyphs, in three different shapes:
   data fields (`icon: "⛏️"`), literal JSX text, and — for 152 of them — inside
   plain strings passed to addLog and showNotif.

   Rewriting all 886 call sites by hand would be an enormous diff with an
   enormous number of places to be subtly wrong, and it could not be done in one
   step without leaving the game half-converted. So the swap is a LOOKUP applied
   at the render boundary instead: `withIcons(text)` turns any string into the
   same string with its emoji replaced by drawings, and every one of those three
   shapes goes through it.

   An emoji with no mapping renders as itself. That is deliberate — coverage can
   grow one entry at a time in design/emoji-map.mjs without a flag day, and
   nothing can silently vanish from the screen because a table was incomplete.
   ============================================================================ */

const HAS = new Set(ICON_IDS);

/* The sprite has to be in the document exactly once — <use href="#id"> resolves
   against the document, so a second copy would duplicate every symbol id and the
   references would bind to whichever came first. Mounted at the app root. */
export const IconSprite = () => (
  <div aria-hidden="true" style={{ position: "absolute", width: 0, height: 0, overflow: "hidden" }}
       dangerouslySetInnerHTML={{ __html: ICON_SPRITE }} />
);

/* Icons inherit currentColor and sit on the text baseline, so an icon beside a
   word is the same ink and the same weight as the word. That is the whole reason
   the set is stroke-only. */
export const Icon = ({ name, size = 16, title, style }) => {
  if (!HAS.has(name)) return null;
  return (
    <svg width={size} height={size} role={title ? "img" : undefined}
         aria-hidden={title ? undefined : "true"} aria-label={title}
         style={{ display: "inline-block", verticalAlign: "-0.14em", flex: "none", ...style }}>
      {title ? <title>{title}</title> : null}
      <use href={`#i-${name}`} />
    </svg>
  );
};

/* An emoji straight from a data table (`zone.icon`, `building.icon`). Falls back
   to rendering the emoji itself so an unmapped table entry still shows something. */
export const EmojiIcon = ({ emoji, size = 16, style }) => {
  const id = EMOJI_ICON[stripVS(emoji || "")];
  return id && HAS.has(id) ? <Icon name={id} size={size} style={style} /> : <>{emoji}</>;
};

const PICTO = /(\p{Extended_Pictographic}️?)/gu;

/* Split a string on its emoji and swap the ones we have drawings for.
   Returns a React fragment; safe to call on any string, including one with none.

   Trailing space handling matters more than it looks: the source writes
   "⚔️ Adventure Gate", and an <svg> followed by a normal space renders with a
   visibly wider gap than the emoji did. The space immediately after a converted
   glyph is dropped and the gap comes from margin instead, so the rhythm of every
   existing label survives the swap untouched. */
export const withIcons = (text, size = 15) => {
  if (typeof text !== "string" || !text) return text;
  const parts = text.split(PICTO);
  if (parts.length === 1) return text;
  const out = [];
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i];
    if (!p) continue;
    const id = EMOJI_ICON[stripVS(p)];
    if (id && HAS.has(id)) {
      out.push(<Icon key={i} name={id} size={size} style={{ marginRight: ".28em" }} />);
      const next = parts[i + 1];
      if (typeof next === "string" && next.startsWith(" ")) parts[i + 1] = next.slice(1);
    } else {
      out.push(p);
    }
  }
  return <>{out}</>;
};
