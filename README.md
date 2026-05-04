# Brand Vision — Claude Code project

A pipeline for art-direction-led prompt generation. Analyse reference images into structured JSON, aggregate into brand profiles, compose Midjourney prompts that respect a brand's visual DNA.

The "tool" is Claude Code plus a few markdown files. No scripts to maintain. The model does the work, you direct it.

-----

## One-time setup (≈10 minutes)

### 1. Install Claude Code

**macOS / Linux** — open Terminal:

```sh
curl -fsSL https://claude.ai/install.sh | bash
```

**Windows** — open PowerShell (not CMD):

```powershell
irm https://claude.ai/install.ps1 | iex
```

Close and reopen your terminal, then verify:

```sh
claude --version
```

The native installer auto-updates in the background, so you don't need to reinstall later.

### 2. Authenticate

You can authenticate two ways:

- **OAuth (uses your Claude Pro/Max subscription)** — just run `claude` in any folder and follow the browser prompt. Recommended if you have a Pro or Max plan.
- **API key (uses Anthropic API spend)** — set the environment variable before running. Use this if you only have an API account or want to keep usage off your subscription.

```sh
export ANTHROPIC_API_KEY=sk-ant-...
```

(Add to `~/.zshrc` or `~/.bashrc` to persist across terminal sessions.)

### 3. Drop the project files into a folder

Save these three files into a new folder, e.g. `~/brand-vision/`:

- `brand-vision.md` — the schema and stage instructions
- `CLAUDE.md` — project conventions (Claude Code reads this automatically)
- `README.md` — this file

Then create the working subfolders:

```sh
cd ~/brand-vision
mkdir -p references analyses profiles prompts
```

-----

## Daily use

### Start a session

```sh
cd ~/brand-vision
claude
```

Claude Code reads `CLAUDE.md` automatically when it starts in this folder, so it already knows the project conventions. The first thing to do in any session is point it at the spec:

> read brand-vision.md

### Analyse a corpus

Drop your reference images into `references/{brand}/`. Then:

> analyse the audi corpus

Claude Code will read each image, produce one JSON analysis per image, save them under `analyses/audi/`, and skip any that already exist. You can stop and resume — already-processed images won't get redone.

For your first run, ask it to do just one or two images so you can spot-check the output before committing to the full corpus:

> analyse the first two images in references/audi/ and show me the JSON before continuing

### Build a brand profile

Once you have at least 10 analyses (20+ for high confidence):

> build the audi brand profile

Output saves to `profiles/audi.json` along with a short summary explaining the brand's centre of gravity, what surprised you in the data, and where confidence is weakest.

### Refine the profile

If something in the profile feels off:

> the audi profile prohibits tropical settings — that's right. but the signature motifs feel weak, can we sharpen them?

Or just edit `profiles/audi.json` directly. Anything saved there is the source of truth for the next composer run.

### Compose a prompt

> compose a prompt for audi: Q6 e-tron in deep green, parked outside a modern timber cabin in British woodland, golden hour

The composer reads `profiles/audi.json`, applies it to the brief, outputs a Midjourney v8.1 prompt with explanatory notes underneath.

To save the prompt for later:

> compose a prompt for audi: … and save to prompts/audi/

-----

## Patterns worth knowing

**Iterate on the prompt without rebuilding the profile:**

> shorter
> change the time to blue hour
> this feels off-brand, the saturation seems too high

The composer responds in-conversation. The profile stays untouched.

**Add new references mid-flight:**

Drop more images into `references/audi/`, then:

> re-analyse new audi references and rebuild the profile

Claude Code skips already-analysed images, processes only new ones, then re-aggregates.

**Multiple brands:**

Just use different folder names — `references/audi/`, `references/porsche/`, etc. Each brand gets its own profile in `profiles/`.

-----

## Cost reference

Sonnet is the default model. For a typical 30-image corpus:

- Analyser stage: ~30 calls × 1500 input tokens (image) + 800 output tokens ≈ $0.15–$0.30
- Aggregator stage: 1 call × 30k input tokens + 2k output ≈ $0.10
- Composer stage: 1 call × 5k input + 1k output ≈ $0.02

So a full brand pipeline costs under a dollar with Sonnet. Switch to Opus if you want higher-quality analysis (about 5× the cost):

> use opus for analysis from now on

-----

## Why this works

The pipeline is just three prompts (analyser, aggregator, composer) operating on a shared schema. Claude Code is the runtime. The markdown files are the program.

This means: no script to maintain, no API plumbing to debug, no UI to keep in sync with the schema. When you want to change the schema, edit `brand-vision.md`. When you want to tighten the analyser's behaviour, edit the Stage 1 section. The next session picks up the change automatically.

Profiles, once built and saved as JSON, are portable. Take them anywhere — reuse in other tools, share with collaborators, version-control them.
