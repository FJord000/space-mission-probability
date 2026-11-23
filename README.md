# 🚀 Space Mission: A Probability Adventure

*(Turkish title: Uzay Görevi: Olasılık Macerası)*

An interactive 3D web game that teaches probability through play, built for a school science fair. The player commands a spacecraft traveling from Earth to Mars and makes five critical decisions along the way. Every option shows its probability of success, but a die roll decides the outcome. When the mission ends, the game walks through the mathematics behind the player's choices step by step.

The whole game is a **single HTML file that works offline**, so it runs in any modern browser on a laptop, tablet or touchscreen at a science fair booth.

> **Languages:** English and Turkish. The game picks the language automatically from the browser (Turkish browsers get Turkish, everyone else gets English), and players can switch at any time with the **Türkçe / English** toggle. To force a language, add `?lang=en` or `?lang=tr` to the address.

## Why I built it

Probability is often taught as formulas on a page. I wanted visitors of all ages to *feel* why a 90% chance can still fail, why chances shrink when you multiply them, and why a risky choice can be "worth it" on average but still lose the whole mission. The game turns each of these ideas into a decision the player has to live with.

## How to play

1. Open `index.html` (or `uzay-gorevi.html`) in Chrome, Edge or Firefox.
2. Choose an explanation level:
   - 🧒 **Explorer mode:** no formulas, plain language for all ages ("85 out of 100 commanders would succeed").
   - 🧑‍🔬 **Scientist mode:** formulas and notation for ages 13+.
3. At each stage, pick an option. A number from 1 to 100 is rolled; if it falls inside the success range, the stage is passed.
4. When the mission ends, explore the four math sections on the results screen.

## Game design

| Stage | Example scenarios |
|---|---|
| 1 · Launch | Windy morning, engine sensor warning, approaching storm |
| 2 · Route | Meteoroid cloud, lunar gravity assist, fuel planning |
| 3 · Deep space | Solar storm, mysterious signal, micrometeoroid hit, computer failure |
| 4 · Mars orbit | Braking maneuver, global dust storm, Phobos flyby |
| 5 · Landing | Landing site choice, landing method choice |

- **15 scenarios with 46 options.** Each run randomly picks one scenario per stage, so back-to-back players get different missions.
- **Limited resources:** 🛡️ 2 shields and 🔧 1 spare part. Using them raises the odds at that stage, but they run out.
- **The hidden cost of shields:** The shield also protects the craft from heat during landing. Every earlier use wears it down and lowers the landing odds.
- **"What if you had continued?"** If the mission fails early, the player still makes the remaining decisions without dice rolls. The math can then analyze the complete plan, and these hypothetical choices are marked 🧪 on the results screen.

## Probability concepts covered

1. **Multiplication rule:** The mission's success probability is the product of the stage probabilities. Example: 85% × 90% × 95% × 76% × 68% = 37.6%.
2. **Expected value:**
   - For each option: the expected points *if you reach that stage* (probability × reward).
   - For the whole mission: expected total points E = p₁r₁ + p₁p₂r₂ + … + p₁p₂p₃p₄p₅r₅, because points earned before a failure are kept.
   - The player's plan is compared with the safest plan and the plan with the highest expected score. Both are found by checking every possible plan, respecting resource limits and the shield's effect on landing.
3. **Conditional probability:** Landing success depends on how many times the shield was used before: P(landing | shield used k times). This connects to the general multiplication rule P(A and B) = P(A) · P(B | A).
4. **Law of large numbers:** The player's plan is simulated 1,000 times. A live chart shows the observed success rate converging to the theoretical probability.

## Features for a science fair booth

- Fullscreen button
- Returns to the start screen automatically after 3 minutes without interaction
- Sound on/off toggle
- A counter showing how many visitors have played on that device and how many reached Mars (resettable from the start screen)
- 3D scenes: planets textured with NASA imagery, a rocket and lander, bloom and particle effects
- Bilingual: every scenario, option and math explanation in English and Turkish, with locale-aware number formatting (37.6% vs %37,6)

## Technical details

- **Rendering:** Three.js (r147) with a custom scene engine: procedural rocket, lander and launch pad models, NASA-textured planets, GPU particle systems, custom GLSL shaders for flames, shields and atmospheres, and bloom post-processing.
- **No build tools or internet needed at runtime:** the library, textures and code are embedded into one HTML file (about 2.4 MB).
- **Math engine:** exact probability and expected-value calculations, exhaustive search over all valid plans (up to a few hundred per game), and a Monte Carlo simulation for the law of large numbers.

## Project structure

```
index.html            The game (single file, everything embedded); GitHub Pages entry point
uzay-gorevi.html      Same file, with a descriptive name for opening locally
kaynak/               Source ("kaynak" means "source" in Turkish)
  oyun.html           Game flow, scenarios, text and the math sections
  sahne3d.js          3D scene engine (Three.js)
  derle.ps1           Build script that bundles everything into one file
  dokular/            NASA planet and star map textures ("dokular" = textures)
  kutuphane/          Three.js r147 and bloom add-ons ("kutuphane" = library)
```

### Editing and rebuilding

Scenarios, probabilities and Turkish text live in the `STAGES` list in `kaynak/oyun.html`; the English text for each scenario lives in `EN_TEXT` right below it, in the same option order. After editing, rebuild on Windows:

```
powershell -ExecutionPolicy Bypass -File kaynak/derle.ps1
```

This regenerates both `index.html` and `uzay-gorevi.html`.

## Publishing with GitHub Pages

In the repository settings, go to **Settings → Pages → Source: Deploy from a branch → main / (root)**. After a few minutes the game is live at `https://<username>.github.io/<repository-name>/`.

## Credits

- **Planet and star map imagery:** NASA (public domain)
  - Mars, Earth, Phobos and the Hipparcos star map: [NASA 3D Resources](https://github.com/nasa/NASA-3D-Resources)
  - Moon: [NASA Scientific Visualization Studio, CGI Moon Kit](https://svs.gsfc.nasa.gov/4720) (LRO data)
- **3D library:** [Three.js](https://threejs.org) r147 (MIT License)

Use of NASA imagery does not imply endorsement by NASA.

## License

The game code is released under the [MIT License](LICENSE). Three.js is used under its own MIT License, and the NASA imagery is in the public domain.
