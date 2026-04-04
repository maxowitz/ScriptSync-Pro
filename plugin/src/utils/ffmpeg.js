/**
 * ScriptSync Pro - FFmpeg Helper Communication
 * Sends audio extraction and media info requests to the local helper sidecar.
 */

const FFmpegHelper = (() => {
  const HELPER_DEFAULT_URL = 'http://localhost:9876';

  function getHelperUrl() {
    try {
      const settings = DataStore.getSettings();
      return settings.helperUrl || HELPER_DEFAULT_URL;
    } catch (e) {
      return HELPER_DEFAULT_URL;
    }
  }

  return {
    /**
     * Extract audio from a video file via the helper sidecar.
     * @param {string} videoPath - Path to the video file
     * @param {object} options - { format, sampleRate, channels }
     * @returns {object} - { audioPath, duration, format }
     */
    async extractAudio(videoPath, options = {}) {
      const url = `${getHelperUrl()}/extract-audio`;

      const body = {
        filePath: videoPath,
        format: options.format || 'wav',
        sampleRate: options.sampleRate || 16000,
        channels: options.channels || 1
      };

      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        });

        if (!res.ok) {
          const errText = await res.text().catch(() => 'Unknown error');
          throw new Error(`Audio extraction failed: ${errText}`);
        }

        return await res.json();
      } catch (e) {
        if (e.message.includes('fetch')) {
          throw new Error('Helper sidecar is not running. Please start the ScriptSync Pro Helper.');
        }
        throw e;
      }
    },

    /**
     * Get media information for a file.
     * @param {string} filePath - Path to the media file
     * @returns {object} - { duration, codec, format, width, height, fps, audioCodec, sampleRate }
     */
    async getMediaInfo(filePath) {
      const url = `${getHelperUrl()}/media-info`;

      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ filePath })
        });

        if (!res.ok) {
          const errText = await res.text().catch(() => 'Unknown error');
          throw new Error(`Media info request failed: ${errText}`);
        }

        return await res.json();
      } catch (e) {
        if (e.message.includes('fetch')) {
          throw new Error('Helper sidecar is not running.');
        }
        throw e;
      }
    },

    /**
     * Check if the FFmpeg helper endpoint is available.
     * @returns {boolean}
     */
    async isAvailable() {
      try {
        const res = await fetch(`${getHelperUrl()}/health`, {
          method: 'GET',
          signal: AbortSignal.timeout(3000)
        });
        const data = await res.json();
        return data.ffmpeg === true || data.status === 'ok';
      } catch (e) {
        return false;
      }
    }
  };
})();
