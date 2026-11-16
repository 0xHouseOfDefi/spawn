"""Customization must survive admission and change the actual ASS timeline."""

import json
import math
import unittest

from spawn_clipper.policy import DEFAULT_CAPTION_STYLE, PolicyError, parse_render_request
from spawn_clipper.runner import _ass, _caption_font, _group_layout, _group_position
from test_captions import caption_rows, events, render_request, timed_words


class CaptionStyleTest(unittest.TestCase):
    def test_strict_bounded_style_and_case_insensitive_hex_colors(self):
        style = {**DEFAULT_CAPTION_STYLE, "highlight_color": "#ff00aa", "x_pct": 27.5}
        parsed = parse_render_request(json.dumps(render_request(caption_style=style)).encode())
        self.assertEqual(parsed["clips"][0]["caption_style"]["highlight_color"], "#FF00AA")
        for change in (
            {"font": "Arial,\\p1"}, {"animation": "unknown"}, {"enabled": 1},
            {"font_size": 39}, {"font_size": 113}, {"font_size": True},
            {"x_pct": 9}, {"y_pct": 91}, {"x_pct": math.nan},
            {"x_pct": 10 ** 400}, {"y_pct": -(10 ** 400)},
            {"y_pct": math.inf}, {"text_color": "red"}, {"highlight_color": "#FFF"},
            {"outline_color": "#000000\\p1"}, {"outline_width": 11},
            {"shadow": -1}, {"uppercase": "true"}, {"words_per_group": 5},
            {"animation_ms": 79}, {"animation_ms": 401}, {"unknown": "value"},
        ):
            with self.subTest(change=change), self.assertRaises(PolicyError):
                parse_render_request(json.dumps(render_request(caption_style={**style, **change})).encode())
        for invalid in (None, {}, {"enabled": True}):
            with self.subTest(invalid=invalid), self.assertRaises(PolicyError):
                parse_render_request(json.dumps(render_request(caption_style=invalid)).encode())

    def test_enabled_false_removes_all_captions(self):
        style = {**DEFAULT_CAPTION_STYLE, "enabled": False}
        self.assertEqual(events(_ass(caption_rows(), timed_words(), caption_style=style)), [])
        self.assertEqual(events(_ass(caption_rows(), caption_style=style)), [])

    def test_custom_font_size_color_case_position_and_grouping(self):
        style = {**DEFAULT_CAPTION_STYLE, "font": "mono", "font_size": 48,
                 "text_color": "#FF0000", "highlight_color": "#0088FF", "outline_color": "#123456",
                 "outline_width": 8, "shadow": 4, "x_pct": 30, "y_pct": 25,
                 "uppercase": False, "words_per_group": 1, "animation": "none"}
        document = _ass(caption_rows(), timed_words(), caption_style=style)
        self.assertIn("DejaVu Sans Mono,48,&H000000FF,&H00563412", document)
        self.assertIn(r"\pos(216,320)", document)
        self.assertIn(r"\fs48", document)
        self.assertIn(r"{\c&HFF8800&}Hello", document)
        self.assertNotIn("HELLO", document)
        self.assertNotIn(r"\t(", document)
        self.assertTrue(all(text.count(r"{\c&") == 1 for _, _, text in events(document)))

    def test_all_entrances_follow_group_clock_across_fast_word_boundaries(self):
        words = [{"from_ms": 0, "to_ms": 40, "text": "one"},
                 {"from_ms": 40, "to_ms": 300, "text": "two"}]
        captions = [{"from_ms": 0, "to_ms": 300, "text": "one two"}]
        for animation in ("pop", "fade", "rise"):
            with self.subTest(animation=animation):
                document = _ass(captions, words, caption_style={**DEFAULT_CAPTION_STYLE,
                    "animation": animation, "animation_ms": 200})
                first, second = [text for _, _, text in events(document)]
                if animation == "pop":
                    self.assertIn(r"\fscx92\fscy92\t(0,200,", first)
                    self.assertIn(r"\fscx93.6\fscy93.6\t(0,160,", second)
                elif animation == "fade":
                    self.assertIn(r"\1a&HFF&\3a&HFF&\4a&HFF&\t(0,200,", first)
                    self.assertIn(r"\1a&HCC&\3a&HCC&\4a&HE6&\t(0,160,", second)
                    self.assertIn(r"\4a&H80&)", first)
                else:
                    self.assertIn(r"\move(360,744,360,720,0,200)", first)
                    self.assertIn(r"\move(360,739.2,360,720,0,160)", second)

    def test_custom_style_applies_to_legacy_sentences_without_fake_word_timings(self):
        style = {**DEFAULT_CAPTION_STYLE, "font": "condensed", "y_pct": 30,
                 "animation": "fade", "uppercase": False}
        document = _ass(caption_rows(), caption_style=style)
        self.assertIn("DejaVu Sans Condensed", document)
        self.assertIn(",384)", document)
        self.assertEqual(len(events(document)), 1)
        self.assertNotIn(r"{\c&HA9FF4C&}", document)
        self.assertIn("Hello", document)

    def test_long_legacy_token_is_fitted_before_placing_the_block(self):
        style = {**DEFAULT_CAPTION_STYLE, "x_pct": 90, "y_pct": 90}
        group = [{"text": "W" * 240}]
        size, split = _group_layout(group, style)
        x, y = _group_position(group, style, size, split)
        width = _caption_font(size, style["font"]).getlength(group[0]["text"])
        self.assertLessEqual(width, 620)
        self.assertGreaterEqual(x - width / 2, 36)
        self.assertLessEqual(x + width / 2, 684)
        self.assertLess(y, 1184)


if __name__ == "__main__":
    unittest.main()
