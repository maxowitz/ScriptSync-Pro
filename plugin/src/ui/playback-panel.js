/**
 * ScriptSync Pro - Playback Panel
 * Controls Premiere Pro playback and displays timecode.
 * FIX: Uses require("premierepro") — correct module for Premiere Pro 2024+.
 */

const PlaybackPanel = (() => {
  let _currentTimecode = 0;
  let _totalDuration = 0;
  let _fps = 24;
  let _mappedRegions = [];
  let _pollInterval = null;

  function render() {
    const root = document.getElementById('playback-panel-root');
    if (!root) return;

    root.innerHTML = `
      <div class="playback-panel">
        <div id="timecode-display" class="timecode-display">00:00:00:00</div>
        <div class="playback-controls">
          <button id="btn-prev-mapping" class="btn btn-sm btn-secondary" title="Previous mapping">⏮</button>
          <button id="btn-step-back" class="btn btn-sm btn-secondary" title="Step back">◀</button>
          <button id="btn-play-pause" class="btn btn-sm btn-primary" title="Play/Pause">▶</button>
          <button id="btn-step-forward" class="btn btn-sm btn-secondary" title="Step forward">▶▶</button>
          <button id="btn-next-mapping" class="btn btn-sm btn-secondary" title="Next mapping">⏭</button>
        </div>
        <div class="timeline-container">
          <div class="timeline-bar" id="timeline-bar">
            <div class="timeline-playhead" id="timeline-playhead"></div>
          </div>
          <div class="timeline-labels">
            <span>00:00:00:00</span>
            <span id="timeline-end">00:00:00:00</span>
          </div>
        </div>
        <div id="mapped-regions-list" class="mapped-regions-list"></div>
      </div>
    `;

    // Bind controls
    document.getElementById('btn-play-pause')?.addEventListener('click', togglePlayPause);
    document.getElementById('btn-step-back')?.addEventListener('click', () => stepFrames(-1));
    document.getElementById('btn-step-forward')?.addEventListener('click', () => stepFrames(1));
    document.getElementById('btn-prev-mapping')?.addEventListener('click', jumpToPrevMapping);
    document.getElementById('btn-next-mapping')?.addEventListener('click', jumpToNextMapping);

    // Start polling playhead position
    startPolling();
  }

  function startPolling() {
    if (_pollInterval) clearInterval(_pollInterval);
    _pollInterval = setInterval(pollPlayhead, 250);
  }

  async function pollPlayhead() {
    try {
      const ppro = require('premierepro');
      const project = await ppro.Project.getActiveProject();
      if (!project) return;
      const seq = await project.getActiveSequence();
      if (!seq) return;

      // Get player position — API may vary by version
      if (seq.getPlayerPosition) {
        const pos = await seq.getPlayerPosition();
        if (pos) _currentTimecode = pos.seconds || 0;
      }

      updateTimecodeDisplay();
      updatePlayhead();
    } catch (e) {
      // Premiere API not available; keep last known values
    }
  }

  function updateTimecodeDisplay() {
    const el = document.getElementById('timecode-display');
    if (el) {
      el.textContent = TimecodeUtils.secondsToTimecode(_currentTimecode, _fps);
    }
  }

  function updatePlayhead() {
    if (_totalDuration <= 0) return;
    const playhead = document.getElementById('timeline-playhead');
    if (playhead) {
      const percent = (_currentTimecode / _totalDuration) * 100;
      playhead.style.left = `${Math.min(100, Math.max(0, percent))}%`;
    }
    const endEl = document.getElementById('timeline-end');
    if (endEl) {
      endEl.textContent = TimecodeUtils.secondsToTimecode(_totalDuration, _fps);
    }
  }

  async function togglePlayPause() {
    try {
      const ppro = require('premierepro');
      const project = await ppro.Project.getActiveProject();
      if (!project) return;
      // Use menu command for play/pause if available
      console.log('[PlaybackPanel] Play/Pause triggered');
    } catch (e) {
      console.warn('[PlaybackPanel] Cannot control playback:', e.message);
    }
  }

  async function stepFrames(count) {
    const frameDuration = 1 / _fps;
    const newTime = Math.max(0, _currentTimecode + (count * frameDuration));
    await seekTo(newTime);
  }

  async function seekTo(seconds) {
    try {
      const ppro = require('premierepro');
      const project = await ppro.Project.getActiveProject();
      if (!project) return;
      const seq = await project.getActiveSequence();
      if (seq && seq.setPlayerPosition) {
        await seq.setPlayerPosition(seconds.toString());
      }
      _currentTimecode = seconds;
      updateTimecodeDisplay();
      updatePlayhead();
    } catch (e) {
      console.warn('[PlaybackPanel] Cannot seek:', e.message);
      _currentTimecode = seconds;
      updateTimecodeDisplay();
      updatePlayhead();
    }
  }

  function jumpToPrevMapping() {
    if (_mappedRegions.length === 0) return;
    const prev = _mappedRegions
      .filter(r => parseFloat(r.start) < _currentTimecode - 0.1)
      .pop();
    if (prev) seekTo(parseFloat(prev.start));
  }

  function jumpToNextMapping() {
    if (_mappedRegions.length === 0) return;
    const next = _mappedRegions
      .find(r => parseFloat(r.start) > _currentTimecode + 0.1);
    if (next) seekTo(parseFloat(next.start));
  }

  function setMappedRegions(regions) {
    _mappedRegions = regions || [];
    renderMappedRegions();
  }

  function renderMappedRegions() {
    const container = document.getElementById('mapped-regions-list');
    if (!container) return;

    if (_mappedRegions.length === 0) {
      container.innerHTML = '<div class="empty-hint">No mapped regions</div>';
      return;
    }

    container.innerHTML = _mappedRegions.map(r => `
      <div class="mapped-region-item" data-start="${r.start}" style="cursor:pointer;">
        <span class="region-label">${r.label || 'Mapped'}</span>
        <span class="region-tc">${r.start || '--'}</span>
      </div>
    `).join('');

    container.querySelectorAll('.mapped-region-item').forEach(item => {
      item.addEventListener('click', () => {
        seekTo(parseFloat(item.dataset.start) || 0);
      });
    });
  }

  function setFPS(fps) {
    _fps = fps || 24;
  }

  return {
    render,
    setMappedRegions,
    setFPS,
    seekTo,
  };
})();
