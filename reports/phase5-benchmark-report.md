# Phase 5 Benchmark Report

Generated: 2026-02-06T19:46:05.907Z

## Environment

- Platform: darwin
- OS Release: 25.2.0
- Architecture: arm64
- CPU: unknown
- RAM (GB): 24.00

## Fixture Corpus

- Total fixtures: 12
- .txt fixtures: 4
- .md fixtures: 4
- .pdf fixtures: 4
- Near-limit fixtures: txt-near-limit, md-near-limit, pdf-near-limit

## Smoke Gate (NFR-010)

### Section Navigation (20 warm)

| metric | value |
|---|---:|
| count | 20 |
| p50 (ms) | 2.57 |
| p90 (ms) | 2.62 |
| mean (ms) | 2.57 |
| min (ms) | 2.51 |
| max (ms) | 2.72 |

### Provocation Latency (10 calls)

| metric | value |
|---|---:|
| count | 10 |
| p50 (ms) | 62.23 |
| p90 (ms) | 69.29 |
| mean (ms) | 62.92 |
| min (ms) | 55.58 |
| max (ms) | 72.25 |

Smoke gate status: PASS

## Full Hardening Benchmarks (NFR-009)

### Section Navigation (200 warm)

| metric | value |
|---|---:|
| count | 200 |
| p50 (ms) | 2.66 |
| p90 (ms) | 2.82 |
| mean (ms) | 2.69 |
| min (ms) | 2.49 |
| max (ms) | 3.42 |

### Provocation Latency (100 calls)

| metric | value |
|---|---:|
| count | 100 |
| p50 (ms) | 64.38 |
| p90 (ms) | 73.60 |
| mean (ms) | 64.18 |
| min (ms) | 53.09 |
| max (ms) | 79.28 |

## Notes

- AI benchmark uses deterministic simulated OpenAI transport latency for local reproducibility.
- Live network benchmark against OpenAI should be run in a network-enabled environment for NFR-002A validation.
