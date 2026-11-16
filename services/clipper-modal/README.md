# SPAWN clipper on Modal

Shared GPU worker for Creator clip **suggestions**, plus a CPU **link import** function. SPAWN admits each job, meters the workspace, and stores the bytes. The GPU process only reads a short-lived signed object URL and writes a suggestion (and, only if the request says so, rendered clips) to signed upload URLs. The import function fetches one owner-supplied public link and writes one MP4 to a signed upload URL.

It is not deployed from this repository. Do not create a Modal account, token, or secret from CI.

## What it runs

OpenShorts MIT core, pinned in `OPENSHORTS_PIN`:

`0af2185c91ef4c95a030034b85df70d9563ba639`

The image clones that commit and deletes `cloud/` and `requirements-billing.txt` in the same layer. The OpenShorts commercial billing tree is not part of the service. `OPENSHORTS-MIT-LICENSE.txt` is the MIT notice that must stay with the image.

Turned off in this app:

- URL ingest on the GPU path. Clip and render jobs still refuse platform hosts (`assert_direct_source_url`) and the runner still blocks OpenShorts' own `yt-dlp` download. Link ingest exists only in the separate import function below.
- Social auto-publish (no Upload-Post key; the runner refuses `UPLOAD_POST_API_KEY`)
- Dubbing and AI actors (`ELEVENLABS_API_KEY`, `FAL_KEY` are refused)
- Billing (`BILLING_ENABLED` must be `0`)
- Automatic render, unless the JSON body sets `render_clips` to true. SPAWN sends false.

Each GPU input uses a private scratch directory that is deleted before the input returns. `retries=0`. `max_containers` is 1, so one source is on the GPU at a time and further jobs stay queued in Modal. The function timeout is 20 minutes.

## Link import (owner decision, 11 November 2026)

The owner asked for "paste a video URL" ingest for clipping pipelines. It reverses the earlier "no yt-dlp" rule for one separate function only:

- `process_import` runs on a CPU image (`import_image`): Debian slim, ffmpeg, `yt-dlp[default,curl-cffi]==2026.10.26`, `curl_cffi==0.17.0` (the version yt-dlp pins, for TLS impersonation: Vimeo refuses plain Python TLS), and `deno==2.7.14` (the JavaScript runtime yt-dlp needs for YouTube). No GPU, no OpenShorts tree, no Modal secret attached. `retries=0`, `max_containers=2`, timeout 40 minutes.
- Accepted links (`classify_import_url` in `policy.py`): YouTube, Twitch VOD and clip, X/Twitter, Vimeo, TikTok, through yt-dlp restricted to those named extractors (no generic extractor), or any other public `https` host as a direct file download.
- SSRF limits: `https` only, port 443, no credentials, no IP literals (including integer and hex forms), no `localhost`, `.local`, `.internal` and similar names. Every DNS answer must be a global address. Direct downloads follow at most five redirects, re-check each hop, and connect to the address that was checked. yt-dlp's chosen media hosts are resolved and checked before the download starts. yt-dlp follows its own redirects inside a platform; that residual is accepted because the container holds no credentials and has no private network.
- Limits: one video (no playlists, no live streams), at most 30 minutes, at most 1 GiB downloaded into private scratch, and an output MP4 of at most `max_bytes` (SPAWN sends 128 MiB). H.264/AAC sources that fit are remuxed; anything else is re-encoded to a bitrate that fits. If 30 minutes cannot fit at 120 kbps video plus 64 kbps audio, the job fails with `IMPORT_TOO_LARGE`.
- No cookies, accounts, or proxies. When a platform asks for a sign-in, age or bot check (YouTube does this for some datacenter addresses), the job fails with `IMPORT_PLATFORM_REFUSED`.
- The result is reported as `sha256`, `bytes`, `duration_ms` (ffprobe) and `mime_type`. SPAWN copies the staged object into its own private key, checks the digest and container header, and only then marks the source ready.

The deploy also creates a Modal Dict named `spawn-source-imports`.

## Deploy

From this directory, after an owner has created a Modal workspace and run `modal setup` on their own machine:

```bash
pip install modal
modal secret create spawn-clipper \
  SPAWN_CLIP_MODAL_SECRET='replace-with-a-long-random-string'
modal deploy spawn_clipper/app.py
```

`modal deploy` prints the web URL. Give that URL to SPAWN as `CREATOR_CLIP_MODAL_URL` (origin only, `https`, no path, no query). Put the same random string in the Worker as `CREATOR_CLIP_MODAL_SECRET`.

Optional keys on the same Modal secret, left unset until an owner decides:

