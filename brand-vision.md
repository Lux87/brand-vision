# Brand Vision

A pipeline for generating on-brand image prompts. Three stages: analyse reference images into structured JSON, aggregate the JSONs into a brand profile, compose Midjourney prompts from the profile plus a subject brief.

This document is the single source of truth. The schema, the stage instructions, and the conventions all live here. Reference it directly when working: `read brand-vision.md` is the natural way to start most sessions.

-----

## Schema

Two JSON shapes. Each image produces one `image_analysis`. The whole corpus aggregates into one `brand_profile`. Everything is JSON, never prose.

### Shape 1: `image_analysis` (one per reference image)

```json
{
  "schema_version": "1.0",
  "shape": "image_analysis",
  "subject": {
    "primary": "string, what the image is of in one phrase",
    "framing": "wide | medium | tight | extreme-close",
    "subject_scale_pct": "integer 0-100, percent of frame width occupied by primary subject",
    "subject_position": "centred | left-third | right-third | low | high | offset-other"
  },
  "palette": {
    "anchors": ["3-5 hex values, area-dominant colours"],
    "accents": ["1-2 hex values, small high-chroma punches"],
    "temperature_bias": "warm | neutral | cool | split-warm-cool",
    "saturation": "muted | restrained | vivid | high-chroma",
    "contrast": "low | mid | high"
  },
  "light": {
    "direction": "front | back | side-left | side-right | top | bottom | three-quarter-front-left | three-quarter-front-right | three-quarter-back-left | three-quarter-back-right | ambient",
    "elevation_deg": "integer 0-90",
    "quality": "hard | semi-hard | soft | diffuse",
    "temperature_k": "integer kelvin",
    "time_of_day": "blue-hour | dawn | golden-morning | morning | midday | afternoon | golden-evening | dusk | night | indeterminate",
    "single_source": "boolean",
    "atmospheric_modifier": "clear | haze | mist | fog | rain | snow | dust | smoke | none"
  },
  "composition": {
    "structure": "rule-of-thirds | centred | symmetrical | layered-planes | leading-line | frame-within-frame | scale-of-environment | negative-space-dominant | other",
    "depth_planes": "integer 1-4",
    "negative_space_pct": "integer 0-100",
    "horizon_position": "low | centre | high | none",
    "lens_character": "wide | normal | tele-compression | macro"
  },
  "setting": {
    "type": "urban | suburban | rural | wilderness | coastal | alpine | desert | interior | studio | infrastructure | other",
    "region_signature": "string, geographic/cultural read, e.g. 'British broadleaf woodland'",
    "weather": "string",
    "vegetation": ["dominant species or types if natural"],
    "materials": ["dominant built materials if architectural"]
  },
  "register": {
    "emotional_tone": "string, one or two words",
    "tempo": "still | implied-motion | active",
    "human_presence": "none | implied | background | foreground"
  },
  "domain_specifics": {
    "_note": "Optional. Only include if subject is a vehicle. Strip the whole block for non-auto.",
    "vehicle_finish": "solid-uni | metallic | pearl | matte | satin | unknown",
    "vehicle_paint_behaviour": "string, observed flake activation, flop, specular character",
    "vehicle_body_type": "string"
  },
  "notes": "1-2 sentences capturing anything structured fields missed"
}
```

### Shape 2: `brand_profile` (one per brand, aggregated)

Every attribute has an **anchor** (centre of gravity), a **range** (permitted latitude), and where relevant **prohibitions** (what the brand never does).

