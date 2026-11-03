import io
import os
import sys
import unittest
import wave

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import numpy as np  # noqa: E402

import server  # noqa: E402
from server import Segment, WavError, clean_text, parse_max_speech, read_wav, select_segments  # noqa: E402


def make_wav(rate=16000, channels=1, width=2, frames=1600):
    buf = io.BytesIO()
    with wave.open(buf, "wb") as wav:
        wav.setnchannels(channels)
        wav.setsampwidth(width)
        wav.setframerate(rate)
        wav.writeframes(b"\x00" * frames * channels * width)
    return buf.getvalue()


class FakeRecognizer:
    def __init__(self):
        self.batches = []

    def create_stream(self):
        class Stream:
            def accept_waveform(self, rate, samples):
                self.result = type("Result", (), {"text": str(len(samples)), "lang": "<|en|>"})()

        return Stream()

    def decode_streams(self, streams):
        self.batches.append(len(streams))


class DecodeTest(unittest.TestCase):
    def test_decodes_in_small_batches_keeping_order(self):
        recognizer = FakeRecognizer()
        clips = [np.zeros(n, dtype=np.float32) for n in range(1, 11)]

        results = server.decode(recognizer, clips)

        self.assertEqual(recognizer.batches, [4, 4, 2])
        self.assertEqual([text for text, _ in results], [str(n) for n in range(1, 11)])

    def test_no_clips_decodes_nothing(self):
        recognizer = FakeRecognizer()
        self.assertEqual(server.decode(recognizer, []), [])
        self.assertEqual(recognizer.batches, [])


class SelectSegmentsTest(unittest.TestCase):
    def test_under_budget_keeps_all(self):
        segments = [Segment(i * 5.0, i * 5.0 + 2.0) for i in range(4)]
        self.assertEqual(select_segments(segments, 100.0), segments)

    def test_empty_input(self):
        self.assertEqual(select_segments([], 10.0), [])

    def test_over_budget_keeps_even_subset_within_budget_in_time_order(self):
        segments = [Segment(i * 5.0, i * 5.0 + 5.0) for i in range(20)]  # 20 x 5 s = 100 s
        chosen = select_segments(segments, 30.0)

        self.assertLessEqual(sum(s.duration for s in chosen), 30.0)
        self.assertEqual(len(chosen), 6)
        starts = [s.start for s in chosen]
        self.assertEqual(starts, sorted(starts))
        self.assertEqual(starts[0], 0.0)
        self.assertGreaterEqual(starts[-1], 75.0)
        gaps = [b - a for a, b in zip(starts, starts[1:])]
        self.assertLessEqual(max(gaps), 2 * min(gaps) + 10.0)

    def test_single_segment_over_budget_is_still_kept(self):
        segment = Segment(0.0, 15.0)
        self.assertEqual(select_segments([segment], 10.0), [segment])


class ReadWavTest(unittest.TestCase):
    def test_accepts_16k_mono_16bit(self):
        samples = read_wav(make_wav(frames=1600))
        self.assertEqual(samples.dtype, np.float32)
        self.assertEqual(len(samples), 1600)

    def test_rejects_44100_hz(self):
        with self.assertRaises(WavError):
            read_wav(make_wav(rate=44100))

    def test_rejects_stereo(self):
        with self.assertRaises(WavError):
            read_wav(make_wav(channels=2))

    def test_rejects_8_bit(self):
        with self.assertRaises(WavError):
            read_wav(make_wav(width=1))

    def test_rejects_non_wav(self):
        with self.assertRaises(WavError):
            read_wav(b"not a wav file at all")


class CleanTextTest(unittest.TestCase):
    def test_strips_sensevoice_tags(self):
        raw = "<|en|><|NEUTRAL|><|Speech|><|woitn|> Hello  there <|zh|>world"
        self.assertEqual(clean_text(raw), "Hello there world")

    def test_tag_only_text_becomes_empty(self):
        self.assertEqual(clean_text("<|nospeech|><|EMO_UNKNOWN|>"), "")


class ParseMaxSpeechTest(unittest.TestCase):
    def test_default(self):
        self.assertEqual(parse_max_speech(""), server.DEFAULT_MAX_SPEECH_SEC)

    def test_clamps(self):
        self.assertEqual(parse_max_speech("maxSpeechSec=5"), 10.0)
        self.assertEqual(parse_max_speech("maxSpeechSec=9999"), 600.0)
        self.assertEqual(parse_max_speech("maxSpeechSec=45.5"), 45.5)

    def test_rejects_non_numeric(self):
        with self.assertRaises(ValueError):
            parse_max_speech("maxSpeechSec=abc")
        with self.assertRaises(ValueError):
            parse_max_speech("maxSpeechSec=nan")


if __name__ == "__main__":
    unittest.main()
