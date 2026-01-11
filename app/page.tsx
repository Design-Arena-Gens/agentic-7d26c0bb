'use client';

import { FormEvent, useMemo, useState } from 'react';
import { toSafeFileName } from '@/lib/filename';
import { extensionFromMime } from '@/lib/mime';

type Format = {
  itag: number;
  qualityLabel?: string;
  container?: string;
  bitrate?: number | null;
  audioSampleRate?: string | null;
};

type VideoInfo = {
  title: string;
  author: string;
  thumbnailUrl?: string;
  lengthSeconds: number;
  mp4Formats: Format[];
  audioFormats: Format[];
};

const formatDuration = (seconds: number) => {
  const totalSeconds = Math.floor(seconds);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }
  return `${m}:${s.toString().padStart(2, '0')}`;
};

const humanBitrate = (bitrate?: number | null) => {
  if (!bitrate) return '';
  if (bitrate >= 1_000_000) return `${(bitrate / 1_000_000).toFixed(1)} Mbps`;
  if (bitrate >= 1_000) return `${Math.round(bitrate / 1_000)} kbps`;
  return `${bitrate} bps`;
};

export default function Home() {
  const [url, setUrl] = useState('');
  const [info, setInfo] = useState<VideoInfo | null>(null);
  const [selectedType, setSelectedType] = useState<'video' | 'audio'>('video');
  const [selectedItag, setSelectedItag] = useState<number | null>(null);
  const [statusMessage, setStatusMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [isFetchingInfo, setIsFetchingInfo] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [progress, setProgress] = useState(0);

  const availableFormats = useMemo(() => {
    if (!info) return [];
    return selectedType === 'video' ? info.mp4Formats : info.audioFormats;
  }, [info, selectedType]);

  const currentFormat = useMemo(() => {
    if (!availableFormats.length) return null;
    if (selectedItag) {
      return availableFormats.find((format) => format.itag === selectedItag) ?? availableFormats[0];
    }
    return availableFormats[0];
  }, [availableFormats, selectedItag]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorMessage('');
    setStatusMessage('');
    setInfo(null);
    setSelectedItag(null);

    if (!url.trim()) {
      setErrorMessage('Paste a YouTube URL to continue.');
      return;
    }

    setIsFetchingInfo(true);

    try {
      const response = await fetch('/api/info', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url.trim() })
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error ?? 'Unable to fetch video data.');
      }

      const data = (await response.json()) as VideoInfo;
      setInfo(data);
      setSelectedItag(
        data.mp4Formats[0]?.itag ?? data.audioFormats[0]?.itag ?? null
      );
      setStatusMessage('Video details ready. Choose quality and download.');
    } catch (error) {
      console.error(error);
      setErrorMessage(
        error instanceof Error ? error.message : 'Unable to fetch video data.'
      );
    } finally {
      setIsFetchingInfo(false);
    }
  };

  const handleDownload = async () => {
    if (!info) return;

    setErrorMessage('');
    setStatusMessage('Preparing your download...');
    setIsDownloading(true);
    setProgress(0);

    try {
      const params = new URLSearchParams({
        url: url.trim(),
        type: selectedType
      });

      if (currentFormat?.itag) {
        params.set('itag', currentFormat.itag.toString());
      }

      const response = await fetch(`/api/download?${params.toString()}`);

      if (!response.ok || !response.body) {
        const data = await response.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error ?? 'Download failed.');
      }

      const contentLength = Number(response.headers.get('Content-Length') ?? '0');
      const reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let received = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
          chunks.push(value);
          received += value.length;
          if (contentLength) {
            setProgress(Math.min(99, Math.round((received / contentLength) * 100)));
          }
        }
      }

      const mimeType = response.headers.get('Content-Type') ?? 'application/octet-stream';
      const blob = new Blob(chunks, { type: mimeType });
      const extension = extensionFromMime(mimeType);
      const downloadUrl = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = downloadUrl;
      anchor.download = `${toSafeFileName(info.title)}.${extension}`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(downloadUrl);
      setProgress(100);
      setStatusMessage('Download complete.');
    } catch (error) {
      console.error('Download failed', error);
      setErrorMessage(
        error instanceof Error ? error.message : 'Download failed. Please try again.'
      );
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '2rem'
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '900px',
          background: 'rgba(15, 23, 42, 0.75)',
          border: '1px solid rgba(148, 163, 184, 0.2)',
          borderRadius: '24px',
          padding: '2.75rem',
          boxShadow: '0 40px 80px rgba(15, 23, 42, 0.45)'
        }}
      >
        <header style={{ marginBottom: '2rem' }}>
          <h1
            style={{
              fontSize: 'clamp(2rem, 3vw, 2.75rem)',
              marginBottom: '0.5rem',
              fontWeight: 700
            }}
          >
            YouTube Downloader
          </h1>
          <p style={{ color: '#94a3b8', maxWidth: '640px', lineHeight: 1.6 }}>
            Paste a YouTube link, inspect the available qualities, and download the
            version that best fits your needs. Video and audio-only options are
            supported.
          </p>
        </header>

        <form onSubmit={handleSubmit} style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
          <input
            type="url"
            placeholder="https://www.youtube.com/watch?v=..."
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            required
            style={{
              flex: 1,
              minWidth: '260px',
              padding: '0.9rem 1.1rem',
              borderRadius: '14px',
              border: '1px solid rgba(148, 163, 184, 0.3)',
              background: 'rgba(15, 23, 42, 0.6)',
              color: '#e2e8f0',
              fontSize: '1rem'
            }}
          />
          <button
            type="submit"
            disabled={isFetchingInfo}
            style={{
              padding: '0.9rem 1.8rem',
              borderRadius: '14px',
              border: 'none',
              background: isFetchingInfo ? 'rgba(59, 130, 246, 0.35)' : '#3b82f6',
              color: '#ffffff',
              fontSize: '1rem',
              fontWeight: 600,
              minWidth: '170px'
            }}
          >
            {isFetchingInfo ? 'Fetching…' : 'Get Details'}
          </button>
        </form>

        {(errorMessage || statusMessage) && (
          <p
            style={{
              marginTop: '1rem',
              color: errorMessage ? '#f87171' : '#38bdf8'
            }}
          >
            {errorMessage || statusMessage}
          </p>
        )}

        {info && (
          <section
            style={{
              marginTop: '2.5rem',
              display: 'grid',
              gridTemplateColumns: 'minmax(220px, 260px) 1fr',
              gap: '2rem'
            }}
          >
            {info.thumbnailUrl && (
              <div
                style={{
                  borderRadius: '18px',
                  overflow: 'hidden',
                  border: '1px solid rgba(148, 163, 184, 0.25)',
                  boxShadow: '0 24px 50px rgba(15, 23, 42, 0.3)'
                }}
              >
                <img
                  src={info.thumbnailUrl}
                  alt={info.title}
                  style={{ display: 'block', width: '100%', height: 'auto' }}
                />
              </div>
            )}

            <div>
              <h2 style={{ margin: 0, fontSize: '1.75rem', fontWeight: 700 }}>{info.title}</h2>
              <p style={{ margin: '0.5rem 0', color: '#cbd5f5' }}>{info.author}</p>
              <p style={{ margin: '0.25rem 0', color: '#94a3b8' }}>
                Duration: {formatDuration(info.lengthSeconds)}
              </p>

              <div
                style={{
                  marginTop: '1.75rem',
                  display: 'flex',
                  gap: '1rem',
                  flexWrap: 'wrap'
                }}
              >
                <label
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    padding: '0.6rem 0.9rem',
                    borderRadius: '12px',
                    border: '1px solid rgba(148, 163, 184, 0.2)',
                    background: selectedType === 'video' ? 'rgba(59, 130, 246, 0.25)' : 'rgba(15, 23, 42, 0.7)',
                    cursor: 'pointer'
                  }}
                >
                  <input
                    type="radio"
                    name="type"
                    value="video"
                    checked={selectedType === 'video'}
                    onChange={() => {
                      setSelectedType('video');
                      setSelectedItag(info.mp4Formats[0]?.itag ?? null);
                    }}
                  />
                  Video
                </label>
                <label
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    padding: '0.6rem 0.9rem',
                    borderRadius: '12px',
                    border: '1px solid rgba(148, 163, 184, 0.2)',
                    background: selectedType === 'audio' ? 'rgba(14, 165, 233, 0.25)' : 'rgba(15, 23, 42, 0.7)',
                    cursor: 'pointer'
                  }}
                >
                  <input
                    type="radio"
                    name="type"
                    value="audio"
                    checked={selectedType === 'audio'}
                    onChange={() => {
                      setSelectedType('audio');
                      setSelectedItag(info.audioFormats[0]?.itag ?? null);
                    }}
                  />
                  Audio Only
                </label>
              </div>

              {availableFormats.length > 0 ? (
                <div style={{ marginTop: '1.5rem' }}>
                  <label
                    htmlFor="format"
                    style={{ display: 'block', marginBottom: '0.6rem', color: '#cbd5f5' }}
                  >
                    Choose quality
                  </label>
                  <select
                    id="format"
                    value={currentFormat?.itag ?? ''}
                    onChange={(event) => setSelectedItag(Number(event.target.value))}
                    style={{
                      width: '100%',
                      padding: '0.8rem 1rem',
                      borderRadius: '12px',
                      border: '1px solid rgba(148, 163, 184, 0.3)',
                      background: 'rgba(15, 23, 42, 0.7)',
                      color: '#e2e8f0',
                      fontSize: '1rem'
                    }}
                  >
                    {availableFormats.map((format) => (
                      <option key={format.itag} value={format.itag}>
                        {selectedType === 'video'
                          ? `${format.qualityLabel ?? 'Unknown quality'} • ${format.container?.toUpperCase() ?? 'N/A'} • ${humanBitrate(format.bitrate)}`
                          : `${format.container?.toUpperCase() ?? 'Audio'} • ${humanBitrate(format.bitrate)} ${format.audioSampleRate ? `• ${format.audioSampleRate} Hz` : ''}`}
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <p style={{ marginTop: '1.5rem', color: '#fbbf24' }}>
                  No {selectedType} formats available for this video. Try switching type.
                </p>
              )}

              <div style={{ marginTop: '2rem', display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  onClick={handleDownload}
                  disabled={isDownloading || !availableFormats.length}
                  style={{
                    padding: '0.9rem 2.2rem',
                    borderRadius: '999px',
                    border: 'none',
                    background: isDownloading ? 'rgba(59, 130, 246, 0.35)' : '#2563eb',
                    color: '#ffffff',
                    fontSize: '1rem',
                    fontWeight: 600,
                    minWidth: '200px'
                  }}
                >
                  {isDownloading ? 'Downloading…' : 'Download'}
                </button>
                {isDownloading && (
                  <div
                    style={{
                      flex: '1 1 200px',
                      background: 'rgba(15, 23, 42, 0.6)',
                      border: '1px solid rgba(148, 163, 184, 0.2)',
                      borderRadius: '999px',
                      overflow: 'hidden'
                    }}
                  >
                    <div
                      style={{
                        width: `${progress}%`,
                        minWidth: '4%',
                        height: '100%',
                        background: 'linear-gradient(90deg, #38bdf8, #6366f1)',
                        transition: 'width 0.3s ease'
                      }}
                    >
                      &nbsp;
                    </div>
                  </div>
                )}
              </div>
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
