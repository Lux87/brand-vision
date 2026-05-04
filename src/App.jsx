import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  Upload, FileText, Layers, Sparkles, Download, Copy, Trash2,
  Check, AlertCircle, Loader2, ChevronRight, Key, X, Eye, EyeOff,
} from 'lucide-react';

// ─────────────────────────────────────────────
// SYSTEM PROMPTS — full versions (no artifact payload constraints here)
// ─────────────────────────────────────────────

const ANALYSER_SYSTEM = `You are a visual art director trained in brand analysis. Analyse the provided reference image and return ONLY raw JSON — no markdown fences, no prose, no commentary before or after. The JSON must validate against the image_analysis schema below.

ORDER OF ANALYSIS (each step constrains the next):
1. Subject and framing first — what is the image of, how large in frame, where positioned.
2. Light before palette — direction, quality, temperature, time of day. Identifying light first prevents misreading colour: a wall isn't "warm cream", it's "neutral white under 3000 K light."
3. Palette extraction — 3–5 anchor hex values by area dominance, 1–2 accent hex values by visual punch (small but high-chroma or high-contrast). Strip the lighting cast where you can — record the surface colour as it would appear under neutral light. If you cannot strip the cast confidently, record what you see and note it.
4. Composition — structural pattern, depth planes, negative space, horizon, lens character.
5. Setting and region — be specific. "Forest" is too generic. "British broadleaf woodland" or "Pacific Northwest temperate rainforest" actually constrains a generative model. Read vegetation, architectural materials, signage language for cues.
6. Register — emotional tone in one or two words, tempo, human presence.
7. Domain specifics — ONLY if the image contains a vehicle. Note finish, paint behaviour, and body type. Omit the entire block otherwise.
8. Notes — 1–2 sentences for anything the structured fields missed.

COMMON FAILURE MODES TO AVOID:
- Over-confident hex values when colour is ambiguous → pick the closest reasonable hex, note uncertainty.
- Mistaking lighting cast for surface palette → separate the two.
- Over-specifying setting beyond what the image supports.
- Filling fields aggressively when "indeterminate" is the honest answer.
- Treating this one image as representative of a brand — this stage describes one image, nothing more.

SCHEMA (return exactly this shape, no extra keys):
{
  "schema_version": "1.0",
  "shape": "image_analysis",
  "subject": {
    "primary": "string — what the image is of in one phrase",
    "framing": "wide | medium | tight | extreme-close",
    "subject_scale_pct": 0,
    "subject_position": "centred | left-third | right-third | low | high | offset-other"
  },
  "palette": {
    "anchors": ["#hex", "#hex", "#hex"],
    "accents": ["#hex"],
    "temperature_bias": "warm | neutral | cool | split-warm-cool",
    "saturation": "muted | restrained | vivid | high-chroma",
    "contrast": "low | mid | high"
  },
  "light": {
    "direction": "front | back | side-left | side-right | top | bottom | three-quarter-front-left | three-quarter-front-right | three-quarter-back-left | three-quarter-back-right | ambient",
    "elevation_deg": 0,
    "quality": "hard | semi-hard | soft | diffuse",
    "temperature_k": 0,
    "time_of_day": "blue-hour | dawn | golden-morning | morning | midday | afternoon | golden-evening | dusk | night | indeterminate",
    "single_source": true,
    "atmospheric_modifier": "clear | haze | mist | fog | rain | snow | dust | smoke | none"
  },
  "composition": {
    "structure": "rule-of-thirds | centred | symmetrical | layered-planes | leading-line | frame-within-frame | scale-of-environment | negative-space-dominant | other",
    "depth_planes": 3,
    "negative_space_pct": 0,
    "horizon_position": "low | centre | high | none",
    "lens_character": "wide | normal | tele-compression | macro"
  },
  "setting": {
    "type": "urban | suburban | rural | wilderness | coastal | alpine | desert | interior | studio | infrastructure | other",
    "region_signature": "string — geographic/cultural read, e.g. 'British broadleaf woodland'",
    "weather": "string",
    "vegetation": [],
    "materials": []
  },
  "register": {
    "emotional_tone": "string — one or two words",
    "tempo": "still | implied-motion | active",
    "human_presence": "none | implied | background | foreground"
  },
  "domain_specifics": {
    "vehicle_finish": "solid-uni | metallic | pearl | matte | satin | unknown",
    "vehicle_paint_behaviour": "string — observed flake activation, flop, specular character",
    "vehicle_body_type": "string"
  },
  "notes": "string — 1–2 sentences for anything the structured fields missed"
}

Omit the domain_specifics block entirely if no vehicle is present. Return raw JSON only.`;

