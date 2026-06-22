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

  const info: any = await new Promise((resolve, reject) => {
    mp4box.onError = (e: string) => reject(new Error(e));
    mp4box.onReady = (i: any) => resolve(i);

    mp4box.onSamples = (id: number, _user: unknown, samples: any[]) => {
      const target = videoTrack && id === videoTrack.id ? videoSamples : audioTrack && id === audioTrack.id ? audioSamples : null;
      if (!target) return;
      for (const s of samples) {
        target.push({ data: s.data, cts: s.cts, duration: s.duration, is_sync: s.is_sync });
      }
    };

    const buf = file.arrayBuffer();
    buf.then((ab) => {
      (ab as any).fileStart = 0;
      mp4box.appendBuffer(ab as any);
      mp4box.flush();
    });
  });

  const vt = info.tracks.find((t: any) => t.video);
  const at = info.tracks.find((t: any) => t.audio);

  if (!vt) throw new Error("No video track found in source file.");

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

  mp4box.setExtractionOptions(videoTrack.id, null, { nbSamples: 100000 });
  if (audioTrack) mp4box.setExtractionOptions(audioTrack.id, null, { nbSamples: 100000 });
  mp4box.start();
  mp4box.flush();

  // mp4box.js processes synchronously within these calls; give pending
  // microtasks a chance to settle before reading results.
  await new Promise((r) => setTimeout(r, 0));

  if (videoSamples.length === 0) throw new Error("Failed to extract video samples.");

  return { mp4box, videoTrack, audioTrack, videoSamples, audioSamples };
}

function bitrateFor(quality: number, width: number, height: number, fps: number): number {
  const bppFactor = 0.035 + quality * 0.065; // ~0.035 (low) .. 0.1 (near-lossless)
  return Math.round(width * height * bppFactor * fps);
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

  const encoderConfig: VideoEncoderConfig = {
    codec: "avc1.640028",
    width,
    height,
    bitrate: bitrateFor(quality, width, height, fps),
    framerate: fps,
    hardwareAcceleration: "prefer-hardware",
    latencyMode: "quality",
  };

  const encoderSupport = await VideoEncoder.isConfigSupported(encoderConfig);
  if (!encoderSupport.supported) throw new Error("VideoEncoder does not support the target configuration.");

  const muxer = new Muxer({
    target: new ArrayBufferTarget(),
    video: { codec: "avc", width, height, frameRate: fps },
    audio: audioTrack
      ? { codec: "aac", numberOfChannels: audioTrack.audio!.channel_count, sampleRate: audioTrack.audio!.sample_rate }
      : undefined,
    fastStart: "in-memory",
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

    if (decoder.decodeQueueSize > 8) {
      await decoder.flush().catch(() => {});
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
