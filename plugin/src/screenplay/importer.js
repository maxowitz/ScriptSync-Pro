/**
 * ScriptSync Pro - Screenplay Importer
 * Parses .fountain format and structured JSON screenplays.
 */

const ScreenplayImporter = (() => {

  /**
   * Parse Fountain-format screenplay text.
   * Fountain spec: scene headings (INT./EXT.), character names (CAPS), dialogue (indented).
   */
  function parseFountain(text) {
    const lines = text.split('\n');
    const scenes = [];
    let currentScene = null;
    let sceneCounter = 0;
    let title = '';
    let author = '';
    let i = 0;

    // Parse optional title page (key: value pairs at the start)
    while (i < lines.length) {
      const line = lines[i].trim();
      if (line === '') { i++; continue; }
      const titleMatch = line.match(/^Title:\s*(.+)/i);
      if (titleMatch) { title = titleMatch[1].trim(); i++; continue; }
      const authorMatch = line.match(/^(?:Author|Credit):\s*(.+)/i);
      if (authorMatch) { author = authorMatch[1].trim(); i++; continue; }
      // If this line doesn't look like a title page entry, break
      if (!line.match(/^[A-Za-z]+:\s*.+/)) break;
      i++;
    }

    while (i < lines.length) {
      const line = lines[i];
      const trimmed = line.trim();

      // Empty line
      if (trimmed === '') {
        i++;
        continue;
      }

      // Scene heading: starts with INT., EXT., INT/EXT., I/E., EST.
      // Or forced with a leading .
      const sceneHeadingPattern = /^(INT\.|EXT\.|INT\/EXT\.|I\/E\.|EST\.|\.)(.+)/i;
      const sceneMatch = trimmed.match(sceneHeadingPattern);
      if (sceneMatch) {
        sceneCounter++;
        // Check for explicit scene number: #1# or #1A#
        let heading = trimmed;
        let sceneNum = sceneCounter;
        const numMatch = trimmed.match(/#(\d+[A-Z]?)#\s*$/);
        if (numMatch) {
          sceneNum = parseInt(numMatch[1], 10) || sceneCounter;
          heading = trimmed.replace(/#\d+[A-Z]?#\s*$/, '').trim();
        }

        currentScene = new Scene({
          sceneNumber: sceneNum,
          heading: heading,
          elements: []
        });
        scenes.push(currentScene);
        i++;
        continue;
      }

      // If no scene yet, create a default one
      if (!currentScene) {
        sceneCounter++;
        currentScene = new Scene({
          sceneNumber: sceneCounter,
          heading: 'UNTITLED SCENE',
          elements: []
        });
        scenes.push(currentScene);
      }

      // Transition: ends with TO: or is > prefixed
      if (trimmed.match(/^>/) || trimmed.match(/TO:$/)) {
        currentScene.elements.push(new Transition({
          text: trimmed.replace(/^>\s*/, '')
        }));
        i++;
        continue;
      }

      // Character name: all uppercase, possibly with (V.O.) or (O.S.)
      // Must be preceded by an empty line (or start of scene)
      const isUpperCase = trimmed === trimmed.toUpperCase() &&
                          trimmed.length > 1 &&
                          /^[A-Z]/.test(trimmed) &&
                          !trimmed.match(/^(INT\.|EXT\.|FADE|CUT)/);
      // Also check for @ forced character
      const forcedChar = trimmed.startsWith('@');

      if (isUpperCase || forcedChar) {
        const charName = forcedChar ? trimmed.slice(1).trim() : trimmed;

        // Look ahead for parenthetical and dialogue
        i++;
        let parenthetical = '';
        let dialogueText = '';

        // Check for parenthetical
        if (i < lines.length && lines[i].trim().startsWith('(') && lines[i].trim().endsWith(')')) {
          parenthetical = lines[i].trim().slice(1, -1);
          i++;
        }

        // Collect dialogue lines until empty line or next element
        const dialogueParts = [];
        while (i < lines.length && lines[i].trim() !== '') {
          const dLine = lines[i].trim();
          // Stop if this looks like a new character or scene heading
          if (dLine === dLine.toUpperCase() && dLine.length > 1 && /^[A-Z]/.test(dLine)) break;
          if (dLine.match(/^(INT\.|EXT\.|INT\/EXT\.|I\/E\.|EST\.)/i)) break;
          dialogueParts.push(dLine);
          i++;
        }
        dialogueText = dialogueParts.join(' ');

        if (dialogueText) {
          currentScene.elements.push(new DialogueLine({
            character: charName.replace(/\s*\(.*\)\s*$/, ''), // Remove (V.O.) etc from stored name
            text: dialogueText,
            parenthetical: parenthetical
          }));
        }
        continue;
      }

      // Action (default)
      const actionParts = [trimmed];
      i++;
      // Collect consecutive non-empty lines as part of the same action block
      while (i < lines.length && lines[i].trim() !== '' &&
             !lines[i].trim().match(/^(INT\.|EXT\.|INT\/EXT\.|I\/E\.|EST\.)/i)) {
        const nextTrimmed = lines[i].trim();
        // Break if it looks like a character name
        if (nextTrimmed === nextTrimmed.toUpperCase() && nextTrimmed.length > 1 && /^[A-Z]/.test(nextTrimmed)) break;
        actionParts.push(nextTrimmed);
        i++;
      }

      currentScene.elements.push(new Action({
        text: actionParts.join(' ')
      }));
    }

    return new ScreenplayData({ title, author, scenes });
  }

  /**
   * Parse structured JSON format from cloud API.
   */
  function parseJSON(jsonData) {
    if (typeof jsonData === 'string') {
      jsonData = JSON.parse(jsonData);
    }
    return ScreenplayData.fromJSON(jsonData);
  }

  /**
   * Auto-detect format and parse.
   */
  function parse(input) {
    if (typeof input === 'string') {
      // Check if it's JSON
      const trimmed = input.trim();
      if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
        try {
          const parsed = JSON.parse(trimmed);
          return parseJSON(parsed);
        } catch (e) {
          // Not valid JSON, treat as Fountain
        }
      }
      return parseFountain(input);
    }

    if (typeof input === 'object') {
      return parseJSON(input);
    }

    throw new Error('Unsupported screenplay format');
  }

  return {
    parseFountain,
    parseJSON,
    parse
  };
})();