const AGGREGATOR_SYSTEM = `You are a brand strategist and visual analyst. You will receive a set of image_analysis JSON objects for a single brand. Aggregate them into one brand_profile JSON. Return ONLY raw JSON — no markdown fences, no prose.

HOW AGGREGATION WORKS:
- ANCHORS (centre of gravity): mode for categoricals (most common value), median for numerics. If two values tie, record both. Never average hex values — cluster by visual proximity instead. A colour earns anchor status if it appears across roughly half the corpus or more.
- RANGES (permitted latitude): 10th–90th percentile for numerics, trimming outliers. For categoricals, include values that appear in 10% or more of the corpus. One-off values are noise, not part of the brand range.
- PROHIBITIONS (conspicuous absences): two sources — (1) inferred absence: what would you expect in a generic corpus that is missing here? Apply conservatively. (2) Domain priors: premium brands almost universally avoid flat overhead midday, oversaturated sunsets, neon palettes, CGI sterility. Include if the corpus is consistent with these.

CONFIDENCE:
- low — under 10 images, or high variance across the corpus
- medium — 10–20 images with clear anchors emerging
- high — 20+ images with strong cross-image agreement

SIGNATURE MOTIFS AND ANTI-PATTERNS are the most important fields and the hardest to populate well. After processing all structured fields, step back and write 2–3 of each.
- Signature motifs: specific, not generic. "Low golden-hour rim light against deep-saturated dark backgrounds" yes. "Uses warm light" no. Specific enough to act on when writing a prompt.
- Anti-patterns: what would immediately read as off-brand to someone who knows this brand. "Studio softbox sterility", "tropical resort palette", "supercar aggression". Not just "looks bad".

COMMON FAILURE MODES:
- Mode-collapsing the range — if 60% of images are golden-hour and 40% are blue-hour, both belong in the brand's range. Do not drop the minority.
- Averaging palette hex values produces grey. Cluster instead.
- Inventing prohibitions the corpus does not support.
- Treating one campaign as the whole brand. If the corpus is dominated by one shoot, flag it and set confidence to low.
- Filling domain_specifics for non-auto brands. Strip the block if not applicable.

OUTPUT SCHEMA (return exactly this shape):
{
  "schema_version": "1.0",
  "shape": "brand_profile",
  "brand_name": "string",
  "domain": "auto | fashion | architecture | lifestyle | hospitality | other",
  "corpus_size": 0,
  "confidence": "low | medium | high",
  "subject": {
    "primary_subject_types": [],
    "framing_anchor": "wide | medium | tight",
    "framing_range": [],
    "subject_scale_anchor_pct": 0,
    "subject_scale_range_pct": [0, 0],
    "subject_position_tendency": "string"
  },
  "palette": {
    "anchor_colours": [],
    "permitted_accents": [],
    "temperature_anchor": "warm | neutral | cool | split-warm-cool",
    "temperature_range": [],
    "saturation_anchor": "muted | restrained | vivid | high-chroma",
    "contrast_anchor": "low | mid | high",
    "prohibited_colours_or_combinations": []
  },
  "light": {
    "direction_tendency": [],
    "elevation_range_deg": [0, 0],
    "quality_anchor": "hard | semi-hard | soft | diffuse",
    "quality_range": [],
    "temperature_range_k": [0, 0],
    "time_of_day_anchors": [],
    "single_source_required": true,
    "atmospheric_modifiers_used": [],
    "prohibitions": []
  },
  "composition": {
    "structure_anchors": [],
    "depth_planes_typical": 3,
    "negative_space_tendency": "low | mid | high",
    "horizon_tendency": "low | centre | high | varies",
    "lens_character_tendency": "wide | normal | tele-compression"
  },
  "setting": {
    "permitted_setting_types": [],
    "region_signature": "string",
    "weather_anchors": [],
    "prohibited_settings": []
  },
  "register": {
    "emotional_tone_anchor": "string",
    "tempo_anchor": "still | implied-motion | active",
    "human_presence_tendency": "none | implied | background | foreground",
    "tonal_register": "string — e.g. 'restrained-premium', 'austere-technical'"
  },
  "domain_specifics": {
    "vehicle_finish_rules": "string",
    "paint_physics_must_render": []
  },
  "signature_motifs": [],
  "anti_patterns": []
}

Omit domain_specifics entirely if not applicable. Return raw JSON only.`;

const COMPOSER_SYSTEM = `You are an art director composing image generation prompts. You will receive a brand_profile JSON and a subject brief. Combine them into a single Midjourney v8.1 prompt. Return the prompt as a blockquote (each line prefixed with "> "), then 2–3 sentences explaining which profile anchors drove the look, which camera angle you chose and why, and any brief-vs-profile conflicts you resolved.

PROCESS:
1. Resolve brief against profile — brief specifications win, profile fills gaps. If the brief contradicts a profile prohibition, surface the conflict explicitly. Do not silently break the brand.
2. Lock four primaries from profile anchors: composition, light, palette, register.
3. Build environment using the profile's permitted_setting_types and region_signature. Pick vegetation, materials, weather from profile anchors. Default to three depth planes.
4. CHOOSE THE CAMERA ANGLE — this is the pivotal decision. If the brief specifies an angle, use it. If not, select the angle that works best with the environment you are building, using this logic:
   - Three-quarter front: suits roads or paths curving away to one side, building facades at an angle, forecourts with environmental context visible. Most versatile for showing both face and flank.
   - Side profile: requires a clean orthogonal background — a straight road, a flat wall, open water, or a long architectural plane. Fails with curved roads or angled settings.
   - Three-quarter rear: suits roads receding into distance, tunnel exits, arrival scenes. Shows proportion and tail design but hides the face.
   - Front-on: suits symmetrical settings — straight roads converging to a vanishing point, head-on tunnels, formal architecture. Needs the background to read as centred.
   - Rear-on: rarely used; suits departure scenes and atmospheric backlit shots.
   Once you choose the angle, every environment and composition decision downstream must be consistent with it. Do not describe a curving road and then place the car in side profile.
5. Apply domain_specifics if the subject is a vehicle — paint physics and finish behaviour only. Skip entirely if not auto.
6. Write the prompt as a single block of natural prose. Order: camera angle + subject → paint/material behaviour → light → surface → environment in depth planes → sky/atmosphere → camera character. State the angle clearly near the start so the model locks it early.

LENGTH: 100–180 words for a hero shot. 70–110 for a quick concept. Default to the shorter end.

MIDJOURNEY v8.1 CONVENTIONS — these are hard rules:
- No em-dashes or en-dashes in the prompt body. Use commas or full stops instead.
- No Latin species names in parentheses. Common name is sufficient.
- No --no block. Not supported in v8.1. Bake prohibitions into positive language: "matt anthracite trim throughout" not "no chrome trim".
- Single prose block, not multi-paragraph, unless explicitly asked.
- Do not bake --ar, --style raw, or version flags into the prompt unless the user specified them. End with a plain trailing note: "Add your --ar, --style raw and version flags as needed."

COMMON FAILURE MODES TO AVOID:
- Choosing an angle and then describing a background that contradicts it — a curving forest road for a side-profile shot, or an asymmetric building behind a front-on car. Always sanity-check angle against background.
- Repeating brand-name boilerplate ("premium through restraint", "cinematic through composition"). This is poetry, not instruction. Skip it.
- Stacking every anchor from the profile into one prompt. The profile is the menu; the prompt is the order — pick one setting, one time of day, one atmospheric condition.
- Translating profile prohibitions as --no lists. Bake them into positive descriptors.
- Over-specifying when the profile confidence is low or general. Match prompt specificity to profile confidence.
- Inventing details the profile does not license.
- Making the subject the entire prompt. The subject is one element of an art-directed image.`;

