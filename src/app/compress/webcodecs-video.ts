// Hardware-accelerated video re-encode using WebCodecs.
// Demuxes the source MP4 with mp4box.js, decodes+re-encodes the video track
// through VideoDecoder/VideoEncoder (hardware accelerated where available),
// passes the audio track through untouched, and remuxes with mp4-muxer.
//
// Only handles MP4/H.264 input — anything else should fall back to the
// FFmpeg.wasm pipeline. Any failure here should be caught by the caller and
// treated the same way.

/* eslint-disable @typescript-eslint/no-explicit-any */

export function supportsWebCodecsFastPath(file: File): boolean {
  if (typeof window === "undefined") return false;
  if (typeof VideoEncoder === "undefined" || typeof VideoDecoder === "undefined") return false;
  const ext = file.name.split(".").pop()?.toLowerCase();
  return ext === "mp4" || ext === "m4v";
}

interface DemuxedTrack {
  id: number;
  codec: string;
  timescale: number;
  video?: { width: number; height: number };
  audio?: { sample_rate: number; channel_count: number };
}

interface Sample {
  data: Uint8Array;
  cts: number;
  duration: number;
  is_sync: boolean;
}

async function demux(file: File) {
  const MP4Box = await import("mp4box");
  const mp4box = MP4Box.createFile();

  let videoTrack: DemuxedTrack | undefined;
  let audioTrack: DemuxedTrack | undefined;
  const videoSamples: Sample[] = [];
  const audioSamples: Sample[] = [];

  await new Promise<void>((resolve, reject) => {
    mp4box.onError = (e: string) => reject(new Error(e));

    mp4box.onSamples = (id: number, _user: unknown, samples: any[]) => {
      const target = videoTrack && id === videoTrack.id ? videoSamples : audioTrack && id === audioTrack.id ? audioSamples : null;
      if (!target) return;
      for (const s of samples) {
        target.push({ data: s.data, cts: s.cts, duration: s.duration, is_sync: s.is_sync });
      }
    };

    // Must configure extraction + call start() synchronously inside onReady,
    // before the data already buffered by appendBuffer/flush gets discarded.
    mp4box.onReady = (info: any) => {
      const vt = info.tracks.find((t: any) => t.video);
      const at = info.tracks.find((t: any) => t.audio);

      if (!vt) { reject(new Error("No video track found in source file.")); return; }

      videoTrack = {
        id: vt.id,
        codec: vt.codec,
        timescale: vt.timescale,
        video: { width: vt.video.width, height: vt.video.height },
      };
      if (at) {
        audioTrack = {
          id: at.id,
          codec: at.codec,
          timescale: at.timescale,
          audio: { sample_rate: at.audio.sample_rate, channel_count: at.audio.channel_count },
        };
      }

      mp4box.setExtractionOptions(vt.id, null, { nbSamples: 100000 });
      if (at) mp4box.setExtractionOptions(at.id, null, { nbSamples: 100000 });
      mp4box.start();
      resolve();
    };

    file.arrayBuffer().then((ab) => {
      (ab as any).fileStart = 0;
      mp4box.appendBuffer(ab as any);
      mp4box.flush();
    }, reject);
  });

  if (!videoTrack || videoSamples.length === 0) throw new Error("Failed to extract video samples.");

  return { mp4box, videoTrack, audioTrack, videoSamples, audioSamples };
}

function bitrateFor(quality: number, width: number, height: number, fps: number): number {
  const bppFactor = 0.035 + quality * 0.065; // ~0.035 (low) .. 0.1 (near-lossless)
  return Math.round(width * height * bppFactor * fps);
}

// Not every device/browser supports the same H.264 profile+level in its
// encoder (especially in software, when no hardware encoder is available —
// many software encoders only do Baseline/Main, not High). Try a few
// reasonable candidates instead of assuming one, and use whichever the
// browser actually reports as supported.
async function pickEncoderConfig(
  width: number,
  height: number,
  bitrate: number,
  framerate: number
): Promise<VideoEncoderConfig | null> {
  // avc1.PPCCLL — PP = profile_idc, LL = level_idc (level * 10), in hex.
  // Try High and Main at generous levels first (better compression), then
  // fall back to Baseline (broadest possible support).
  const codecs = ["avc1.640033", "avc1.4d0033", "avc1.42001f"];
  const accelerations: VideoEncoderConfig["hardwareAcceleration"][] = ["prefer-hardware", "no-preference"];

  for (const hardwareAcceleration of accelerations) {
    for (const codec of codecs) {
      const config: VideoEncoderConfig = {
        codec,
        width,
        height,
        bitrate,
        framerate,
        hardwareAcceleration,
        latencyMode: "quality",
      };
      try {
        const support = await VideoEncoder.isConfigSupported(config);
        if (support.supported) return support.config ?? config;
      } catch {
        // try next candidate
      }
    }
  }
  return null;
}

