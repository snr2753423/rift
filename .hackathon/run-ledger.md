# Run ledger
MODEL: claude-opus-5-5 (Opus 5.5) — specific model, MODEL check PASS
STAGE: grill-me RUNNING (execution posture — prompt is a near-complete spec)
RISK: /Users/srivanth/RIFT sits inside a git repo rooted at /Users/srivanth (home). Plan: `git init` inside RIFT before first commit so home files are never staged.
DECISION: model = nvidia/nemotron-3.5-super-vl-120b-a12b (catalog-verified), fallback nemotron-3.5-lightning-30b-a3b
ACCEPTED-UNKNOWN: NVIDIA key not yet obtained (user locating it on build.nvidia.com). Builder proceeds with labeled replay fallback; live path wired via NVIDIA_API_KEY env var. Owner: user; resolution: any time during build.
STAGE: grill-me DONE (5 decisions user-stated, rest assumed). KEY-RECEIPT: NVIDIA received yes (stored .env.local, value never logged). Live tool-call test PASS.
STAGE: scope DONE; prebuild-research: skipped web sweep (3h budget) — recorded gap, stack facts verified live (model catalog + tool call).
