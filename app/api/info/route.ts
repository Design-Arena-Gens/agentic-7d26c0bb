import { NextRequest, NextResponse } from 'next/server';
import ytdl from 'ytdl-core';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const { url } = await request.json();

    if (typeof url !== 'string' || !ytdl.validateURL(url)) {
      return NextResponse.json(
        { error: 'Please provide a valid YouTube URL.' },
        { status: 400 }
      );
    }

    const info = await ytdl.getInfo(url);
    const { videoDetails, formats } = info;

    const mp4Formats = ytdl
      .filterFormats(formats, 'videoandaudio')
      .filter((format) => format.mimeType?.includes('mp4'))
      .map((format) => ({
        itag: format.itag,
        qualityLabel: format.qualityLabel,
        container: format.container,
        bitrate: format.bitrate
      }));

    const audioFormats = ytdl
      .filterFormats(formats, 'audioonly')
      .filter((format) => format.mimeType?.includes('audio'))
      .map((format) => ({
        itag: format.itag,
        bitrate: format.bitrate,
        container: format.container,
        audioSampleRate: format.audioSampleRate
      }));

    return NextResponse.json({
      title: videoDetails.title,
      author: videoDetails.author.name,
      thumbnailUrl: videoDetails.thumbnails[videoDetails.thumbnails.length - 1]?.url,
      lengthSeconds: Number(videoDetails.lengthSeconds),
      mp4Formats,
      audioFormats
    });
  } catch (error) {
    console.error('Failed to load video info', error);

    return NextResponse.json(
      { error: 'Unable to fetch video information. Please try again.' },
      { status: 500 }
    );
  }
}
