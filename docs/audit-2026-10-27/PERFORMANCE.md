# Synthetic catalog benchmark

Measured 31 October 2026 with v22.23.2 on darwin. Run `npm run benchmark` to repeat locally.

One tiny SKILL.md per package; synthetic local measurements, not production guarantees. Fifty warm searches per size; p95 is the 48th sorted sample. These tiny fixtures measure metadata overhead, not worst-case 8 MiB packages, long-lived memory, filesystem power-loss behavior, or external-provider performance. RSS includes Node and earlier benchmark allocations in this process.

| Skills | Loaded bytes | Startup ms | Warm search p95 ms | Process RSS MiB |
| --- | --- | --- | --- | --- |
| 100 | 9840 | 68 | 0.21 | 73 |
| 500 | 49200 | 301 | 0.43 | 103 |
| 1000 | 98400 | 607 | 1.2 | 115 |

The default snapshot byte budget is 128 MiB, adjustable deliberately from 1 MiB to 1 GiB with `SKILL_LIBRARY_MAX_BYTES`. The budget covers retained package bytes, not total process memory or private on-disk history. Per-package bounds still apply. Representative real-package benchmarks remain a release qualification task.
