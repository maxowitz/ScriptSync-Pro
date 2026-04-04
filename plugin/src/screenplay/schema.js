/**
 * ScriptSync Pro - Screenplay Data Schema
 * Data structures for screenplay representation.
 */

class DialogueLine {
  constructor({ character = '', text = '', parenthetical = '', id = null }) {
    this.id = id || `dl_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
    this.type = 'dialogue';
    this.character = character;
    this.text = text;
    this.parenthetical = parenthetical;
  }

  toJSON() {
    return {
      id: this.id,
      type: this.type,
      character: this.character,
      text: this.text,
      parenthetical: this.parenthetical
    };
  }

  static fromJSON(data) {
    return new DialogueLine(data);
  }
}

class Action {
  constructor({ text = '', id = null }) {
    this.id = id || `act_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
    this.type = 'action';
    this.text = text;
  }

  toJSON() {
    return { id: this.id, type: this.type, text: this.text };
  }

  static fromJSON(data) {
    return new Action(data);
  }
}

class Transition {
  constructor({ text = '', id = null }) {
    this.id = id || `tr_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
    this.type = 'transition';
    this.text = text;
  }

  toJSON() {
    return { id: this.id, type: this.type, text: this.text };
  }

  static fromJSON(data) {
    return new Transition(data);
  }
}

class Scene {
  constructor({ sceneNumber = 0, heading = '', elements = [], id = null }) {
    this.id = id || `sc_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
    this.sceneNumber = sceneNumber;
    this.heading = heading;
    this.elements = elements;
  }

  getDialogueLines() {
    return this.elements.filter(el => el.type === 'dialogue');
  }

  getActions() {
    return this.elements.filter(el => el.type === 'action');
  }

  toJSON() {
    return {
      id: this.id,
      sceneNumber: this.sceneNumber,
      heading: this.heading,
      elements: this.elements.map(el => el.toJSON ? el.toJSON() : el)
    };
  }

  static fromJSON(data) {
    const elements = (data.elements || []).map(el => {
      switch (el.type) {
        case 'dialogue': return DialogueLine.fromJSON(el);
        case 'action': return Action.fromJSON(el);
        case 'transition': return Transition.fromJSON(el);
        default: return el;
      }
    });
    return new Scene({ ...data, elements });
  }
}

class ScreenplayData {
  constructor({ title = '', author = '', scenes = [], id = null }) {
    this.id = id || `sp_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
    this.title = title;
    this.author = author;
    this.scenes = scenes;
  }

  getAllDialogueLines() {
    const lines = [];
    this.scenes.forEach(scene => {
      scene.getDialogueLines().forEach(dl => {
        lines.push({ ...dl, sceneId: scene.id, sceneNumber: scene.sceneNumber });
      });
    });
    return lines;
  }

  getSceneByNumber(num) {
    return this.scenes.find(s => s.sceneNumber === num);
  }

  getDialogueLineById(id) {
    for (const scene of this.scenes) {
      const dl = scene.elements.find(el => el.id === id);
      if (dl) return dl;
    }
    return null;
  }

  toJSON() {
    return {
      id: this.id,
      title: this.title,
      author: this.author,
      scenes: this.scenes.map(s => s.toJSON ? s.toJSON() : s)
    };
  }

  static fromJSON(data) {
    const scenes = (data.scenes || []).map(s => Scene.fromJSON(s));
    return new ScreenplayData({ ...data, scenes });
  }
}