- `LLM_BASE_URL`, `LLM_MODEL`, `LLM_API_KEY` — OpenShorts moment picker via an OpenAI-compatible server
- `GEMINI_API_KEY` — OpenShorts moment picker via Gemini. Transcript text, and frames for silent video or layout, leave this container.

Do not add `UPLOAD_POST_API_KEY`, `FAL_KEY`, `ELEVENLABS_API_KEY`, or `BILLING_ENABLED=1`. Jobs refuse to start if those are present.

The deploy also creates a Modal Dict named `spawn-clip-jobs` and a Volume named `spawn-clipper-models` (Whisper and detection weights). Those are created by `modal deploy`, not by this repo.

To raise the GPU concurrency cap, change `MAX_CONTAINERS` in `spawn_clipper/app.py` and deploy again. Keep it inside the number of GPUs you are willing to pay for. SPAWN separately allows one active job per workspace.

## HTTP

SPAWN signs every request:

```text
hex(hmac_sha256(secret, f"{timestamp}.{METHOD}.{path}.{raw_body}"))
```

Headers: `x-spawn-timestamp` (unix seconds) and `x-spawn-signature`. Skew is five minutes. A repeated `job_id` returns the existing row and does not start a second GPU input.

- `POST /v1/jobs` — body below, response `202`
- `GET /v1/jobs/{job_id}` — `queued`, `running`, `succeeded`, `failed`, or `not_found`
- `POST /v1/jobs/{job_id}/cancel` — marks the row failed. It does not enqueue another input.
- `POST /v1/imports` — `{job_id: "srcimport_…", source_url, put_url, max_bytes, max_duration_ms}`, response `202`. A repeated `job_id` never fetches the link again.
- `GET /v1/imports/{job_id}` — `queued`, `running`, `succeeded` (with `sha256`, `bytes`, `duration_ms`, `mime_type`), `failed` (with an `IMPORT_*` code), or `not_found`
- `POST /v1/imports/{job_id}/cancel` — marks the row failed and cancels the Modal call

```json
{
  "job_id": "clipjob_example",
  "source_get_url": "https://account.r2.cloudflarestorage.com/bucket/key?...",
  "suggestion_put_url": "https://account.r2.cloudflarestorage.com/bucket/suggestion?...",
  "render_clips": false,
  "clip_put_urls": [],
  "max_clips": 3,
  "aspect": "9:16",
  "source_sha256": "<64 hex chars>",
  "source_bytes": 1000,
  "duration_ms": 30000,
  "openshorts_commit": "<OPENSHORTS_PIN>"
}
```

The suggestion object is `spawn-clip-suggestion-v1`: time ranges, a normalized crop, optional face-track samples, captions, and a transcript. SPAWN may replace the ranges after asking OpenRouter. Applying the suggestion is a separate render job.

Source limits match SPAWN: 128 MiB and 30 minutes. Clips are at most 60 seconds.

## Word-timed captions

The pinned OpenShorts transcription already enables Whisper word timestamps.
The runner retains optional `words: [{start_ms, end_ms, text}]` on transcript
segments. These times are absolute within the source. SPAWN maps complete,
matching words into optional `caption_words: [{from_ms, to_ms, text}]` on each
proposal clip, relative to its selected start. The metadata remains outside
the editable Creator definition and the OpenRouter moment-selection prompt.

By default, the chosen-render path uses those exact intervals to display up to three
words in DejaVu Sans Bold, white with a black outline at `(360, 720)` in the
720×1280 output. Only the currently spoken word is green (`#4cffa9`). Groups
enter over 80 ms, break across pauses longer than 350 ms, and use at most two
lines. Font metrics keep the text within the frame. A final word or an
isolated phrase can form a one-word group.

Words are never timed by dividing a sentence into equal durations. Missing,
incomplete or text-mismatched word metadata keeps sentence timing without
active-word highlighting. Stored suggestions from before this change need a new
transcription job to acquire timings; existing MP4s are unchanged. Malformed
render word intervals are rejected before dispatch.

Each segment and clip has at most 256 timed words, each at most 64 characters.
The signed `/v1/renders` body has a separate 256 KiB limit to accommodate the
metadata, checked in both SPAWN and Modal. Source/import requests retain
their 64 KiB limit, and the Creator definition retains its existing byte cap.

### Caption controls in clip review

The owner reviews the suggested moments, chooses a caption preset, previews
the result, and renders the clips in the existing Creator workflow. Viral,
Clean and Minimal are starting points. Position, Style and Motion expose the
individual settings without another dialog. One look applies to every clip
in this render. Selecting a different preview clip does not change the set
of clips to be rendered.

