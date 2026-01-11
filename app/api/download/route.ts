import { NextRequest, NextResponse } from 'next/server';
import { Readable } from 'node:stream';
import ytdl from 'ytdl-core';
import { toSafeFileName } from '@/lib/filename';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function inferExtension(mimeType?: string | null) {
  if (!mimeType) return 'bin';
  if (mimeType.includes('mp4')) return 'mp4';
  if (mimeType.includes('webm')) return 'webm';
  if (mimeType.includes('mpeg')) return 'mp3';
  if (mimeType.includes('ogg')) return 'ogg';
  return 'bin';
}

export async function GET(request: NextRequest) {
  const url = request.nextUrl.searchParams.get('url');
  const type = request.nextUrl.searchParams.get('type') ?? 'video';
  const itagParam = request.nextUrl.searchParams.get('itag');

  if (typeof url !== 'string' || !ytdl.validateURL(url)) {
    return NextResponse.json(
      { error: 'Please provide a valid YouTube URL.' },
      { status: 400 }
    );
  }

  try {
    const info = await ytdl.getInfo(url);
    const { formats, videoDetails } = info;

    const targetItag = itagParam ? Number(itagParam) : undefined;

    let selectedFormat = targetItag
      ? formats.find((format) => format.itag === targetItag)
      : undefined;

    if (!selectedFormat) {
      if (type === 'audio') {
        const preferredAudio = formats
          .filter((format) => format.hasAudio && !format.hasVideo)
          .sort((a, b) => (Number(b.audioBitrate ?? 0) - Number(a.audioBitrate ?? 0)));
        selectedFormat = preferredAudio[0] ?? formats.find((format) => format.hasAudio && !format.hasVideo);
      } else {
        const preferredVideo = formats
          .filter((format) => format.hasVideo && format.hasAudio && format.container === 'mp4')
          .sort((a, b) => {
            const qualityA = Number((a.qualityLabel ?? '').replace(/p.*/, ''));
            const qualityB = Number((b.qualityLabel ?? '').replace(/p.*/, ''));
            return qualityB - qualityA;
          });
        selectedFormat = preferredVideo[0] ?? formats.find((format) => format.hasVideo && format.hasAudio);
      }
    }

    if (!selectedFormat) {
      return NextResponse.json(
        { error: 'No matching format available for download.' },
        { status: 404 }
      );
    }

    const fileExtension = inferExtension(selectedFormat.mimeType);
    const safeTitle = toSafeFileName(videoDetails.title);
    const fileName = `${safeTitle}.${fileExtension}`;

    const downloadStream = ytdl(url, {
      quality: selectedFormat.itag,
      filter: type === 'audio' ? 'audioonly' : 'videoandaudio'
    });

    const webStream = Readable.toWeb(downloadStream);

    return new NextResponse(webStream as any, {
      status: 200,
      headers: {
        'Content-Type': selectedFormat.mimeType?.split(';')[0] ?? 'application/octet-stream',
        'Content-Disposition': `attachment; filename="${fileName}"`,
        ...(selectedFormat.contentLength ? { 'Content-Length': selectedFormat.contentLength } : {})
      }
    });
  } catch (error) {
    console.error('Download failed', error);

    return NextResponse.json(
      { error: 'Unable to process download. Please try again later.' },
      { status: 500 }
    );
  }
}
