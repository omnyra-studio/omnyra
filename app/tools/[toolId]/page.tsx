import { notFound } from 'next/navigation';
import GenerationFlow from '@/components/creation/GenerationFlow';
import AnimatedBackground from '@/components/AnimatedBackground';
import { getNicheTool, getNichePrefill } from '@/lib/tools-config';

interface Props {
  params: Promise<{ toolId: string }>;
}

export default async function NicheToolPage({ params }: Props) {
  const { toolId } = await params;
  const tool = getNicheTool(toolId);
  if (!tool) notFound();

  const prefill = getNichePrefill(toolId);

  return (
    <>
      <AnimatedBackground />
      <div className="min-h-screen text-white relative z-10 pt-20" style={{ background: '#0A0010' }}>
        <div className="max-w-2xl mx-auto px-6 py-12">
          <div className="flex items-center gap-3 mb-2">
            <span className="text-4xl">{tool.icon}</span>
            <h1 className="text-3xl font-bold text-white">{tool.title}</h1>
          </div>
          <p className="text-purple-300 text-sm mb-10">{tool.desc}</p>
          <GenerationFlow
            toolId={toolId}
            toolName={tool.title}
            modelOverride="kling"
            nichePrefill={prefill}
          />
        </div>
      </div>
    </>
  );
}
