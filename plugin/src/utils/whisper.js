/**
 * ScriptSync Pro - Whisper Helper Communication
 * Interfaces with the local helper sidecar for Whisper transcription.
 */

const WhisperHelper = (() => {
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
     * Start a transcription job.
     * @param {string} audioPath - Path to audio file
     * @param {string} model - Whisper model name (default: 'base.en')
     * @param {object} options - { language, task, wordTimestamps }
     * @returns {object} - { jobId, status }
     */
    async transcribe(audioPath, model = 'base.en', options = {}) {
      const url = `${getHelperUrl()}/transcribe`;

      const body = {
        filePath: audioPath,
        model: model,
        language: options.language || 'en',
        task: options.task || 'transcribe',
        wordTimestamps: options.wordTimestamps !== false,
        outputFormat: 'json'
      };

      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        });

        if (!res.ok) {
          const errText = await res.text().catch(() => 'Unknown error');
          throw new Error(`Whisper transcription request failed: ${errText}`);
        }

        return await res.json();
      } catch (e) {
        if (e.message.includes('fetch') || e.message.includes('network')) {
          throw new Error('Helper sidecar is not running. Start the ScriptSync Pro Helper application.');
        }
        throw e;
      }
    },

    /**
     * Get available Whisper models from the helper.
     * @returns {Array<{name, size, languages}>}
     */
    async getModels() {
      try {
        const res = await fetch(`${getHelperUrl()}/models`, {
          method: 'GET',
          signal: AbortSignal.timeout(5000)
        });

        if (!res.ok) {
          throw new Error('Failed to get models list');
        }

        const data = await res.json();
        return data.models || [];
      } catch (e) {
        console.warn('[WhisperHelper] Cannot get models:', e.message);
        // Return default list when helper is unavailable
        return [
          { name: 'tiny.en', size: '75 MB', languages: ['en'] },
          { name: 'tiny', size: '75 MB', languages: ['multilingual'] },
          { name: 'base.en', size: '142 MB', languages: ['en'] },
          { name: 'base', size: '142 MB', languages: ['multilingual'] },
          { name: 'small.en', size: '466 MB', languages: ['en'] },
          { name: 'small', size: '466 MB', languages: ['multilingual'] },
          { name: 'medium.en', size: '1.5 GB', languages: ['en'] },
          { name: 'medium', size: '1.5 GB', languages: ['multilingual'] }
        ];
      }
    },

    /**
     * Poll transcription job status.
     * @param {string} jobId
     * @returns {object} - { status, progress, result?, error? }
     */
    async getStatus(jobId) {
      const res = await fetch(`${getHelperUrl()}/transcribe/${jobId}`, {
        method: 'GET'
      });

      if (!res.ok) {
        throw new Error(`Failed to get status for job ${jobId}`);
      }

      return await res.json();
    },

    /**
     * Cancel a transcription job.
     * @param {string} jobId
     */
    async cancel(jobId) {
      try {
        await fetch(`${getHelperUrl()}/transcribe/${jobId}`, {
          method: 'DELETE'
        });
      } catch (e) {
        console.warn('[WhisperHelper] Cancel error:', e);
      }
    },

    /**
     * Check if Whisper is available through the helper.
     * @returns {boolean}
     */
    async isAvailable() {
      try {
        const res = await fetch(`${getHelperUrl()}/health`, {
          method: 'GET',
          signal: AbortSignal.timeout(3000)
        });
        const data = await res.json();
        return data.whisper === true || data.status === 'ok';
      } catch (e) {
        return false;
      }
    }
  };
})();