export async function compressVideoWebCodecs(
  file: File,
  quality: number,
  onProgress: (pct: number) => void
): Promise<Blob> {
  const { Muxer, ArrayBufferTarget } = await import("mp4-muxer");
  const MP4Box = await import("mp4box");

  const { mp4box, videoTrack, audioTrack, videoSamples, audioSamples } = await demux(file);

  if (!/^(avc1|avc3)/.test(videoTrack.codec)) {
    throw new Error("Fast path only supports H.264 input.");
  }

  const width = videoTrack.video!.width;
  const height = videoTrack.video!.height;
  const fps = Math.min(60, Math.max(15, Math.round(videoSamples.length / Math.max(1, (videoSamples.at(-1)?.cts ?? 1) / videoTrack.timescale))));

  // Extract avcC description bytes for the decoder config
  let description: Uint8Array | undefined;
  {
    const trak: any = mp4box.getTrackById(videoTrack.id);
    const entries: any[] = trak?.mdia?.minf?.stbl?.stsd?.entries ?? [];
    for (const entry of entries) {
      const box = entry.avcC;
      if (box) {
        const stream = new MP4Box.DataStream();
        box.write(stream);
        description = new Uint8Array(stream.buffer, 8);
        break;
      }
    }
  }
  if (!description) throw new Error("Could not extract H.264 decoder configuration.");

  const decoderConfig: VideoDecoderConfig = {
    codec: videoTrack.codec,
    codedWidth: width,
    codedHeight: height,
    description,
  };

  const decoderSupport = await VideoDecoder.isConfigSupported(decoderConfig);
  if (!decoderSupport.supported) throw new Error("VideoDecoder does not support this stream.");

  const encoderConfig = await pickEncoderConfig(width, height, bitrateFor(quality, width, height, fps), fps);
  if (!encoderConfig) throw new Error("VideoEncoder does not support the target configuration.");

  const muxer = new Muxer({
    target: new ArrayBufferTarget(),
    video: { codec: "avc", width, height, frameRate: fps },
    audio: audioTrack
      ? { codec: "aac", numberOfChannels: audioTrack.audio!.channel_count, sampleRate: audioTrack.audio!.sample_rate }
      : undefined,
    fastStart: "in-memory",
    // Source timestamps aren't guaranteed to start at 0 (e.g. due to an edit
    // list or encoder delay) — offset both tracks by the earliest of the two
    // so playback stays in sync instead of erroring on a non-zero first chunk.
    firstTimestampBehavior: audioTrack ? "cross-track-offset" : "offset",
  });

  let encoderError: Error | null = null;
  const encoder = new VideoEncoder({
    output: (chunk, meta) => muxer.addVideoChunk(chunk, meta as EncodedVideoChunkMetadata),
    error: (e) => { encoderError = e; },
  });
  encoder.configure(encoderConfig);

  let decoderError: Error | null = null;
  const decoder = new VideoDecoder({
    output: (frame) => {
      encoder.encode(frame);
      frame.close();
    },
    error: (e) => { decoderError = e; },
  });
  decoder.configure(decoderConfig);

  const total = videoSamples.length;
  for (let i = 0; i < total; i++) {
    if (decoderError) throw decoderError;
    if (encoderError) throw encoderError;

    const s = videoSamples[i];
    decoder.decode(
      new EncodedVideoChunk({
        type: s.is_sync ? "key" : "delta",
        timestamp: (s.cts * 1e6) / videoTrack.timescale,
        duration: (s.duration * 1e6) / videoTrack.timescale,
        data: s.data,
      })
    );

    // Backpressure: wait for the decode queue to drain a bit before continuing,
    // without calling flush() (which would force the next chunk to be a
    // keyframe and break mid-GOP decoding).
    while (decoder.decodeQueueSize > 16) {
      await new Promise((r) => setTimeout(r, 0));
    }
    if (i % 5 === 0) onProgress(Math.round((i / total) * 85));
  }

  await decoder.flush();
  await encoder.flush();
  decoder.close();
  encoder.close();

  if (decoderError) throw decoderError;
  if (encoderError) throw encoderError;

  onProgress(90);

  // Audio: pass through untouched (no decode/re-encode needed)
  if (audioTrack && audioSamples.length > 0) {
    let audioDescription: Uint8Array | undefined;
    const trak: any = mp4box.getTrackById(audioTrack.id);
    const entries: any[] = trak?.mdia?.minf?.stbl?.stsd?.entries ?? [];
    for (const entry of entries) {
      if (entry.esds) {
        const stream = new MP4Box.DataStream();
        entry.esds.write(stream);
        audioDescription = new Uint8Array(stream.buffer, 8);
        break;
      }
    }

    audioSamples.forEach((s, idx) => {
      muxer.addAudioChunkRaw(
        s.data,
        s.is_sync ? "key" : "delta",
        (s.cts * 1e6) / audioTrack.timescale,
        (s.duration * 1e6) / audioTrack.timescale,
        idx === 0
          ? {
              decoderConfig: {
                codec: audioTrack.codec,
                sampleRate: audioTrack.audio!.sample_rate,
                numberOfChannels: audioTrack.audio!.channel_count,
                description: audioDescription,
              },
            }
          : undefined
      );
    });
  }

  onProgress(98);
  muxer.finalize();
  onProgress(100);

  return new Blob([muxer.target.buffer], { type: "video/mp4" });
}
