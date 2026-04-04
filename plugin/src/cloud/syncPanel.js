/**
 * ScriptSync Pro - Remote Clip Sync Panel Logic
 * Fetches remote clips, handles imports, shows live status.
 */

const SyncPanelLogic = (() => {
  let _remoteClips = [];
  let _localClips = [];
  let _projectId = null;

  /**
   * Fetch remote clips from cloud API.
   */
  async function fetchRemoteClips(projectId) {
    _projectId = projectId;
    try {
      const data = await CloudAPI.getClips(projectId);
      _remoteClips = data.clips || data || [];
      return _remoteClips;
    } catch (e) {
      console.error('[SyncPanel] Error fetching remote clips:', e);
      throw e;
    }
  }

  /**
   * Set local clips for conflict detection.
   */
  function setLocalClips(clips) {
    _localClips = clips || [];
  }

  /**
   * Detect conflicts between remote and local clips.
   * Flags clips with same shot/take as local clips.
   */
  function detectConflicts() {
    const localIndex = new Map();
    for (const clip of _localClips) {
      if (clip.shot != null && clip.take != null) {
        const key = `${clip.scene || ''}_${clip.shot}_${clip.take}`;
        localIndex.set(key, clip);
      }
    }

    return _remoteClips.map(remote => {
      const parsed = ClipNameParser.parse(remote.filename || remote.name || '');
      let conflict = null;

      if (parsed.shot != null && parsed.take != null) {
        const key = `${parsed.scene || ''}_${parsed.shot}_${parsed.take}`;
        if (localIndex.has(key)) {
          conflict = {
            localClip: localIndex.get(key),
            reason: `Same shot/take: ${ClipNameParser.formatInfo(parsed)}`
          };
        }
      }

      return {
        ...remote,
        parsed,
        conflict
      };
    });
  }

  /**
   * Download a remote clip and import it into Premiere Pro.
   */
  async function importRemoteClip(clip) {
    try {
      // Download from cloud
      const response = await CloudAPI.download(`/api/clips/${clip.id || clip._id}/download`);
      const blob = await response.blob();

      // Save to local temp directory via UXP file system
      let filePath;
      try {
        const uxpStorage = require('uxp').storage;
        const fs = uxpStorage.localFileSystem;
        const tempFolder = await fs.getTemporaryFolder();
        const filename = clip.filename || clip.name || 'imported_clip';
        const file = await tempFolder.createFile(filename, { overwrite: true });
        await file.write(blob);
        filePath = file.nativePath;
      } catch (fsErr) {
        console.error('[SyncPanel] File system error:', fsErr);
        throw new Error('Failed to save downloaded clip locally');
      }

      // Import into Premiere Pro
      await ClipIndexer.importFile(filePath);
      return { success: true, filePath };
    } catch (e) {
      console.error('[SyncPanel] Import error:', e);
      throw e;
    }
  }

  /**
   * Upload a local clip to the cloud.
   */
  async function uploadLocalClip(clipInfo) {
    if (!_projectId) throw new Error('No project selected');

    try {
      const uxpStorage = require('uxp').storage;
      const fs = uxpStorage.localFileSystem;
      const file = await fs.getFileForOpening({ initialLocation: clipInfo.filePath });

      if (!file) throw new Error('File not found');

      const data = await file.read({ format: uxpStorage.formats.binary });
      const blob = new Blob([data]);
      const filename = clipInfo.name || file.name;

      return await CloudAPI.uploadClip(_projectId, blob, filename);
    } catch (e) {
      console.error('[SyncPanel] Upload error:', e);
      throw e;
    }
  }

  /**
   * Set up socket listeners for live updates.
   */
  function setupSocketListeners(onUpdate) {
    SocketClient.onClipUploaded((data) => {
      // Add new remote clip to list
      _remoteClips.push(data.clip || data);
      if (onUpdate) onUpdate('clipUploaded', data);
    });

    SocketClient.onClipTranscribed((data) => {
      // Update transcription status
      const clip = _remoteClips.find(c => (c.id || c._id) === data.clipId);
      if (clip) {
        clip.transcriptionStatus = 'completed';
        clip.transcription = data.transcription;
      }
      if (onUpdate) onUpdate('clipTranscribed', data);
    });
  }

  return {
    fetchRemoteClips,
    setLocalClips,
    detectConflicts,
    importRemoteClip,
    uploadLocalClip,
    setupSocketListeners,
    getRemoteClips() { return _remoteClips; }
  };
})();