The preview uses the proposal's real word timestamps. When the verified
source file is already loaded, it plays the selected source range with the
same crop. Otherwise it clearly identifies a text-only preview. Previewing
does not fetch a new recording, upload bytes, transcribe, or dispatch a render.
Three bundled DejaVu web fonts match the renderer's font families. Reduced
motion suppresses preview movement while retaining the explicitly chosen
export animation.

`caption_style` is an optional, complete snapshot on the apply request and
saved proposal; it is forwarded to each signed render clip. Supplied objects
must contain every field below and no extra keys. Omitted input on a new
apply uses `DEFAULT_CREATOR_CAPTION_STYLE`.

| Setting | Accepted values | Default |
| --- | --- | --- |
| `enabled` | Boolean | `true` |
| `font` | `sans`, `condensed`, `mono` (all bold) | `sans` |
| `font_size` | Integer 40–112 at the 720×1280 reference size | 80 |
| `text_color`, `highlight_color`, `outline_color` | Six-digit `#RRGGBB`, normalized uppercase | `#FFFFFF`, `#4CFFA9`, `#000000` |
| `outline_width`, `shadow` | Integers 0–10 and 0–6 | 5 and 2 |
| `x_pct`, `y_pct` | Finite percentages 10–90 | 50 and 56.25 |
| `words_per_group` | Integer 1–4 | 3 |
| `uppercase` | Boolean | `true` |
| `animation` | `none`, `pop`, `fade`, `rise` | `pop` |
| `animation_ms` | Integer 80–400 | 80 |

Font metrics fit groups into at most two lines, then clamp the full text
block inside the frame's safe margins. Each group's entrance continues
across word boundaries instead of restarting on every highlight. Legacy
sentence-only captions receive an explicitly chosen/default style on new
applies, without invented word timings. Direct historical render requests
that omit a style retain their original sentence appearance.

The host saves the full style before attempting dispatch. Recovery and
definite-rejection retries reuse that snapshot and render job ID. Changing
the style of an attempted render returns
`CREATOR_CLIP_SUGGESTION_CAPTION_STYLE_LOCKED`; start a new suggestion for a
different version. A late concurrent suggestion completion cannot replace
the reviewed proposal or its saved style.

### Qualification and release

Run the complete clipper tests with FFmpeg/libass, Pillow, and all three
DejaVu faces installed. The Modal image pins both `fonts-dejavu-core` and
`fonts-dejavu-extra` to `2.37-2build1` and checks the font files at build time:

```bash
PYTHONPATH=services/clipper-modal python3 -m unittest discover -s services/clipper-modal/tests -v
```

`test_caption_render.py` uses real FFmpeg/libass and decoded pixels to check
the nonzero source cut, word changes, silent intervals, dimensions and audio,
plus custom colors, all fonts, positions, captions off, and visible motion.
The optional synthetic speech preview uses FFmpeg's libflite:

```bash
PYTHONPATH=services/clipper-modal python3 services/clipper-modal/scripts/preview_captions.py /tmp/spawn-caption-preview

# Also render Viral, Clean, Minimal and a custom Rise style, with a comparison MP4.
PYTHONPATH=services/clipper-modal python3 services/clipper-modal/scripts/preview_captions.py /tmp/spawn-caption-preview --variants
```

That preview supplies known word timings and is not an interview or Whisper
qualification. Re-test the original interview through the actual application
after deployment, checking speech alignment and readability over its frames.

Land the change through GitHub `main`, then release the updated frontend and
Worker using the existing pinned Cloudflare release path before redeploying
`spawn-clipper`. The earlier strict Worker schema rejects the new transcript
fields. Use the existing Modal workspace and secret; no credential changes
are needed. For a rendering rollback, revert the renderer while retaining the
optional schema support: newly saved proposals can already contain word
metadata and caption styles and are not readable by the old strict parser.
Treat the Worker/frontend and Modal changes as one coordinated release;
custom controls must not be qualified against an older renderer that ignores
their settings.

## Access

There is no clipper allowlist. When `CREATOR_CLIP_SUGGESTIONS_ENABLED` is `true`, admitting, dispatching, and applying a suggestion use `requireBetaAccess` with the build action: a granted builder application (`BETA_APPLICATIONS_ENABLED` and the auth grant from the builder whitelist) or the existing action token balance. Reconcile of a job that was already sent is not a new admission. The feature flag remains the kill switch. Per-workspace quotas stay at one active job and 30 source minutes per day.

