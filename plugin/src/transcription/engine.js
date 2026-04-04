/**
 * ScriptSync Pro - Transcription Engine
 * Communicates with local helper sidecar for Whisper transcription.
 */

const TranscriptionEngine = (() => {
  const HELPER_DEFAULT_URL = 'http://localhost:9876';
  let _activeJobs = new Map();

  function getHelperUrl() {
    try {
      const settings = DataStore.getSettings();
      return settings.helperUrl || HELPER_DEFAULT_URL;
    } catch (e) {
      return HELPER_DEFAULT_URL;
    }
  }

  async function checkHelperAvailable() {
    try {
      const res = await fetch(`${getHelperUrl()}/health`, {
        method: 'GET',
        signal: AbortSignal.timeout(3000)
      });
      return res.ok;
    } catch (e) {
      return false;
    }
  }

  function updateHelperStatus(available) {
    const el = document.getElementById('helper-status');
    if (el) {
      el.textContent = available ? 'Helper: Online' : 'Helper: Offline';
      el.className = `status-badge ${available ? 'status-connected' : 'status-disconnected'}`;
    }
  }

  return {
    /**
     * Check if the helper sidecar is running.
     */
    async isHelperAvailable() {
      const available = await checkHelperAvailable();
      updateHelperStatus(available);
      return available;
    },

    /**
     * Start transcription of a clip.
     * @param {string} clipPath - Path to the media file
     * @param {object} options - { model, language, wordTimestamps }
     * @returns {object} - { jobId, status }
     */
    async transcribeClip(clipPath, options = {}) {
      const available = await checkHelperAvailable();
      if (!available) {
        throw new Error('Helper sidecar is not running. Please start the ScriptSync Pro Helper application.');
      }

      const settings = DataStore.getSettings();
      const body = {
        filePath: clipPath,
        model: options.model || settings.whisperModel || 'base.en',
        language: options.language || 'en',
        wordTimestamps: options.wordTimestamps !== false,
        task: 'transcribe'
      };

      const res = await fetch(`${getHelperUrl()}/transcribe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => 'Unknown error');
        throw new Error(`Transcription request failed: ${errText}`);
      }

      const data = await res.json();
      _activeJobs.set(data.jobId, {
        clipPath,
        status: 'processing',
        startedAt: Date.now()
      });

      return data;
    },

    /**
     * Poll the helper for transcription status.
     * @param {string} jobId
     * @returns {object} - { status, progress, result? }
     */
    async getTranscriptionStatus(jobId) {
      const res = await fetch(`${getHelperUrl()}/transcribe/${jobId}`, {
        method: 'GET'
      });

      if (!res.ok) {
        throw new Error(`Status check failed for job ${jobId}`);
      }

      const data = await res.json();

      // Update active job tracking
      if (_activeJobs.has(jobId)) {
        _activeJobs.get(jobId).status = data.status;
      }

      // If completed, remove from active jobs
      if (data.status === 'completed' || data.status === 'failed') {
        _activeJobs.delete(jobId);
      }

      return data;
    },

    /**
     * Cancel an active transcription job.
     * @param {string} jobId
     */
    async cancelTranscription(jobId) {
      try {
        await fetch(`${getHelperUrl()}/transcribe/${jobId}`, {
          method: 'DELETE'
        });
        _activeJobs.delete(jobId);
      } catch (e) {
        console.error('[TranscriptionEngine] Cancel error:', e);
      }
    },

    /**
     * Poll a job until completion.
     * @param {string} jobId
     * @param {function} onProgress - callback(progress)
     * @param {number} intervalMs - poll interval
     * @returns {object} - Final transcription result
     */
    async waitForCompletion(jobId, onProgress = null, intervalMs = 2000) {
      while (true) {
        const status = await this.getTranscriptionStatus(jobId);

        if (onProgress && status.progress != null) {
          onProgress(status.progress);
        }

        if (status.status === 'completed') {
          return status.result;
        }

        if (status.status === 'failed') {
          throw new Error(status.error || 'Transcription failed');
        }

        await new Promise(resolve => setTimeout(resolve, intervalMs));
      }
    },

    /**
     * Get list of active transcription jobs.
     */
    getActiveJobs() {
      return Array.from(_activeJobs.entries()).map(([id, info]) => ({
        jobId: id,
        ...info
      }));
    },

    /**
     * Transcribe and return parsed result in one call.
     */
    async transcribeAndParse(clipPath, options = {}, onProgress = null) {
      const { jobId } = await this.transcribeClip(clipPath, options);
      const result = await this.waitForCompletion(jobId, onProgress);
      return TranscriptionParser.parseWhisperJSON(result);
    }
  };
})();
