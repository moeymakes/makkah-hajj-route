# Hajj Route: build notes

Built with the `worldsmith` skill (`~/.shared/skills/worldsmith`), starting from the sibling world
`~/Dev/projects/makkah-haram` (renderer, Time and Sound rows, minarets, finials), which itself came from Nabawi
Courtyard and Madinah Horizon. None of them was edited. Brief: `prompt.txt`.

## State (update after every step)

### Realism stages (brief: ~/.config/Claude/side-session-notes/local_e46bf3a1-465b-49b7-b617-a09a30fa0fa1/realism-stages-brief.md)

- 2026-11-18 ~21:40 AEDT. **Stage 1 shipped** (realism-s1 fast-forwarded to main). Stage 2 next on `realism-s2`.
- Stage 1 commits: bf12c6c GTAO+TAA · 55bee59 Hillaire sky · 2789b94 static whole-route shadow map (and the near
  map no longer skips the 8x8 tents) · b3b613d Mina camps, district tint, exposure pass · fcd487b fix 1 (thinner
  haze, desert-pavement and silt sheets, walkway paving and membrane, tent variation) · 3645d2e fix 2 (moonlit
  night, walkway lamps, dawn shafts .6) · d919fc3 fix 3 (fence panels, softer night walkway lamps).
- Stage 1 gates (final capture verify/rs1-f4, gates verify/rs1-g4): clip .070 (<.5 PASS; all of it sky glow beside
  the golden sun, pose 2) · flatwhite .286 (<2 PASS) · brightdetail dawn 16.5 -> 72.4, golden 19.4 -> 31.3 (+15%
  PASS) · GPU avg 5.03 p99 7.79 ms (verify/rs1-g4, PASS) · 0 console errors at 3 Times x H/M/L · menu-preview ok ·
  index.html ~100 kB. **Critic gate FAILED**: highest "major" after 3 fix loops (verify/rs1-c2, rs1-f2, rs1-f3
  critic.md). Shipped under the brief's rule: every remaining major is a stage-2 hero (tents read as a regular
  grid, the Jamarat as a car park with its pillars hidden, Jabal al-Rahmah as a pebbled cone, pose 6's empty plain)
  and every metric beats live. The in-scope majors (haze, flat plains, walkway, black night) were fixed and dropped
  out of the list. The 4th loop was not spent: nothing in stage-1 scope was left on the critic's list.
- Metric: ground crop `--crop 0,.5,1,1`, 6 poses x 3 Times at 1920x1080 (helper scripts in the session scratchpad;
  capture = `flock /tmp/claude-1000/worldsmith-gpu.lock node tools/capture.mjs ../dev.html --out <dir>/t<T> --size
  1920x1080 --storage hajjTime=<T>`). Night brightdetail is unstable (few bright pixels); judge detail on dawn+golden.
- Live baseline (verify/rs-base): clip .003, flatwhite 1.72, brightdetail dawn 16.5 / golden 19.4 / all 25.8.
- After b3b613d (verify/rs1-expo, measured before golden shafts 1 -> .6 and fences 2.2 -> 1.8 m): clip .079 (all of it
  sky glow beside the golden sun in pose 2), flatwhite .32, brightdetail dawn 36.5 / golden 28.5.
- Perf after 2789b94 (verify/rs1-perf1, 2560x1440 High, 60 s flight): GPU avg 5.27, p99 8.33, max 9.68 ms.
- Critic on bf12c6c (verify/rs1-ao/critic.md) was "blocker" (identical white pyramids); b3b613d took it to major.
- Next: stage 2 on `realism-s2`: bounded GI (port of Madinah 8246d13 + 133f332, script ready), altocumulus
  (02909b3), Jamarat with oval openings round the pillars in every deck + stair towers + roof canopies, Jabal
  al-Rahmah as dense granite tors + larger pillar platform, tents (per-camp variation, far moire), neem groves ->
  stage 3 (DEM, OSM).

### Original build

- Phase: 7 (delivered locally, committed, nothing pushed). Critic loop stopped by the brief's rule: 5 critic
  iterations (on iter-03, 06, 08, 10, 13), highest severity "major" every time. Gate 1 NOT passed; gate 2 passes.
- index.html: 78.6 kB, 32.6 kB gzipped. Load to menu ~1.1 s headless.
- Perf (verify/final-dev/perf.txt, dev.html, 2560x1440, 60 s flight, RTX 3070 shared with other worlds rendering at
  the same time): GPU avg 5.76 ms, p99 7.85, max 7.95. Earlier runs: 5.56/10.00/10.95 (iter-02), 3.82/7.28/9.14
  (iter-05), 5.05/8.09/10.49 (iter-10), 5.25/9.50/10.32 (iter-12).