## Moment picking and rendering

SPAWN calls OpenRouter itself after the GPU worker returns a transcript. The default model is `google/gemini-3.1-flash-lite`, overridable with `CREATOR_CLIP_MOMENT_MODEL`. The gateway token is the existing `CLOUDFLARE_AI_TOKEN`. The URL comes from the Creator speech-analysis gateway when that configuration is present, otherwise from `AI_GATEWAY_ACCOUNT_ID`, `AI_GATEWAY_CUSTOM_PROVIDER_SLUG`, and `CREATOR_CLIP_MOMENT_GATEWAY_ID`. The token is not placed on the Modal job. If OpenRouter fails, the suggestion keeps transcript-window ranges and says so.

Applying a suggestion asks Modal to render private 9:16 MP4s with the captions burned in. Those files have to fit the existing clip caps (60 seconds, 64 MiB) and the 1 GiB workspace media quota. Nothing is posted to a social network.

## Worker secret and variable names

Modal secret `spawn-clipper`:

- `SPAWN_CLIP_MODAL_SECRET` (required)

Do not put `GEMINI_API_KEY`, `UPLOAD_POST_API_KEY`, `FAL_KEY`, `ELEVENLABS_API_KEY`, or `BILLING_ENABLED=1` on this secret. The runner refuses publish, dubbing, and billing keys.

SPAWN Worker:

- `CREATOR_CLIP_SUGGESTIONS_ENABLED` (must be the string `true`)
- `CREATOR_CLIP_MODAL_URL`
- `CREATOR_CLIP_MODAL_SECRET`
- `CREATOR_CLIP_R2_ACCOUNT_ID`
- `CREATOR_CLIP_R2_ACCESS_KEY_ID`
- `CREATOR_CLIP_R2_SECRET_ACCESS_KEY`
- `CREATOR_CLIP_R2_BUCKET`
- `CREATOR_CLIP_SUGGESTION_PRICING_JSON`
- `CREATOR_CLIP_MOMENT_MODEL` (optional; default `google/gemini-3.1-flash-lite`)
- `CREATOR_CLIP_MOMENT_GATEWAY_ID` (optional when Creator speech analysis is not already configured)
- `CREATOR_SOURCE_URL_IMPORT_ENABLED` (must be the string `true` for link import; also needs clip suggestions open and `CREATOR_DURABLE_SOURCES_ENABLED=true`)

OpenRouter uses the existing `CLOUDFLARE_AI_TOKEN`. When speech-analysis configuration is absent, the gateway URL also uses `AI_GATEWAY_ACCOUNT_ID` and `AI_GATEWAY_CUSTOM_PROVIDER_SLUG`. Access uses the existing `BETA_ACCESS_MODE` and `BETA_APPLICATIONS_ENABLED` grant, not a clipper allowlist.

`CREATOR_CLIP_R2_BUCKET` must be the private generation bucket the Worker binding already uses. Values are not in this repo.

## GPU and model cost estimate

This is an estimate, not a quote and not a measured run of this image.

- Modal list price for an Nvidia T4, checked 10 November 2026 at [modal.com/pricing](https://modal.com/pricing): **$0.000164 per second**.
- OpenShorts README, same day: about **50 seconds on their NVIDIA GPU for an 8-minute video** for the whole pipeline. This service splits that into a transcript job and a later render job. If each matched that 50 second figure, GPU time would be about 12.5 seconds per source minute, or **$0.0021 per source minute**. Rendering only the chosen clips would cost less. Neither split was measured here. Scaledown is 10 seconds, and a cold start that fills the model volume is extra.
- OpenRouter's model list, checked 10 November 2026 at `https://openrouter.ai/api/v1/models`: `google/gemini-3.1-flash-lite` is **$0.00000025 per prompt token** and **$0.0000015 per completion token**. A 10-minute transcript is roughly 2,800 input tokens and 400 output tokens, about **$0.0013 per job**, or **$0.00013 per source minute**. OpenShorts' README still says direct Gemini moment picking is under $0.01 per 10-minute video.

Do not charge these figures. The funded operation is unpriced and disabled.

## Local check

Policy tests do not need a GPU, Modal, or OpenShorts (the two importer helper tests run when `httpx` is installed):

```bash
PYTHONPATH=services/clipper-modal python3 -m unittest discover -s services/clipper-modal/tests -v
python3 -m py_compile services/clipper-modal/spawn_clipper/*.py
```

Running the pinned OpenShorts generator on a fixture needs the GPU image (torch, Whisper, YOLO, MediaPipe). That was not executed in CI.
