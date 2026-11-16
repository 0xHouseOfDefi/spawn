import json
import math
import unittest
from copy import deepcopy

from spawn_clipper.policy import OPENSHORTS_COMMIT, PolicyError, parse_render_request
from spawn_clipper.runner import _ass, _transcript


def timed_words():
    return [
        {"from_ms": 300, "to_ms": 700, "text": "Hello"},
        {"from_ms": 760, "to_ms": 1200, "text": "world"},
        {"from_ms": 1300, "to_ms": 1700, "text": "from"},
        {"from_ms": 2400, "to_ms": 2900, "text": "SPAWN"},
    ]


def caption_rows():
    return [{"from_ms": 300, "to_ms": 2900, "text": "Hello world from SPAWN"}]


def render_request(**clip_overrides):
    clip = {
        "in_ms": 10_000, "out_ms": 14_000, "aspect": "9:16",
        "put_url": "https://account.r2.cloudflarestorage.com/bucket/clip",
        "captions": caption_rows(), "caption_words": timed_words(),
    }
    clip.update(clip_overrides)
    return {
        "job_id": "render_caption_test",
        "source_get_url": "https://account.r2.cloudflarestorage.com/bucket/source",
        "source_sha256": "ab" * 32, "source_bytes": 2048,
        "duration_ms": 30_000, "openshorts_commit": OPENSHORTS_COMMIT,
        "clips": [clip],
    }


def seconds(value):
    hours, minutes, seconds_ = value.split(":")
    return int(hours) * 3600 + int(minutes) * 60 + float(seconds_)


def events(document):
    result = []
    for line in document.splitlines():
        if line.startswith("Dialogue: "):
            fields = line.split(",", 9)
            result.append((seconds(fields[1]), seconds(fields[2]), fields[9]))
    return result


class TranscriptWordsTest(unittest.TestCase):
    def test_preserves_absolute_word_timestamps_without_retranscribing(self):
        raw = {"language": "en", "segments": [{
            "start": 10, "end": 12, "text": " Hello world",
            "words": [
                {"word": " Hello", "start": 10.125, "end": 10.625},
                {"word": " world", "start": 10.7, "end": 11.4},
            ],
        }]}
        normalized = _transcript(raw, 30_000)
        self.assertEqual(normalized["segments"][0].get("words"), [
            {"text": "Hello", "start_ms": 10_125, "end_ms": 10_625},
            {"text": "world", "start_ms": 10_700, "end_ms": 11_400},
        ])

    def test_bad_word_timing_does_not_create_partial_karaoke(self):
        base = {"segments": [{"start": 0, "end": 2, "text": "Hello world", "words": [
            {"word": "Hello", "start": 0, "end": .5},
            {"word": "world", "start": .6, "end": 1.2},
        ]}]}
        for changes in ({"start": math.nan}, {"end": math.inf}, {"end": .4},
                        {"start": .4}, {"word": "x" * 65}, {"start": -1}, {"end": 3}):
            raw = deepcopy(base)
            raw["segments"][0]["words"][1].update(changes)
            with self.subTest(changes=changes):
                normalized = _transcript(raw, 2000)
                self.assertEqual(normalized["segments"][0]["text"], "Hello world")
                self.assertNotIn("words", normalized["segments"][0])

    def test_non_finite_segment_is_omitted(self):
        for bad in (math.nan, math.inf, -math.inf):
            with self.subTest(bad=bad):
                self.assertEqual(_transcript({"segments": [{"start": bad, "end": 2, "text": "bad"}]}, 2000)["segments"], [])


