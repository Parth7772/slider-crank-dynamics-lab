# Slider–Crank Dynamics Lab

**Interactive dynamic analysis of a single-cylinder IC engine for the Dynamics of Machinery (DOM) course project.**

**Live dashboard:** https://parth7772.github.io/slider-crank-dynamics-lab/

The page opens on the animated mechanism with the parameters right next to it (bore, crank radius, l/r ratio, masses, speed, load, flywheel, balance fraction, combustion). Change any of them and every result updates instantly. *Share link* copies a URL that reopens the exact configuration and tab.

## Tabs

Each tab starts with a short plain-language "What the results say" box, then the plots, then the equations used.

| Tab | What it shows |
|-----|---------------|
| Step-by-step | the textbook procedure at any crank angle, with your numbers substituted: ω, φ, x, v, a, m_R, F_g, F_I, F_P, F_Q, F_N, F_T, F_R, T₁, correction couple T_c, rod-weight torque T_w and net T (checked against the exact solver) |
| Kinematics | velocity and acceleration diagrams (relative velocity method) drawn to scale and moving with the animation; exact piston displacement, velocity, acceleration; rod angular velocity and acceleration; error of the approximate formulas |
| Gas pressure | single-zone first-law model with Wiebe heat release (RK4), or the ideal Otto cycle; indicator diagram, indicated work, imep, power, efficiency |
| Forces | exact Newton–Euler solution of piston and rod (rod mass and inertia included): gas force, inertia force, piston effort, rod thrust, side thrust, crank effort, radial force, crank-pin polar load diagram |
| Turning moment & flywheel | turning-moment diagram, table of loop areas between crossings of T_mean (textbook method), ΔE, C_E, flywheel inertia for a given C_s, rim size, rim speed and hoop stress, speed ripple |
| Balancing | primary and secondary unbalanced forces, shaking-force locus with a counterweight balancing a fraction c of the reciprocating mass, optimum c |
| What-if | elasticity of every result to every input, and N–n design-space maps |
| Verification | benchmarks and live self-consistency checks (below) |
| Problem & notation | problem statement, live data, nomenclature, assumptions, references |

## Key equations

* Kinematics: x = r[(1 − cos θ) + n − √(n² − sin²θ)], v = rω[sin θ + sin 2θ / (2√(n² − sin²θ))], a = rω²[cos θ + (n² cos 2θ + sin⁴θ)/(n² − sin²θ)^{3/2}]
* Gas: dp/dθ = −γ (p/V) dV/dθ + ((γ − 1)/V) dQ/dθ, with Q = Q_in{1 − exp[−5((θ − θ₀)/Δθ_b)³]}
* Forces: piston m_p a_P = F_g + F + N + m_p g; rod m_c a_G = F_C − F + m_c g, I_G β̈ = (r_C − r_P) × F + (r_C − r_G) × m_c(a_G − g); crank T = [r_C × (−F_C)]_z
* Flywheel: ΔE = I ω² C_s, m_rim = I/R², σ = ρv²
* Balancing: F_pri = m_R ω² r cos θ, F_sec = m_R ω² r cos 2θ / n

## Verification (`node tests/verify.js`)

51 automated checks, all passing:

1. **Textbook problem.** For a horizontal engine (r = 300 mm, l = 1.2 m, D = 0.5 m, m_R = 250 kg, 250 rpm, Δp = 0.35 N/mm² at θ = 60°), the hand-calculation chain and the exact solver agree within 0.03 % (F_N = 10.96 kN, F_Q = 50.65 kN, F_T = 48.30 kN, T = 14.49 kN·m).
2. **Otto cycle.** The numerically integrated cycle reproduces η = 1 − r_c^{1−γ} to 5 × 10⁻⁶.
3. **Newton–Euler vs energy method.** The crank torque matches the virtual-power result to 10⁻¹⁵ for every preset.
4. **Closed form vs numerical derivatives.** The closed-form velocity and acceleration match finite differences of x(θ).
5. **Mechanism vs thermodynamics.** ∫T dθ = ∮p dV (relative difference 2 × 10⁻⁵).
6. **Inertia forces.** They do no net work over a cycle (10⁻¹⁶).
7. **Massless rod.** It reduces exactly to the textbook relations F_N = F_P tan φ, F_Q = F_P / cos φ, F_T = F_Q sin(θ + φ).
8. **Flywheel.** The designed flywheel reproduces the requested C_s.
9. **Textbook two-mass rod with correction couple.** With the exact acceleration it gives the same crank torque as Newton–Euler (10⁻¹⁵).
10. **Turning-moment loop table.** The loop areas reproduce ΔE and sum to zero over the cycle.
11. **Acceleration polygon.** It closes: a_C + a^r_PC + a^t_PC = a_P.

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
css/style.css       styling (LaTeX-paper look, responsive, print)
js/engine.js        computation engine: kinematics, pressure model, Newton–Euler, flywheel, balancing, verification
js/plot.js          dependency-free canvas plotting (line plots, heat maps, bar charts)
js/mechanism.js     animated SVG drawing of the mechanism
js/app.js           dashboard wiring (inputs, results, animation, sharing, CSV export)
js/worker.js        computes the design-space maps in a background thread
tests/verify.js     verification suite (Node.js)
vendor/katex/       KaTeX 0.16.11 (MIT) for typesetting equations
```

## Assumptions

Rigid links; frictionless joints; constant crank speed during the force analysis; crank balanced about O; gravity included; single-zone ideal gas with constant γ; instantaneous gas exchange at the dead centres; crank-case at atmospheric pressure; flywheel inertia provided by the rim alone.

## References

1. S. S. Rattan, *Theory of Machines*, McGraw-Hill Education.
2. R. S. Khurmi & J. K. Gupta, *Theory of Machines*, S. Chand.
3. A. Ghosh & A. K. Mallik, *Theory of Mechanisms and Machines*, East-West Press.
4. J. J. Uicker, G. R. Pennock & J. E. Shigley, *Theory of Machines and Mechanisms*, Oxford University Press.
5. J. B. Heywood, *Internal Combustion Engine Fundamentals*, McGraw-Hill.
