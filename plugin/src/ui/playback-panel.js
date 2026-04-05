/**
 * ScriptSync Pro - Playback Control Panel
 * Timecode display, playhead control, and mini timeline.
 */

const PlaybackPanel = (() => {
  let _currentTimecode = 0;
  let _totalDuration = 0;
  let _mappedRegions = [];
  let _fps = 24;
  let _pollTimer = null;

  function getRoot() {
    return document.getElementById('playback-panel-root');
  }

  function render() {
    const root = getRoot();
    if (!root) return;

    root.innerHTML = `
      <div class="panel-section">
        <div class="panel-section-header">
          <span class="panel-section-title">Playback</span>
        </div>

        <div class="timecode-display" id="timecode-display">00:00:00:00</div>

        <div class="playback-controls">
          <button class="btn btn-icon" id="btn-prev-mapping" title="Previous Mapped Point">\u23EE</button>
          <button class="btn btn-icon" id="btn-step-back" title="Step Back">\u23EA</button>
          <button class="btn btn-primary" id="btn-play-pause" title="Play/Pause">\u25B6</button>
          <button class="btn btn-icon" id="btn-step-forward" title="Step Forward">\u23E9</button>
          <button class="btn btn-icon" id="btn-next-mapping" title="Next Mapped Point">\u23ED</button>
        </div>

        <div class="mini-timeline" id="mini-timeline">
          <div class="playhead" id="timeline-playhead" style="left:0%"></div>
        </div>

        <div style="display:flex; justify-content:space-between; font-size:10px; color:var(--text-muted);">
          <span id="timeline-start">00:00:00:00</span>
          <span id="timeline-end">00:00:00:00</span>
        </div>

        <div style="margin-top:12px;">
          <div class="panel-section-title" style="font-size:11px; margin-bottom:8px;">Mapped Regions</div>
          <div id="mapped-regions-list" style="max-height:120px; overflow-y:auto;"></div>
        </div>
      </div>
    `;

    // Bind controls
    document.getElementById('btn-play-pause').addEventListener('click', togglePlayPause);
    document.getElementById('btn-step-back').addEventListener('click', () => stepFrames(-1));
    document.getElementById('btn-step-forward').addEventListener('click', () => stepFrames(1));
    document.getElementById('btn-prev-mapping').addEventListener('click', jumpToPrevMapping);
    document.getElementById('btn-next-mapping').addEventListener('click', jumpToNextMapping);

    // Click on mini timeline to seek
    document.getElementById('mini-timeline').addEventListener('click', (e) => {
      const rect = e.currentTarget.getBoundingClientRect();
      const ratio = (e.clientX - rect.left) / rect.width;
      seekTo(ratio * _totalDuration);
    });

    // Listen for jump-to events from other panels
    document.addEventListener('playback:jumpTo', (e) => {
      seekTo(e.detail.seconds);
    });

    // Start polling playhead position
    startPolling();
  }

  function startPolling() {
    stopPolling();
    _pollTimer = setInterval(pollPlayhead, 250);
  }

  function stopPolling() {
    if (_pollTimer) {
      clearInterval(_pollTimer);
      _pollTimer = null;
    }
  }

  function pollPlayhead() {
    try {
      const { app } = require('premiere');
      const seq = app.project.activeSequence;
      if (!seq) return;

      const playerPos = seq.getPlayerPosition();
      if (playerPos) {
        _currentTimecode = playerPos.seconds || 0;
      }

      _totalDuration = seq.end ? seq.end.seconds : 0;
      _fps = seq.frameSizeVertical ? 24 : 24; // Default to 24

      updateTimecodeDisplay();
      updatePlayhead();
    } catch (e) {
      // Premiere API not available; use last known values
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

  function togglePlayPause() {
    try {
      const { app } = require('premiere');
      const seq = app.project.activeSequence;
      if (seq) {
        // Toggle playback via QE API
        try {
          const qe = app.enableQE();
          const qeSeq = qe.project.getActiveSequence();
          if (qeSeq) {
            qeSeq.player.play();
          }
        } catch (e) {
          console.warn('[PlaybackPanel] QE API not available:', e.message);
        }
      }
    } catch (e) {
      console.warn('[PlaybackPanel] Cannot control playback:', e.message);
    }
  }

  function stepFrames(count) {
    try {
      const { app } = require('premiere');
      const seq = app.project.activeSequence;
      if (seq) {
        const frameDuration = 1 / _fps;
        const newTime = _currentTimecode + (count * frameDuration);
        seekTo(Math.max(0, newTime));
      }
    } catch (e) {
      console.warn('[PlaybackPanel] Cannot step frames:', e.message);
    }
  }

  function seekTo(seconds) {
    try {
      const { app } = require('premiere');
      const seq = app.project.activeSequence;
      if (seq && seq.setPlayerPosition) {
        seq.setPlayerPosition(seconds.toString());
        _currentTimecode = seconds;
        updateTimecodeDisplay();
        updatePlayhead();
      }
    } catch (e) {
      console.warn('[PlaybackPanel] Cannot seek:', e.message);
      _currentTimecode = seconds;
      updateTimecodeDisplay();
      updatePlayhead();
    }
  }

  function jumpToPrevMapping() {
    const sorted = [..._mappedRegions].sort((a, b) => a.start - b.start);
    for (let i = sorted.length - 1; i >= 0; i--) {
      if (sorted[i].start < _currentTimecode - 0.1) {
        seekTo(sorted[i].start);
        return;
      }
    }
    // Wrap to last
    if (sorted.length > 0) {
      seekTo(sorted[sorted.length - 1].start);
    }
  }

  function jumpToNextMapping() {
    const sorted = [..._mappedRegions].sort((a, b) => a.start - b.start);
    for (const region of sorted) {
      if (region.start > _currentTimecode + 0.1) {
        seekTo(region.start);
        return;
      }
    }
    // Wrap to first
    if (sorted.length > 0) {
      seekTo(sorted[0].start);
    }
  }

  function renderMappedRegions() {
    const timeline = document.getElementById('mini-timeline');
    const listEl = document.getElementById('mapped-regions-list');
    if (!timeline || !listEl) return;

    // Clear existing region markers
    timeline.querySelectorAll('.timeline-region').forEach(el => el.remove());

    // Render regions on timeline
    if (_totalDuration > 0) {
      for (const region of _mappedRegions) {
        const left = (region.start / _totalDuration) * 100;
        const width = ((region.end - region.start) / _totalDuration) * 100;

        const regionEl = document.createElement('div');
        regionEl.className = 'timeline-region mapped';
        regionEl.style.left = `${left}%`;
        regionEl.style.width = `${Math.max(0.5, width)}%`;
        regionEl.title = region.label || '';
        timeline.appendChild(regionEl);
      }
    }

    // Render regions list
    if (_mappedRegions.length === 0) {
      listEl.innerHTML = '<div style="color:var(--text-muted); font-size:11px;">No mapped regions</div>';
    } else {
      listEl.innerHTML = _mappedRegions.map(r => `
        <div class="clip-item" style="cursor:pointer" data-start="${r.start}">
          <span class="clip-name">${escapeHtml(r.label || 'Region')}</span>
          <span class="clip-meta">${TimecodeUtils.secondsToTimecode(r.start, _fps)}</span>
        </div>
      `).join('');

      listEl.querySelectorAll('.clip-item').forEach(el => {
        el.addEventListener('click', () => seekTo(parseFloat(el.dataset.start)));
      });
    }
  }

  function escapeHtml(text) {
    if (!text) return '';
    return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  return {
    render,
    setMappedRegions(regions) {
      _mappedRegions = regions || [];
      renderMappedRegions();
    },
    setFPS(fps) { _fps = fps; },
    getCurrentTimecode() { return _currentTimecode; },
    seekTo,
    destroy() { stopPolling(); }
  };
})();
