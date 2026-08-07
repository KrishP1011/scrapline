# Scrapline

A single-file HTML5 arena survivor. Salvage-yard setting: you move, your turret
fires on its own, and you spend scrap between waves to build a run.

Open `scrapline.html` in a browser. No build step, no dependencies, no assets —
all sprites, sound and music are generated at runtime.

## Controls

| | |
|---|---|
| Move | `WASD` / arrows, or drag anywhere on the left half (touch) |
| Dash | `SPACE` / `SHIFT`, or the on-screen button |
| Scrap Blast | `E`, or the on-screen button |
| Pause | `ESC` / `P`, or the button top-right |
| Mute | `M` |

## What's in it

- **4 rigs** — Scrapper, Bulwark, Sparkhand, Magpie. Different stats and starting weapon.
- **5 weapons** — rifle, scattergun, rail lance, flak mortar, needler. Fit a second
  mount to carry two at once; each fires on its own rate and range.
- **26 bench cards** — stacking upgrades, five automatic abilities that fight for you,
  and red risk cards that trade health for power.
- **7 enemy types** plus gold-ringed elites from wave 4.
- **5 bosses**, every tenth wave: The Foundry Press, Slag Widow, Rust Colossus,
  The Arc Warden, The Derrick. Three phases each, telegraphed attacks, heavy armour.
- **Meta-progression** — salvage tokens unlock rigs and permanent workshop upgrades
  in The Yard, then seven prestige ranks with shiny badges.
- Procedural audio, run summary, field manual, touch controls, saved progress.

## Notes

Progress saves to `localStorage` under `scrapline.meta.v1`, and degrades to
in-memory if storage is blocked.

Everything lives in `scrapline.html` — game, sprites-as-pixel-arrays, audio
synthesis and UI in one file, so it can be dropped onto a web game portal as-is.
