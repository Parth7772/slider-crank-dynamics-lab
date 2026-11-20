# Compliant Four-Bar Dynamics Lab

**Interactive dynamic analysis of a compliant four-bar mechanism with flexure hinges, for the Dynamics of Machinery (DOM) course project.**

**Live dashboard:** https://parth7772.github.io/slider-crank-dynamics-lab/compliant-four-bar-lab/

**Report (PDF, 19 pages):** [report/Compliant-Four-Bar-Dynamic-Analysis.pdf](report/Compliant-Four-Bar-Dynamic-Analysis.pdf). It is the complete analysis of the default design (problem statement, mechanism, kinematics, flexure stiffness, motor torque and energy, vibration, strength and fatigue, step-by-step solution, what-if study, verification). The *Print* button produces the same report for any other design.

## Topic

A four-bar linkage made in one piece, whose joints are thin **flexure hinges** instead of pins (a *compliant mechanism*). A motor swings the input link back and forth. Each flexure is modelled with the **pseudo-rigid-body model** as a pin joint plus a torsional spring, *K = EI/l*. The springs store energy, so near the mechanism's **natural frequency** they supply the torque the moving links need, and the motor works far less than for a rigid, pin-jointed linkage. The default design (a packaging-machine pusher with spring-steel flexures) needs about 85 % less RMS motor torque than the rigid linkage.

The project covers the DOM syllabus: kinematic analysis (position, velocity, acceleration, transmission angle, Grashof), dynamic force analysis (Lagrange and Newton–Euler, joint forces, shaking force), a torque diagram with energy fluctuation, natural frequency, damping, free and forced vibration, and design for strength and fatigue.

The page opens on the animated mechanism with the parameters beside it (link lengths, as-made angle, material, flexure length, thickness and width, drive amplitude, frequency and offset, damping, payload). Change any of them and every result updates instantly. The flexures are drawn bending and coloured by stress. *Drive at best frequency* moves the drive to the frequency that needs the least motor torque. *Share link* copies a URL that reopens the exact design.

## Tabs

Each tab starts with a short plain-language "What the results say" box, then the plots, then the equations used.

| Tab | What it shows |
|-----|---------------|
| Step-by-step | the full procedure at any drive phase, with your numbers substituted: drive motion, position of A, coupler and output angles, velocity and acceleration coefficients, flexure stiffness, flexure rotations, spring torque, equivalent inertia, inertia and damping torques, motor torque (checked against Newton–Euler), flexure stress |
| Kinematics | link angles, angular velocities and accelerations, coupler-point path, transmission angle, Grashof check |
| Flexure stiffness | pseudo-rigid-body model, table of flexures, elastic energy and holding torque against input angle, flexure rotations, equivalent stiffness and inertia |
| Motor torque & energy | motor torque and its inertia, spring and damping parts; peak and RMS torque against drive frequency (compliant vs rigid); kinetic and elastic energy; torque–angle loop; motor power |
| Vibration | free vibration (nonlinear, RK4) with its envelope, magnification factor and phase, backbone curve (frequency against amplitude) |
| Strength & fatigue | stress in every flexure over the cycle, modified Goodman diagram, joint forces, fatigue and yield safety factors, shaking force on the frame |
| What-if | elasticity of every result to every input, and flexure design maps (natural frequency with the resonance line, fatigue safety factor with the *n = 1* line) |
| Verification | benchmarks and live self-consistency checks (below) |
| Problem & notation | problem statement, live data, nomenclature, assumptions, references |

## Key equations

* Kinematics: loop closure r₂e^{iθ₂} + r₃e^{iθ₃} = r₁ + r₄e^{iθ₄}; ω₃ = h₃ω₂ with h₃ = r₂ sin(θ₄ − θ₂) / (r₃ sin(θ₃ − θ₄)), h₄ = r₂ sin(θ₃ − θ₂) / (r₄ sin(θ₃ − θ₄)); α₃ = h₃′ω₂² + h₃α₂
* Flexures (small-length flexural pivot): K = EI/l, I = bt³/12, V = ½ Σ Kⱼψⱼ², σ = Etψ/(2l)
* Motion (Lagrange): T = M(θ₂) θ̈₂ + ½ M′(θ₂) θ̇₂² + C θ̇₂ + dV/dθ₂, with M = I_O2 + I_O4 h₄² + I_G3 h₃² + m₃|dr_G3/dθ₂|² + m_p|dr_P/dθ₂|²
* Vibration: ωₙ = √(K_eq/M), δ = 2πζ/√(1 − ζ²), Θ/Θ_st = 1/√((1 − r²)² + (2ζr)²)
* Fatigue (modified Goodman): 1/n_f = σ_a/S_e + σ_m/S_ut

