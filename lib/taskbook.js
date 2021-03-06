#!/usr/bin/env node
'use strict';
const Task = require('./task');
const Note = require('./note');
const Storage = require('./storage');
const render = require('./render');

class Taskbook {
  constructor() {
    this._storage = new Storage();
  }

  get _archive() {
    return this._storage.getArchive();
  }

  get _data() {
    return this._storage.get();
  }

  _arrayify(x) {
    return Array.isArray(x) ? x : [x];
  }

  _save(data) {
    this._storage.set(data);
  }

  _saveArchive(data) {
    this._storage.setArchive(data);
  }

  _removeDuplicates(x) {
    return [...new Set(this._arrayify(x))];
  }

  _generateID(data = this._data) {
    const ids = Object.keys(data).map(id => parseInt(id, 10));
    const max = (ids.length === 0) ? 0 : Math.max(...ids);
    return max + 1;
  }

  _validateIDs(inputIDs, existingIDs = this._getIDs()) {
    if (inputIDs.length === 0) {
      render.missingID();
      process.exit(1);
    }

    inputIDs = this._removeDuplicates(inputIDs);

    inputIDs.forEach(id => {
      if (existingIDs.indexOf(parseInt(id, 10)) === -1) {
        render.invalidID(id);
        process.exit(1);
      }
    });

    return inputIDs;
  }

  _isPriorityOpt(x) {
    return ['p:1', 'p:2', 'p:3'].indexOf(x) > -1;
  }

  _getBoards() {
    const boards = ['My Board'];

    Object.entries(this._data).forEach(([_, item]) => {
      boards.push(...item.boards.filter(x => boards.indexOf(x) === -1));
    });

    return boards;
  }

  _getDates(data = this._data) {
    const dates = [];

    Object.entries(data).forEach(([_, item]) => {
      if (dates.indexOf(item._date) === -1) {
        dates.push(item._date);
      }
    });

    return dates;
  }

  _getIDs(data = this._data) {
    return Object.keys(data).map(id => parseInt(id, 10));
  }

  _getPriority(desc) {
    const opt = desc.find(x => this._isPriorityOpt(x));
    return opt ? opt[opt.length - 1] : 1;
  }

  _getOptions(input) {
    const [boards, desc] = [[], []];

    if (input.length === 0) {
      render.missingDesc();
      process.exit(1);
    }

    const id = this._generateID();
    const priority = this._getPriority(input);

    input.forEach(x => {
      if (!this._isPriorityOpt(x)) {
        return x.startsWith('@') && x.length > 1 ? boards.push(x) : desc.push(x);
      }
    });

    const description = desc.join(' ');

    if (boards.length === 0) {
      boards.push('My Board');
    }

    return {boards, description, id, priority};
  }

  _getStats() {
    let [complete, pending, notes] = [0, 0, 0];

    Object.entries(this._data).forEach(([_, item]) => {
      if (item._isTask) {
        return item.isComplete ? complete++ : pending++;
      }
      return notes++;
    });

    const total = complete + pending;
    const percent = (total === 0) ? 0 : Math.floor(complete * 100 / total);

    return {percent, complete, pending, notes};
  }

  _hasTerms(string, terms) {
    let result;

    terms.forEach((term, key, arr) => {
      if (string.toLowerCase().indexOf(term) > -1) {
        result = (key === arr.length - 1) ? string : '';
      }
    });

    return result;
  }

  _filterTask(data) {
    Object.entries(data).forEach(([id, item]) => {
      if (!item._isTask) {
        delete data[id];
      }
    });
    return data;
  }

  _filterStarred(data) {
    Object.entries(data).forEach(([id, item]) => {
      if (!item.isStarred) {
        delete data[id];
      }
    });
    return data;
  }

  _filterComplete(data) {
    Object.entries(data).forEach(([id, item]) => {
      if (!item._isTask || !item.isComplete) {
        delete data[id];
      }
    });
    return data;
  }

  _filterPending(data) {
    Object.entries(data).forEach(([id, item]) => {
      if (!item._isTask || item.isComplete) {
        delete data[id];
      }
    });
    return data;
  }

  _filterNote(data) {
    Object.entries(data).forEach(([id, item]) => {
      if (item._isTask) {
        delete data[id];
      }
    });
    return data;
  }

  _filterByAttributes(attr, data = this._data) {
    if (Object.keys(data).length === 0) {
      return data;
    }

    attr.forEach(x => {
      switch (x) {
        case 'star':
        case 'starred':
          data = this._filterStarred(data);
          break;

        case 'done':
        case 'checked':
        case 'complete':
          data = this._filterComplete(data);
          break;

        case 'pending':
        case 'unchecked':
        case 'incomplete':
          data = this._filterPending(data);
          break;

        case 'todo':
        case 'task':
        case 'tasks':
          data = this._filterTask(data);
          break;

        case 'note':
        case 'notes':
          data = this._filterNote(data);
          break;

        default:
          break;
      }
    });

    return data;
  }

  _groupByBoard(data = this._data, boards = this._getBoards()) {
    const grouped = {};

    if (boards.length === 0) {
      boards = this._getBoards();
    }

    Object.entries(data).forEach(([_, item]) => {
      boards.forEach(board => {
        if (item.boards.includes(board)) {
          if (Array.isArray(grouped[board])) {
            return grouped[board].push(item);
          }
          grouped[board] = [item];
          return grouped[board];
        }
      });
    });

    return grouped;
  }

