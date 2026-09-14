/**
 * Test fixtures.
 * Author: gurvinny
 */
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * Write a short 16-bit PCM WAV to a temp path and return it.
 *
 * The orb is mounted lazily -- AnomalySphere is only imported once a track has
 * decoded and an analyser node exists -- so a real audio file is the only way
 * to reach it. A plain sine is enough: nothing here asserts on the detected
 * key or tempo, only that decoding completes and the renderer starts.
 */
export function makeWavFile(seconds = 2, freq = 440, rate = 44100): string {
  const samples = Math.floor(seconds * rate);
  const buf = Buffer.alloc(44 + samples * 2);

  buf.write("RIFF", 0);
  buf.writeUInt32LE(36 + samples * 2, 4);
  buf.write("WAVE", 8);
  buf.write("fmt ", 12);
  buf.writeUInt32LE(16, 16);           // PCM header size
  buf.writeUInt16LE(1, 20);            // format: PCM
  buf.writeUInt16LE(1, 22);            // channels: mono
  buf.writeUInt32LE(rate, 24);
  buf.writeUInt32LE(rate * 2, 28);     // byte rate
  buf.writeUInt16LE(2, 32);            // block align
  buf.writeUInt16LE(16, 34);           // bits per sample
  buf.write("data", 36);
  buf.writeUInt32LE(samples * 2, 40);

  for (let i = 0; i < samples; i++) {
    // Amplitude-modulated so the analyser sees movement rather than a flat tone.
    const env = 0.4 + 0.6 * Math.abs(Math.sin((2 * Math.PI * 2 * i) / rate));
    const v = Math.sin((2 * Math.PI * freq * i) / rate) * env * 0x7000;
    buf.writeInt16LE(Math.round(v), 44 + i * 2);
  }

  const path = join(mkdtempSync(join(tmpdir(), "slofi-qa-")), "tone.wav");
  writeFileSync(path, buf);
  return path;
}
