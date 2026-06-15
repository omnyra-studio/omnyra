export async function stitchVideo(
  clips:        { url: string; duration: number }[],
  voiceUrl:     string,
  campaignName?: string,
) {
  return {
    url:       `https://final-video-${Date.now()}.mp4`,
    thumbnail: `https://final-video-${Date.now()}-thumb.jpg`,
    duration:  120,
  };
}
