# Scrapline

### ▶ [PLAY IT HERE](https://krishp1011.github.io/scrapline/)

A single-file HTML5 arena survivor. Salvage-yard setting: you move, your turret
fires on its own, and you spend scrap between waves to build a run.

Runs in any browser — nothing to install, no account, works on phones. Or clone
the repo and open `scrapline.html` directly. No build step, no dependencies, no
asset files: every sprite, sound effect and music track is generated at runtime.

## Links

| | |
|---|---|
| **Play** | <https://krishp1011.github.io/scrapline/> |
| **Dev / testing build** | <https://krishp1011.github.io/scrapline/#dev> |

The `#dev` link is for testing late-game content without grinding to it. It
**skips the entire progression system** — it unlocks every rig, maxes the
workshop, and sets the top rank the moment the page loads, and it saves that to
your browser like normal progress. Use the plain link if you want to actually
play the game; use `scrapline.wipe()` in the console to undo it.

Nothing in the game's UI links to `#dev`, so anyone you share the plain link with
gets the real progression. The same tools are on the console:

```js
scrapline.unlockAll()   // all rigs, workshop maxed, top rank, 9999 tokens
scrapline.wipe()        // back to a fresh save
scrapline.tokens(500)   // set salvage tokens
scrapline.meta()        // dump the saved progress object
```

## Controls

| | |
|---|---|
| Move | `WASD` / arrows, or drag anywhere on the left half (touch) |
| Dash | `SPACE` / `SHIFT`, or the on-screen button |
| Scrap Blast | `E`, or the on-screen button |
| Pause | `ESC` / `P`, or the button top-right |
| Mute | `M` |

## What's in it

- **6 rigs** — Scrapper, Bulwark, Sparkhand, Magpie, plus two with a *welded mount*:
  **Ember**, whose Pilot Light barely scratches anything but sets it all on fire, and
  **Anchor**, whose Deadlock Cannon spins up to double damage while you stand
  perfectly still and collapses the moment you move. A signature weapon can never be
  sold, swapped or replaced.
- **10 weapons** — rifle, scattergun, rail lance, flak mortar, needler, arc thrower,
  slag thrower, grapple harpoon, plus the two signature mounts. Fit a second mount to
  carry two at once; each fires on its own rate and range.
- **42 bench cards** — stacking upgrades, eight automatic abilities that fight for you,
  and red risk cards that trade health for power.
- **11 enemy types** plus gold-ringed elites from wave 4.
- **A heavy every fifth wave from wave 10**, alternating — 8 main bosses on 10, 20,
  30… (three phases, telegraphed attacks, heavy armour) and 3 mini-bosses on 15, 25,
  35… (one phase, one pattern, a third of the health).
- **Build synergies** — burn, crits, arcs, kill streaks and drag fields that
  multiply into each other, all with hard ceilings. The COMBOS page of the in-game
  manual documents every one of them.
- **Meta-progression** — salvage tokens unlock rigs and permanent workshop upgrades
  in The Yard, then seven prestige ranks with shiny badges.
- Procedural audio, run summary, field manual, touch controls, saved progress.

## Notes

Progress saves to `localStorage` under `scrapline.meta.v1`, and degrades to
in-memory if storage is blocked.

Everything lives in `scrapline.html` — game, sprites-as-pixel-arrays, audio
synthesis and UI in one file, so it can be dropped onto a web game portal as-is.

## Testing

`tools/headless.js` runs the real game script under node against a stubbed DOM,
driving every wave tier, weapon pairing and rig, plus a kiting bot that shops for
itself and is used as a fixed difficulty yardstick between builds.

```
node tools/headless.js                     # this build
node tools/headless.js /path/to/other.html # A/B against another build
```

The node stub cannot catch a bad canvas call, so there is also a real-browser pass:
inject a driver into a copy of the page and run it through headless Chrome, which
surfaces genuine runtime errors and renders real frames for eyeballing.
