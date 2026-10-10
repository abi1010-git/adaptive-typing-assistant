# Adaptive Typing Assistant Rough Draft

StreamLit Link: https://adaptive-typing-assistant-xc53bpgibax76njxkawvac.streamlit.app/
Codex was used in parts of this project. 

## Project Overview

Adaptive Typing Assistant is an exploratory project for investigating whether adaptive input filtering can reduce accidental repeated key activations. It focuses on accessibility questions around typing with difficulty in precise or repeated input, including motor-control difficulties. The project provides a live on-screen keyboard and controlled simulations for comparing simple debounce strategies.

## Problem Statement

Unintended repeated activations can add characters, interrupt a word, and require users to correct their text. Filtering them is not as simple as removing repeated letters: sequences such as the double `l` in “hello” or the double `o` in “book” are legitimate. A filter sees the key and its timing, not the user's intent, so suppressing accidental repeats can also suppress valid input.

## Features

- Accessible on-screen QWERTY keyboard with Space, Backspace, Clear, and Reset Session controls.
- Three live modes: Standard, Fixed debounce, and Adaptive debounce.
- Deterministic, seeded simulator for duplicate activations and optional neighboring-key errors.
- Experiment dashboard with 90 simulated conditions and 100 seeds per condition (9,000 runs total).
- Comparison charts, per-condition metrics, paired win/tie summaries, and run-level CSV export.
- Automated tests for simulation, filters, aggregation, live behavior, and accessible markup.

## How It Works

**Standard** accepts every on-screen letter or Space activation. **Fixed debounce** suppresses a repeated key when the next activation occurs within a fixed 180 ms threshold. **Adaptive debounce** estimates a threshold from the rolling median of up to nine recent observed inter-activation intervals, multiplies the median by 0.75, and clamps the result between 100 ms and 350 ms. It applies the current threshold before updating it with the newest interval, so processing is incremental and does not look ahead.

The live keyboard uses the same filter implementations as the simulator. Live activations are timestamped with `performance.now()`. Backspace and Clear bypass filtering and reset filter timing history; they are not counted as key activations. Mode changes preserve accepted text but reset counters and filter history. Live typing is kept separate from simulated data and has no CER because it has no independently supplied reference phrase.

## Experimental Results

The current experiment ran 9,000 **synthetic** simulations across duplicate probabilities of 0%, 5%, 10%, 20%, and 40%; fast, medium, and slow timing ranges; and phrases both with and without legitimate repeated letters.

| Method | Mean CER | False-suppression rate |
| --- | ---: | ---: |
| Unfiltered | 15.1% | 0.0% |
| Fixed debounce | 12.5% | 3.9% |
| Adaptive debounce | 12.3% | 2.3% |

The average CER difference between fixed and adaptive debounce is modest. Adaptive filtering does not always outperform fixed filtering: across paired runs, adaptive had lower CER in 10.6%, fixed had lower CER in 9.0%, and they tied in 80.4%. These results summarize this particular simulator and parameter matrix; they do not establish statistical or real-world effectiveness.

## Technologies Used

- React
- TypeScript
- Vite
- Vitest
- Streamlit (companion demo)

The React app and Streamlit companion run without a backend, database, paid API, or external model.

## Getting Started

Install Node.js 20.19+ or 22.12+ and npm. In Windows PowerShell, navigate to the project directory and install dependencies:

```powershell
npm install
```

Start the development server:

```powershell
npm run dev
```

Open the local URL printed by Vite, usually `http://localhost:5173`. If that port is occupied, Vite selects another available port and prints it in the terminal.

### Run the Streamlit demo on Windows

Create an isolated Python environment and install the demo dependency:

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
```

Start the companion website:

```powershell
streamlit run streamlit_app.py
```

Open the local URL printed by Streamlit, usually `http://localhost:8501`.

## Testing

Run the automated test suite, lint checks, and production build from PowerShell:

```powershell
npm test
npm run lint
npm run build
```

## Limitations and Future Improvements

All reported experiment results are synthetic. The phrase set, event timings, duplicate probabilities, and filter parameters are simplified assumptions, not measurements of people's typing. The live keyboard demonstrates immediate on-screen activations but is not calibrated to a person's access method or motor patterns. This project has not been validated with disabled people and does not establish proven benefits for people with disabilities.

Future work should start with co-design and evaluation with disabled users and accessibility specialists, with appropriate consent and safeguards. The simulator and metrics could then be revised against observed needs before testing alternative filter strategies in a properly designed study.

## Project Background

Adaptive Typing Assistant was developed as an exploratory assistive technology onboarding project for BananaBots. Its milestones progress from a baseline keyboard and simulator to filtering experiments and live input; they are a learning and investigation tool, not a validated assistive product.
