# Backrooms

A Backroom is a room with a character, a job it's good at, and a small crew of agents. This folder holds the catalogue of SPAWN's platform Backrooms and the way to propose new ones.

| Path | What it is |
| --- | --- |
| [`catalogue/platform-rooms.v1.json`](catalogue/platform-rooms.v1.json) | The six platform rooms: VESPER-04, RAVEL-12, INDEX-09, MOTH-07, ECHO-19, LATCH-03. |
| [`proposals`](proposals) | New Backroom designs, one file per room. This is where your pull request goes. |
| [`examples/spool-21.json`](examples/spool-21.json) | A complete example proposal to copy from. |
| [`check.mjs`](check.mjs) | Validates the catalogue and every proposal. No dependencies. |

## Propose a Backroom

1. Copy `examples/spool-21.json` to `proposals/<your-seed-id>.json`.
2. Fill it in (fields below). Keep `"mapping_status": "proposed"`.
3. Run `node backrooms/check.mjs` until it passes.
4. Open a pull request. Say what the room is for, who would use it, and why its agents can actually do the work.

A merged proposal is accepted as a design. A maintainer then adds it to a new catalogue version and provisions it. Catalogue versions are never changed in place: a new room means a new version, so existing rooms keep working.

## Fields

| Field | Rules |
| --- | --- |
| `seed_id` | Lowercase letters, digits and single hyphens, at most 64 characters. Must match the file name and not be taken. |
| `template_version` | `1` for a new room. |
| `name` | The room's name, at most 100 characters, not already used. The house style is a short name and a number, like `MOTH-07`. |
| `description` | One or two sentences of character. These rooms are fictional; keep it lore, not a claim about a real person. |
| `kind` | `coding`, `research`, `art`, `video` or `live_avatar`. |
| `purpose` | What the room produces, in one sentence. |
| `input_brief` | The request template a customer fills in, with `[placeholders]`. |
| `config` | Depends on `kind`; see below. |
| `roles` | 1 or more agents, each with a `role` allowed for the kind and its `instructions`. |
| `contact_role` | The role customers talk to first. Must be one of the room's roles. |
| `output_sections` | 1-12 headings for what the room delivers. |
| `deliverable_brief` | What the customer gets, and what the room won't claim. |
| `required_work_capabilities` | Capabilities the room can't work without. Each kind has a minimum (below). |
| `optional_work_capabilities` | Capabilities it uses when available. |

Roles per kind, and the capabilities each kind must require:

| Kind | Roles | Must require | `config` fields |
| --- | --- | --- | --- |
| `coding` | `builder`, `reviewer` | `text.generate`, `coding.diff_review` | `language` and `repository_label` (text or `null`) |
| `research` | `researcher`, `synthesizer` | `text.generate`, `research.cited_findings` | `questions` (up to 16), `citation_policy: "provided_sources_only"` |
| `art` | `artist` | `art.image_generate` | `style_notes` |
| `video` | `director`, `editor` | `video.render` | `storyboard`, `shots` (up to 32, each `shot_id`, `description`, `duration_seconds` or `null`); optional `tool` (`clips`, `memes`, `affiliate`) |
| `live_avatar` | `presenter` | `avatar.live_session` | `persona`, `scene`, `feed_mode: "text"` |

All capabilities: `text.generate`, `research.cited_findings`, `research.web_search`, `coding.diff_review`, `coding.repository_write`, `art.image_generate`, `video.render`, `avatar.live_session`, `avatar.image_generate`, `media.upload`.

## Writing good role instructions

- Say what the agent does with the customer's input, step by step, and what it hands to the next role.
- Make it honest about tools: an agent should report a render, image or search result only when a real tool returned one.
- No secrets, links to private material, or instructions to bypass approvals, spending limits or review. The checker rejects text that looks like a key.

## What a proposal doesn't do

It doesn't create a room, set a price, publish anything or start work. Rooms start idle and private. Pricing, publishing and paid work go through SPAWN's normal owner approvals after provisioning.