## Verification (`node tests/verify.js`)

29 automated checks, all passing:

1. **Parallel-guiding benchmark.** For a parallelogram (r₁ = r₃, r₂ = r₄) the closed form gives h₃ = 0, h₄ = 1, K_eq = 4K and M = I_O2 + I_O4 + (m₃ + m_p) r₂². The solver matches to machine precision, and a 15° free swing has exactly the linear frequency (5 × 10⁻¹⁰).
2. **Forced vibration.** Time integration under a harmonic torque reproduces the magnification factor at r = 0.5, 1 and 1.5 (within 2 × 10⁻⁵).
3. **Lagrange vs Newton–Euler.** The motor torque from the energy method and from the joint forces of the three moving links agree to 10⁻¹⁵ for every preset.
4. **Independent equations.** The moment balance of the coupler about B (not used in the solution) and the Freudenstein equation are satisfied to 10⁻¹⁵.
5. **Closed form vs numerical derivatives.** The velocity and acceleration coefficients, dM/dθ₂, dV/dθ₂ and K_eq match finite differences (10⁻¹⁰).
6. **Energy.** Motor work per cycle equals the damping loss; inertia and spring torques do no net work; undamped free vibration conserves energy (10⁻⁹).
7. **Vibration.** The small-swing simulated frequency equals f_n, the energy-integral period equals the simulated one, and the simulated logarithmic decrement equals 2πζ/√(1 − ζ²).
8. **Physics sanity.** Resonant drive saves torque, quasi-static drive needs more torque than a rigid linkage, K ∝ t³, f_n² ∝ K, impossible geometries and unreachable swings are reported, and every preset stays inside the small-length pivot model with a fatigue safety factor above 1.

The same checks also run live on the dashboard (Verification tab) for whatever design is on screen.

## Run locally

Any static file server works, for example:

```bash
python -m http.server 8000
```

Then open http://localhost:8000. There is no build step and no external dependency at run time; KaTeX is bundled in `vendor/`.

## Project structure

```
index.html          page structure and text (paper-style sheets)
css/style.css       styling (paper look, responsive, print)
js/engine.js        computation engine: kinematics, pseudo-rigid-body model, Lagrange and Newton–Euler dynamics, vibration, fatigue, verification
js/plot.js          dependency-free canvas plotting (line plots, heat maps, bar charts)
js/mechanism.js     animated SVG drawing of the compliant four-bar
js/app.js           dashboard wiring (inputs, results, animation, sharing, CSV export, print)
js/worker.js        computes the What-if sensitivities and design maps in a background thread
tests/verify.js     verification suite (Node.js)
report/             PDF report of the default design
vendor/katex/       KaTeX 0.16.11 (MIT) for typesetting equations
```

## Assumptions

Planar motion in a horizontal plane; rigid links; flexures modelled as small-length flexural pivots (flexure length well below link length), linear elastic; prescribed sinusoidal input motion; damping proportional to flexure stiffness; flexure stress includes the joint force conservatively (as both bending and direct stress). Material data are typical values.

## References

1. L. L. Howell, *Compliant Mechanisms*, Wiley, 2001.
2. Y.-Q. Yu, L. L. Howell, C. Lusk, Y. Yue, M.-G. He, "Dynamic modeling of compliant mechanisms based on the pseudo-rigid-body model", *ASME J. Mechanical Design* 127(4), 2005.
3. Study of compliant joints that store elastic energy to cut the motor torque of an automatic-machine mechanism running at resonance, *Int. J. Advanced Manufacturing Technology*, Springer, 2022, doi:10.1007/s00170-022-09879-6.
4. S. S. Rattan, *Theory of Machines*, McGraw-Hill Education.
5. J. J. Uicker, G. R. Pennock & J. E. Shigley, *Theory of Machines and Mechanisms*, Oxford University Press.
6. S. S. Rao, *Mechanical Vibrations*, Pearson.
7. R. G. Budynas & J. K. Nisbett, *Shigley's Mechanical Engineering Design*, McGraw-Hill.
