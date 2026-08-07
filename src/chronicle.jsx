import React, { useEffect, useRef } from "react";
import { CHRONICLE_CSS } from "./chronicle-css.js";
import { withIcons } from "./icons.jsx";

/* ============================================================================
   THE CHRONICLE — the combat screen, rendered as a page

   The premise: the fight is a chronicle being written down. Prose in the body,
   quantities ruled off in the margin, and colour doing grammar rather than
   decoration — rubric red for your own deeds, bole brown for what is done to
   you, verdigris for restoration, gilt for spoils.

   NO COMBAT MESSAGE WAS REWRITTEN TO GET THIS. The log already speaks in the
   right shape — "Concussive Blow: 450", "Raptor hits for 61" — so the deed is
   the part before the colon and the quantity is the number at the end. Parsing
   what is already there beat rewriting eighty-nine call sites, and it means the
   margin column works for messages nobody has written yet.
   ============================================================================ */

export const ChronicleStyles = () => <style>{CHRONICLE_CSS}</style>;

/* ---- reading an entry ------------------------------------------------------
   Three things come out of a log line: the DEED (the named thing that happened),
   the QUANTITY (which goes to the margin), and WHOSE it was.

   Kind is derived from the text, not from the colour the caller passed. The
   colours in this codebase are decorative and there are fourteen of them; the
   sentence shapes are far more stable, and there are only a handful. */

const NUM_AT_END = /^(.*?)[\s:\u2014-]*([+\u2212-]?[\d][\d,]*(?:\.\d+)?(?:\/s)?)(s)?\s*(\u26a1)?$/u;
/* The deed is whatever is named before the first colon. Pulled out FIRST, because
   the number pattern above happily eats the colon along with the spaces around it
   — which silently threw away every deed on the screen the first time this ran. */
const DEED_HEAD = /^(\S[^:]{0,39}):\s*(.*)$/;

export const chronicleKind = (text) => {
  const t = String(text || "");
  // What is done TO you. The enemy's own skills read "Raptor's Twin Shot ...",
  // and its swings read "Raptor hits for 61".
  if (/\bhits for\b|\bafflicts you\b|\bstuns you\b|'s .+ (?:afflicts|stuns|hits)/i.test(t)) return "foe";
  // Restoration. Checked before spoils so "heals for 61" is not read as a gain.
  if (/\bheal|\brestor|\babsorb|\bdrink|\bshield|\bleech/i.test(t)) return "boon";
  // Spoils: what the body gave up, and what the fight was worth.
  if (/defeated!|\bslain\b|\+\d[\d,]* ?XP|\bDust\b|\bgem\b|\breagent\b|\+\d+ /i.test(t)) return "spoil";
  // Your own hand. Every player skill and the auto-attack log as "Name: something",
  // and that something is not always a number — "Concussive Blow: target stunned
  // 2.0s" is just as much your doing as "Concussive Blow: 450", and demanding a
  // digit here filed half your own deeds as neutral asides.
  if (DEED_HEAD.test(t)) return "mine";
  return "aside";
};

export const parseEntry = (text) => {
  const raw = String(text || "");
  const head = raw.match(DEED_HEAD);
  const deed = head ? head[1].trim() : null;
  const body0 = head ? head[2] : raw;

  const m = body0.match(NUM_AT_END);
  let rest = body0, n = null, crit = false;
  if (m && m[2]) {
    rest = m[1];
    n = m[2] + (m[3] || "");
    crit = !!m[4];
  }
  return { deed, rest: rest.trim(), n, crit, kind: chronicleKind(raw) };
};

const KIND_CLASS = { foe: "is-foe", boon: "is-boon", spoil: "is-spoil", aside: "is-aside", mine: "" };

export const Chronicle = ({ log, height }) => {
  const ref = useRef(null);
  // The account is written downward: the newest line is the one you are reading,
  // so the view stays pinned to the foot of the page.
  useEffect(() => { if (ref.current) ref.current.scrollTop = ref.current.scrollHeight; }, [log]);
  return (
    <div className="chronicle" ref={ref} style={height ? { height, flex: "none", overflowY: "auto" } : undefined}>
      {log.map((e, i) => {
        const p = parseEntry(e.text);
        return (
          <p key={i} className={`entry ${KIND_CLASS[p.kind] || ""}`}>
            <span className="entry-text">
              {p.deed ? <><span className="deed">{withIcons(p.deed, 12)}</span>{p.rest ? <> {withIcons(p.rest, 12)}</> : null}</>
                      : withIcons(p.rest, 12)}
            </span>
            <span className="entry-n">{p.n ? (p.crit ? `${p.n}!` : p.n) : ""}</span>
          </p>
        );
      })}
    </div>
  );
};

/* ---- theme ----------------------------------------------------------------
   The page follows the reader's system preference and can be overridden. Stored
   per device rather than on the character: which way round the light is has
   nothing to do with who you are playing. */
const THEME_KEY = "roe_chronicle_theme";
export const loadTheme = () => {
  try { const v = localStorage.getItem(THEME_KEY); return v === "day" || v === "night" ? v : "auto"; }
  catch { return "auto"; }
};
export const saveTheme = (v) => { try { localStorage.setItem(THEME_KEY, v); } catch {} };
export const themeClass = (pref) => {
  if (pref === "day") return "theme-day";
  if (pref === "night") return "theme-night";
  const dark = typeof window !== "undefined" && window.matchMedia
    && window.matchMedia("(prefers-color-scheme: dark)").matches;
  return dark ? "theme-night" : "theme-day";
};