- index.html captured at High and Low (--storage hajj=2) for each Time (--storage hajjTime=0|1|2): 0 console errors in
  all six (verify/final-index-t*-q*).
- Not done: touch controls and audio untested by ear; real-window frame pacing and heap check; no GitHub.

## Critic history

| Iter (capture) | Highest | Main changes after it |
|---|---|---|
| 1 (iter-03) | major | per-pixel terrain normals, granite slopes, varied boulders, pillar without a ring, mosque plinth and deep arches, canopy ribs |
| 2 (iter-06) | major | normal texture instead of half-float heights (the terracing), longer Jamarat, stepped pillar base, stair, facade reveals, forecourt |
| 3 (iter-08) | major | continuous walkway roof, groves, angular boulders, taller pillar, darker granite, Mina pose up the valley, al-Khayf moved |
| 4 (iter-10) | major | single walkway membrane on cross beams, no roof discs on the Jamarat, rail station, recomposed poses, foreground granite |
| 5 (iter-13) | major | (stopped: 5 critic iterations) |

Recurring and still open (iter-13): tents uniform on a grid and flat-looking in shadow; mountains read sand-brown
rather than dark granite; Jabal al-Rahmah reads as a rubble heap; Namirah plaza empty; the right half of pose 6;
flat distant tents in the flight. Treated as noise: "tent LOD pop" (there is no LOD; same geometry everywhere), "only
four of six minarets" (two are behind the hall from that side).

## Geography (composed and compressed, ~4 km instead of ~15-20 km)

Axes: +x east, -z north, y up, metres. The valley's centre line is `czf(x)`; poses and the flight are given relative
to it in `world.js`.

| Feature | Real (source) | Here |
|---|---|---|
| Mina tents | 100,000+ permanent fiberglass tents with Teflon coating since the 1997 fire; 8x8, 6x8 or 12x8 m modules (Wikipedia-derived "Mina, Saudi Arabia"; tensinet tent project; Wego "Mina tents") | ~5,000 8x8 m peaked tents on the floor of a ~760 m wide valley, x -1230..-300, in blocks with alleys; 12x8 m tents in patches on Arafat |
| Jamarat | ~950 m long, ~80 m wide, five or six levels about 12 m apart, built round three pillars reshaped as oval walls (Saudipedia "Jamarat Complex"; World Highways; Bernama) | 440 m long, 80 m wide, four decks every 12 m above the plaza, three 26 m stadium-shaped walls in oval basins, ramps at both ends |
| Mashaer rail | an 18 km double-track line with nine stations (Wego) | an elevated viaduct 14 m up along the route with a station at the Mina end |
| Muzdalifah | open plain between Mina and Arafat; pilgrims collect pebbles there | gravel plain with pebbles, granite knolls, light towers on a ~110 m grid, al-Mash'ar al-Haram mosque (2 minarets) |
| Jabal al-Rahmah | ~65-70 m above the ground, circumference ~640 m, a pillar on top marking the place (Saudipedia "Jabal al-Rahmah"; Wikipedia "Mount Arafat") | 64 m granite knoll ~270 m across with ~1,500 boulders and a pale stair; a plain white square pillar on a stepped base, 12.4 m (taller than real, for legibility) |
| Namirah mosque | ~110,000 m2, six 60 m minarets, three domes (Arab News citing SPA; Madain Project) | 200 x 120 m hall, six minarets of ~60 m, three domes, a paved forecourt, at Arafat's western edge |
| Masjid al-Khayf | in Mina | a smaller mosque with four minarets on the north side of the valley (position composed) |
| Distances | Mina 7 km from the Grand Mosque; Arafat-Muzdalifah ~5-8 km (sources conflict) | compressed so the whole route is ~4 km |

## Six poses (ritual order of the route as told here)

1. Mina from the south slope looking east up the valley of tents.
2. The Namirah mosque at the edge of Arafat.
3. Jabal al-Rahmah from the south-east plain.
4. Muzdalifah's plain looking west toward Mina: light towers, walkway, rail line.
5. The covered walkway leading back into Mina's tents.
6. From the air: the Jamarat beside the tent valley.

## Time presets

| | Dawn (default) | Golden hour | Night |
|---|---|---|---|
| Key | sun 9 deg up at azimuth 70 | sun 12 deg up at 252 | moon 35 deg up at 140 |
| Lights | x0.2 | x1 | x6: tents lit from inside, light towers, road lamps, mosques, Jamarat |

## Sacred-site rules (from the brief)

No human figures. No interiors. Nothing recited or written. Finials: stacked spheres and an upturned crescent. The
pillar on Jabal al-Rahmah is a plain square shaft on a stepped base with no cap overhang (the critic once read a
thin ring round it as cross-like; the ring was removed).
