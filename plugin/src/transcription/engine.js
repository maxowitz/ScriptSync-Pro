/**
 * ScriptSync Pro - Transcription Engine
 * Communicates with local helper sidecar for FFmpeg + Whisper transcription.
 * FIX: Two-step flow — extract audio first (if video), then transcribe.
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

  function isAudioFile(filePath) {
    if (!filePath) return false;
    return /\.(wav|aif|aiff|mp3|aac|flac|ogg)$/i.test(filePath);
  }

  return {
    async isHelperAvailable() {
      const available = await checkHelperAvailable();
      updateHelperStatus(available);
      return available;
    },

    /**
     * Full transcription pipeline for a clip:
     * 1. If video file → extract audio via /extract-audio
     * 2. Send audio to /transcribe
     * 3. Poll until complete
     * 4. Return transcript words
     */
    async transcribeAndParse(clipPath, options = {}) {
      const available = await checkHelperAvailable();
      if (!available) {
        throw new Error('Helper sidecar is not running. Please start the ScriptSync Pro Helper application.');
      }

      const helperUrl = getHelperUrl();
      let audioPath = clipPath;

      // FIX: Step 1 — Extract audio if this is a video file (not WAV/AIF)
      if (!isAudioFile(clipPath)) {
        console.log('[Transcription] Extracting audio from:', clipPath);
        const extractRes = await fetch(`${helperUrl}/extract-audio`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ videoPath: clipPath })
        });

        if (!extractRes.ok) {
          const errText = await extractRes.text().catch(() => 'Unknown error');
          throw new Error(`Audio extraction failed: ${errText}`);
        }

        const extractData = await extractRes.json();
        audioPath = extractData.audioPath;
        console.log('[Transcription] Audio extracted to:', audioPath);
      }

      // FIX: Step 2 — Start transcription with correct field name (audioPath, not filePath)
      const settings = DataStore.getSettings();
      const modelName = options.model || settings.whisperModel || 'ggml-base.en.bin';

      console.log('[Transcription] Starting whisper on:', audioPath, 'model:', modelName);
      const transcribeRes = await fetch(`${helperUrl}/transcribe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          audioPath: audioPath,
          model: modelName
        })
      });

      if (!transcribeRes.ok) {
        const errText = await transcribeRes.text().catch(() => 'Unknown error');
        throw new Error(`Transcription start failed: ${errText}`);
      }

      const jobData = await transcribeRes.json();
      const jobId = jobData.jobId;
      console.log('[Transcription] Job started:', jobId);

      // Step 3 — Poll until complete
      const result = await this.pollUntilComplete(jobId);
      return result;
    },

    /**
     * Start transcription (low-level, returns jobId).
     */
    async transcribeClip(clipPath, options = {}) {
      const available = await checkHelperAvailable();
      if (!available) {
        throw new Error('Helper sidecar is not running. Please start the ScriptSync Pro Helper application.');
      }

      const helperUrl = getHelperUrl();
      let audioPath = clipPath;

      // Extract audio if video file
      if (!isAudioFile(clipPath)) {
        const extractRes = await fetch(`${helperUrl}/extract-audio`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ videoPath: clipPath })
        });
        if (!extractRes.ok) throw new Error('Audio extraction failed');
        const extractData = await extractRes.json();
        audioPath = extractData.audioPath;
      }

      const settings = DataStore.getSettings();
      const res = await fetch(`${helperUrl}/transcribe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          audioPath: audioPath,
          model: options.model || settings.whisperModel || 'ggml-base.en.bin'
        })
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => 'Unknown error');
        throw new Error(`Transcription request failed: ${errText}`);
      }

      const data = await res.json();
      _activeJobs.set(data.jobId, { clipPath, status: 'processing', startedAt: Date.now() });
      return data;
    },

    async getTranscriptionStatus(jobId) {
      const res = await fetch(`${getHelperUrl()}/transcribe/${jobId}`);
      if (!res.ok) throw new Error(`Status check failed for job ${jobId}`);
      const data = await res.json();
      if (_activeJobs.has(jobId)) _activeJobs.get(jobId).status = data.status;
      if (data.status === 'completed' || data.status === 'failed') _activeJobs.delete(jobId);
      return data;
    },

    async cancelTranscription(jobId) {
      try {
        await fetch(`${getHelperUrl()}/transcribe/${jobId}/cancel`, { method: 'POST' });
        _activeJobs.delete(jobId);
      } catch (e) {
        console.error('[TranscriptionEngine] Cancel error:', e);
      }
    },

    /**
     * Poll a job until completion.
     */
    async pollUntilComplete(jobId, onProgress, intervalMs = 1000) {
      return new Promise((resolve, reject) => {
        const check = async () => {
          try {
            const status = await this.getTranscriptionStatus(jobId);
            if (onProgress) onProgress(status.progress || 0);

            if (status.status === 'completed') {
              resolve(status.result);
            } else if (status.status === 'failed') {
              reject(new Error(status.error || 'Transcription failed'));
            } else {
              setTimeout(check, intervalMs);
            }
          } catch (e) {
            reject(e);
          }
        };
        check();
      });
    },

    getActiveJobCount() {
      return _activeJobs.size;
    }
  };
})();