// ─────────────────────────────────────────────
// localStorage key
// ─────────────────────────────────────────────

const LS_KEY = 'brand-vision-api-key';

const getStoredKey = () => localStorage.getItem(LS_KEY) || '';
const setStoredKey = (k) => {
  if (k) localStorage.setItem(LS_KEY, k);
  else localStorage.removeItem(LS_KEY);
};

// ─────────────────────────────────────────────
// API helpers
// ─────────────────────────────────────────────

const callClaude = async (systemPrompt, userMessage, imageBase64 = null, mediaType = null) => {
  const apiKey = getStoredKey();
  if (!apiKey) throw new Error('Please add your Anthropic API key in Settings.');

  const content = [];
  if (imageBase64) {
    content.push({ type: 'image', source: { type: 'base64', media_type: mediaType, data: imageBase64 } });
  }
  content.push({ type: 'text', text: userMessage });

  let response;
  try {
    response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 2000,
        system: systemPrompt,
        messages: [{ role: 'user', content }],
      }),
    });
  } catch (e) {
    throw new Error(`Network failure — check your connection. (${e.message})`);
  }

  const rawText = await response.text();

  if (!response.ok) {
    if (response.status === 401) throw new Error('API key invalid or expired. Update it in Settings.');
    if (response.status === 429) throw new Error('Rate limited. Wait a moment and try again.');
    let detail = '';
    try { detail = JSON.parse(rawText)?.error?.message || rawText.slice(0, 300); } catch { detail = rawText.slice(0, 300); }
    throw new Error(`API error ${response.status}: ${detail}`);
  }

  let data;
  try { data = JSON.parse(rawText); } catch {
    throw new Error(`Response was not JSON. First 300 chars: ${rawText.slice(0, 300)}`);
  }

  if (!data.content || !Array.isArray(data.content)) {
    throw new Error(`Unexpected response shape. Keys: ${Object.keys(data).join(', ')}`);
  }

  const text = data.content.filter(b => b.type === 'text').map(b => b.text).join('\n');
  if (!text) throw new Error(`No text in response. Block types: ${data.content.map(b => b.type).join(', ')}`);
  return text;
};

const fileToBase64 = (file) => new Promise((resolve, reject) => {
  const r = new FileReader();
  r.onload = () => resolve(r.result.split(',')[1]);
  r.onerror = () => reject(new Error('Read failed'));
  r.readAsDataURL(file);
});

const compressImage = (file, maxDim = 1024, quality = 0.82) => new Promise((resolve, reject) => {
  const img = new Image();
  const objectUrl = URL.createObjectURL(file);
  img.onload = () => {
    URL.revokeObjectURL(objectUrl);
    let { width, height } = img;
    if (width > maxDim || height > maxDim) {
      const scale = maxDim / Math.max(width, height);
      width = Math.round(width * scale);
      height = Math.round(height * scale);
    }
    const canvas = document.createElement('canvas');
    canvas.width = width; canvas.height = height;
    canvas.getContext('2d').drawImage(img, 0, 0, width, height);
    const dataUrl = canvas.toDataURL('image/jpeg', quality);
    resolve({ base64: dataUrl.split(',')[1], mediaType: 'image/jpeg', width, height });
  };
  img.onerror = () => { URL.revokeObjectURL(objectUrl); reject(new Error('Image load failed')); };
  img.src = objectUrl;
});

const tryParseJSON = (text) => {
  const cleaned = text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
  try { return JSON.parse(cleaned); } catch { return null; }
};

const downloadJSON = (data, filename) => {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
};

// ─────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────