  _groupByDate(data = this._data, dates = this._getDates()) {
    const grouped = {};

    Object.entries(data).forEach(([_, item]) => {
      dates.forEach(date => {
        if (item._date === date) {
          if (Array.isArray(grouped[date])) {
            return grouped[date].push(item);
          }
          grouped[date] = [item];
          return grouped[item];
        }
      });
    });

    return grouped;
  }

  _saveItemToArchive(item) {
    const {_archive} = this;
    const archiveID = this._generateID(_archive);

    item._id = archiveID;
    _archive[archiveID] = item;

    this._saveArchive(_archive);
  }

  _saveItemToStorage(item) {
    const {_data} = this;
    const restoreID = this._generateID();

    item._id = restoreID;
    _data[restoreID] = item;

    this._save(_data);
  }

  createNote(desc) {
    const {id, description, boards} = this._getOptions(desc);
    const note = new Note({id, description, boards});
    const {_data} = this;
    _data[id] = note;
    this._save(_data);
    render.successCreate(note);
  }

  checkTasks(ids) {
    ids = this._validateIDs(ids);
    const {_data} = this;

    ids.forEach(id => {
      _data[id].isComplete = !_data[id].isComplete;
    });

    this._save(_data);
    render.markComplete(ids);
  }

  createTask(desc) {
    const {boards, description, id, priority} = this._getOptions(desc);
    const task = new Task({id, description, boards, priority});
    const {_data} = this;
    _data[id] = task;
    this._save(_data);
    render.successCreate(task);
  }

  deleteItems(ids) {
    ids = this._validateIDs(ids);
    const {_data} = this;

    ids.forEach(id => {
      this._saveItemToArchive(_data[id]);
      delete _data[id];
    });

    this._save(_data);
    render.successDelete(ids);
  }

  displayArchive() {
    render.displayByDate(this._groupByDate(this._archive, this._getDates(this._archive)));
  }

  displayByBoard() {
    render.displayByBoard(this._groupByBoard());
  }

  displayByDate() {
    render.displayByDate(this._groupByDate());
  }

  displayStats() {
    render.displayStats(this._getStats());
  }

  editDescription(input) {
    const targets = input.filter(x => x.startsWith('@'));

    if (targets.length === 0) {
      render.missingID();
      process.exit(1);
    }

    if (targets.length > 1) {
      render.invalidIDsNumber();
      process.exit(1);
    }

    const [target] = targets;
    const id = this._validateIDs(target.replace('@', ''));
    const newDesc = input.filter(x => x !== target).join(' ');

    if (newDesc.length === 0) {
      render.missingDesc();
      process.exit(1);
    }

    const {_data} = this;
    _data[id].description = newDesc;
    this._save(_data);
    render.successEdit(id);
  }

  findItems(terms) {
    const result = {};

    Object.entries(this._data).forEach(([id, item]) => {
      if (!this._hasTerms(item.description, terms)) {
        return;
      }
      result[id] = item;
    });

    render.displayByBoard(this._groupByBoard(result));
  }

  listByAttributes(terms) {
    let [boards, attributes] = [[], []];
    const storedBoards = this._getBoards();

    terms.forEach(x => {
      if (storedBoards.indexOf(`@${x}`) === -1) {
        return x === 'myboard' ? boards.push('My Board') : attributes.push(x);
      }
      return boards.push(`@${x}`);
    });

    [boards, attributes] = [boards, attributes].map(x => this._removeDuplicates(x));

    const data = this._filterByAttributes(attributes);
    render.displayByBoard(this._groupByBoard(data, boards));
  }

  moveBoards(input) {
    let boards = [];
    const targets = input.filter(x => x.startsWith('@'));

    if (targets.length === 0) {
      render.missingID();
      process.exit(1);
    }

    if (targets.length > 1) {
      render.invalidIDsNumber();
      process.exit(1);
    }

    const [target] = targets;
    const id = this._validateIDs(target.replace('@', ''));

    input.filter(x => x !== target).forEach(x => {
      boards.push(x === 'myboard' ? 'My Board' : `@${x}`);
    });

    if (boards.length === 0) {
      render.missingBoards();
      process.exit(1);
    }

    boards = this._removeDuplicates(boards);

    const {_data} = this;
    _data[id].boards = boards;
    this._save(_data);
    render.successMove(id, boards);
  }

  restoreItems(ids) {
    ids = this._validateIDs(ids, this._getIDs(this._archive));
    const {_archive} = this;

    ids.forEach(id => {
      this._saveItemToStorage(_archive[id]);
      delete _archive[id];
    });

    this._saveArchive(_archive);
    render.successRestore(ids);
  }

  starItems(ids) {
    ids = this._validateIDs(ids);
    const {_data} = this;

    ids.forEach(id => {
      _data[id].isStarred = !_data[id].isStarred;
    });

    this._save(_data);
    render.markStarred(ids);
  }

  updatePriority(input) {
    const level = input.find(x => ['1', '2', '3'].indexOf(x) > -1);

    if (!level) {
      render.invalidPriority();
      process.exit(1);
    }

    const targets = input.filter(x => x.startsWith('@'));

    if (targets.length === 0) {
      render.missingID();
      process.exit(1);
    }

    if (targets.length > 1) {
      render.invalidIDsNumber();
      process.exit(1);
    }

    const [target] = targets;
    const id = this._validateIDs(target.replace('@', ''));

    const {_data} = this;
    _data[id].priority = level;
    this._save(_data);
    render.successPriority(id, level);
  }
}

module.exports = new Taskbook();
