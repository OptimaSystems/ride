{
  // session
  // holds a reference to a Monaco editor instance (.me)
  // and processes some of its commands (e.g. .ED(), .ER(), ...)
  function Se(ide) { // constructor
    const se = this;
    se.ide = ide;
    se.hist = [''];
    se.histIdx = 0;
    se.focusTS = 0;
    se.id = 0;
    se.decorations = [];
    // modified lines: lineNumber→originalContent
    // inserted lines: lineNumber→0 (also used in syn.js)
    se.dirty = {};
    se.isReadOnly = !1;
    se.lineEditor = {};
    se.multiLineBlocks = [];

    se.dom = document.createElement('div');
    se.dom.className = 'ride_win';
    se.$e = $(se.dom);
    D.createContextMenu(se.dom, se);
    const fs = D.zoom2fs[D.prf.zoom() + 10];
    const me = monaco.editor.create(se.dom, {
      acceptSuggestionOnCommitCharacter: true,
      acceptSuggestionOnEnter: 'off',
      autoClosingBrackets: !!D.prf.autoCloseBrackets(),
      automaticLayout: false,
      autoIndent: false,
      contextmenu: false,
      cursorStyle: D.prf.blockCursor() ? 'block' : 'line',
      cursorBlinking: D.prf.cursorBlinking(),
      emptySelectionClipboard: false,
      folding: false,
      fontFamily: 'apl',
      fontSize: fs,
      fixedOverflowWidgets: true,
      glyphMargin: se.breakpoints,
      iconsInSuggestions: false,
      language: 'apl-session',
      lineHeight: fs + 2,
      lineNumbers: 'off',
      matchBrackets: !!D.prf.matchBrackets(),
      minimap: {
        enabled: D.prf.minimapEnabled(),
        renderCharacters: D.prf.minimapRenderCharacters(),
        showSlider: D.prf.minimapShowSlider(),
      },
      mouseWheelZoom: false,
      quickSuggestions: D.prf.autocompletion() === 'classic',
      quickSuggestionsDelay: D.prf.autocompletionDelay(),
      renderIndentGuides: false,
      renderLineHighlight: D.prf.renderLineHighlight(),
      selectionHighlight: D.prf.selectionHighlight(),
      snippetSuggestions: D.prf.snippetSuggestions(),
      suggestOnTriggerCharacters: D.prf.autocompletion() === 'classic',
      useTabStops: false,
      wordBasedSuggestions: false,
      wordSeparators: D.wordSeparators,
      wordWrap: D.prf.wrap() ? 'on' : 'off',
      unusualLineTerminators: 'off',  // iss646: Prevent message prompt about unusual line endings
    });
    se.me = me;
    se.me_ready = new Promise((resolve) => {
      // ugly hack as monaco doesn't have a built in event for when the editor is ready?!
      // https://github.com/Microsoft/monaco-editor/issues/115
      const didScrollChangeDisposable = me.onDidScrollChange(() => {
        didScrollChangeDisposable.dispose();
        resolve(true);
      });
    });
    me.getModel().winid = 0;
    me.dyalogCmds = se;
    se.session = me.createContextKey('session', true);
    se.tracer = me.createContextKey('tracer', true);
    me.listen = true;
    se.oModel = monaco.editor.createModel('');
    D.remDefaultMap(me);
    D.mapScanCodes(me);
    D.mapKeys(se); D.prf.keys(D.mapKeys.bind(this, se));

    let mouseL = 0; let mouseC = 0; let mouseTS = 0;
    me.onMouseDown((e) => {
      const t = e.target;
      const mt = monaco.editor.MouseTargetType;
      if (e.event.middleButton) {
        e.event.preventDefault();
        e.event.stopPropagation();
      } else if (t.type === mt.CONTENT_TEXT) {
        const p = t.position;
        const l = p.lineNumber;
        const c = p.column;
        if (e.event.timestamp - mouseTS < 400 && mouseL === l && mouseC === c) {
          if (D.prf.doubleClickToEdit() && D.ide.cword(me, p)) {
            se.ED(me);
            me.setPosition(p);
          }
        }
        mouseL = l; mouseC = c; mouseTS = e.event.timestamp;
      }
    });
    me.onDidChangeModelContent((e) => {
      if (!me.listen || me.getModel().bqc) return;
      e.changes.forEach((c) => {
        const l0 = c.range.startLineNumber;
        const l1 = c.range.endLineNumber;
        let dl0 = l0;
        let dl1 = l1;
        const m = (l1 - l0) + 1;
        const text = c.text.split('\n');
        for (let i = 0; i < se.multiLineBlocks.length; i++) {
          const element = se.multiLineBlocks[i];
          if (l0 <= (element.end || 0) && l1 >= element.start) {
            dl0 = Math.min(dl0, element.start);
            dl1 = Math.max(dl1, element.end);
          }
        }
        let n = text.length;
        if (m < n) {
          const h = se.dirty;
          se.dirty = {};
          Object.keys(h).forEach((x) => { se.dirty[+x + ((n - m) * (+x > l1))] = h[x]; });
        } else if (n < m) {
          for (let j = n; j < m; j++) text.push(''); // pad shrinking changes with empty lines
          se.edit([{ range: new monaco.Range(l0 + n, 1, l0 + 1, 1), text: '\n'.repeat(m - n) }]);
          n = m;
        } 
        if (dl0 < l0 && !se.dirty[dl0]) {
          se.edit([{ range: new monaco.Range(dl0, 1, dl0, 1), text: ' '},
            { range: new monaco.Range(dl0, 1, dl0, 2), text: ''}]);
        }
        let l = dl0;
        while (l <= dl1) {
          const base = se.dirty;
          base[l] == null && (base[l] = se.oModel.getLineContent(l));
          l += 1;
        }
        while (l < l0 + n) se.dirty[l++] = 0;
        se.hl();
      });
    });
    me.onDidScrollChange((e) => {
      se.btm = se.me.getContentHeight() + e.scrollTop;
    });
    me.onDidFocusEditorText(() => { se.focusTS = +new Date(); se.ide.focusedWin = se; });
    me.onDidChangeCursorPosition(e => ide.setCursorPosition(e.position, se.me.getModel().getLineCount()));
    se.promptType = 0; // see ../docs/protocol.md #SetPromptType
    se.processAutocompleteReply = D.ac(me);
    // me.viewModel.viewLayout.constructor.LINES_HORIZONTAL_EXTRA_PX = 14;
    D.prf.wrap((x) => {
      se.me.updateOptions({ wordWrap: x ? 'on' : 'off' });
      se.me.revealLineInCenterIfOutsideViewport(se.me.getModel().getLineCount());
    });
    se.histRead();
    se.taBuffer = []; // type ahead buffer
    se.taReplay = () => {
      if (!se.taBuffer.length) return;
      const k = se.taBuffer.shift();
      if (typeof k === 'string') se.insert(k);
      else document.activeElement.dispatchEvent(k);
      setTimeout(se.taReplay, 1);
    };
  }
  Se.prototype = {
    histRead() {
      if (!D.el || !D.prf.persistentHistory()) return;
      const fs = nodeRequire('fs');
      const d = D.el.app.getPath('userData');
      const f = `${d}/hist.txt`;
      try {
        if (fs.existsSync(f)) {
          const l = fs.readFileSync(f, 'utf8').split('\n');
          this.histAdd(l);
        }
      } catch (e) { console.error(e); }
    },
    histWrite() {
      if (!D.el || !D.prf.persistentHistory()) return;
      const fs = nodeRequire('fs');
      const d = D.el.app.getPath('userData');
      const f = `${d}/hist.txt`;
      fs.writeFileSync(f, this.hist.slice(1, 1 + D.prf.persistentHistorySize()).join('\n'));
    },
    histAdd(lines) {
      this.hist[0] = '';
      this.hist.splice(...[1, 0].concat(lines));
      this.histIdx = 0;
    },
    histMove(d) { // go back or forward in history
      const se = this;
      const { me } = se;
      const model = me.getModel();
      const i = se.histIdx + d;
      const l = me.getPosition().lineNumber;
      if (i < 0 || i >= se.hist.length) {
        toastr.info('Reached end of history');
        return;
      }
      if (!se.histIdx) se.hist[0] = model.getLineContent(l);
      if (se.hist[i] == null) return;
      me.executeEdits('D', [{
        range: new monaco.Range(l, 1, l, model.getLineMaxColumn(l)),
        text: se.hist[i],
      }]);
      me.setPosition({ lineNumber: l, column: 1 + se.hist[i].search(/\S|$/) });
      se.histIdx = i;
    },
    hl() { // highlight modified lines
      const se = this;
      se.decorations = se.me.deltaDecorations(
        se.decorations,
        Object.keys(se.dirty).map(l => ({
          range: new monaco.Range(+l, 1, +l, 1),
          options: {
            isWholeLine: true,
            className: 'modified',
          },
        })),
      );
    },
    add(s, isEcho) { // append text to session
      const se = this;
      const { me } = se;
      const model = me.getModel();
      const l = model.getLineCount();
      const s0 = model.getLineContent(l);
      const cp = se.cursorPosition || me.getPosition();
      const ssp = '      ';
      let text;
      let scp = cp.column;
      if (se.promptType === 3 || se.promptType === 4) {
        text = s;
      } else {
        const res = (s0 === ssp) ? se.preProcessOutput({ line: '', column: 1, input: s })
          : se.preProcessOutput({ line: s0, column: scp, input: s });
        scp = res.column;
        text = res.text;
      }
      if (se.promptType === 3 && isEcho) {
        se.lastEchoLine = l;
        se.lineEditor[l] = true;
      }
      if (s[s.length - 1] === '\n' && se.promptType === 1) text += ssp;
      se.isReadOnly && me.updateOptions({ readOnly: false });
      if (this.dirty[l] != null) {
        se.edit([{ range: new monaco.Range(l, 1, l, 1 + s0.length), text: `${s0}\n${text}` }]);
        me.setPosition(cp);
      } else {
        se.edit([{ range: new monaco.Range(l, 1, l, 1 + s0.length), text }]);
        const ll = model.getLineCount();
        const lc = se.isReadOnly ? scp : model.getLineMaxColumn(ll);
        const ncp = { lineNumber: ll, column: lc };
        me.setPosition(ncp);
        se.isReadOnly && (se.cursorPosition = ncp);
        me.revealLine(ll);
        me.setScrollLeft(0);
        se.btm = Math.max(se.dom.clientHeight + me.getScrollTop(), me.getTopForLineNumber(ll));
      }
      se.isReadOnly && me.updateOptions({ readOnly: true });
      se.oModel.setValue(me.getValue());
      model._commandManager.clear();
    },
    edit(edits, sel) {
      const { me } = this;
      me.listen = false;
      me.executeEdits('D', edits, sel);
      me.listen = true;
    },
    preProcessOutput(args) {
      const { line, column, input } = args;
      const x = line.split('');
      let p = column - 1;
      let nl = 0;
      for (let i = 0; i < input.length; i++) {
        const c = input[i];
        if (c === '\b') {
          (p > 0) && (x[p - 1] !== '\n') && (p -= 1);
        } else if (c === '\n') {
          x[x.length] = c;
          p = x.length;
          nl = p;
        } else {
          x[p] = c;
          p += 1;
        }
      }
      return { text: x.join(''), column: p - nl + 1 };
    },
    prompt(x) {
      const se = this;
      const { me } = se;
      const model = me.getModel();
      const ssp = '      ';
      const line = model.getLineCount();
      const column = model.getLineMaxColumn(line);
      const t = model.getLineContent(line);
      const wasMultiLine = se.promptType === 3;
      const promptChanged = se.promptType !== x;
      se.promptType = x;
      se.isReadOnly = !x;
      me.updateOptions({
        readOnly: !x,
        quickSuggestions: [2, 4].includes(x) ? false : D.prf.autocompletion() === 'classic',
      });
      if (!wasMultiLine && x === 3) {
        const pl = line - 1;
        se.lineEditor[pl] = true;
        se.multiLineBlocks.push({ start: pl });
        se.edit([{ range: new monaco.Range(pl, 1, pl, 1), text: ' '},
            { range: new monaco.Range(pl, 1, pl, 2), text: ''}]);
      } else if (wasMultiLine && x !== 3) {
        se.multiLineBlocks[se.multiLineBlocks.length - 1].end = se.lastEchoLine;
      }
      if (promptChanged) {
        if (x) delete se.cursorPosition;
        else se.cursorPosition = me.getPosition();
      }
      if ((x === 1 && this.dirty[line] == null) || ![0, 1, 3, 4].includes(x)) {
        const isEmpty = /^\s*$/.test(t);
        const text = isEmpty ? ssp : `${t}\n${ssp}`;
        se.edit(
          [{ range: new monaco.Range(line, 1, line, column), text }],
          (promptChanged || !isEmpty)
            ? [new monaco.Selection(line + !isEmpty, 7, line + !isEmpty, 7)] : me.getSelections(),
        );
        se.oModel.setValue(me.getValue());
      } else if (t === ssp) {
        se.edit([{ range: new monaco.Range(line, 1, line, 7), text: '' }]);
      } else {
        me.setPosition({ lineNumber: line, column });
      }
      if (!x) {
        se.taBuffer.length = 0;
        se.taCb = se.taCb || me.onKeyDown((ke) => {
          const be = ke.browserEvent;
          const k = be.key;
          if (k.length === 1 && !be.ctrlKey && !be.altKey && !be.metaKey) se.taBuffer.push(k);
          else se.taBuffer.push(be);
        });
      } else {
        if (se.taCb) { se.taCb.dispose(); delete se.taCb; }
        se.taBuffer.length && se.taReplay();
      }
    },
    updSize() {
      const se = this;
      const { me } = se;
      const top = me.getScrollTop();
      const lh = me.getOption(monaco.editor.EditorOption.lineHeight);
      const ll = me.getModel().getLineCount();
      const llt = me.getTopForLineNumber(ll);
      const onbottom = (me.getPosition().lineNumber === ll) 
        && ((llt + lh + lh - top) > se.dom.clientHeight);
      me.layout({ width: se.dom.clientWidth, height: se.dom.clientHeight });
      const newHeight = me.getContentHeight();
      this.updPW();
      if (se.hadErrTmr) {
        me.revealLine(ll);
        this.btm = null;
      } else if (onbottom) {
        me.setScrollTop(0);
        this.btm = null;
        me.revealLine(ll);
      } else {
        const [{ startLineNumber }] = me.getVisibleRanges();
        const flt = me.getTopForLineNumber(startLineNumber);
        this.btm = flt + newHeight;
      }
    },
    updPW(force) {
      // force: -1 => delayed update (once gl size established)
      //         1 => immediate update
      const se = this;
      if (!D.prf.autoPW()) return;
      if (force === -1) { se.setPW = !0; return; }
      if (!se.setPW && force !== 1) return;
      const pw = Math.max(42, se.me.getLayoutInfo().viewportColumn);
      if (pw !== se.pw && se.ide.connected) D.send('SetPW', { pw: se.pw = pw });
      se.setPW = !1;
    },
    scrollCursorIntoView() {
      const { me } = this;
      setTimeout(() => { me.revealLine(me.getModel().getLineCount()); }, 1);
    },
    saveScrollPos() {
      // workaround for Monaco scrolling under GoldenLayout on Windows when editor is closed
      const { me } = this;
      if (this.btm == null) {
        this.btm = me.getScrollTop() + me.getContentHeight();
      }
    },
    restoreScrollPos() {
      if (this.btm != null) {
        this.me.setScrollTop(this.btm - this.me.getContentHeight());
      }
    },
    stateChanged() {
      const w = this;
      w.updSize();
      w.updGutters && w.updGutters();
      w.restoreScrollPos();
    },
    blockCursor(x) { this.me.updateOptions({ cursorStyle: x ? 'block' : 'line' }); },
    cursorBlinking(x) { this.me.updateOptions({ cursorBlinking: x }); },
    hasFocus() { return this.me.hasTextFocus(); },
    focus() {
      let q = this.container;
      let p = q && q.parent;
      const l = q && q.layoutManager;
      const m = l && l._maximisedItem;
      if (m && m !== (p && p.parent)) m.toggleMaximise();
      while (p) {
        p.setActiveContentItem && p.setActiveContentItem(q); q = p; p = p.parent;
      } // reveal in golden layout
      D.elw && D.elw.focus();
      window.focused || window.focus();
      this.me.focus();
      this.ide.setCursorPosition(this.me.getPosition(), this.me.getModel().getLineCount());
    },
    insert(ch) {
      this.isReadOnly || this.me.trigger('editor', 'type', { text: ch });
    },
    die() { this.me.updateOptions({ readOnly: (this.isReadOnly = true) }); },
    getDocument() { return this.dom.ownerDocument; },
    refresh() { },
    loadLine(s) {
      const { me } = this;
      const model = me.getModel();
      const l = model.getLineCount();
      me.executeEdits('D', [{
        range: new monaco.Range(l, 1, l, model.getLineMaxColumn(l)),
        text: s,
      }], [new monaco.Selection(l, s.length + 1, l, s.length + 1)]);
    },
    exec(trace) {
      let w;
      let es;
      const se = this;
      const { me } = se;
      const model = me.getModel();
      if (!se.promptType) return;
      const allLines = Object.keys(se.dirty)
        .map(l => +l);
      const ls = allLines.filter(l => !/^\s*$/.test(model.getLineContent(l)));
      if (ls.length) {
        ls.sort((x, y) => x - y);
        const max = model.getLineCount();
        es = ls.map((l) => {
          if (l > max) {
            console.log('out of range', l);
            return '';
          }
          return model.getLineContent(l) || '';
        }); // strings to execute
        allLines.reverse().forEach((l) => {
          if (se.dirty[l] === 0) {
            se.edit([{
              range: new monaco.Range(l, 1, l + 1, 1),
              text: '',
            }]);
          } else {
            se.edit([{
              range: new monaco.Range(l, 1, l, model.getLineMaxColumn(l)),
              text: se.dirty[l],
            }]);
          }
        });
      } else {
        const sel = me.getSelection();
        if (sel.isEmpty()) {
          es = [model.getLineContent(sel.startLineNumber)];
          trace && /^\s*$/.test(es[0]) && (w = se.ide.tracer()) && w.focus();
        } else {
          es = [model.getValueInRange(sel)];
        }
      }
      se.ide.exec(es, trace);
      se.dirty = {};
      se.hl();
      se.histAdd(es.filter(x => !/^\s*$/.test(x)));
      model._commandManager.clear();
    },
    autoCloseBrackets(x) { this.me.updateOptions({ autoClosingBrackets: x }); },
    matchBrackets(x) { this.me.updateOptions({ matchBrackets: !!x }); },
    minimapEnabled(x) { this.me.updateOptions({ minimap: { enabled: !!x } }); },
    minimapRenderCharacters(x) { this.me.updateOptions({ minimap: { renderCharacters: !!x } }); },
    minimapShowSlider(x) { this.me.updateOptions({ minimap: { showSlider: x } }); },
    renderLineHighlight(x) { this.me.updateOptions({ renderLineHighlight: x }); },
    selectionHighlight(x) { this.me.updateOptions({ selectionHighlight: x }); },
    snippetSuggestions(x) { this.me.updateOptions({ snippetSuggestions: x ? 'bottom' : 'none' }); },
    autocompletion(x) {
      this.me.updateOptions({
        quickSuggestions: x,
        suggestOnTriggerCharacters: x,
      });
    },
    autocompletionDelay(x) { this.me.updateOptions({ quickSuggestionsDelay: x }); },
    execCommand(cmd) {
      if (this[cmd]) this[cmd](this.me);
      else if (D.commands[cmd]) D.commands[cmd](this.me);
    },
    zoom(z) {
      const se = this;
      const { me } = se;
      const [r] = me.getVisibleRanges();
      const fs = D.zoom2fs[z + 10];
      me.updateOptions({ fontSize: fs, lineHeight: fs + 2 });
      me.revealRangeAtTop(r);
    },

    ValueTip(x) {
      const { me } = this;
      const model = me.getModel();
      if (model.vt && model.vt.complete) {
        const { vt } = model;
        const l = vt.position.lineNumber;
        const value = '```'
          + `${x.class === 2 ? 'plaintext' : 'apl'}\n`
          + `${x.tip.join('\n')}\n`
          + '```';
        vt.complete({
          range: new monaco.Range(l, x.startCol + 1, l, x.endCol + 1),
          contents: [{ isTrusted: true, value }],
        });
      }
    },
    ED(me) {
      const c = me.getPosition();
      const model = me.getModel();
      const text = model.getLineContent(c.lineNumber);
      if (/^\s*$/.test(text)) {
        const tc = this.ide.tracer();
        if (tc) { tc.focus(); tc.ED(tc.me); }
      } else {
        const pos = D.util.ucLength(text.slice(0, c.column - 1));
        D.ide.Edit({ win: 0, pos, text });
      }
    },
    BK() { this.histMove(1); },
    FD() { this.histMove(-1); },
    QT(me) {
      const se = this;
      const model = me.getModel();
      const c = me.getPosition();
      const l = c.lineNumber;
      const lc = model.getLineCount();
      if (se.dirty[l] === 0) {
        if (l === model.getLineCount()) {
          se.edit([{ range: new monaco.Range(l, 1, l + 1, 1), text: '' }]);
        } else {
          se.edit([{
            range: new monaco.Range(
              l - 1, model.getLineMaxColumn(l - 1),
              l, model.getLineMaxColumn(l),
            ),
            text: '',
          }]);
        }
        delete se.dirty[l];
        const h = se.dirty;
        se.dirty = {};
        Object.keys(h).forEach((x) => { se.dirty[+x - (+x > l)] = h[x]; });
      } else if (se.dirty[l] != null) {
        const text = l === lc && !se.dirty[l].length ? '      ' : se.dirty[l];
        se.edit([{
          range: new monaco.Range(l, 1, l, model.getLineMaxColumn(l)),
          text,
        }]);
        me.setPosition({ lineNumber: l, column: 1 + text.search(/\S|$/) });
        delete se.dirty[l];
      }
      se.oModel.setValue(me.getValue());
      se.hl();
    },
    EP() { this.ide.focusMRUWin(); },
    ER() { this.exec(0); },
    TC() { this.exec(1); },
    LN() { D.prf.lineNums.toggle(); },
    MA() { D.send('RestartThreads', {}); }, // Threads > Restart All Threads
    DC() {
      const { me } = this;
      const model = me.getModel();
      const l = me.getPosition().lineNumber;
      if (l < model.getLineCount() || /^\s*$/.test(model.getLineContent(l))) {
        me.trigger('editor', 'cursorDown');
      }
    },
    UC() { this.me.trigger('editor', 'cursorUp'); },
    LC() { this.me.trigger('editor', 'cursorLeft'); },
    RC() { this.me.trigger('editor', 'cursorRight'); },
    SA() { this.me.setSelection(this.me.getModel().getFullModelRange()); },
    TO() { this.me.trigger('editor', 'editor.fold'); }, // (editor.unfold) is there a toggle?
    TVB() { D.prf.breakPts.toggle(); },
    TVO() { D.prf.fold.toggle(); },
    indentOrComplete(me) {
      const sels = me.getSelections();

      const c = me.getPosition();
      const ci = c.column - 1;
      const s = me.getModel().getLineContent(c.lineNumber);
      const ch = s[ci - 1];
      if (sels.length !== 1 || !sels[0].isEmpty()
        || this.promptType === 4 || /^ *$/.test(s.slice(0, ci))) {
        me.trigger('editor', 'editor.action.indentLines'); return;
      }
      if (!ch || ch === ' ') {
        const i = D.prf.indent();
        me.trigger('editor', 'type', { text: ' '.repeat(i - (ci % i)) });
        return;
      }
      if (D.prf.autocompletion() !== 'off') {
        me.tabComplete += 1;
        me.trigger('editor', 'editor.action.triggerSuggest');
      }
    },
  };
  D.Se = Se;
}