const TabButton = ({ active, onClick, num, label, sublabel }) => (
  <button
    onClick={onClick}
    className={`group flex items-baseline gap-3 py-3 px-1 border-b transition-all ${
      active ? 'border-stone-900 text-stone-900' : 'border-transparent text-stone-400 hover:text-stone-700'
    }`}
  >
    <span className={`font-serif text-xs tracking-[0.2em] ${active ? 'text-stone-900' : 'text-stone-400'}`}>{num}</span>
    <div className="text-left">
      <div className="font-serif text-base leading-none">{label}</div>
      <div className="text-[10px] uppercase tracking-[0.15em] text-stone-400 mt-0.5">{sublabel}</div>
    </div>
  </button>
);

const StatusPill = ({ status }) => {
  const map = {
    pending:  { label: 'PENDING',   cls: 'bg-stone-100 text-stone-500' },
    running:  { label: 'ANALYSING', cls: 'bg-amber-50 text-amber-800' },
    done:     { label: 'DONE',      cls: 'bg-emerald-50 text-emerald-800' },
    error:    { label: 'FAILED',    cls: 'bg-red-50 text-red-800' },
  };
  const s = map[status] || map.pending;
  return <span className={`text-[9px] tracking-[0.15em] px-1.5 py-0.5 ${s.cls}`}>{s.label}</span>;
};

// ─── API Key dialog / settings panel ──────────

