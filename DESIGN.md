# gklabs Device Manager design

Reading this as: a desktop system monitor for a PC enthusiast who leaves it open while working or gaming, in the gklabs warm paper-and-signal-red language with an instrument-scale motif, dial ENERGY 2 / RHYTHM 2 / MOTION 2.

Direction from the owner: "the gklabs brand put together with new fonts and interactive elements", "way more user friendly while being incredibly aesthetic and sleek", built under the antislop rules.

Dial: ENERGY 2 / RHYTHM 2 / MOTION 2

## Decisions and reasons

- **Palette: the gklabs paper, ink and signal red.** It is the owner's brand (the gklabs showcase uses the same values), so the app reads as a gklabs product. Light: paper `#f6f3f2`, surface `#ffffff`, ink `#1d1716`, muted `#6c605d`, line `#e2d9d6`, signal `#c4242b`. Dark: paper `#120e0d`, surface `#1b1514`, ink `#f1e9e7`, muted `#a3928e`, line `#2f2523`, signal `#ff4a4f`.
- **Signal red means "look here", and nothing else.** It marks the live-status dot, any reading in its hot range (load at or above 90%, temperature at or above 85 °C, a disk at or above 90% full), the globe's location pin and an unlocked achievement. A screen with nothing hot carries almost no red, so red showing up is information.
- **Light and dark both ship, defaulting to the system setting.** A monitor is left open day and night, so it follows the OS theme; the toggle offers System, Light and Dark and remembers the choice.
- **Type: Archivo for words, Martian Mono for readings.** Archivo is one variable family with a width axis: headings run expanded (width 118) for a sturdy instrument-label voice, body text at 100, dense tables and labels condensed (88) so more fits without shrinking the size. Martian Mono's squared, even-width numerals read like a panel display and never shift width while values change. Both are bundled with the app, so it works offline.
- **Sentence case everywhere, no wide-tracked capitals.** Labels are set by weight and size, not by tracking.
- **Identity motif: the scale.** Every reading sits on a ruled scale of ticks, one tick per 5%, with the filled run in ink and the ticks in the hot range turning red as they light. The same scale appears in the overview meters, as vertical columns in the core grid, and as the drum frames of the odometer, so the app reads as one instrument.
- **Focal point per screen.** Overview: the processor readout, the number people check first. Hardware: the core grid. Network: the globe and the location under it.
- **Overview layout: one big readout, one list, one strip.** The processor panel is large because it is the focal point; memory, graphics, disk and network are rows in a single list (not identical cards) because they are scanned top to bottom; the runtime odometer runs full width at the bottom because it is a different kind of number (a total, not a level). Each row opens the section of the app that explains it.
- **Navigation: three tabs, number keys 1 to 3.** Each tab is a real view. Expansion packs add their own tabs to the same list.
- **Radius scale: 2 / 4 / 8 / 14.** Scale ticks 2, chips and odometer drums 4, controls 8, panels 14. Nothing is a pill except the theme switch's sliding thumb, which marks the one stateful control in the header.
- **Shadow only on things above the page:** the facts drawer, dialogs and toasts. Panels sit flat on the paper with a 1px line.
- **No glow, no gradients, no glass.** None of them serve hierarchy here; the scale motif and the signal red already do.
- **Motion.**
  - **Meters and ticks** ease over 400 ms, the same rate the backend updates at, so a change reads as movement instead of a jump.
  - **The 60-second trail** draws under the processor readout so a spike is still visible after it has passed.
  - **Tabs** cross-fade in 150 ms; the drawer slides in 220 ms; toasts drop in once.
  - **The globe spins** because the spin is how the location pin comes into view.
  - **Reduced motion** (the OS setting) stops the globe, the transitions and the odometer roll.
- **States.** Every data view has a waiting state (before the first reading), a lost-contact state (no reading for 4 seconds, with what to do), and empty states (no GPU, no Wi-Fi, no drives). The browser preview without the desktop app is labelled as simulated data on every screen.
- **Pause.** Readings can be frozen (P key or the status button) so a number can be read or screenshotted without it changing.
- **Hidden achievements.** Seven, from Easy to Very hard. Unlocked ones are kept on the device and listed in the facts drawer; hidden ones show only "Hidden achievement" and their difficulty until found, so people know what they are hunting for without being told where.
- **Spacing.** 4px base. Tight groups inside a panel (8 to 12), larger gaps between panels (20 to 24), so the eye groups readings by panel first.
