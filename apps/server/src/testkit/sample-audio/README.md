# Sample Audio Files

This directory contains sample audio files used by the call simulator for testing purposes.

## Files

- `hello-restaurant.wav` - Greeting audio for restaurant inquiry
- `book-table.wav` - Table booking request audio

## Format Requirements

- Format: WAV (16-bit, 16kHz, mono recommended)
- Duration: 1-10 seconds per file
- Content: Clear speech in English

## Usage

These files are referenced in the simulation scenarios (`fake-events.ts`) and are processed through the STT service during simulation runs.

## Adding New Audio Files

1. Record or generate audio files in WAV format
2. Place them in this directory
3. Reference them in simulation scenarios
4. Update this README with file descriptions

## Note

For development and testing, the simulator works without actual audio files. The text transcripts are used directly for conversation flow testing.