const ApiKeyPanel = ({ onClose }) => {
  const [draft, setDraft]       = useState(getStoredKey());
  const [show, setShow]         = useState(false);
  const [verifyState, setVerify] = useState(null); // null | 'running' | 'ok' | string(error)

  const save = () => { setStoredKey(draft.trim()); onClose(); };
  const clear = () => { setDraft(''); setStoredKey(''); };

  const verify = async () => {
    setStoredKey(draft.trim());
    setVerify('running');
    try {
      const text = await callClaude('Reply with the single word READY and nothing else.', 'Test.');
      if (text.trim().toUpperCase().includes('READY')) setVerify('ok');
      else setVerify(`Unexpected response: ${text.slice(0, 80)}`);
    } catch (e) {
      setVerify(e.message);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/40 backdrop-blur-sm">
      <div className="bg-white border border-stone-200 w-full max-w-lg mx-4 p-8">
        <div className="flex items-baseline justify-between mb-6">
          <h2 className="font-serif text-2xl">API key</h2>
          <button onClick={onClose} className="text-stone-400 hover:text-stone-900"><X className="w-4 h-4" /></button>
        </div>

        {/* Privacy note */}
        <div className="bg-stone-50 border border-stone-200 p-4 mb-6 text-xs text-stone-600 leading-relaxed space-y-1.5">
          <p className="font-semibold text-stone-800 text-[10px] uppercase tracking-[0.15em] mb-2">Before you paste your key</p>
          <p>Your key is stored in <strong>this browser only</strong> (localStorage). It never leaves your device except as the <code>x-api-key</code> header sent directly to <strong>api.anthropic.com</strong>.</p>
          <p>No server, proxy, or third party ever sees it. The site owner cannot see it.</p>
          <p>API calls are billed to whoever's key is used — that's you.</p>
          <p>If you share a device, anyone with browser access could read localStorage. Clear the key when you're done if that's a concern.</p>
        </div>

        <label className="block mb-4">
          <span className="text-[10px] uppercase tracking-[0.2em] text-stone-500">Anthropic API key</span>
          <div className="relative mt-1.5">
            <input
              type={show ? 'text' : 'password'}
              value={draft}
              onChange={(e) => { setDraft(e.target.value); setVerify(null); }}
              placeholder="sk-ant-..."
              className="w-full border-b border-stone-300 bg-transparent py-2 pr-8 font-mono text-sm focus:outline-none focus:border-stone-900"
            />
            <button onClick={() => setShow(s => !s)} className="absolute right-0 top-2 text-stone-400 hover:text-stone-700">
              {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </label>

        <div className="flex items-center gap-3 mb-6">
          <button
            onClick={verify}
            disabled={!draft.trim() || verifyState === 'running'}
            className="text-[10px] uppercase tracking-[0.15em] px-3 py-1.5 border border-stone-300 hover:bg-stone-100 transition disabled:opacity-40"
          >
            {verifyState === 'running'
              ? <><Loader2 className="w-3 h-3 inline mr-1.5 animate-spin" />Verifying…</>
              : 'Verify key'}
          </button>
          {verifyState === 'ok' && (
            <span className="text-xs text-emerald-700 flex items-center gap-1.5"><Check className="w-3 h-3" /> Key works</span>
          )}
          {verifyState && verifyState !== 'ok' && verifyState !== 'running' && (
            <span className="text-xs text-red-700 break-all">{verifyState}</span>
          )}
        </div>

        <div className="flex gap-3">
          <button
            onClick={save}
            disabled={!draft.trim()}
            className="flex-1 text-xs uppercase tracking-[0.15em] px-4 py-2.5 bg-stone-900 text-stone-50 hover:bg-stone-700 transition disabled:opacity-40"
          >
            Save key
          </button>
          {getStoredKey() && (
            <button onClick={clear} className="text-xs uppercase tracking-[0.15em] px-4 py-2.5 border border-stone-300 hover:bg-red-50 hover:border-red-300 transition">
              Clear
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────
// Main app
// ─────────────────────────────────────────────

export default function BrandVisionApp() {
  const [tab, setTab]               = useState('analyse');
  const [analyses, setAnalyses]     = useState([]);
  const [profile, setProfile]       = useState(null);
  const [profileBrand, setProfileBrand] = useState('');
  const [aggregating, setAggregating] = useState(false);
  const [composing, setComposing]   = useState(false);
  const [brief, setBrief]           = useState('');
  const [composedPrompt, setComposedPrompt] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const [noKeyBanner, setNoKeyBanner]   = useState(false);
  const fileInputRef = useRef(null);

  useEffect(() => {
    if (!getStoredKey()) setNoKeyBanner(true);
  }, []);

  // ── Analyse ──────────────────────────────────

  const handleFiles = async (fileList) => {
    const files = Array.from(fileList).filter(f => f.type.startsWith('image/'));
    if (!files.length) return;
    if (!getStoredKey()) { setShowSettings(true); return; }

    const newItems = files.map(f => ({
      id: `${Date.now()}-${f.name}-${Math.random().toString(36).slice(2, 7)}`,
      file: f,
      name: f.name,
      status: 'pending',
      json: null,
      error: null,
      preview: URL.createObjectURL(f),
    }));
    // Add all items as running immediately so the UI reflects the full batch at once
    setAnalyses(prev => [...prev, ...newItems.map(x => ({ ...x, status: 'running' }))]);

    await Promise.allSettled(newItems.map(async (item) => {
      try {
        const { base64, mediaType } = await compressImage(item.file);
        const text = await callClaude(ANALYSER_SYSTEM, 'Analyse this image.', base64, mediaType);
        const json = tryParseJSON(text);
        if (!json) throw new Error('Model output was not valid JSON');
        setAnalyses(prev => prev.map(x => x.id === item.id ? { ...x, status: 'done', json } : x));
      } catch (e) {
        setAnalyses(prev => prev.map(x => x.id === item.id ? { ...x, status: 'error', error: e.message } : x));
      }
    }));
  };

  const removeAnalysis = (id) => setAnalyses(prev => prev.filter(x => x.id !== id));

  const clearAll = () => {
    if (confirm('Clear all analyses? This cannot be undone.')) {
      analyses.forEach(a => URL.revokeObjectURL(a.preview));
      setAnalyses([]);
    }
  };

  const downloadCorpus = () => {
    const corpus = analyses.filter(a => a.status === 'done').map(a => a.json);
    if (!corpus.length) return;
    downloadJSON(corpus, `corpus-${Date.now()}.json`);
  };

  // ── Aggregate ────────────────────────────────

  const buildProfile = async () => {
    const corpus = analyses.filter(a => a.status === 'done').map(a => a.json);
    if (corpus.length < 3) { alert('Need at least 3 successful analyses to build a profile.'); return; }
    setAggregating(true);
    setProfile(null);
    try {
      const userMsg = `Brand name: ${profileBrand || 'Unknown'}\nCorpus size: ${corpus.length}\n\nImage analyses:\n${JSON.stringify(corpus, null, 2)}`;
      const text = await callClaude(AGGREGATOR_SYSTEM, userMsg);
      const json = tryParseJSON(text);
      if (!json) throw new Error('Model output was not valid JSON. Raw output:\n\n' + text.slice(0, 500));
      setProfile(json);
      setTab('compose');
    } catch (e) {
      alert('Aggregation failed: ' + e.message);
    } finally {
      setAggregating(false);
    }
  };

  const downloadProfile = () => {
    if (!profile) return;
    const name = (profile.brand_name || 'brand').toLowerCase().replace(/\s+/g, '-');
    downloadJSON(profile, `profile-${name}.json`);
  };

  const importProfile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const r = new FileReader();
    r.onload = () => {
      try {
        const parsed = JSON.parse(r.result);
        if (parsed.shape !== 'brand_profile') { alert("This doesn't look like a brand_profile JSON."); return; }
        setProfile(parsed);
        setProfileBrand(parsed.brand_name || '');
        setTab('compose');
      } catch (err) { alert('Could not parse JSON: ' + err.message); }
    };
    r.readAsText(file);
  };

  // ── Compose ──────────────────────────────────

  const composePrompt = async () => {
    if (!profile) { alert('Build or import a brand profile first.'); return; }
    if (!brief.trim()) { alert('Write a subject brief first.'); return; }
    setComposing(true);
    setComposedPrompt('');
    try {
      const userMsg = `BRAND PROFILE:\n${JSON.stringify(profile, null, 2)}\n\nSUBJECT BRIEF:\n${brief.trim()}`;
      const text = await callClaude(COMPOSER_SYSTEM, userMsg);
      setComposedPrompt(text);
    } catch (e) {
      alert('Composition failed: ' + e.message);
    } finally {
      setComposing(false);
    }
  };

  const copyPrompt = () => {
    const lines = composedPrompt.split('\n');
    const quoted = lines.filter(l => l.trim().startsWith('>')).map(l => l.replace(/^>\s?/, '')).join('\n').trim();
    navigator.clipboard.writeText(quoted || composedPrompt);
  };

  const doneCount    = analyses.filter(a => a.status === 'done').length;
  const errorCount   = analyses.filter(a => a.status === 'error').length;
  const runningCount = analyses.filter(a => a.status === 'running').length;

  // ─────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-stone-50 text-stone-900">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=EB+Garamond:ital,wght@0,400;0,500;1,400&family=JetBrains+Mono:wght@400;500&display=swap');
        .font-serif  { font-family: 'EB Garamond', Georgia, serif; }
        .font-mono   { font-family: 'JetBrains Mono', ui-monospace, monospace; }
        .tab-content { animation: fade-in 0.25s ease-out; }
        @keyframes fade-in { from { opacity:0; transform:translateY(4px); } to { opacity:1; transform:translateY(0); } }
      `}</style>

      {showSettings && <ApiKeyPanel onClose={() => { setShowSettings(false); setNoKeyBanner(false); }} />}

      {/* No-key banner */}
      {noKeyBanner && !showSettings && (
        <div className="bg-amber-50 border-b border-amber-200 px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs text-amber-800">
            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
            No API key set. Add your Anthropic API key to start analysing images.
          </div>
          <div className="flex items-center gap-3">
            <button onClick={() => setShowSettings(true)} className="text-[10px] uppercase tracking-[0.15em] px-3 py-1 bg-amber-800 text-amber-50 hover:bg-amber-900 transition">
              Add key
            </button>
            <button onClick={() => setNoKeyBanner(false)} className="text-amber-600 hover:text-amber-900"><X className="w-3.5 h-3.5" /></button>
          </div>
        </div>
      )}

      {/* Masthead */}
      <header className="border-b border-stone-200 bg-stone-50/80 backdrop-blur sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-6 py-5 flex items-baseline justify-between">
          <div>
            <h1 className="font-serif text-2xl tracking-tight leading-none">Brand Vision</h1>
            <p className="text-[10px] uppercase tracking-[0.25em] text-stone-500 mt-1.5">Reference → Profile → Prompt</p>
          </div>
          <button
            onClick={() => setShowSettings(true)}
            title="API key settings"
            className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.2em] text-stone-400 hover:text-stone-900 transition"
          >
            <Key className="w-3.5 h-3.5" />
            {getStoredKey() ? <span className="text-emerald-600">Key set</span> : <span>Settings</span>}
          </button>
        </div>

        <nav className="max-w-5xl mx-auto px-6 flex gap-8 border-t border-stone-100">
          <TabButton active={tab === 'analyse'}   onClick={() => setTab('analyse')}   num="01" label="Analyse"   sublabel="References" />
          <TabButton active={tab === 'aggregate'} onClick={() => setTab('aggregate')} num="02" label="Aggregate" sublabel="Build profile" />
          <TabButton active={tab === 'compose'}   onClick={() => setTab('compose')}   num="03" label="Compose"   sublabel="Generate prompt" />
        </nav>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-10">

        {/* ── ANALYSE ──────────────────────────── */}
        {tab === 'analyse' && (
          <div className="tab-content">
            <div className="mb-8">
              <h2 className="font-serif text-3xl mb-2">Drop reference images.</h2>
              <p className="text-stone-600 max-w-xl leading-relaxed">
                Each image is broken down into its art direction — palette, light, composition, setting, register — and stored as structured JSON. Aim for 20 to 40 images per brand.
              </p>
            </div>

            <div
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => { e.preventDefault(); handleFiles(e.dataTransfer.files); }}
              className="border border-dashed border-stone-300 hover:border-stone-900 hover:bg-white transition-all cursor-pointer p-12 text-center mb-8"
            >
              <Upload className="w-6 h-6 mx-auto mb-3 text-stone-400" strokeWidth={1.5} />
              <div className="font-serif text-lg mb-1">Tap or drop to upload</div>
              <div className="text-xs uppercase tracking-[0.15em] text-stone-500">Multiple images · jpg · png · webp</div>
              <input ref={fileInputRef} type="file" multiple accept="image/*" className="hidden" onChange={(e) => handleFiles(e.target.files)} />
            </div>

            {analyses.length > 0 && (
              <>
                <div className="flex items-center justify-between mb-4 pb-3 border-b border-stone-200">
                  <div className="flex gap-5 text-xs">
                    <span><span className="font-mono text-stone-900">{analyses.length}</span> <span className="uppercase tracking-[0.15em] text-stone-500">total</span></span>
                    <span><span className="font-mono text-emerald-700">{doneCount}</span> <span className="uppercase tracking-[0.15em] text-stone-500">done</span></span>
                    {runningCount > 0 && <span><span className="font-mono text-amber-700">{runningCount}</span> <span className="uppercase tracking-[0.15em] text-stone-500">running</span></span>}
                    {errorCount > 0 && <span><span className="font-mono text-red-700">{errorCount}</span> <span className="uppercase tracking-[0.15em] text-stone-500">failed</span></span>}
                  </div>
                  <div className="flex gap-2">
                    <button onClick={downloadCorpus} disabled={!doneCount} className="text-[10px] uppercase tracking-[0.15em] px-3 py-1.5 border border-stone-300 hover:bg-stone-900 hover:text-stone-50 hover:border-stone-900 transition disabled:opacity-30 disabled:cursor-not-allowed">
                      <Download className="w-3 h-3 inline mr-1.5" />Export corpus
                    </button>
                    <button onClick={clearAll} className="text-[10px] uppercase tracking-[0.15em] px-3 py-1.5 border border-stone-300 hover:bg-red-50 hover:border-red-300 transition">
                      <Trash2 className="w-3 h-3 inline mr-1.5" />Clear
                    </button>
                  </div>
                </div>

                <div className="grid gap-3">
                  {analyses.map(a => (
                    <div key={a.id} className="flex gap-4 border border-stone-200 bg-white">
                      <img src={a.preview} alt="" className="w-24 h-24 object-cover" />
                      <div className="flex-1 py-3 pr-4 min-w-0">
                        <div className="flex items-start justify-between gap-3 mb-2">
                          <div className="font-mono text-xs truncate">{a.name}</div>
                          <div className="flex items-center gap-2 shrink-0">
                            <StatusPill status={a.status} />
                            <button onClick={() => removeAnalysis(a.id)} className="text-stone-400 hover:text-red-600"><Trash2 className="w-3 h-3" /></button>
                          </div>
                        </div>
                        {a.status === 'running' && (
                          <div className="flex items-center gap-2 text-xs text-stone-500">
                            <Loader2 className="w-3 h-3 animate-spin" /> Reading the image…
                          </div>
                        )}
                        {a.status === 'error' && (
                          <div className="flex items-start gap-2 text-xs text-red-700">
                            <AlertCircle className="w-3 h-3 mt-0.5 shrink-0" />
                            <span className="break-all">{a.error}</span>
                          </div>
                        )}
                        {a.status === 'done' && a.json && (
                          <details className="text-xs">
                            <summary className="cursor-pointer text-stone-500 hover:text-stone-900 select-none">
                              {a.json.subject?.primary || 'View extracted JSON'}
                              <ChevronRight className="w-3 h-3 inline ml-1" />
                            </summary>
                            <pre className="mt-2 p-3 bg-stone-50 text-[10px] font-mono overflow-x-auto max-h-64">
                              {JSON.stringify(a.json, null, 2)}
                            </pre>
                          </details>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                {doneCount >= 3 && (
                  <div className="mt-8 pt-6 border-t border-stone-200 flex items-center justify-between">
                    <div className="text-xs text-stone-600">
                      <span className="font-mono">{doneCount}</span> analyses ready.{doneCount < 10 && ' More references will sharpen the profile.'}
                    </div>
                    <button onClick={() => setTab('aggregate')} className="text-xs uppercase tracking-[0.15em] px-4 py-2 bg-stone-900 text-stone-50 hover:bg-stone-700 transition">
                      Continue to aggregate <ChevronRight className="w-3 h-3 inline ml-1" />
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* ── AGGREGATE ────────────────────────── */}
        {tab === 'aggregate' && (
          <div className="tab-content">
            <div className="mb-8">
              <h2 className="font-serif text-3xl mb-2">Synthesise the brand.</h2>
              <p className="text-stone-600 max-w-xl leading-relaxed">
                Find what is consistent across the corpus, what varies inside an acceptable band, and what is conspicuously absent. Output a brand profile.
              </p>
            </div>

            <div className="border border-stone-200 bg-white p-6 mb-6">
              <div className="text-[10px] uppercase tracking-[0.2em] text-stone-500 mb-3">Corpus status</div>
              <div className="flex items-baseline gap-4 mb-4">
                <span className="font-serif text-5xl">{doneCount}</span>
                <span className="text-sm text-stone-600">analyses ready to aggregate</span>
              </div>
              {doneCount < 10 && doneCount >= 3 && (
                <div className="flex items-start gap-2 text-xs text-amber-800 bg-amber-50 p-3 mb-4">
                  <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                  <div>Confidence will be low. The profile is usable but adding more references (target 20+) will sharpen anchors and ranges.</div>
                </div>
              )}
              {doneCount < 3 && (
                <div className="flex items-start gap-2 text-xs text-red-800 bg-red-50 p-3 mb-4">
                  <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                  <div>Need at least 3 analyses. Go back to the Analyse tab and process more images.</div>
                </div>
              )}

              <label className="block mb-4">
                <span className="text-[10px] uppercase tracking-[0.2em] text-stone-500">Brand name</span>
                <input
                  type="text"
                  value={profileBrand}
                  onChange={(e) => setProfileBrand(e.target.value)}
                  placeholder="e.g. Audi"
                  className="w-full mt-1.5 border-b border-stone-300 bg-transparent py-2 font-serif text-lg focus:outline-none focus:border-stone-900"
                />
              </label>

              <button
                onClick={buildProfile}
                disabled={aggregating || doneCount < 3}
                className="w-full text-xs uppercase tracking-[0.15em] px-4 py-3 bg-stone-900 text-stone-50 hover:bg-stone-700 transition disabled:opacity-30 disabled:cursor-not-allowed"
              >
                {aggregating
                  ? <><Loader2 className="w-3 h-3 inline mr-2 animate-spin" />Synthesising…</>
                  : <><Layers className="w-3 h-3 inline mr-2" />Build brand profile</>}
              </button>
            </div>

            <div className="border-t border-stone-200 pt-6">
              <div className="text-[10px] uppercase tracking-[0.2em] text-stone-500 mb-3">Or load existing profile</div>
              <label className="cursor-pointer text-xs uppercase tracking-[0.15em] px-3 py-2 border border-stone-300 hover:bg-stone-100 inline-block">
                <Upload className="w-3 h-3 inline mr-1.5" />Import profile JSON
                <input type="file" accept=".json,application/json" onChange={importProfile} className="hidden" />
              </label>
            </div>

            {profile && (
              <div className="mt-8 border border-stone-900 bg-white p-6">
                <div className="flex items-baseline justify-between mb-4 pb-4 border-b border-stone-200">
                  <div>
                    <div className="text-[10px] uppercase tracking-[0.2em] text-stone-500">Brand profile</div>
                    <h3 className="font-serif text-2xl">{profile.brand_name || 'Unnamed'}</h3>
                  </div>
                  <div className="text-right">
                    <div className="text-[10px] uppercase tracking-[0.2em] text-stone-500">Confidence</div>
                    <div className="font-mono text-sm">{profile.confidence}</div>
                  </div>
                </div>
                {profile.signature_motifs?.length > 0 && (
                  <div className="mb-4">
                    <div className="text-[10px] uppercase tracking-[0.2em] text-stone-500 mb-2">Signature motifs</div>
                    <ul className="space-y-1">
                      {profile.signature_motifs.map((m, i) => (
                        <li key={i} className="font-serif italic text-stone-800 leading-snug">— {m}</li>
                      ))}
                    </ul>
                  </div>
                )}
                <div className="flex gap-2">
                  <button onClick={downloadProfile} className="text-[10px] uppercase tracking-[0.15em] px-3 py-1.5 border border-stone-300 hover:bg-stone-900 hover:text-stone-50 hover:border-stone-900 transition">
                    <Download className="w-3 h-3 inline mr-1.5" />Download profile
                  </button>
                  <button onClick={() => setTab('compose')} className="text-[10px] uppercase tracking-[0.15em] px-3 py-1.5 bg-stone-900 text-stone-50 hover:bg-stone-700 transition">
                    Compose prompt <ChevronRight className="w-3 h-3 inline ml-1" />
                  </button>
                </div>
                <details className="mt-4">
                  <summary className="cursor-pointer text-[10px] uppercase tracking-[0.2em] text-stone-500 hover:text-stone-900">View full JSON</summary>
                  <pre className="mt-3 p-4 bg-stone-50 text-[10px] font-mono overflow-x-auto max-h-96">
                    {JSON.stringify(profile, null, 2)}
                  </pre>
                </details>
              </div>
            )}
          </div>
        )}

        {/* ── COMPOSE ──────────────────────────── */}
        {tab === 'compose' && (
          <div className="tab-content">
            <div className="mb-8">
              <h2 className="font-serif text-3xl mb-2">Generate the prompt.</h2>
              <p className="text-stone-600 max-w-xl leading-relaxed">
                Write what you want in frame. The brand profile fills in the art direction. Output is a Midjourney v8.1 prompt.
              </p>
            </div>

            {!profile && (
              <div className="border border-stone-200 bg-stone-100 p-6 text-center mb-6">
                <FileText className="w-6 h-6 mx-auto mb-2 text-stone-400" strokeWidth={1.5} />
                <div className="text-sm text-stone-600 mb-3">No brand profile loaded.</div>
                <button onClick={() => setTab('aggregate')} className="text-xs uppercase tracking-[0.15em] px-4 py-2 border border-stone-900 hover:bg-stone-900 hover:text-stone-50 transition">
                  Build or import one
                </button>
              </div>
            )}

            {profile && (
              <>
                <div className="flex items-baseline justify-between mb-4 pb-3 border-b border-stone-200">
                  <div>
                    <div className="text-[10px] uppercase tracking-[0.2em] text-stone-500">Active profile</div>
                    <div className="font-serif text-lg">{profile.brand_name || 'Unnamed'}</div>
                  </div>
                  <button onClick={() => setTab('aggregate')} className="text-[10px] uppercase tracking-[0.15em] text-stone-500 hover:text-stone-900">
                    Change
                  </button>
                </div>

                <label className="block mb-6">
                  <span className="text-[10px] uppercase tracking-[0.2em] text-stone-500">Subject brief</span>
                  <textarea
                    value={brief}
                    onChange={(e) => setBrief(e.target.value)}
                    placeholder="e.g. Q6 e-tron in Ascari Blue parked outside a modern timber cabin in British woodland, golden hour"
                    rows={4}
                    className="w-full mt-1.5 border border-stone-300 bg-white p-3 font-serif text-base leading-relaxed focus:outline-none focus:border-stone-900 resize-none"
                  />
                </label>

                <button
                  onClick={composePrompt}
                  disabled={composing || !brief.trim()}
                  className="text-xs uppercase tracking-[0.15em] px-6 py-3 bg-stone-900 text-stone-50 hover:bg-stone-700 transition disabled:opacity-30 disabled:cursor-not-allowed mb-8"
                >
                  {composing
                    ? <><Loader2 className="w-3 h-3 inline mr-2 animate-spin" />Composing…</>
                    : <><Sparkles className="w-3 h-3 inline mr-2" />Compose prompt</>}
                </button>

                {composedPrompt && (
                  <div className="border-t border-stone-200 pt-6">
                    <div className="flex items-center justify-between mb-4">
                      <div className="text-[10px] uppercase tracking-[0.2em] text-stone-500">Output</div>
                      <button onClick={copyPrompt} className="text-[10px] uppercase tracking-[0.15em] px-3 py-1.5 border border-stone-300 hover:bg-stone-900 hover:text-stone-50 hover:border-stone-900 transition">
                        <Copy className="w-3 h-3 inline mr-1.5" />Copy prompt
                      </button>
                    </div>
                    <div className="font-serif text-base leading-relaxed text-stone-800 whitespace-pre-wrap bg-white border border-stone-200 p-6">
                      {composedPrompt}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}

      </main>

      <footer className="max-w-5xl mx-auto px-6 py-8 border-t border-stone-200 mt-16">
        <div className="text-[10px] uppercase tracking-[0.2em] text-stone-400">
          Brand Vision · A pipeline for art-direction-led prompt generation
        </div>
      </footer>
    </div>
  );
}