```json
{
  "schema_version": "1.0",
  "shape": "brand_profile",
  "brand_name": "string",
  "domain": "auto | fashion | architecture | lifestyle | hospitality | other",
  "corpus_size": "integer",
  "confidence": "low | medium | high",
  "subject": {
    "primary_subject_types": ["consistently shown subjects"],
    "framing_anchor": "wide | medium | tight",
    "framing_range": ["permitted framings"],
    "subject_scale_anchor_pct": "integer",
    "subject_scale_range_pct": [25, 45],
    "subject_position_tendency": "string"
  },
  "palette": {
    "anchor_colours": ["hex values appearing across most images"],
    "permitted_accents": ["hex values"],
    "temperature_anchor": "warm | neutral | cool | split-warm-cool",
    "temperature_range": ["permitted temperatures"],
    "saturation_anchor": "muted | restrained | vivid | high-chroma",
    "contrast_anchor": "low | mid | high",
    "prohibited_colours_or_combinations": ["e.g. 'neon', 'tropical brights'"]
  },
  "light": {
    "direction_tendency": ["typical directions"],
    "elevation_range_deg": [10, 35],
    "quality_anchor": "hard | semi-hard | soft | diffuse",
    "quality_range": ["permitted qualities"],
    "temperature_range_k": [3000, 5500],
    "time_of_day_anchors": ["e.g. golden-evening, blue-hour"],
    "single_source_required": "boolean",
    "atmospheric_modifiers_used": ["mist", "haze"],
    "prohibitions": ["e.g. 'flat overhead midday', 'multi-directional fill'"]
  },
  "composition": {
    "structure_anchors": ["primary patterns"],
    "depth_planes_typical": "integer",
    "negative_space_tendency": "low | mid | high",
    "horizon_tendency": "low | centre | high | varies",
    "lens_character_tendency": "wide | normal | tele-compression"
  },
  "setting": {
    "permitted_setting_types": ["urban", "alpine", "coastal"],
    "region_signature": "string",
    "weather_anchors": ["e.g. clear-with-haze, post-rain"],
    "prohibited_settings": ["e.g. 'tropical', 'desert', 'fantasy']
  },
  "register": {
    "emotional_tone_anchor": "string",
    "tempo_anchor": "still | implied-motion | active",
    "human_presence_tendency": "none | implied | background | foreground",
    "tonal_register": "string, e.g. 'restrained-premium', 'austere-technical'"
  },
  "domain_specifics": {
    "_note": "Optional. Strip for non-auto.",
    "vehicle_finish_rules": "string",
    "paint_physics_must_render": ["e.g. 'flake-activation-on-lit-panels', 'orange-peel-texture'"]
  },
  "signature_motifs": [
    "2-3 short specific phrases naming what makes this brand instantly recognisable"
  ],
  "anti_patterns": [
    "2-3 short phrases naming what would immediately read as off-brand"
  ]
}
```

### Shape 3: `image_prompt` (one per composed prompt)

Output of Stage 3. Captures every decision made during prompt composition in structured form, with hex values preserved per surface.

```json
{
  "shape": "image_prompt",
  "subject": {
    "description": "string — car model and colour name",
    "activity": "parked | stationary | moving | cornering | other",
    "finish": "metallic | matte | satin | pearl | solid-uni",
    "colour": { "name": "string — evocative descriptor", "hex": "#hex" },
    "paint_behaviour": "string — flake activation, flop, specular character"
  },
  "light": {
    "direction": "string — e.g. side-left, three-quarter-front-right, ambient",
    "quality": "hard | semi-hard | soft | diffuse",
    "time_of_day": "string",
    "temperature_k": "integer kelvin",
    "atmospheric_modifier": "string"
  },
  "palette": [
    { "surface": "car_body",   "description": "string", "hex": "#hex" },
    { "surface": "ground",     "description": "string", "hex": "#hex" },
    { "surface": "vegetation", "description": "string", "hex": "#hex" },
    { "surface": "sky",        "description": "string", "hex": "#hex" },
    { "surface": "accent",     "description": "string", "hex": "#hex" }
  ],
  "tonal_register": "string — e.g. 'cool-cast muted tones throughout' or 'warm amber-biased palette, restrained saturation'",
  "environment": {
    "type": "string",
    "region": "string",
    "ground_surface": "string — e.g. 'damp tarmac', 'loose gravel', 'wet grass'",
    "vegetation_detail": "string — e.g. 'mature oak and hornbeam canopy'",
    "architecture_detail": "string — omit if setting has none",
    "weather": "string"
  },
  "scene": "string — 1-2 sentences: what the car is doing, where, and the overall mood",
  "register": {
    "tone": "string",
    "atmosphere": "string"
  }
}
```

Omit `palette` entries for surfaces not present in the scene. Omit `architecture_detail` if not applicable.

-----

## Stage 1: Reference analyser

**What it does:** turns one image into one `image_analysis` JSON.

**Order of analysis** (each step constrains the next):

