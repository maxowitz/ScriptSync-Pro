/**
 * ScriptSync Pro - Clip Indexer
 * Scans Premiere Pro project for clips using ppro DOM API.
 */

const ClipIndexer = (() => {
  /**
   * Recursively scan a bin (folder) for clip items.
   */
  function scanBin(bin, clips, parentPath = '') {
    try {
      const currentPath = parentPath ? `${parentPath}/${bin.name}` : bin.name;

      for (let i = 0; i < bin.children.numItems; i++) {
        const item = bin.children[i];

        if (item.type === 2) {
          // Type 2 = bin (folder), recurse into it
          scanBin(item, clips, currentPath);
        } else if (item.type === 1) {
          // Type 1 = clip/file item
          try {
            const clipInfo = {
              id: item.nodeId || `clip_${i}_${Date.now()}`,
              name: item.name || 'Untitled',
              binPath: currentPath,
              filePath: '',
              duration: 0,
              inPoint: 0,
              outPoint: 0,
              hasVideo: false,
              hasAudio: false,
              frameRate: 24,
              mediaType: 'unknown'
            };

            // Try to get file path
            try {
              if (item.getMediaPath) {
                clipInfo.filePath = item.getMediaPath();
              } else if (item.treePath) {
                clipInfo.filePath = item.treePath;
              }
            } catch (e) { /* media path not available */ }

            // Try to get duration
            try {
              if (item.getOutPoint) {
                clipInfo.duration = item.getOutPoint().seconds || 0;
              }
            } catch (e) { /* duration not available */ }

            // Try to get in/out points
            try {
              if (item.getInPoint) {
                clipInfo.inPoint = item.getInPoint().seconds || 0;
              }
              if (item.getOutPoint) {
                clipInfo.outPoint = item.getOutPoint().seconds || 0;
              }
            } catch (e) { /* points not available */ }

            // Try to detect media type
            try {
              if (item.getFootageInterpretation) {
                const interp = item.getFootageInterpretation();
                clipInfo.frameRate = interp.frameRate || 24;
              }
            } catch (e) { /* interpretation not available */ }

            // Check for video/audio streams
            try {
              clipInfo.hasVideo = item.hasVideo ? item.hasVideo() : true;
              clipInfo.hasAudio = item.hasAudio ? item.hasAudio() : true;
            } catch (e) {
              // Default assumptions
              clipInfo.hasVideo = true;
              clipInfo.hasAudio = true;
            }

            // Parse shot/take info from filename
            const parsed = ClipNameParser.parse(clipInfo.name);
            clipInfo.scene = parsed.scene;
            clipInfo.shot = parsed.shot;
            clipInfo.take = parsed.take;
            clipInfo.camera = parsed.camera;

            clips.push(clipInfo);
          } catch (itemErr) {
            console.warn('[ClipIndexer] Error processing item:', item.name, itemErr);
          }
        }
      }
    } catch (e) {
      console.error('[ClipIndexer] Error scanning bin:', bin.name, e);
    }
  }

  return {
    /**
     * Scan the entire Premiere Pro project for clips.
     * Returns array of ClipInfo objects.
     */
    async scanProject() {
      const clips = [];

      try {
        const { app } = require('premiere');
        const project = app.project;

        if (!project) {
          console.warn('[ClipIndexer] No project open');
          return clips;
        }

        const rootItem = project.rootItem;
        if (!rootItem) {
          console.warn('[ClipIndexer] No root item in project');
          return clips;
        }

        scanBin(rootItem, clips);
        console.log(`[ClipIndexer] Found ${clips.length} clips`);
      } catch (e) {
        console.warn('[ClipIndexer] Premiere Pro API not available:', e.message);
        // Return empty array when not running inside Premiere
      }

      return clips;
    },

    /**
     * Get the currently selected clip in Premiere Pro.
     */
    getSelectedClip() {
      try {
        const { app } = require('premiere');
        const project = app.project;

        if (!project) return null;

        // Try to get selection from project panel
        const selection = project.getInsertionBin ? project.getInsertionBin() : null;
        return selection;
      } catch (e) {
        console.warn('[ClipIndexer] Cannot get selection:', e.message);
        return null;
      }
    },

    /**
     * Get current sequence clips.
     */
    async getSequenceClips() {
      const clips = [];

      try {
        const { app } = require('premiere');
        const seq = app.project.activeSequence;

        if (!seq) {
          console.warn('[ClipIndexer] No active sequence');
          return clips;
        }

        // Scan video tracks
        for (let t = 0; t < seq.videoTracks.numTracks; t++) {
          const track = seq.videoTracks[t];
          for (let c = 0; c < track.clips.numItems; c++) {
            const clip = track.clips[c];
            try {
              clips.push({
                id: clip.nodeId || `seqclip_${t}_${c}`,
                name: clip.name || clip.projectItem?.name || 'Untitled',
                trackIndex: t,
                clipIndex: c,
                start: clip.start?.seconds || 0,
                end: clip.end?.seconds || 0,
                duration: (clip.end?.seconds || 0) - (clip.start?.seconds || 0),
                inPoint: clip.inPoint?.seconds || 0,
                outPoint: clip.outPoint?.seconds || 0
              });
            } catch (clipErr) {
              console.warn('[ClipIndexer] Error reading sequence clip:', clipErr);
            }
          }
        }
      } catch (e) {
        console.warn('[ClipIndexer] Premiere Pro sequence API not available:', e.message);
      }

      return clips;
    },

    /**
     * Import a media file into the project.
     */
    async importFile(filePath) {
      try {
        const { app } = require('premiere');
        const project = app.project;

        if (!project) {
          throw new Error('No project open');
        }

        const success = project.importFiles([filePath]);
        return success;
      } catch (e) {
        console.error('[ClipIndexer] Import failed:', e);
        throw e;
      }
    }
  };
})();
