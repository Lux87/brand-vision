# Brand Vision project

This is a brand-vision project. The full schema, stage instructions, and iteration patterns live in `brand-vision.md`. **Read that file before doing any work in this project.**

## What lives where

```
.
├── brand-vision.md         # Schema + stage instructions (source of truth)
├── CLAUDE.md               # This file
├── references/             # Input: reference images, organised by brand
│   └── {brand}/            # e.g. references/audi/img001.jpg
├── analyses/               # Output: per-image JSON analyses
│   └── {brand}/            # e.g. analyses/audi/img001.json
├── profiles/               # Output: aggregated brand profiles
│   └── {brand}.json
└── prompts/                # Optional: saved composed prompts
    └── {brand}/
```

## How to work in this project

When I say "analyse the {brand} corpus": process every image in `references/{brand}/` through the analyser stage, save one JSON per image to `analyses/{brand}/{basename}.json`, skip images that already have a JSON sibling. Use the Read tool to view each image before analysing.

When I say "build the {brand} profile": aggregate every JSON in `analyses/{brand}/` using the aggregator stage, save to `profiles/{brand}.json`. Print a short summary after.

When I say "compose a prompt for {brand}: {brief}": load `profiles/{brand}.json`, run the composer stage on the brief, output the prompt. Save to `prompts/{brand}/` only if asked.

## Conventions

- All JSON pretty-printed, 2-space indent
- Schema-valid JSON only — no extra commentary mixed in
- One image at a time for analysis; no parallel batching (consistency matters more than speed at this scale)
- Honest "indeterminate" or low-confidence values beat confident guesses
- For the composer: Midjourney v8.1 conventions strict — no em-dashes, no Latin species names, no `--no` block

## What I don't want

- Don't invent a new schema. The schema in `brand-vision.md` is the source of truth.
- Don't write Python scripts to "automate" analysis. Use the Read tool on each image. The model is the analyser.
- Don't bulk-process without showing me the first 1–2 outputs. I want to spot-check tone before you do all 30.
- Don't add commentary inside the JSON. JSON files contain valid JSON only.
