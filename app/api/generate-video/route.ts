import { NextRequest, NextResponse } from 'next/server';
import { performAnalysis } from '@/utils/performAnalysis';
import { generateScript }  from '@/utils/generateScript';
import { generateVideoClip } from '@/utils/generateVideoClip';
import { generateVoice }   from '@/utils/generateVoice';
import { stitchVideo }     from '@/utils/ffmpegStitch';

export const maxDuration = 300;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      prompt,
      campaignMode    = false,
      campaignName,
      selectedModel   = 'kling',
      brandMemory     = '',
      emotionalArc    = 'neutral',
      microIntensity  = 65,
      activeEmotions  = [],
      selectedVoiceId,
      referenceImages = [],
      lightningMode   = false,
    } = body;

    if (!prompt?.trim()) {
      return NextResponse.json({ error: 'prompt is required' }, { status: 400 });
    }

    const startTime = Date.now();
    const progress: { stage: string; progress: number; message: string; url?: string }[] = [];

    // Frontend already resolves the model (pika in lightning, user choice otherwise)
    const effectiveModel = selectedModel;
    const clipDuration   = lightningMode ? 5 : 7;
    const maxScenes      = lightningMode ? 2 : 3;

    // ── Stage 1: Analyze ──────────────────────────────────────────────────────
    progress.push({ stage: 'Analyze', progress: 25, message: 'Ghost Test analysis...' });

    const analysis = await performAnalysis(prompt, brandMemory, emotionalArc, activeEmotions);

    progress.push({ stage: 'Analyze', progress: 40, message: `Ghost Test: ${analysis.ghostTestScore}/100` });

    // ── Stage 2: Script ───────────────────────────────────────────────────────
    progress.push({ stage: 'Script', progress: 55, message: 'Visual script...' });

    const script = await generateScript(prompt, analysis, brandMemory);

    // ── Stage 3: Generate (parallel) ─────────────────────────────────────────
    progress.push({ stage: 'Generate', progress: 70, message: `Generating with ${effectiveModel}...` });

    const scenesToProcess = (analysis.suggestedScenes ?? []).slice(0, maxScenes);

    const clips = await Promise.all(
      scenesToProcess.map(scene =>
        generateVideoClip({
          prompt:        scene.description,
          selectedModel: effectiveModel,
          referenceImages,
          duration:      scene.duration ?? clipDuration,
          campaignMode,
          microIntensity,
          activeEmotions,
        }),
      ),
    );

    // ── Stage 4: Voice ────────────────────────────────────────────────────────
    progress.push({ stage: 'Voice', progress: 85, message: 'Voiceover...' });

    const voice = await generateVoice({
      script:          script.fullScript || prompt,
      emotionalArc,
      activeEmotions,
      selectedVoiceId: selectedVoiceId ?? '21m00Tcm4TlvDq8ikWAM',
    });

    // ── Stage 5: Stitch ───────────────────────────────────────────────────────
    progress.push({ stage: 'Stitch', progress: 95, message: 'Final stitch...' });

    const finalVideo = await stitchVideo(
      clips.map(c => ({ url: c.url, duration: c.duration })),
      voice.url,
      campaignName,
    );

    const generationTime = ((Date.now() - startTime) / 1000).toFixed(1) + 's';

    progress.push({ stage: 'Stitch', progress: 100, message: 'Generation complete!', url: finalVideo.url });

    return NextResponse.json({
      success:        true,
      videoUrl:       finalVideo.url,
      thumbnail:      finalVideo.thumbnail,
      duration:       finalVideo.duration,
      ghostTestScore: analysis.ghostTestScore,
      generationTime,
      mode:           lightningMode ? 'balanced' : 'quality',
      progressLog:    progress,
    });

  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Generation failed';
    console.error('[generate-video] Error:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({ status: 'generate-video endpoint ready', maxDuration: '300s' });
}