1. **Subject and framing first.** What's the image of, how big in frame, where positioned.
1. **Light before palette.** Direction, quality, temperature, time of day. Identifying light first prevents misreading colour: a wall isn't "warm cream", it's "neutral white under 3000K light." Get this wrong and palette extraction goes wrong.
1. **Palette extraction.** 3–5 anchor colours by area dominance, 1–2 accents by visual punch (small but high-chroma or high-contrast). Hex values. Strip the lighting cast where you can — record the surface colour as it would appear under neutral light. If you can't strip the cast confidently, record what you see and note it.
1. **Composition.** Structural pattern, depth planes, negative space, horizon, lens character.
1. **Setting and region.** Be specific. "Forest" is too generic; "British broadleaf woodland" or "Pacific Northwest temperate rainforest" actually constrains the model later. Read vegetation, architectural materials, signage language for cues.
1. **Register.** Emotional tone in one or two words. Tempo. Human presence.
1. **Domain specifics.** Only if the image contains a vehicle. Note finish, paint behaviour, and body type. Skip the whole block otherwise.
1. **Notes.** 1–2 sentences for anything structured fields missed.

**Common failure modes to avoid:**

- Over-confident hex values when colour is ambiguous → pick closest reasonable hex, lower confidence in `notes`.
- Mistaking lighting cast for palette → separate inherent surface colour from cast.
- Over-specifying setting beyond what the image supports.
- Filling fields aggressively when "indeterminate" is honest.
- Treating one image as the brand. This stage describes one image, not a brand.

**Output:** one JSON object, valid against the `image_analysis` schema. Save as `analyses/{image_basename}.json`.

-----

## Stage 2: Brand profile builder

**What it does:** aggregates many `image_analysis` JSONs into one `brand_profile` JSON.

**How aggregation works:**

- **Anchors (centre of gravity):** mode for categorical attributes (most common value), median for numerics. If two values tie, record both. Never average hex values — cluster instead. A colour earns anchor status if it appears across roughly half the corpus or more.
- **Ranges (permitted latitude):** 10th–90th percentile for numerics, trimming outliers. For categoricals, values that appear in 10% or more of the corpus. One-off values are noise, not part of the brand's range.
- **Prohibitions (conspicuous absences):** two sources. Inferred absence — what would you expect in a generic corpus that's missing here? Apply conservatively. Domain priors — premium brands almost universally avoid flat overhead midday, oversaturated sunsets, neon palettes, CGI sterility. Include if the corpus is consistent with these.

**Confidence:**

- **low** — under 10 images, or high variance
- **medium** — 10–20 with clear anchors
- **high** — 20+ with strong agreement

Be honest. Low confidence isn't failure — it's a signal to gather more references.

**Signature motifs and anti-patterns:** the most useful fields in the whole profile, the hardest to populate well. After processing structured fields, step back and write 2–3 of each.

- **Signature motifs:** specific, not generic. "Low golden-hour rim light against deep saturated backgrounds" yes; "uses warm light" no. Specific enough to act on.
- **Anti-patterns:** what would immediately read as off-brand. "Studio softbox sterility", "tropical resort palette", "supercar aggression". Not "looks bad".

**Common failure modes:**

- Mode-collapsing the range — if 60% of images are golden-hour and 40% blue-hour, both belong in the brand's range. Don't drop the minority.
- Averaging palette hex values produces grey. Cluster instead.
- Inventing prohibitions the corpus doesn't support.
- Treating one campaign as the whole brand. If the corpus is dominated by one shoot, flag it and set confidence to low.
- Filling `domain_specifics` for non-auto brands with fields that don't apply. Strip the block.

**Output:** one JSON object, valid against the `brand_profile` schema. Save as `profiles/{brand_name}.json`. Then write a short summary covering: brand's centre of gravity (one line each on subject, light, palette), what surprised you in the data, where confidence is weakest and what additional references would sharpen it.

-----

## Stage 3: Prompt composer

**What it does:** combines a `brand_profile` and a subject brief into a Midjourney v8.1 prompt designed to be used alongside a reference image of the car. The reference image carries the spatial composition, framing, and camera angle — the prompt supplies the painterly context: light, surface, environment, atmosphere, and register.

**Process:**

1. **Resolve brief against profile.** Brief specifications win; profile fills gaps. If brief contradicts a profile prohibition, surface the conflict. Don't silently break the brand.
1. **Lock three primaries from profile anchors:** light, palette, register. Do not use composition anchors to prescribe spatial layout — that comes from the reference image.
1. **Translate the palette.** Hex codes mean nothing to Midjourney — they must become descriptive colour language applied to specific surfaces. This is where most prompts lose the brand's colour identity.
   - Convert each `anchor_colour` hex to a named descriptor: not "#2c3e35" but "deep forest green". Be specific and evocative, not generic ("dark", "grey" are not enough).
   - Assign the 2–3 dominant anchor colours to real surfaces in the scene — car body, road or ground, vegetation or architecture, sky. Each surface gets a colour.
   - Place `permitted_accents` as small, specific colour punches on a real object — a reflection, a light source, a material detail.
   - Use `temperature_anchor` and `saturation_anchor` to write one tonal-register phrase that ties all the surface colours together: "cool-cast muted tones throughout" or "warm amber-biased palette, restrained saturation".