class RenderAdmissionTest(unittest.TestCase):
    def test_valid_word_times_and_legacy_requests_remain_accepted(self):
        self.assertEqual(parse_render_request(json.dumps(render_request()).encode())["clips"][0]["caption_words"], timed_words())
        legacy = render_request()
        del legacy["clips"][0]["caption_words"]
        self.assertIn("captions", parse_render_request(json.dumps(legacy).encode())["clips"][0])

    def test_rejects_invalid_or_unbounded_word_metadata(self):
        for words in (
            [{"from_ms": -1, "to_ms": 100, "text": "bad"}],
            [{"from_ms": 100, "to_ms": 100, "text": "bad"}],
            [{"from_ms": True, "to_ms": 100, "text": "bad"}],
            [{"from_ms": 0, "to_ms": 4001, "text": "bad"}],
            [{"from_ms": 0, "to_ms": 100, "text": "x" * 65}],
            [{"from_ms": 0, "to_ms": 100, "text": "   "}],
            [{"from_ms": 100, "to_ms": 200, "text": "one"}, {"from_ms": 150, "to_ms": 250, "text": "two"}],
            [{"from_ms": i, "to_ms": i + 1, "text": "a"} for i in range(257)],
        ):
            with self.subTest(words=words[:2]):
                with self.assertRaises(PolicyError):
                    parse_render_request(json.dumps(render_request(caption_words=words)).encode())

    def test_word_rich_render_has_a_separate_bounded_body_budget(self):
        payload = render_request()
        payload["clips"] *= 4
        payload["clips"][0]["caption_words"] = [
            {"from_ms": i * 10, "to_ms": i * 10 + 10, "text": "caption" * 8}
            for i in range(256)
        ]
        encoded = json.dumps(payload, ensure_ascii=False).encode()
        self.assertGreater(len(encoded), 65_536)
        self.assertEqual(len(parse_render_request(encoded)["clips"]), 4)
        with self.assertRaises(PolicyError):
            parse_render_request(encoded + b" " * 262_144)


class KaraokeAssTest(unittest.TestCase):
    def test_only_spoken_word_is_green_and_silence_is_not_highlighted(self):
        document = _ass(caption_rows(), timed_words(), duration_ms=4000)
        dialogue = events(document)
        green = r"{\c&HA9FF4C&}"
        at = lambda t: [text for start, end, text in dialogue if start <= t < end]
        self.assertEqual(at(.2), [])
        self.assertIn(green + "HELLO", "".join(at(.5)))
        self.assertIn(green + "WORLD", "".join(at(.9)))
        self.assertNotIn(green, "".join(at(.72)))
        self.assertEqual(at(2), [])
        self.assertIn(green + "SPAWN", "".join(at(2.5)))
        self.assertEqual(at(3.2), [])
        self.assertTrue(all(0 <= start < end <= 4 for start, end, _ in dialogue))

    def test_uses_bold_outlined_middle_placement_and_group_entrance(self):
        document = _ass(caption_rows(), timed_words(), duration_ms=4000)
        self.assertIn("DejaVu Sans", document)
        self.assertIn(r"\pos(360,720)", document)
        self.assertIn(r"\t(", document)
        self.assertNotIn("HELLO WORLD FROM SPAWN", document)

    def test_edited_text_keeps_caption_and_drops_stale_highlights(self):
        edited = [{"from_ms": 0, "to_ms": 2000, "text": "The approved correction"}]
        document = _ass(edited, timed_words(), duration_ms=4000)
        self.assertIn("The approved correction", document)
        self.assertNotIn(r"{\c&HA9FF4C&}", document)

    def test_joining_words_is_a_text_edit_that_invalidates_timing(self):
        words = [{"from_ms": 0, "to_ms": 400, "text": "now"}, {"from_ms": 400, "to_ms": 800, "text": "here"}]
        document = _ass([{"from_ms": 0, "to_ms": 800, "text": "nowhere"}], words)
        self.assertIn("nowhere", document)
        self.assertNotIn(r"{\c&HA9FF4C&}", document)

    def test_literal_text_cannot_inject_ass_commands(self):
        text = r"{\p1}unsafe\N\htext"
        document = _ass([{"from_ms": 0, "to_ms": 1000, "text": text}])
        for command in (r"\p1", r"\N", r"\h"):
            self.assertNotIn(command, document)

    def test_empty_captions_stay_empty(self):
        self.assertEqual(events(_ass([])), [])


if __name__ == "__main__":
    unittest.main()
