/**
 * ScriptSync Pro - Clip Name Parser
 * Extracts shot/take/scene info from clip filenames.
 */

const ClipNameParser = (() => {
  // Built-in patterns — order matters (more specific patterns first)
  const PATTERNS = [
    {
      name: 'Scene_Shot_Take',
      // Scene01_Shot02_Take03.mov
      regex: /Scene\s*(\d+)[_\-\s]*Shot\s*(\d+)[_\-\s]*Take\s*(\d+)/i,
      extract: (m) => ({ scene: parseInt(m[1]), shot: parseInt(m[2]), take: parseInt(m[3]), camera: null, reel: null })
    },
    {
      name: 'ARRI',
      // A002C011_240618_RPSM.mov — camera A, reel 002, clip 011
      regex: /^([A-Z])(\d{3})C(\d{3,4})/i,
      extract: (m) => ({ scene: null, shot: parseInt(m[3]), take: null, camera: m[1].toUpperCase(), reel: m[2] })
    },
    {
      name: 'RED',
      // A001_C002.R3D — camera A, reel 001, clip 002
      regex: /^([A-Z])(\d{3})[_\-]C(\d{3})/i,
      extract: (m) => ({ scene: null, shot: parseInt(m[3]), take: null, camera: m[1].toUpperCase(), reel: m[2] })
    },
    {
      // FIX: Production sound convention — 21A-003.WAV = Scene 21A, Take 003
      name: 'ProductionSound',
      regex: /^(\d+[A-Z]?)[_\-](\d{2,3})$/i,
      extract: (m) => ({ scene: m[1], shot: null, take: parseInt(m[2]), camera: null, reel: null })
    },
    {
      name: 'Shot_Take',
      // Shot5_Take2.mp4
      regex: /Shot\s*(\d+)[_\-\s]*Take\s*(\d+)/i,
      extract: (m) => ({ scene: null, shot: parseInt(m[1]), take: parseInt(m[2]), camera: null, reel: null })
    },
    {
      name: 'SceneShot',
      // S01_S02 or Sc1_Sh2
      regex: /S(?:c|cene)?\s*(\d+)[_\-\s]*S(?:h|hot)?\s*(\d+)/i,
      extract: (m) => ({ scene: parseInt(m[1]), shot: parseInt(m[2]), take: null, camera: null, reel: null })
    },
    {
      name: 'Take_Only',
      // Take03 or T3
      regex: /(?:Take|Tk|T)\s*(\d+)/i,
      extract: (m) => ({ scene: null, shot: null, take: parseInt(m[1]), camera: null, reel: null })
    },
    {
      name: 'Shot_Only',
      // Shot03 or Sh3
      regex: /(?:Shot|Sh)\s*(\d+)/i,
      extract: (m) => ({ scene: null, shot: parseInt(m[1]), take: null, camera: null, reel: null })
    }
  ];

  let customPatterns = [];

  /**
   * Strip file extension from filename.
   */
  function stripExtension(filename) {
    const dotIndex = filename.lastIndexOf('.');
    if (dotIndex > 0) {
      return filename.substring(0, dotIndex);
    }
    return filename;
  }

  return {
    /**
     * Parse a clip filename for shot/take/scene info.
     * Tries each pattern in order, returns first match.
     */
    parse(filename) {
      const baseName = stripExtension(filename);

      // Try custom patterns first
      for (const cp of customPatterns) {
        try {
          const regex = new RegExp(cp.pattern, 'i');
          const match = baseName.match(regex);
          if (match) {
            return {
              name: baseName,
              scene: cp.sceneGroup ? parseInt(match[cp.sceneGroup]) || null : null,
              shot: cp.shotGroup ? parseInt(match[cp.shotGroup]) || null : null,
              take: cp.takeGroup ? parseInt(match[cp.takeGroup]) || null : null,
              camera: cp.cameraGroup ? match[cp.cameraGroup] : null,
              patternName: cp.name || 'custom',
              originalFilename: filename
            };
          }
        } catch (e) {
          console.warn('[NameParser] Invalid custom pattern:', cp, e);
        }
      }

      // Try built-in patterns
      for (const pattern of PATTERNS) {
        const match = baseName.match(pattern.regex);
        if (match) {
          const extracted = pattern.extract(match);
          return {
            name: baseName,
            reel: null,
            ...extracted,
            patternName: pattern.name,
            originalFilename: filename
          };
        }
      }

      // Fallback: no pattern matched — never throws
      return {
        name: baseName,
        scene: null,
        shot: null,
        take: null,
        camera: null,
        reel: null,
        patternName: 'none',
        originalFilename: filename
      };
    },

    /**
     * Set custom parsing patterns from settings.
     * Each pattern: { name, pattern (regex string), sceneGroup, shotGroup, takeGroup, cameraGroup }
     */
    setCustomPatterns(patterns) {
      customPatterns = patterns || [];
    },

    /**
     * Get all available pattern names.
     */
    getPatternNames() {
      const builtIn = PATTERNS.map(p => p.name);
      const custom = customPatterns.map(p => p.name || 'custom');
      return [...custom, ...builtIn];
    },

    /**
     * Test a filename against all patterns and return all matches.
     */
    testAll(filename) {
      const baseName = stripExtension(filename);
      const results = [];

      for (const pattern of PATTERNS) {
        const match = baseName.match(pattern.regex);
        if (match) {
          results.push({
            patternName: pattern.name,
            ...pattern.extract(match)
          });
        }
      }

      return results;
    },

    /**
     * Format shot/take info as a display string.
     */
    formatInfo(parsed) {
      const parts = [];
      if (parsed.scene != null) parts.push(`Sc${parsed.scene}`);
      if (parsed.shot != null) parts.push(`Sh${parsed.shot}`);
      if (parsed.take != null) parts.push(`Tk${parsed.take}`);
      if (parsed.camera) parts.push(`Cam${parsed.camera}`);
      if (parsed.reel) parts.push(`R${parsed.reel}`);
      return parts.length > 0 ? parts.join(' / ') : parsed.name;
    }
  };
})();