1. **Build environment** using profile's permitted setting types and region signature. Pick vegetation, materials, weather from anchors. The environment should carry the translated palette — colours appear on real surfaces, not just in the abstract.
1. **Apply domain specifics if relevant.** Vehicle paint physics and finish behaviour only. Skip if not auto.
1. **Write the prompt.** Single block of natural prose. Order: subject identity → paint/material behaviour → light → surface the car sits on → environment with colours applied → sky/atmosphere → mood. **Do not include camera angle, framing, lens character, depth planes, subject positioning, or compositional structure** unless the brief explicitly asks for them.

**Length:** 80–140 words. Keep it tight — the reference image carries the rest.

**What to leave out (unless the brief explicitly asks):**

- Camera angle or viewpoint (three-quarter front, side profile, front-on, etc.)
- Framing (wide shot, close-up, etc.)
- Lens character (tele-compression, wide, macro)
- Subject positioning in frame (centred, left-third, etc.)
- Compositional structure (leading line, rule of thirds, layered planes, etc.)
- Depth plane counts

These are carried by the reference image. Adding them fights against it.

**Midjourney v8.1 conventions:**

- **No em-dashes or en-dashes** in the prompt body. Use commas or full stops.
- **No Latin species names** in parentheses. Common name is enough.
- **No `--no` block.** Not supported in v8.1. Bake prohibitions into positive language: "matt anthracite trim throughout" not "no chrome trim".
- **Single block,** not multi-paragraph, unless explicitly asked.
- **Don't bake `--ar`, `--style raw`, version flags into the prompt** unless the user specified them. End with a separate trailing note: "Add your `--ar`, `--style raw` and version flags as needed."

**Common failure modes:**

- Absorbing the palette as vague mood ("warm tones", "cool palette") without applying specific named colours to specific surfaces. Every anchor colour should land on something real in the scene.
- Naming hex codes in the prompt. Midjourney does not parse hex. Convert them first.
- Applying colour only to the car and leaving the environment colourless. The ground, sky, and vegetation should all carry the palette.
- Slipping spatial language in through the back door — "the car sits in the left third", "a road recedes into the background", "tele-compressed perspective". If it describes framing or layout, cut it.
- Repeating brand-name boilerplate. "Premium through restraint, cinematic through composition" is poetry, not instruction. Skip it.
- Stacking every anchor. A profile might list five permitted setting types — the prompt uses one. Profile is the menu, prompt is the order.
- Translating prohibitions as `--no` lists. Bake into positive language.
- Over-specifying when the profile is general. Match prompt specificity to profile confidence.
- Inventing details the profile doesn't license.

**Output:** the prompt as a single blockquote (lines prefixed `> `), then 2–3 sentences after explaining which profile anchors drove the look and any conflicts resolved.

-----

## Iteration patterns

**"Make it shorter":** cut repeated descriptors first, environmental detail second, paint physics last. Paint physics is usually the highest-leverage detail for auto brands — keep it.

**"Change the time of day":** check the requested time falls inside the profile's range. If yes, swap. If no, flag.

**"This feels off-brand":** ask which element. Run it back to the profile field that should have controlled it. The fix is usually upstream (in the profile) not downstream (in the prompt).

**"Build a corpus":** I'll process every image in `references/{brand}/`, save one JSON per image to `analyses/{brand}/`, skip ones already analysed. After the corpus is built, I'll aggregate into `profiles/{brand}.json` only if explicitly asked.

**"Add new references":** drop more images into `references/{brand}/`, run the analyser stage again — already-processed images skip automatically. Then re-aggregate to update the profile.

-----

## Project conventions

- Reference images live in `references/{brand}/`
- Per-image analyses live in `analyses/{brand}/{image_basename}.json`
- Brand profiles live in `profiles/{brand}.json`
- Composed prompts can be saved to `prompts/{brand}/{date}-{short-slug}.md` if asked, otherwise just shown
- All JSON files are pretty-printed (2-space indent) for readability
- Skip-if-exists is the default behaviour for the analyser stage so corpus building is resumable
