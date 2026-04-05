/**
 * ScriptSync Pro - Clip Indexer
 * Scans Premiere Pro project for clips using the UXP premierepro API.
 * FIX: Uses require("premierepro") — the correct module name for Premiere Pro 2024+.
 * The old require("premiere") was incorrect and caused "Module not found" errors.
 */

const ClipIndexer = (() => {

  /**
   * Recursively scan a folder item for clip items.
   * Uses the Premiere Pro 2024+ UXP API with ppro.FolderItem.cast() and ppro.ClipProjectItem.cast().
   */
  async function scanFolder(ppro, folderItem, clips, parentPath) {
    try {
      const items = await folderItem.getItems();
      if (!items || items.length === 0) return;

      for (const item of items) {
        try {
          // Check if it's a folder
          const folder = ppro.FolderItem.cast(item);
          if (folder) {
            const folderPath = parentPath ? `${parentPath}/${item.name}` : item.name;
            await scanFolder(ppro, folder, clips, folderPath);
            continue;
          }

          // Check if it's a clip
          const clipItem = ppro.ClipProjectItem.cast(item);
          if (clipItem) {
            let mediaPath = '';
            try {
              mediaPath = await clipItem.getMediaFilePath();
            } catch (e) { /* media path not available */ }

            const parsed = ClipNameParser.parse(item.name || 'Untitled');

            clips.push({
              id: item.guid || `clip_${clips.length}_${Date.now()}`,
              name: item.name || 'Untitled',
              binPath: parentPath || 'Root',
              filePath: mediaPath || '',
              duration: 0,
              inPoint: 0,
              outPoint: 0,
              hasVideo: true,
              hasAudio: true,
              frameRate: 24,
              mediaType: mediaPath ? guessMediaType(mediaPath) : 'unknown',
              scene: parsed.scene,
              shot: parsed.shot,
              take: parsed.take,
              camera: parsed.camera,
              reel: parsed.reel,
              source: 'bin',
              status: 'pending',
              originalFilename: item.name
            });
          }
        } catch (itemErr) {
          console.warn('[ClipIndexer] Error processing item:', item.name, itemErr.message);
        }
      }
    } catch (e) {
      console.error('[ClipIndexer] Error scanning folder:', e.message);
    }
  }

  function guessMediaType(filePath) {
    if (!filePath) return 'unknown';
    const ext = filePath.split('.').pop().toLowerCase();
    if (['wav', 'aif', 'aiff', 'mp3', 'aac'].includes(ext)) return 'audio';
    if (['mov', 'mp4', 'mxf', 'r3d', 'avi', 'braw'].includes(ext)) return 'video';
    return 'unknown';
  }

  return {
    /**
     * Scan the entire Premiere Pro project for clips.
     * Uses require("premierepro") — the correct module for Premiere Pro 2024+ UXP.
     */
    async scanProject() {
      const clips = [];

      try {
        // FIX: Correct module name is "premierepro", not "premiere"
        const ppro = require('premierepro');
        console.log('[ClipIndexer] premierepro module loaded');

        const project = await ppro.Project.getActiveProject();
        if (!project) {
          console.warn('[ClipIndexer] No active project');
          return clips;
        }
        console.log('[ClipIndexer] Active project:', project.name);

        // Scan project bin
        const rootItem = await project.getRootItem();
        if (rootItem) {
          const rootFolder = ppro.FolderItem.cast(rootItem);
          if (rootFolder) {
            await scanFolder(ppro, rootFolder, clips, '');
          }
        }

        console.log(`[ClipIndexer] Found ${clips.length} clips in project bin`);

        // Also scan active sequence tracks for clips with timeline info
        try {
          const sequence = await project.getActiveSequence();
          if (sequence) {
            console.log('[ClipIndexer] Active sequence:', sequence.name);

            // Scan video tracks
            const videoTrackCount = await sequence.getVideoTrackCount();
            for (let t = 0; t < videoTrackCount; t++) {
              try {
                const track = await sequence.getVideoTrack(t);
                const trackItems = track.getTrackItems(
                  ppro.Constants.TrackItemType.CLIP,
                  false
                );
                if (trackItems) {
                  for (const trackItem of trackItems) {
                    try {
                      const projItem = await trackItem.getProjectItem();
                      if (!projItem) continue;

                      const clipProjItem = ppro.ClipProjectItem.cast(projItem);
                      let mediaPath = '';
                      if (clipProjItem) {
                        try {
                          mediaPath = await clipProjItem.getMediaFilePath();
                        } catch (e) { /* ok */ }
                      }

                      const inPt = await trackItem.getInPoint();
                      const outPt = await trackItem.getOutPoint();

                      // Check if already in clips array from bin scan
                      const existing = clips.find(c => c.name === projItem.name);
                      if (existing) {
                        // Update with sequence-specific info
                        existing.inPoint = inPt ? inPt.seconds : 0;
                        existing.outPoint = outPt ? outPt.seconds : 0;
                        existing.duration = (existing.outPoint - existing.inPoint) || existing.duration;
                        existing.source = 'sequence';
                      } else {
                        const parsed = ClipNameParser.parse(projItem.name || 'Untitled');
                        clips.push({
                          id: projItem.guid || `seqclip_${t}_${clips.length}`,
                          name: projItem.name || 'Untitled',
                          binPath: '',
                          filePath: mediaPath || '',
                          duration: outPt && inPt ? (outPt.seconds - inPt.seconds) : 0,
                          inPoint: inPt ? inPt.seconds : 0,
                          outPoint: outPt ? outPt.seconds : 0,
                          hasVideo: true,
                          hasAudio: true,
                          frameRate: 24,
                          mediaType: mediaPath ? guessMediaType(mediaPath) : 'unknown',
                          scene: parsed.scene,
                          shot: parsed.shot,
                          take: parsed.take,
                          camera: parsed.camera,
                          reel: parsed.reel,
                          source: 'sequence',
                          status: 'pending',
                          originalFilename: projItem.name
                        });
                      }
                    } catch (clipErr) {
                      console.warn('[ClipIndexer] Error reading track item:', clipErr.message);
                    }
                  }
                }
              } catch (trackErr) {
                console.warn('[ClipIndexer] Error reading video track', t, ':', trackErr.message);
              }
            }
          }
        } catch (seqErr) {
          console.warn('[ClipIndexer] Sequence scan failed:', seqErr.message);
        }

      } catch (e) {
        console.warn('[ClipIndexer] Premiere Pro API not available:', e.message);
      }

      return clips;
    },

    /**
     * Get info about the active project and sequence.
     */
    async getProjectInfo() {
      try {
        const ppro = require('premierepro');
        const project = await ppro.Project.getActiveProject();
        if (!project) return null;

        const sequence = await project.getActiveSequence();
        return {
          projectName: project.name || 'Untitled',
          sequenceName: sequence ? sequence.name : null,
          hasSequence: !!sequence,
        };
      } catch (e) {
        console.warn('[ClipIndexer] Cannot get project info:', e.message);
        return null;
      }
    },

    /**
     * Import a media file into the project.
     */
    async importFile(filePath) {
      try {
        const ppro = require('premierepro');
        const project = await ppro.Project.getActiveProject();
        if (!project) throw new Error('No project open');

        await project.importFiles([filePath]);
        return true;
      } catch (e) {
        console.error('[ClipIndexer] Import failed:', e);
        throw e;
      }
    }
  };
})();
