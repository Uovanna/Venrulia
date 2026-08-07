# The Chronicle — Venrulia's design system

**The premise every decision serves: the fight is a chronicle being written down.**
The screen is a page, combat is an account of combat, and quantities live in the
margin the way a ledger's do.

Nothing here is wired into the game yet. This is the system, proven on the screen
players spend their time on, so the direction can be judged before a ~10,000-line
refactor starts.

## Files

| | |
|---|---|
| `tokens.css` | Colour, type, space. The only place a value is defined. |
| `combat.css` | The combat screen. Depends on tokens, nothing else. |
| `icons-sprite.svg` | 46 glyphs. Stroke-only, `currentColor`, one shared roughening filter. |
| `contrast.mjs` | `node design/contrast.mjs` — every foreground against both grounds, both themes. |
| `build.mjs` | `node design/build.mjs` — inlines the parts into `dist/chronicle.html`. |
| `preview/` | Source of the preview. `screen.part.html` is the combat markup. |

## The three rules that carry the system

**1. Texture lives on the ground and nowhere else.** Every raised surface paints a
flat colour over it, so prose always sits on an even bed and the material is only
ever visible *around* the type. This is what keeps parchment from overcrowding the
interface, and the system enforces it rather than asking anyone to remember it.

**2. Colour in the chronicle is grammar.** Rubric red is what you do — the
rubrication a scribe used for the actor's own deeds. Bole brown is what is done to
you. Verdigris is restoration, gilt is spoils. There are no other colours in the
log, and none of them is decorative.

**3. Mono is only ever numbers.** A quantity is legible as a quantity by its shape,
so it never has to be introduced with a label.

## Two themes, not one inverted

`day` is vellum in daylight. `night` is the same page read by candlelight — a warm
umber-black, ink that becomes aged bone, and a rubric warmed to an ember so it
still reads as *your hand* on a dark ground. An inverted parchment is grey, and
grey has nothing to do with this game.

Both are applied through all three theme states (`prefers-color-scheme`, an
explicit `data-theme`, and the un-stamped system default), so a viewer who has
never touched a toggle still gets a coherent page. The night palette appears
exactly twice in `tokens.css`, which is the CSS minimum — a media query cannot
join a selector list. **Change both together.**

## Before changing any colour

```
node design/contrast.mjs
```

Every foreground token clears WCAG AA (4.5:1) against both `--ground` and
`--raised` in both themes; the structural rule clears 3:1 so drawn rules stay
drawn. These numbers were tuned to hit that, not eyeballed — `--ink-faint` in
particular is darker than it looks like it wants to be because it carries 9px
small-caps labels.

## Known gaps

- The bestiary tier (`i-beast`, `i-undead`, `i-drake`) is a placeholder family.
  Those three stand in for ~40 creature glyphs and need real per-family art.
- `i-arena` and `i-ring` read weakly at 24px and want another pass.
- ~15 of the emoji in use are pure colour swatches, not icons. Those become CSS.
